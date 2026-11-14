-- =============================================================================
-- Demo accounts: three students who CAN sign in, each with different courses.
--
-- How to use (Supabase dashboard → SQL Editor):
--   1. Paste this file.
--   2. Change the password on the line marked "SET THE PASSWORD HERE".
--   3. Run. Then sign in to the app with a username below and that password.
--
--   Username         Student         Courses
--   maya_torres      Maya Torres     AP Biology, AP Statistics,
--                                    Honors English 11, AP World History
--   jordan_brooks    Jordan Brooks   Algebra 2, Chemistry, US History,
--                                    Spanish 2, Physical Education
--   sam_nguyen       Sam Nguyen      AP Computer Science A, AP Macroeconomics,
--                                    Honors Physics, Studio Art
--
-- Supabase signs people in by email, so each account's email is
-- <username>@demo.example.com (a domain that can never receive mail). The app
-- adds that ending when a username is typed: see mobile/src/lib/sign-in-form.ts.
--
-- All three use the same password. Running the file again keeps the gradebooks
-- and only sets the password (and the email above) again, so it is also how you
-- change the password.
--
-- Do not commit the real password: change it in the SQL Editor, not in the
-- repository. These accounts are separate from the three students in seed.sql
-- (ana_park, ben_ortiz, chris_lee), who have no password.
--
-- To remove the demo accounts and all their data:
--   delete from auth.users where email like '%@demo.example.com';
-- =============================================================================

do $$
declare
  v_password constant text := 'CHANGE-ME';   -- <== SET THE PASSWORD HERE (8+ characters)

  -- Each student: id, name, username, courses, upcoming items.
  -- Courses use the format of load_sample_gradebook(): each assignment is
  -- [title, actual score, max score, days ago, options]. Options can set
  -- excused (ex), extra credit (ec), or a forecast (f). Q2 gets the same
  -- categories; `q2` and `midterm` add forecast-only placeholders.
  students constant jsonb := $json$
  [
    {"id": "44444444-4444-4444-8444-444444444444",
     "name": "Maya Torres", "username": "maya_torres",
     "courses": [
       {"name": "AP Biology", "teacher": "Dr. Whitfield", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 50, "assignments": [
            ["Unit 1 Test: Chemistry of Life", 94, 100, 31], ["Unit 2 Test: Cell Structure", 97, 100, 10]]},
          {"name": "Labs", "weight": 30, "assignments": [
            ["Enzyme Catalysis Lab", 28, 30, 27], ["Diffusion and Osmosis Lab", 30, 30, 15],
            ["Photosynthesis Lab", null, 30, 3, {"f": 28}]]},
          {"name": "Homework", "weight": 20, "drop": 1, "assignments": [
            ["Reading Guide 1", 10, 10, 36], ["Reading Guide 2", 10, 10, 29],
            ["Reading Guide 3", 8, 10, 20], ["Reading Guide 4", 10, 10, 12]]}
        ],
        "q2": {"Tests": [["Unit 3 Test: Cellular Energetics", 93, 100, -12]]},
        "midterm": ["Semester 1 Midterm Exam", 92, 100, -58]},
       {"name": "AP Statistics", "teacher": "Mr. Lindqvist", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 60, "assignments": [
            ["Chapter 1–2 Test: Describing Data", 91, 100, 24], ["Chapter 3 Test: Regression", 46, 50, 8]]},
          {"name": "Quizzes", "weight": 25, "assignments": [
            ["Quiz: Boxplots", 19, 20, 33], ["Quiz: Normal Distributions", 17, 20, 19],
            ["Quiz: Residuals", 20, 20, 11]]},
          {"name": "Homework", "weight": 15, "assignments": [
            ["Homework Check 1", 5, 5, 34], ["Homework Check 2", 5, 5, 21], ["Homework Check 3", 4, 5, 9]]}
        ]},
       {"name": "Honors English 11", "teacher": "Ms. Abernathy", "mode": "weighted",
        "categories": [
          {"name": "Essays", "weight": 45, "assignments": [
            ["The Great Gatsby Essay", 95, 100, 22], ["Rhetorical Analysis Draft", null, 50, 4, {"f": 46}]]},
          {"name": "Reading Quizzes", "weight": 25, "assignments": [
            ["Gatsby Ch. 1–3", 10, 10, 35], ["Gatsby Ch. 4–6", 9, 10, 28], ["Gatsby Ch. 7–9", 10, 10, 23]]},
          {"name": "Vocabulary", "weight": 15, "assignments": [
            ["Vocab Unit 1", 24, 25, 30], ["Vocab Unit 2", 25, 25, 16]]},
          {"name": "Participation", "weight": 15, "assignments": [
            ["Socratic Seminar 1", 20, 20, 26], ["Socratic Seminar 2", 19, 20, 13]]}
        ]},
       {"name": "AP World History", "teacher": "Mr. Castellano", "mode": "points",
        "categories": [
          {"name": "All work", "weight": null, "assignments": [
            ["Unit 1 Exam: Global Tapestry", 52, 60, 25], ["Document-Based Question 1", 6, 7, 18],
            ["Silk Roads Map Project", 38, 40, 14], ["Unit 2 Reading Quiz", 13, 15, 7],
            ["Bonus: Museum Visit", 5, 0, 6, {"ec": true}]]}
        ]}
     ],
     "upcoming": [
       ["Photosynthesis Lab report", "AP Biology", 1],
       ["Rhetorical Analysis final draft", "Honors English 11", 2],
       ["Chapter 4 Homework Check", "AP Statistics", 4],
       ["Unit 2 Exam: Networks of Exchange", "AP World History", 6],
       ["Unit 3 Test: Cellular Energetics", "AP Biology", 12]
     ]},

    {"id": "55555555-5555-4555-8555-555555555555",
     "name": "Jordan Brooks", "username": "jordan_brooks",
     "courses": [
       {"name": "Algebra 2", "teacher": "Mrs. Donnelly", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 50, "assignments": [
            ["Chapter 1 Test: Linear Functions", 71, 100, 29], ["Chapter 2 Test: Quadratics", 64, 100, 9]]},
          {"name": "Quizzes", "weight": 30, "assignments": [
            ["Quiz: Slope", 8, 10, 34], ["Quiz: Systems", 6, 10, 23], ["Quiz: Factoring", 7, 10, 14],
            ["Quiz: Completing the Square", null, 10, 2, {"f": 8}]]},
          {"name": "Homework", "weight": 20, "drop": 1, "assignments": [
            ["Homework 1", 10, 10, 36], ["Homework 2", 0, 10, 30], ["Homework 3", 9, 10, 22],
            ["Homework 4", 10, 10, 15], ["Homework 5", 5, 10, 8]]}
        ],
        "q2": {"Tests": [["Chapter 3 Test: Polynomials", 80, 100, -11]]},
        "midterm": ["Semester 1 Midterm Exam", 75, 100, -59]},
       {"name": "Chemistry", "teacher": "Mr. Hargrove", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 45, "assignments": [
            ["Matter and Measurement Test", 82, 100, 26], ["Atomic Structure Test", 77, 100, 7]]},
          {"name": "Labs", "weight": 35, "assignments": [
            ["Density Lab", 23, 25, 32], ["Flame Test Lab", 25, 25, 18],
            ["Separation of Mixtures Lab", null, 25, 12, {"ex": true}]]},
          {"name": "Classwork", "weight": 20, "assignments": [
            ["Significant Figures Worksheet", 12, 15, 35], ["Periodic Table Scavenger Hunt", 15, 15, 16]]}
        ]},
       {"name": "US History", "teacher": "Ms. Okonkwo", "mode": "points",
        "categories": [
          {"name": "All work", "weight": null, "assignments": [
            ["Colonial America Test", 68, 80, 27], ["Revolution Timeline Project", 45, 50, 19],
            ["Constitution Quiz", 16, 20, 13], ["Current Events Journal", 18, 20, 5]]}
        ]},
       {"name": "Spanish 2", "teacher": "Sr. Delgado", "mode": "weighted",
        "categories": [
          {"name": "Exams", "weight": 40, "assignments": [["Examen: Unidad 1", 86, 100, 21]]},
          {"name": "Speaking", "weight": 30, "assignments": [
            ["Diálogo: En el restaurante", 27, 30, 28], ["Presentación: Mi familia", 25, 30, 10]]},
          {"name": "Homework", "weight": 30, "assignments": [
            ["Tarea 1", 10, 10, 33], ["Tarea 2", 9, 10, 24], ["Tarea 3", 10, 10, 11]]}
        ]},
       {"name": "Physical Education", "teacher": "Coach Ramirez", "mode": "points",
        "categories": [
          {"name": "All work", "weight": null, "assignments": [
            ["Participation: September", 50, 50, 44], ["Participation: October", 48, 50, 13],
            ["Mile Run", 18, 20, 20], ["Fitness Log", 9, 10, 6]]}
        ]}
     ],
     "upcoming": [
       ["Quiz: Completing the Square retake", "Algebra 2", 1],
       ["Periodic Trends Worksheet", "Chemistry", 2],
       ["Tarea 4", "Spanish 2", 3],
       ["Civil War Essay outline", "US History", 5],
       ["Yearbook photo forms", null, 7],
       ["Chapter 3 Test: Polynomials", "Algebra 2", 11]
     ]},

    {"id": "66666666-6666-4666-8666-666666666666",
     "name": "Sam Nguyen", "username": "sam_nguyen",
     "courses": [
       {"name": "AP Computer Science A", "teacher": "Ms. Petrova", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 40, "assignments": [
            ["Unit 1 Test: Primitive Types", 38, 40, 28], ["Unit 2 Test: Using Objects", 35, 40, 9]]},
          {"name": "Projects", "weight": 40, "assignments": [
            ["Magpie Chatbot Lab", 48, 50, 23], ["Picture Lab", 50, 50, 12],
            ["Elevens Card Game", null, 50, -4, {"f": 47}]]},
          {"name": "Practice", "weight": 20, "drop": 1, "assignments": [
            ["CodingBat Set 1", 10, 10, 33], ["CodingBat Set 2", 10, 10, 26],
            ["CodingBat Set 3", 6, 10, 17], ["CodingBat Set 4", 10, 10, 10]]}
        ],
        "q2": {"Tests": [["Unit 4 Test: Iteration", 88, 100, -13]]},
        "midterm": ["Semester 1 Midterm Exam", 90, 100, -57]},
       {"name": "AP Macroeconomics", "teacher": "Mr. Feldman", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 65, "assignments": [
            ["Unit 1 Test: Basic Economic Concepts", 84, 100, 25], ["Unit 2 Test: Economic Indicators", 79, 100, 6]]},
          {"name": "Problem Sets", "weight": 35, "assignments": [
            ["PS 1: Opportunity Cost", 18, 20, 31], ["PS 2: Supply and Demand", 16, 20, 20],
            ["PS 3: GDP and Inflation", 19, 20, 8]]}
        ],
        "q2": {"Tests": [["Unit 3 Test: National Income", 85, 100, -9]]}},
       {"name": "Honors Physics", "teacher": "Dr. Iyer", "mode": "weighted",
        "categories": [
          {"name": "Tests", "weight": 50, "assignments": [
            ["Kinematics Test", 73, 100, 22], ["Forces Test", 81, 100, 5, {"f": 85}]]},
          {"name": "Labs", "weight": 30, "assignments": [
            ["Motion Graphs Lab", 17, 20, 30], ["Projectile Launcher Lab", 19, 20, 16],
            ["Atwood Machine Lab", 16, 20, 7]]},
          {"name": "Homework", "weight": 20, "assignments": [
            ["WebAssign 1", 9, 10, 32], ["WebAssign 2", 7, 10, 24], ["WebAssign 3", 8, 10, 11]]}
        ]},
       {"name": "Studio Art", "teacher": "Ms. Laurent", "mode": "points",
        "categories": [
          {"name": "All work", "weight": null, "assignments": [
            ["Sketchbook Check 1", 25, 25, 34], ["Still Life in Charcoal", 92, 100, 21],
            ["Sketchbook Check 2", 23, 25, 14], ["Self-Portrait", 96, 100, 4]]}
        ]}
     ],
     "upcoming": [
       ["PS 4: Unemployment", "AP Macroeconomics", 1],
       ["Elevens Card Game", "AP Computer Science A", 4],
       ["Energy Lab pre-lab questions", "Honors Physics", 5],
       ["Sketchbook Check 3", "Studio Art", 8],
       ["Unit 4 Test: Iteration", "AP Computer Science A", 13]
     ]}
  ]
  $json$;

  v_student   jsonb;
  v_course    jsonb;
  v_cat       jsonb;
  v_row       jsonb;
  v_id        uuid;
  v_email     text;
  v_import_id uuid;
  v_course_id uuid;
  v_q1_id     uuid;
  v_q2_id     uuid;
  v_cat_id    uuid;
  v_course_no integer;
  v_cat_no    integer;
  v_row_no    integer;
  v_rows      integer;
  v_new       integer := 0;
begin
  if v_password = 'CHANGE-' || 'ME' or char_length(v_password) < 8 then
    raise exception 'Set v_password near the top of this file first (8 or more characters).';
  end if;

  for v_student in select value from jsonb_array_elements(students) loop
    v_id := (v_student ->> 'id')::uuid;
    v_email := (v_student ->> 'username') || '@demo.example.com';

    -- Already loaded: keep the gradebook, set the password and email again.
    if exists (select 1 from auth.users where id = v_id) then
      update auth.users
         set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
             email = v_email,
             updated_at = now()
       where id = v_id;
      update auth.identities
         set identity_data = identity_data || jsonb_build_object('email', v_email),
             updated_at = now()
       where user_id = v_id and provider = 'email';
      continue;
    end if;
    v_new := v_new + 1;

    -- 1. The account. The sign-up triggers create the profile, settings and
    --    login method. The four token columns must be '' (not null), or
    --    Supabase Auth refuses the sign-in.
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change, email_change_token_new)
    values
      ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
       v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
       now(), now(), '{"provider": "email", "providers": ["email"]}',
       jsonb_build_object('full_name', v_student ->> 'name', 'username', v_student ->> 'username'),
       '', '', '', '');

    insert into auth.identities
      (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
    values
      (gen_random_uuid(), v_id, 'email', v_id::text,
       jsonb_build_object('sub', v_id::text, 'email', v_email,
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now());

    update public.profiles set school_name = 'American Heritage School', graduation_year = 2027
     where id = v_id;
    update public.user_settings set sync_enabled = true, onboarding_completed_at = now()
     where student_id = v_id;

    -- 2. The gradebook (same steps as load_sample_gradebook).
    insert into public.imports (student_id, source) values (v_id, 'sample')
    returning id into v_import_id;
    v_course_no := 0;
    v_rows := 0;

    for v_course in select value from jsonb_array_elements(v_student -> 'courses') loop
      v_course_no := v_course_no + 1;

      insert into public.courses (student_id, name, teacher, grading_mode, school_year, source, position)
      values (v_id, v_course ->> 'name', v_course ->> 'teacher',
              (v_course ->> 'mode')::public.grading_mode, '2026-27', 'sample', v_course_no)
      returning id into v_course_id;

      insert into public.grading_periods (course_id, student_id, name, kind, semester, position)
      values (v_course_id, v_id, 'Q1', 'quarter', 1, 1) returning id into v_q1_id;
      insert into public.grading_periods (course_id, student_id, name, kind, semester, position)
      values (v_course_id, v_id, 'Q2', 'quarter', 1, 2) returning id into v_q2_id;

      v_cat_no := 0;
      for v_cat in select value from jsonb_array_elements(v_course -> 'categories') loop
        v_cat_no := v_cat_no + 1;

        -- Q1: the graded work.
        insert into public.categories (period_id, student_id, name, weight, drop_lowest, position)
        values (v_q1_id, v_id, v_cat ->> 'name', (v_cat ->> 'weight')::numeric,
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
            v_cat_id, v_id, v_row ->> 0, (v_row ->> 1)::numeric, (v_row ->> 2)::numeric,
            current_date - (v_row ->> 3)::integer,
            coalesce((v_row -> 4 ->> 'ex')::boolean, false),
            coalesce((v_row -> 4 ->> 'ec')::boolean, false),
            (v_row -> 4 ->> 'f')::numeric,
            'sample', v_import_id, v_row_no);
        end loop;

        -- Q2: same categories, nothing graded yet, plus forecast placeholders.
        insert into public.categories (period_id, student_id, name, weight, drop_lowest, position)
        values (v_q2_id, v_id, v_cat ->> 'name', (v_cat ->> 'weight')::numeric,
                coalesce((v_cat ->> 'drop')::smallint, 0), v_cat_no)
        returning id into v_cat_id;

        v_row_no := 0;
        for v_row in select value from jsonb_array_elements(v_course -> 'q2' -> (v_cat ->> 'name')) loop
          v_row_no := v_row_no + 1;
          insert into public.assignments (
            category_id, student_id, title, forecast_score, max_score, due_date,
            is_placeholder, source, import_id, position)
          values (
            v_cat_id, v_id, v_row ->> 0, (v_row ->> 1)::numeric, (v_row ->> 2)::numeric,
            current_date - (v_row ->> 3)::integer, true, 'sample', v_import_id, v_row_no);
        end loop;
      end loop;

      -- Semester 1 midterm exam: its own period, 20% of the semester grade.
      if v_course ? 'midterm' then
        v_row := v_course -> 'midterm';
        insert into public.grading_periods (course_id, student_id, name, kind, semester, weight, position)
        values (v_course_id, v_id, 'Midterm Exam', 'semester_exam', 1, 20, 3)
        returning id into v_q2_id;
        insert into public.categories (period_id, student_id, name, position)
        values (v_q2_id, v_id, 'Exam', 1)
        returning id into v_cat_id;
        insert into public.assignments (
          category_id, student_id, title, forecast_score, max_score, due_date,
          is_placeholder, source, import_id)
        values (
          v_cat_id, v_id, v_row ->> 0, (v_row ->> 1)::numeric, (v_row ->> 2)::numeric,
          current_date - (v_row ->> 3)::integer, true, 'sample', v_import_id);
      end if;
    end loop;

    insert into public.upcoming_items (student_id, course_id, external_uid, title, due_at)
    select v_id,
           (select c.id from public.courses c
             where c.student_id = v_id and c.name = u.value ->> 1),
           'demo-' || u.ordinality,
           u.value ->> 0,
           date_trunc('day', now()) + make_interval(days => (u.value ->> 2)::integer)
             + interval '23 hours 59 minutes'
    from jsonb_array_elements(v_student -> 'upcoming') with ordinality as u;

    update public.imports set rows_imported = v_rows where id = v_import_id;
  end loop;

  if v_new = 0 then
    raise notice 'Demo accounts already exist. Their password was set again.';
  else
    raise notice 'Created % demo account(s): maya_torres, jordan_brooks and sam_nguyen.', v_new;
  end if;
end;
$$;
