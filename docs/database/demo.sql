-- =============================================================================
-- Class demo: inspect and query the database with SQL.
--
-- Run the seed first (supabase/seed.sql). Then run one query at a time:
-- select the query text in the Supabase SQL Editor and press Ctrl+Enter
-- (Cmd+Enter on a Mac). The editor shows the result of the query you select.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1. Inspect the schema
-- -----------------------------------------------------------------------------

-- 1.1 All tables, with their row counts.
select c.relname as table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int
         as row_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 1.2 Columns of one table.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'assignments'
order by ordinal_position;

-- 1.3 Constraints: primary keys (p), foreign keys (f), unique (u), checks (c).
select conrelid::regclass as table_name, conname as constraint_name, contype as type,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, contype, conname;

-- 1.4 Indexes.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 1.5 Row-level security policies (each student sees only their own rows).
select tablename, policyname, cmd, qual as using_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 1.6 Views and functions.
select table_name as view_name from information_schema.views
where table_schema = 'public' order by table_name;

select p.proname as function_name, pg_get_function_arguments(p.oid) as arguments
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by p.proname;


-- -----------------------------------------------------------------------------
-- PART 2. Query the data
-- -----------------------------------------------------------------------------

-- 2.1 Student accounts, with sign-in methods and Face ID devices.
select p.username, p.full_name, p.email, p.phone,
       (select string_agg(m.provider::text, ', ' order by m.provider::text)
          from public.login_methods m where m.student_id = p.id) as sign_in_methods,
       (select count(*) from public.user_devices d
         where d.student_id = p.id and d.biometric_unlock_enabled) as biometric_devices
from public.profiles p
order by p.username;

-- 2.2 Grades home: every course of every student, current and projected.
select p.username, g.course_name, g.grading_mode,
       g.current_percent, g.current_letter,
       g.projected_percent, g.projected_letter
from public.course_grades g
join public.profiles p on p.id = g.student_id
order by p.username, g.course_name;

-- 2.3 One course in detail: periods, categories, and their grades.
select pg.period_name, cg.category_name, cg.weight, cg.drop_lowest,
       cg.current_percent, cg.projected_percent
from public.category_grade_summary cg
join public.period_grade_summary pg on pg.period_id = cg.period_id
join public.courses c on c.id = cg.course_id
join public.profiles p on p.id = c.student_id
where p.username = 'ana_park' and c.name = 'AP Calculus BC'
order by pg.position, cg.position;

-- 2.4 Every assignment in that course, with actual and forecast scores.
select gp.name as period, cat.name as category, a.title,
       a.actual_score, a.forecast_score, a.max_score,
       case
         when a.excused                    then 'excused'
         when a.actual_score is not null   then 'graded'
         when a.is_placeholder             then 'forecast (not posted yet)'
         when a.forecast_score is not null then 'forecast'
         else 'not graded'
       end as status
from public.assignments a
join public.categories cat on cat.id = a.category_id
join public.grading_periods gp on gp.id = cat.period_id
join public.courses c on c.id = gp.course_id
join public.profiles p on p.id = c.student_id
where p.username = 'ana_park' and c.name = 'AP Calculus BC'
order by gp.position, cat.position, a.position;

-- 2.5 Semester grades (quarters 50/50, exam 20%).
select p.username, c.name as course, s.label,
       s.current_quarters_percent, s.current_exam_percent, s.exam_weight,
       s.current_percent, s.projected_percent
from public.semester_grade_summary s
join public.courses c on c.id = s.course_id
join public.profiles p on p.id = s.student_id
where c.name = 'AP Calculus BC'
order by p.username;

-- 2.6 Forecast accuracy: forecast vs actual grade.
select p.username, f.title, f.forecast_percent, f.actual_percent, f.difference_points
from public.forecast_accuracy f
join public.profiles p on p.id = f.student_id
order by p.username, f.difference_points;

-- 2.7 Score needed on the midterm for Ana to reach 90% in Calc.
select r.*
from public.assignments a
join public.profiles p on p.id = a.student_id
cross join lateral public.required_score(a.id, 90) r
where p.username = 'ana_park' and a.title = 'Semester 1 Midterm Exam';

-- 2.8 Upcoming assignments, next 10 days. No course = "Unfiled".
select p.username, u.due_at::date as due, u.title, coalesce(c.name, 'Unfiled') as course
from public.upcoming_items u
join public.profiles p on p.id = u.student_id
left join public.courses c on c.id = u.course_id
where u.due_at between now() and now() + interval '10 days'
order by p.username, u.due_at;


-- -----------------------------------------------------------------------------
-- PART 3. Live change: replace a forecast with the actual grade
-- -----------------------------------------------------------------------------

-- 3.1 Before: Ana's Calc grade. The midterm has only a forecast (85).
select course_name, current_percent, current_letter, projected_percent, projected_letter
from public.course_grades g
join public.profiles p on p.id = g.student_id
where p.username = 'ana_park' and g.course_name = 'AP Calculus BC';

-- 3.2 The real grade arrives: 80.
select r.title, r.forecast_score, r.actual_score, r.is_placeholder
from public.assignments a
join public.profiles p on p.id = a.student_id
cross join lateral public.record_actual_score(a.id, 80) r
where p.username = 'ana_park' and a.title = 'Semester 1 Midterm Exam';

-- 3.3 After: run 3.1 again. The current grade now includes the midterm.
--     Then see the change in the score history:
select h.changed_at, h.kind, h.old_score, h.new_score
from public.score_history h
join public.assignments a on a.id = h.assignment_id
join public.profiles p on p.id = a.student_id
where p.username = 'ana_park' and a.title = 'Semester 1 Midterm Exam'
order by h.id;

-- 3.4 Reset for the next demo: make the midterm a forecast again.
update public.assignments a
   set actual_score = null, is_placeholder = true
  from public.profiles p
 where p.id = a.student_id and p.username = 'ana_park' and a.title = 'Semester 1 Midterm Exam';
