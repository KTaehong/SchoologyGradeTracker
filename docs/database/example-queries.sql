-- Example queries for the Schoology Grade Tracker database.
--
-- Run these in the Supabase SQL editor after loading the sample gradebook
-- (see README.md, "Try it with demo data"). The SQL editor is an admin and sees
-- every student, so replace <student id> with one student's id. In the app the
-- `where student_id = …` filters are not needed: row-level security adds them.

-- 1. Grades home (F02): every course with its current and projected grade.
select course_name, current_percent, current_letter, projected_percent, projected_letter
from public.course_grades
where student_id = '<student id>'
order by course_name;

-- 2. Course detail (F03): period and category grades for one course.
select p.period_name, c.category_name, c.weight, c.drop_lowest,
       c.current_percent, c.projected_percent
from public.category_grade_summary c
join public.period_grade_summary p on p.period_id = c.period_id
join public.courses co on co.id = c.course_id
where co.student_id = '<student id>' and co.name = 'AP Calculus BC'
order by p.position, c.position;

-- 3. Every assignment in a course, showing actual vs forecast.
select gp.name as period, cat.name as category, a.title,
       a.actual_score, a.forecast_score, a.max_score,
       case
         when a.excused                  then 'excused'
         when a.actual_score is not null then 'graded'
         when a.is_placeholder           then 'forecast only (not posted yet)'
         when a.forecast_score is not null then 'forecast'
         else 'not graded'
       end as status
from public.assignments a
join public.categories cat on cat.id = a.category_id
join public.grading_periods gp on gp.id = cat.period_id
join public.courses co on co.id = gp.course_id
where co.student_id = '<student id>' and co.name = 'AP Calculus BC'
order by gp.position, cat.position, a.position;

-- 4. Forecast a grade for an assignment that has not been graded yet.
update public.assignments
   set forecast_score = 9
 where student_id = '<student id>' and title = 'Quiz 2.2';

-- 5. Forecast work that is not in Schoology yet (a placeholder).
insert into public.assignments (category_id, student_id, title, max_score, forecast_score, is_placeholder)
select cat.id, co.student_id, 'Unit 4 Test: Series', 100, 88, true
from public.categories cat
join public.grading_periods gp on gp.id = cat.period_id
join public.courses co on co.id = gp.course_id
where co.student_id = '<student id>' and co.name = 'AP Calculus BC'
  and gp.name = 'Q2' and cat.name = 'Tests';

-- 6. The real grade came in: replace the forecast with the actual score.
select title, forecast_score, actual_score, is_placeholder
from public.record_actual_score(
  (select id from public.assignments
    where student_id = '<student id>' and title = 'Semester 1 Midterm Exam'),
  80);

-- 7. How accurate were my forecasts?
select title, forecast_percent, actual_percent, difference_points
from public.forecast_accuracy
where student_id = '<student id>'
order by difference_points;

-- 8. What do I need on the midterm to finish the semester with 90%? (F09)
select *
from public.required_score(
  (select id from public.assignments
    where student_id = '<student id>' and title = 'Semester 1 Midterm Exam'),
  90);

-- 9. Semester grades (F10).
select co.name, s.label, s.current_quarters_percent, s.current_exam_percent,
       s.exam_weight, s.current_percent, s.projected_percent
from public.semester_grade_summary s
join public.courses co on co.id = s.course_id
where s.student_id = '<student id>';

-- 10. Upcoming assignments, grouped by day (F11). NULL course = "Unfiled".
select due_at::date as day, title, coalesce(co.name, 'Unfiled') as course
from public.upcoming_items u
left join public.courses co on co.id = u.course_id
where u.student_id = '<student id>' and u.due_at >= now()
order by u.due_at;

-- 11. A grade's history: every change to one assignment's scores.
select h.changed_at, h.kind, h.old_score, h.new_score
from public.score_history h
join public.assignments a on a.id = h.assignment_id
where a.student_id = '<student id>' and a.title = 'Semester 1 Midterm Exam'
order by h.id;

-- 12. How many students, courses, and assignments are stored (admin only).
select (select count(*) from public.profiles)    as students,
       (select count(*) from public.courses)     as courses,
       (select count(*) from public.assignments) as assignments;
