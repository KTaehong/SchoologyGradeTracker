-- =============================================================================
-- load_sample_gradebook(): the "load sample" gradebook from F01/F02.
--
-- The same courses as mobile/src/data/demo.ts, plus forecasts and semester exams
-- so the projection features have something to show.
--
-- From the app:          select public.load_sample_gradebook();
-- From the SQL editor:   select public.load_sample_gradebook('<student uuid>');
-- =============================================================================

create or replace function public.load_sample_gradebook(p_student_id uuid default auth.uid())
returns void
language plpgsql
set search_path = ''
as $$
declare
  -- Each course: name, teacher, mode, and Q1 categories. Each assignment is
  -- [title, actual score, max score, days ago, options]. Options can set
  -- excused (ex), extra credit (ec), or a forecast (f). Q2 is created with the
  -- same categories; `q2` and `midterm` add forecast-only placeholders there.
  sample jsonb := $json$
  [
    {"name": "AP Calculus BC", "teacher": "Ms. Rivera", "mode": "weighted",
     "categories": [
       {"name": "Tests", "weight": 50, "assignments": [
         ["Unit 1 Test: Limits", 88, 100, 30], ["Unit 2 Test: Derivatives", 92, 100, 9]]},
       {"name": "Quizzes", "weight": 30, "assignments": [
         ["Quiz 1.1", 9, 10, 35], ["Quiz 1.2", 8, 10, 26], ["Quiz 2.1", 10, 10, 16],
         ["Quiz 2.2", null, 10, 2, {"f": 9}]]},
       {"name": "Homework", "weight": 20, "drop": 1, "assignments": [
         ["Problem Set 1", 10, 10, 38], ["Problem Set 2", 7, 10, 31], ["Problem Set 3", 10, 10, 24],
         ["Problem Set 4", 0, 10, 17], ["Problem Set 5", 9, 10, 10]]}
     ],
     "q2": {"Tests": [["Unit 3 Test: Integrals", 90, 100, -10]]},
     "midterm": ["Semester 1 Midterm Exam", 85, 100, -60]},
    {"name": "AP Physics C: E&M", "teacher": "Mr. Okafor", "mode": "weighted",
     "categories": [
       {"name": "Tests", "weight": 50, "assignments": [["Electrostatics Test", 41, 50, 20]]},
       {"name": "Labs", "weight": 25, "assignments": [
         ["Coulomb's Law Lab", 18, 20, 33], ["Electric Field Mapping Lab", 19, 20, 19],
         ["Capacitor Lab", null, 20, 5, {"ex": true}]]},
       {"name": "Problem Sets", "weight": 25, "assignments": [
         ["PS 1: Charge & Force", 14, 15, 36], ["PS 2: Gauss’s Law", 12, 15, 22],
         ["PS 3: Potential", 15, 15, 8]]}
     ]},
    {"name": "AP English Literature", "teacher": "Dr. Chen", "mode": "weighted",
     "categories": [
       {"name": "Essays", "weight": 50, "assignments": [
         ["Poetry Analysis Essay", 44, 50, 25], ["Prose Timed Write", 7, 9, 11, {"f": 8}]]},
       {"name": "Reading Quizzes", "weight": 30, "assignments": [
         ["Frankenstein Ch. 1–5", 9, 10, 32], ["Frankenstein Ch. 6–12", 10, 10, 23],
         ["Frankenstein Ch. 13–24", 8, 10, 14], ["Bonus: Author Research", 3, 0, 12, {"ec": true}]]},
       {"name": "Participation", "weight": 20, "assignments": [
         ["Seminar 1", 10, 10, 29], ["Seminar 2", 9, 10, 15]]}
     ]},
    {"name": "AP Spanish Language", "teacher": "Sra. Morales", "mode": "points",
     "categories": [
       {"name": "All work", "weight": null, "assignments": [
         ["Vocab Quiz: Familia", 18, 20, 34], ["Presentational Speaking", 45, 50, 21],
         ["Email Reply", 24, 25, 13], ["Unit 1 Exam", 88, 100, 6]]}
     ]},
    {"name": "AP US Government", "teacher": "Mr. Patel", "mode": "weighted",
     "categories": [
       {"name": "Tests", "weight": 60, "assignments": [["Unit 1: Foundations", 47, 55, 18, {"f": 50}]]},
       {"name": "Classwork", "weight": 40, "assignments": [
         ["Federalist 10 Reading Notes", 10, 10, 37], ["Constitution Scavenger Hunt", 19, 20, 27],
         ["Court Case Brief", 14, 15, 7]]}
     ]}
  ]
  $json$;

  upcoming jsonb := $json$
  [
    ["Problem Set 6", "AP Calculus BC", 1],
    ["Seminar 3 prep questions", "AP English Literature", 1],
    ["PS 4: Capacitance", "AP Physics C: E&M", 3],
    ["Unit 2 Test: Branches of Government", "AP US Government", 5],
    ["Interpersonal Speaking Practice", "AP Spanish Language", 6],
    ["College Counseling Survey", null, 8],
    ["Unit 3 Test: Integrals", "AP Calculus BC", 10]
  ]
  $json$;

  v_import_id uuid;
  v_course    jsonb;
  v_cat       jsonb;
  v_row       jsonb;
  v_course_id uuid;
  v_q1_id     uuid;
  v_q2_id     uuid;
  v_cat_id    uuid;
  v_course_no integer := 0;
  v_cat_no    integer;
  v_row_no    integer;
  v_rows      integer := 0;
begin
  if p_student_id is null then
    raise exception 'Not signed in, and no student id given';
  end if;
  if exists (select 1 from public.courses where student_id = p_student_id) then
    raise exception 'This student already has courses; the sample only loads into an empty gradebook';
  end if;

  insert into public.imports (student_id, source) values (p_student_id, 'sample')
  returning id into v_import_id;

  for v_course in select value from jsonb_array_elements(sample) loop
    v_course_no := v_course_no + 1;

    insert into public.courses (student_id, name, teacher, grading_mode, school_year, source, position)
    values (p_student_id, v_course ->> 'name', v_course ->> 'teacher',
            (v_course ->> 'mode')::public.grading_mode, '2026-27', 'sample', v_course_no)
    returning id into v_course_id;

    insert into public.grading_periods (course_id, student_id, name, kind, semester, position)
    values (v_course_id, p_student_id, 'Q1', 'quarter', 1, 1) returning id into v_q1_id;
    insert into public.grading_periods (course_id, student_id, name, kind, semester, position)
    values (v_course_id, p_student_id, 'Q2', 'quarter', 1, 2) returning id into v_q2_id;

    v_cat_no := 0;
    for v_cat in select value from jsonb_array_elements(v_course -> 'categories') loop
      v_cat_no := v_cat_no + 1;

      -- Q1: the graded work.
      insert into public.categories (period_id, student_id, name, weight, drop_lowest, position)
      values (v_q1_id, p_student_id, v_cat ->> 'name', (v_cat ->> 'weight')::numeric,
              coalesce((v_cat ->> 'drop')::smallint, 0), v_cat_no)
      returning id into v_cat_id;

      v_row_no := 0;
      for v_row in select value from jsonb_array_elements(v_cat -> 'assignments') loop
        v_row_no := v_row_no + 1;
        v_rows := v_rows + 1;
        insert into public.assignments (
          category_id, student_id, title, actual_score, max_score, due_date,
          excused, extra_credit, forecast_score, source, import_id, position)
        values (
          v_cat_id, p_student_id, v_row ->> 0, (v_row ->> 1)::numeric, (v_row ->> 2)::numeric,
          current_date - (v_row ->> 3)::integer,
          coalesce((v_row -> 4 ->> 'ex')::boolean, false),
          coalesce((v_row -> 4 ->> 'ec')::boolean, false),
          (v_row -> 4 ->> 'f')::numeric,
          'sample', v_import_id, v_row_no);
      end loop;

      -- Q2: same categories, nothing graded yet, plus any forecast placeholders.
      insert into public.categories (period_id, student_id, name, weight, drop_lowest, position)
      values (v_q2_id, p_student_id, v_cat ->> 'name', (v_cat ->> 'weight')::numeric,
              coalesce((v_cat ->> 'drop')::smallint, 0), v_cat_no)
      returning id into v_cat_id;

      v_row_no := 0;
      for v_row in select value from jsonb_array_elements(v_course -> 'q2' -> (v_cat ->> 'name')) loop
        v_row_no := v_row_no + 1;
        insert into public.assignments (
          category_id, student_id, title, forecast_score, max_score, due_date,
          is_placeholder, source, import_id, position)
        values (
          v_cat_id, p_student_id, v_row ->> 0, (v_row ->> 1)::numeric, (v_row ->> 2)::numeric,
          current_date - (v_row ->> 3)::integer, true, 'sample', v_import_id, v_row_no);
      end loop;
    end loop;

    -- Semester 1 midterm exam: its own period, counting 20% of the semester grade.
    if v_course ? 'midterm' then
      v_row := v_course -> 'midterm';
      insert into public.grading_periods (course_id, student_id, name, kind, semester, weight, position)
      values (v_course_id, p_student_id, 'Midterm Exam', 'semester_exam', 1, 20, 3)
      returning id into v_q2_id;
      insert into public.categories (period_id, student_id, name, position)
      values (v_q2_id, p_student_id, 'Exam', 1)
      returning id into v_cat_id;
      insert into public.assignments (
        category_id, student_id, title, forecast_score, max_score, due_date,
        is_placeholder, source, import_id)
      values (
        v_cat_id, p_student_id, v_row ->> 0, (v_row ->> 1)::numeric, (v_row ->> 2)::numeric,
        current_date - (v_row ->> 3)::integer, true, 'sample', v_import_id);
    end if;
  end loop;

  insert into public.upcoming_items (student_id, course_id, external_uid, title, due_at)
  select p_student_id,
         (select c.id from public.courses c
           where c.student_id = p_student_id and c.name = u.value ->> 1),
         'sample-' || u.ordinality,
         u.value ->> 0,
         date_trunc('day', now()) + make_interval(days => (u.value ->> 2)::integer)
           + interval '23 hours 59 minutes'
  from jsonb_array_elements(upcoming) with ordinality as u;

  update public.imports set rows_imported = v_rows where id = v_import_id;
end;
$$;
