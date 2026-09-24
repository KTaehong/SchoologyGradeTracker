-- =============================================================================
-- Grade engine in SQL (F07, F08, F09, F10) and the views the app reads.
--
-- The app computes grades on the phone (F07 is on-device, so it works offline).
-- These functions apply the same rules on the server, so grades can be queried
-- with plain SQL and the phone's numbers can be checked against them.
--
-- Two kinds of grade are available everywhere:
--   current   — actual scores only (what Schoology shows today).
--   projected — actual scores, with forecasts filling in anything not graded yet.
--
-- The rules (docs/features.md, F07 and F10):
--   * Category grade = pooled points of its graded items. Excused and ungraded
--     items are left out. Extra credit adds earned points, not possible points.
--     `drop_lowest` drops that many of the lowest-percent regular items (but
--     always keeps at least one).
--   * Period grade:
--       weighted course → weight-normalized average of the categories that have
--                         a grade ("present-weight normalization");
--       points course   → pooled points across all its categories.
--   * Course grade:
--       no semester exams → weight-normalized average of the graded periods;
--       semester exams    → average of the graded semester grades.
--   * Semester grade = the semester's graded quarters averaged 50/50, blended
--     with the exam by the exam's weight (default 20%). A missing exam drops out;
--     with no graded quarters it is just the exam.
--   * When no row at a level has a weight, all rows at that level count equally.
--
-- All functions are SECURITY INVOKER, so row-level security still applies:
-- a student only ever gets results for their own courses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- category_grades: earned / possible / percent for every category in a course.
--
-- p_override_assignment_id / p_override_score replace one assignment's score,
-- which is how What-If (F08) and the final-grade calculator (F09) ask
-- "what if I got X on this?".
-- -----------------------------------------------------------------------------
create or replace function public.category_grades(
  p_course_id              uuid,
  p_projected              boolean default false,
  p_override_assignment_id uuid    default null,
  p_override_score         numeric default null
)
returns table (category_id uuid, period_id uuid, earned numeric, possible numeric, percent numeric)
language sql
stable
set search_path = ''
as $$
  with course_categories as (
    select c.id, c.period_id, c.drop_lowest
    from public.categories c
    join public.grading_periods gp on gp.id = c.period_id
    where gp.course_id = p_course_id
  ),
  scored as (
    select a.id, a.category_id, a.max_score, a.extra_credit,
           case
             when a.id = p_override_assignment_id then p_override_score
             when p_projected then coalesce(a.actual_score, a.forecast_score)
             else a.actual_score
           end as score
    from public.assignments a
    join course_categories cc on cc.id = a.category_id
    where not a.excused
  ),
  ranked as (
    select s.*,
           row_number() over (
             partition by s.category_id, s.extra_credit
             order by case when s.extra_credit then 0 else s.score / s.max_score end, s.id
           ) as low_rank,
           count(*) over (partition by s.category_id, s.extra_credit) as group_size
    from scored s
    where s.score is not null
  ),
  kept as (
    select r.*
    from ranked r
    join course_categories cc on cc.id = r.category_id
    where r.extra_credit or r.low_rank > least(cc.drop_lowest, r.group_size - 1)
  )
  select cc.id,
         cc.period_id,
         sum(k.score),
         sum(case when k.extra_credit then 0 else k.max_score end),
         case
           when sum(case when k.extra_credit then 0 else k.max_score end) > 0
           then 100 * sum(k.score) / sum(case when k.extra_credit then 0 else k.max_score end)
         end
  from course_categories cc
  left join kept k on k.category_id = cc.id
  group by cc.id, cc.period_id;
$$;

-- -----------------------------------------------------------------------------
-- period_grades: percent for every grading period in a course.
-- -----------------------------------------------------------------------------
create or replace function public.period_grades(
  p_course_id              uuid,
  p_projected              boolean default false,
  p_override_assignment_id uuid    default null,
  p_override_score         numeric default null
)
returns table (period_id uuid, percent numeric)
language sql
stable
set search_path = ''
as $$
  with cg as (
    select cg.*,
           c.weight,
           bool_or(c.weight is not null) over (partition by cg.period_id) as period_has_weights
    from public.category_grades(p_course_id, p_projected, p_override_assignment_id, p_override_score) cg
    join public.categories c on c.id = cg.category_id
  ),
  weighted as (
    select cg.*,
           case when period_has_weights then coalesce(weight, 0) else 1 end as w
    from cg
  )
  select gp.id,
         case co.grading_mode
           when 'points' then
             case when sum(w.possible) > 0 then 100 * sum(w.earned) / sum(w.possible) end
           else
             sum(w.percent * w.w) / nullif(sum(w.w) filter (where w.percent is not null), 0)
         end
  from public.grading_periods gp
  join public.courses co on co.id = gp.course_id
  left join weighted w on w.period_id = gp.id
  where gp.course_id = p_course_id
  group by gp.id, co.grading_mode;
$$;

-- -----------------------------------------------------------------------------
-- semester_of: which semester a period belongs to (explicit, or from its name).
-- -----------------------------------------------------------------------------
create or replace function public.semester_of(p_semester smallint, p_name text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_semester,
    case
      when p_name ~* '^\s*q(uarter)?\s*[12]([^0-9]|$)' then 1
      when p_name ~* '^\s*q(uarter)?\s*[34]([^0-9]|$)' then 2
      when p_name ~* 'midterm'                          then 1
      when p_name ~* 'final'                            then 2
    end
  )::smallint;
$$;

-- -----------------------------------------------------------------------------
-- semester_grades: midterm (semester 1) and final (semester 2) grades (F10).
-- -----------------------------------------------------------------------------
create or replace function public.semester_grades(
  p_course_id              uuid,
  p_projected              boolean default false,
  p_override_assignment_id uuid    default null,
  p_override_score         numeric default null
)
returns table (
  semester         smallint,
  quarters_percent numeric,
  exam_percent     numeric,
  exam_weight      numeric,
  percent          numeric
)
language sql
stable
set search_path = ''
as $$
  with periods as (
    select pg.percent, gp.kind, gp.weight, gp.position,
           public.semester_of(gp.semester, gp.name) as sem
    from public.period_grades(p_course_id, p_projected, p_override_assignment_id, p_override_score) pg
    join public.grading_periods gp on gp.id = pg.period_id
  ),
  default_weight as (
    select coalesce(
      (select us.default_exam_weight
         from public.user_settings us
         join public.courses c on c.student_id = us.student_id
        where c.id = p_course_id),
      20) as w
  ),
  per_semester as (
    select s.sem,
           (select avg(p.percent) from periods p
             where p.kind = 'quarter' and p.sem = s.sem and p.percent is not null) as q,
           e.percent as exam,
           coalesce(e.weight, (select w from default_weight)) as w
    from (select distinct sem from periods where sem is not null) s
    left join lateral (
      select p.percent, p.weight from periods p
      where p.kind = 'semester_exam' and p.sem = s.sem
      order by p.position
      limit 1
    ) e on true
  )
  select sem, q, exam, w,
         case
           when q is null    then exam
           when exam is null then q
           else q * (100 - w) / 100 + exam * w / 100
         end
  from per_semester
  order by sem;
$$;

-- -----------------------------------------------------------------------------
-- course_percent: the overall course grade (F02, F07).
-- -----------------------------------------------------------------------------
create or replace function public.course_percent(
  p_course_id              uuid,
  p_projected              boolean default false,
  p_override_assignment_id uuid    default null,
  p_override_score         numeric default null
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.grading_periods
      where course_id = p_course_id and kind = 'semester_exam'
    ) then (
      select avg(sg.percent)
      from public.semester_grades(p_course_id, p_projected, p_override_assignment_id, p_override_score) sg
      where sg.percent is not null
    )
    else (
      select sum(x.percent * x.w) / nullif(sum(x.w) filter (where x.percent is not null), 0)
      from (
        select pg.percent,
               case when bool_or(gp.weight is not null) over () then coalesce(gp.weight, 0) else 1 end as w
        from public.period_grades(p_course_id, p_projected, p_override_assignment_id, p_override_score) pg
        join public.grading_periods gp on gp.id = pg.period_id
      ) x
    )
  end;
$$;

-- -----------------------------------------------------------------------------
-- letter_for: percent → letter on a scale (NULL scale = default US +/-).
-- -----------------------------------------------------------------------------
create or replace function public.letter_for(p_percent numeric, p_scale_id uuid default null)
returns text
language sql
stable
set search_path = ''
as $$
  select b.letter
  from public.grading_scale_bands b
  where b.scale_id = coalesce(p_scale_id, '00000000-0000-0000-0000-000000000001')
    and b.min_percent <= round(p_percent, 2)
  order by b.min_percent desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- required_score: "What do I need on this item to reach X%?" (F09)
--
-- Other items use actual scores only, unless p_use_forecasts is true.
-- Returns one row:
--   status = 'already_secured' → the target is met even with a 0.
--   status = 'not_possible'    → even full marks fall short.
--   status = 'needed'          → required_score / required_percent is the minimum.
-- -----------------------------------------------------------------------------
create or replace function public.required_score(
  p_assignment_id  uuid,
  p_target_percent numeric,
  p_use_forecasts  boolean default false
)
returns table (status text, required_score numeric, required_percent numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_max       numeric;
  v_low       numeric := 0;
  v_high      numeric;
  v_mid       numeric;
  v_grade     numeric;
begin
  select gp.course_id, a.max_score
    into v_course_id, v_max
  from public.assignments a
  join public.categories c on c.id = a.category_id
  join public.grading_periods gp on gp.id = c.period_id
  where a.id = p_assignment_id and not a.excused and not a.extra_credit;

  if v_course_id is null then
    raise exception 'Assignment % not found, excused, or extra credit', p_assignment_id;
  end if;

  v_grade := public.course_percent(v_course_id, p_use_forecasts, p_assignment_id, 0);
  if v_grade >= p_target_percent then
    return query select 'already_secured'::text, 0::numeric, 0::numeric;
    return;
  end if;

  v_high := v_max;
  v_grade := public.course_percent(v_course_id, p_use_forecasts, p_assignment_id, v_high);
  if v_grade is null or v_grade < p_target_percent then
    return query select 'not_possible'::text, null::numeric, null::numeric;
    return;
  end if;

  -- The course grade never goes down when this score goes up, so a binary
  -- search finds the smallest score that reaches the target.
  for i in 1..40 loop
    v_mid := (v_low + v_high) / 2;
    if public.course_percent(v_course_id, p_use_forecasts, p_assignment_id, v_mid) >= p_target_percent then
      v_high := v_mid;
    else
      v_low := v_mid;
    end if;
  end loop;

  -- Report to the cent: the rounded value if it reaches the target, else round up.
  v_mid := round(v_high, 2);
  if public.course_percent(v_course_id, p_use_forecasts, p_assignment_id, v_mid) >= p_target_percent then
    v_high := v_mid;
  else
    v_high := least(ceil(v_high * 100) / 100, v_max);
  end if;
  return query select 'needed'::text, v_high, round(100 * v_high / v_max, 2);
end;
$$;

-- -----------------------------------------------------------------------------
-- record_actual_score: replace a forecast with the real grade.
--
-- Sets the actual score (which now wins over the forecast in every projected
-- grade), turns a placeholder into a real assignment, and keeps the forecast
-- so forecast accuracy can be reported. score_history logs the change.
-- -----------------------------------------------------------------------------
create or replace function public.record_actual_score(
  p_assignment_id uuid,
  p_actual_score  numeric,
  p_import_id     uuid default null
)
returns public.assignments
language sql
volatile
set search_path = ''
as $$
  update public.assignments
     set actual_score   = p_actual_score,
         is_placeholder = false,
         import_id      = coalesce(p_import_id, import_id)
   where id = p_assignment_id
  returning *;
$$;

-- =============================================================================
-- Views. security_invoker = true makes them respect row-level security.
-- =============================================================================

-- Grades home (F02): every active course with its current and projected grade.
create view public.course_grades
with (security_invoker = true) as
select c.student_id,
       c.id   as course_id,
       c.name as course_name,
       c.teacher,
       c.grading_mode,
       round(cur.pct, 2)                              as current_percent,
       public.letter_for(cur.pct, c.grading_scale_id) as current_letter,
       round(proj.pct, 2)                              as projected_percent,
       public.letter_for(proj.pct, c.grading_scale_id) as projected_letter
from public.courses c
cross join lateral (select public.course_percent(c.id, false) as pct) cur
cross join lateral (select public.course_percent(c.id, true)  as pct) proj
where c.archived_at is null;

-- Course detail (F03): each grading period's grade.
create view public.period_grade_summary
with (security_invoker = true) as
select c.student_id,
       c.id as course_id,
       gp.id as period_id,
       gp.name as period_name,
       gp.kind,
       public.semester_of(gp.semester, gp.name) as semester,
       gp.weight,
       gp.position,
       round(cur.percent, 2)  as current_percent,
       round(proj.percent, 2) as projected_percent
from public.courses c
join public.grading_periods gp on gp.course_id = c.id
left join lateral public.period_grades(c.id, false) cur  on cur.period_id  = gp.id
left join lateral public.period_grades(c.id, true)  proj on proj.period_id = gp.id;

-- Course detail (F03): each category's grade.
create view public.category_grade_summary
with (security_invoker = true) as
select c.student_id,
       c.id  as course_id,
       cat.period_id,
       cat.id as category_id,
       cat.name as category_name,
       cat.weight,
       cat.drop_lowest,
       cat.position,
       round(cur.percent, 2)  as current_percent,
       round(proj.percent, 2) as projected_percent
from public.courses c
join public.grading_periods gp on gp.course_id = c.id
join public.categories cat on cat.period_id = gp.id
left join lateral public.category_grades(c.id, false) cur  on cur.category_id  = cat.id
left join lateral public.category_grades(c.id, true)  proj on proj.category_id = cat.id;

-- Semester grades card (F10).
create view public.semester_grade_summary
with (security_invoker = true) as
select c.student_id,
       c.id as course_id,
       cur.semester,
       case cur.semester when 1 then 'Midterm' when 2 then 'Final' end as label,
       round(cur.quarters_percent, 2) as current_quarters_percent,
       round(cur.exam_percent, 2)     as current_exam_percent,
       cur.exam_weight,
       round(cur.percent, 2)          as current_percent,
       round(proj.percent, 2)         as projected_percent
from public.courses c
cross join lateral public.semester_grades(c.id, false) cur
left join lateral public.semester_grades(c.id, true) proj on proj.semester = cur.semester;

-- How close were the student's forecasts to the grades they actually got?
create view public.forecast_accuracy
with (security_invoker = true) as
select a.student_id,
       gp.course_id,
       a.id as assignment_id,
       a.title,
       a.max_score,
       a.forecast_score,
       a.actual_score,
       round(100 * a.forecast_score / a.max_score, 2) as forecast_percent,
       round(100 * a.actual_score   / a.max_score, 2) as actual_percent,
       -- Positive = did better than forecast.
       round(100 * (a.actual_score - a.forecast_score) / a.max_score, 2) as difference_points
from public.assignments a
join public.categories c on c.id = a.category_id
join public.grading_periods gp on gp.id = c.period_id
where a.actual_score is not null
  and a.forecast_score is not null
  and a.max_score > 0;
