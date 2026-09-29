-- =============================================================================
-- Grade engine API: the functions the app calls over HTTP.
--
-- Supabase publishes every function in `public` at
--   POST {SUPABASE_URL}/rest/v1/rpc/<function name>
-- and the app calls them with supabase.rpc('<function name>', { args }).
--
-- Authentication: the caller is whoever the `Authorization: Bearer <JWT>`
-- header says. supabase-js adds that header on its own once the student has
-- signed in, so none of these functions take a user id or a token. They read
-- auth.uid(), run as the caller (SECURITY INVOKER), and row-level security
-- limits them to the caller's own rows. Calls without a signed-in student fail
-- with SQLSTATE 28000 (HTTP 403).
--
-- Errors the app can rely on (PostgREST turns the SQLSTATE into the HTTP status):
--   28000 → 403  not signed in
--   P0002 → 404  course / category / assignment not found (or not the caller's)
--   22023 → 400  bad argument (empty title, negative score, …)
--
-- Endpoints:
--   get_grades(course_id?)          current grades snapshot, all courses or one
--   add_forecast(category_id, …)    forecast for work not in Schoology yet
--   set_forecast(assignment_id, x)  forecast (or change the forecast) on an assignment
--   remove_forecast(assignment_id)  delete a forecast-only item, or clear a forecast
-- Every forecast call returns the changed assignment and the course's new
-- grades, so the app can redraw without a second request.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- require_student: the signed-in student's id, or an error when signed out.
-- -----------------------------------------------------------------------------
create or replace function public.require_student()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then
    raise exception 'Sign in to use this' using errcode = '28000';
  end if;
  return v_student_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- course_grade_snapshot: one course's grades at every level, as JSON.
--
-- {
--   "course_id", "name", "teacher", "grading_mode",
--   "current":   { "percent", "letter" },     -- actual scores only
--   "projected": { "percent", "letter" },     -- forecasts fill the gaps
--   "periods": [ { "period_id", "name", "kind", "semester", "weight",
--                  "current_percent", "projected_percent",
--                  "categories": [ { "category_id", "name", "weight", "drop_lowest",
--                                    "current_percent", "projected_percent" } ] } ],
--   "semesters": [ { "semester", "label", "exam_weight",
--                    "current_percent", "projected_percent" } ],
--   "forecasts": [ { "assignment_id", "period_id", "category_id", "title", "due_date",
--                    "max_score", "forecast_score", "is_placeholder" } ]
-- }
-- Percents are rounded to 2 decimals; null means "nothing graded yet".
-- `forecasts` lists the forecasts still waiting for a real grade.
-- -----------------------------------------------------------------------------
create or replace function public.course_grade_snapshot(p_course_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with cur_cat  as (select * from public.category_grades(p_course_id, false)),
       proj_cat as (select * from public.category_grades(p_course_id, true)),
       cur_per  as (select * from public.period_grades(p_course_id, false)),
       proj_per as (select * from public.period_grades(p_course_id, true)),
       cur_sem  as (select * from public.semester_grades(p_course_id, false)),
       proj_sem as (select * from public.semester_grades(p_course_id, true)),
       pct      as (select public.course_percent(p_course_id, false) as cur,
                           public.course_percent(p_course_id, true)  as proj)
  select jsonb_build_object(
    'course_id',    c.id,
    'name',         c.name,
    'teacher',      c.teacher,
    'grading_mode', c.grading_mode,
    'current',   jsonb_build_object('percent', round(pct.cur, 2),
                                    'letter',  public.letter_for(pct.cur, c.grading_scale_id)),
    'projected', jsonb_build_object('percent', round(pct.proj, 2),
                                    'letter',  public.letter_for(pct.proj, c.grading_scale_id)),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period_id',         gp.id,
               'name',              gp.name,
               'kind',              gp.kind,
               'semester',          public.semester_of(gp.semester, gp.name),
               'weight',            gp.weight,
               'current_percent',   round(cp.percent, 2),
               'projected_percent', round(pp.percent, 2),
               'categories', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'category_id',       cat.id,
                          'name',              cat.name,
                          'weight',            cat.weight,
                          'drop_lowest',       cat.drop_lowest,
                          'current_percent',   round(cc.percent, 2),
                          'projected_percent', round(pc.percent, 2))
                        order by cat.position, cat.name)
                 from public.categories cat
                 left join cur_cat  cc on cc.category_id = cat.id
                 left join proj_cat pc on pc.category_id = cat.id
                 where cat.period_id = gp.id), '[]'::jsonb))
             order by gp.position, gp.name)
      from public.grading_periods gp
      left join cur_per  cp on cp.period_id = gp.id
      left join proj_per pp on pp.period_id = gp.id
      where gp.course_id = c.id), '[]'::jsonb),
    'semesters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'semester',          cs.semester,
               'label',             case cs.semester when 1 then 'Midterm' when 2 then 'Final' end,
               'exam_weight',       cs.exam_weight,
               'current_percent',   round(cs.percent, 2),
               'projected_percent', round(ps.percent, 2))
             order by cs.semester)
      from cur_sem cs
      left join proj_sem ps on ps.semester = cs.semester), '[]'::jsonb),
    'forecasts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'assignment_id',  a.id,
               'period_id',      cat.period_id,
               'category_id',    a.category_id,
               'title',          a.title,
               'due_date',       a.due_date,
               'max_score',      a.max_score,
               'forecast_score', a.forecast_score,
               'is_placeholder', a.is_placeholder)
             order by a.due_date nulls last, a.title)
      from public.assignments a
      join public.categories cat on cat.id = a.category_id
      join public.grading_periods gp on gp.id = cat.period_id
      where gp.course_id = c.id
        and a.forecast_score is not null
        and a.actual_score is null
        and not a.excused), '[]'::jsonb)
  )
  from public.courses c
  cross join pct
  where c.id = p_course_id;
$$;

-- -----------------------------------------------------------------------------
-- get_grades: the current grades snapshot.
--
--   supabase.rpc('get_grades')                          → every active course
--   supabase.rpc('get_grades', { p_course_id: '…' })    → just that course
--
-- Returns { "computed_at": "<timestamp>", "courses": [ <course_grade_snapshot> ] }.
-- -----------------------------------------------------------------------------
create or replace function public.get_grades(p_course_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_courses jsonb;
begin
  perform public.require_student();

  if p_course_id is not null
     and not exists (select 1 from public.courses where id = p_course_id) then
    raise exception 'Course % not found', p_course_id using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(public.course_grade_snapshot(c.id) order by c.position, c.name), '[]'::jsonb)
    into v_courses
  from public.courses c
  where (p_course_id is null and c.archived_at is null)
     or c.id = p_course_id;

  return jsonb_build_object('computed_at', now(), 'courses', v_courses);
end;
$$;

-- -----------------------------------------------------------------------------
-- forecast_result: the reply every forecast call sends back.
-- { "assignment": <assignments row>, "course": <course_grade_snapshot> }
-- (the assignment is null after a forecast-only item is deleted).
-- -----------------------------------------------------------------------------
create or replace function public.forecast_result(p_assignment jsonb, p_course_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'assignment', p_assignment,
    'course',     public.course_grade_snapshot(p_course_id));
$$;

-- -----------------------------------------------------------------------------
-- add_forecast: a forecast for work that is not in Schoology yet (F08).
--
-- Creates a placeholder assignment in the given category. When the real grade
-- arrives, record_actual_score() turns it into a normal assignment.
-- -----------------------------------------------------------------------------
create or replace function public.add_forecast(
  p_category_id    uuid,
  p_title          text,
  p_max_score      numeric,
  p_forecast_score numeric,
  p_due_date       date default null
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_student_id uuid := public.require_student();
  v_course_id  uuid;
  v_title      text := btrim(p_title);
  v_row        public.assignments;
begin
  select gp.course_id into v_course_id
  from public.categories cat
  join public.grading_periods gp on gp.id = cat.period_id
  where cat.id = p_category_id;

  if v_course_id is null then
    raise exception 'Category % not found', p_category_id using errcode = 'P0002';
  end if;
  if v_title is null or v_title = '' then
    raise exception 'Title is required' using errcode = '22023';
  end if;
  if p_max_score is null or p_max_score <= 0 then
    raise exception 'Points possible must be more than 0' using errcode = '22023';
  end if;
  if p_forecast_score is null or p_forecast_score < 0 then
    raise exception 'Forecast must be 0 or more' using errcode = '22023';
  end if;

  insert into public.assignments (
    category_id, student_id, title, due_date, max_score, forecast_score,
    is_placeholder, source, position)
  values (
    p_category_id, v_student_id, v_title, p_due_date, p_max_score, p_forecast_score,
    true, 'manual',
    (select coalesce(max(a.position), 0) + 1 from public.assignments a
      where a.category_id = p_category_id))
  returning * into v_row;

  return public.forecast_result(to_jsonb(v_row), v_course_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- set_forecast: set or change the forecast on an assignment (F08).
--
-- Works on any assignment: a placeholder, or real work that has no grade yet.
-- An assignment that already has an actual grade keeps it; the actual grade
-- still wins in the projected grade (see the assignments table).
-- -----------------------------------------------------------------------------
create or replace function public.set_forecast(
  p_assignment_id  uuid,
  p_forecast_score numeric
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row       public.assignments;
  v_course_id uuid;
begin
  perform public.require_student();

  if p_forecast_score is null or p_forecast_score < 0 then
    raise exception 'Forecast must be 0 or more (use remove_forecast to clear it)'
      using errcode = '22023';
  end if;

  update public.assignments
     set forecast_score = p_forecast_score
   where id = p_assignment_id
  returning * into v_row;

  if not found then
    raise exception 'Assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;

  select gp.course_id into v_course_id
  from public.categories cat
  join public.grading_periods gp on gp.id = cat.period_id
  where cat.id = v_row.category_id;

  return public.forecast_result(to_jsonb(v_row), v_course_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- remove_forecast: undo a forecast.
--
-- A placeholder is only a forecast, so it is deleted. On a real assignment the
-- forecast is cleared and the assignment stays.
-- -----------------------------------------------------------------------------
create or replace function public.remove_forecast(p_assignment_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row       public.assignments;
  v_course_id uuid;
begin
  perform public.require_student();

  select a.* into v_row from public.assignments a where a.id = p_assignment_id;
  if not found then
    raise exception 'Assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;

  select gp.course_id into v_course_id
  from public.categories cat
  join public.grading_periods gp on gp.id = cat.period_id
  where cat.id = v_row.category_id;

  if v_row.is_placeholder then
    delete from public.assignments where id = p_assignment_id;
    return public.forecast_result(null, v_course_id);
  end if;

  update public.assignments
     set forecast_score = null
   where id = p_assignment_id
  returning * into v_row;

  return public.forecast_result(to_jsonb(v_row), v_course_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Only signed-in students may call the API. (Supabase grants EXECUTE on new
-- functions to anon by default; RLS would return nothing anyway, but a clear
-- 401/403 is easier to debug than an empty result.)
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.require_student()',
    'public.course_grade_snapshot(uuid)',
    'public.get_grades(uuid)',
    'public.forecast_result(jsonb, uuid)',
    'public.add_forecast(uuid, text, numeric, numeric, date)',
    'public.set_forecast(uuid, numeric)',
    'public.remove_forecast(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
