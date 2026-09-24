-- =============================================================================
-- Tests for the schema, grade engine, forecasts, and row-level security.
--
-- Runs in one transaction and rolls back, so it leaves no data behind. It works
-- in the Supabase SQL editor (paste and run) and locally via run_local.sh.
-- Any failed check stops the script with "FAILED: <what>".
-- =============================================================================
begin;

create function pg_temp.expect(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAILED: % — got %, expected %', label, got, want;
  end if;
  raise notice 'ok  %', label;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Account creation: two students, three sign-in methods.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'ana@example.com', null,
   '{"full_name": "Ana Park", "username": "Ana_P", "phone": "+12065550100"}',
   '{"provider": "email", "providers": ["email", "google"]}'),
  ('b0000000-0000-0000-0000-00000000000b', 'ben@example.com', null,
   '{"full_name": "Ben Ortiz"}',
   '{"provider": "apple", "providers": ["apple"]}');

select pg_temp.expect('profile created with lowercased username',
  (select username from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a'), 'ana_p');
select pg_temp.expect('profile keeps phone from sign-up',
  (select phone from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a'), '+12065550100');
select pg_temp.expect('OAuth sign-up without username gets a generated one',
  (select username from public.profiles where id = 'b0000000-0000-0000-0000-00000000000b'), 'student_b000000000');
select pg_temp.expect('settings row created',
  (select theme::text from public.user_settings where student_id = 'b0000000-0000-0000-0000-00000000000b'), 'system');
select pg_temp.expect('Ana has two login methods',
  (select count(*) from public.login_methods where student_id = 'a0000000-0000-0000-0000-00000000000a'), 2::bigint);

-- Ana unlinks Google and links Microsoft.
update auth.users set raw_app_meta_data = '{"provider": "email", "providers": ["email", "azure"]}'
 where id = 'a0000000-0000-0000-0000-00000000000a';
select pg_temp.expect('login methods follow link / unlink',
  (select string_agg(provider::text, ',' order by provider::text) from public.login_methods
    where student_id = 'a0000000-0000-0000-0000-00000000000a'), 'azure,email');

-- -----------------------------------------------------------------------------
-- 2. Sign in as Ana and load the sample gradebook.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select public.load_sample_gradebook();

insert into public.user_devices (student_id, installation_id, device_name, platform, biometric_kind, biometric_unlock_enabled)
values ('a0000000-0000-0000-0000-00000000000a', 'install-1', 'Ana''s iPhone', 'ios', 'face_id', true);

select pg_temp.expect('five sample courses', (select count(*) from public.course_grades), 5::bigint);

-- -----------------------------------------------------------------------------
-- 3. Grade engine: current grades (actual scores only), checked by hand.
-- -----------------------------------------------------------------------------
-- Calc BC Q1: Tests 180/200 = 90, Quizzes 27/30 = 90 (Quiz 2.2 ungraded),
-- Homework drops the 0 → 36/40 = 90. Q1 = 90. Q2 and the midterm are ungraded,
-- so semester 1 = 90 and the course = 90.
select pg_temp.expect('Calc current %',
  (select current_percent from public.course_grades where course_name = 'AP Calculus BC'), 90.00);
select pg_temp.expect('Calc current letter',
  (select current_letter from public.course_grades where course_name = 'AP Calculus BC'), 'A-');
select pg_temp.expect('drop-lowest drops the 0 in Homework',
  (select current_percent from public.category_grade_summary s
     join public.courses c on c.id = s.course_id
     join public.grading_periods gp on gp.id = s.period_id
    where c.name = 'AP Calculus BC' and gp.name = 'Q1' and s.category_name = 'Homework'), 90.00);

-- Physics: Tests 41/50 = 82 (×50), Labs 37/40 = 92.5 (×25, excused lab left out),
-- Problem sets 41/45 = 91.11 (×25) → 86.90 → B.
select pg_temp.expect('Physics current % (excused left out)',
  (select current_percent from public.course_grades where course_name = 'AP Physics C: E&M'), 86.90);
select pg_temp.expect('Physics letter',
  (select current_letter from public.course_grades where course_name = 'AP Physics C: E&M'), 'B');

-- English: Essays 51/59 = 86.44 (×50), Reading 27+3 extra credit / 30 = 100 (×30),
-- Participation 19/20 = 95 (×20) → 92.22.
select pg_temp.expect('English current % (extra credit)',
  (select current_percent from public.course_grades where course_name = 'AP English Literature'), 92.22);

-- Spanish is a points course: 175 / 195 = 89.74.
select pg_temp.expect('Spanish current % (points course)',
  (select current_percent from public.course_grades where course_name = 'AP Spanish Language'), 89.74);

-- US Gov: Tests 47/55 = 85.45 (×60), Classwork 43/45 = 95.56 (×40) → 89.49.
select pg_temp.expect('US Gov current %',
  (select current_percent from public.course_grades where course_name = 'AP US Government'), 89.49);

-- -----------------------------------------------------------------------------
-- 4. Forecasts: projected grades.
-- -----------------------------------------------------------------------------
-- Calc projected: Quiz 2.2 forecast 9 → Quizzes 36/40 = 90, Q1 = 90.
-- Q2 placeholder Unit 3 Test forecast 90 → Q2 = 90. Midterm forecast 85 at 20%:
-- semester 1 = 90 × 0.8 + 85 × 0.2 = 89 → B+.
select pg_temp.expect('Calc projected % uses forecasts',
  (select projected_percent from public.course_grades where course_name = 'AP Calculus BC'), 89.00);
select pg_temp.expect('Calc projected letter',
  (select projected_letter from public.course_grades where course_name = 'AP Calculus BC'), 'B+');
select pg_temp.expect('Midterm semester card, projected',
  (select projected_percent from public.semester_grade_summary s
     join public.courses c on c.id = s.course_id
    where c.name = 'AP Calculus BC' and s.semester = 1), 89.00);

-- A forecast never overrides an actual grade: US Gov Unit 1 has actual 47 and
-- forecast 50, and the projected grade still uses 47.
select pg_temp.expect('actual wins over forecast in projection',
  (select projected_percent from public.course_grades where course_name = 'AP US Government'), 89.49);

-- -----------------------------------------------------------------------------
-- 5. Final-grade calculator (F09) on the Calc midterm.
-- -----------------------------------------------------------------------------
-- Need 90: 90 × 0.8 + x × 0.2 ≥ 90 → x ≥ 90.
select pg_temp.expect('required score for 90%',
  (select required_score from public.required_score(
     (select id from public.assignments where title = 'Semester 1 Midterm Exam'), 90)), 90.00);
select pg_temp.expect('93% is not possible',
  (select status from public.required_score(
     (select id from public.assignments where title = 'Semester 1 Midterm Exam'), 93)), 'not_possible');
select pg_temp.expect('70% is already secured',
  (select status from public.required_score(
     (select id from public.assignments where title = 'Semester 1 Midterm Exam'), 70)), 'already_secured');

-- -----------------------------------------------------------------------------
-- 6. Replace a forecast with the actual grade.
-- -----------------------------------------------------------------------------
select public.record_actual_score(
  (select id from public.assignments where title = 'Semester 1 Midterm Exam'), 80);

select pg_temp.expect('placeholder became a real assignment',
  (select is_placeholder from public.assignments where title = 'Semester 1 Midterm Exam'), false);
select pg_temp.expect('forecast is kept after the actual arrives',
  (select forecast_score from public.assignments where title = 'Semester 1 Midterm Exam'), 85.00);
-- Current: 90 × 0.8 + 80 × 0.2 = 88.
select pg_temp.expect('current grade now uses the actual midterm',
  (select current_percent from public.course_grades where course_name = 'AP Calculus BC'), 88.00);
select pg_temp.expect('forecast accuracy: 5 points below forecast',
  (select difference_points from public.forecast_accuracy where title = 'Semester 1 Midterm Exam'), -5.00);
select pg_temp.expect('score history logged forecast then actual',
  (select string_agg(h.kind::text, ',' order by h.id) from public.score_history h
     join public.assignments a on a.id = h.assignment_id
    where a.title = 'Semester 1 Midterm Exam'), 'forecast,actual');

-- -----------------------------------------------------------------------------
-- 7. Row-level security: Ben cannot see or touch Ana's data.
-- -----------------------------------------------------------------------------
select set_config('test.ana_period_id', (select id::text from public.grading_periods limit 1), true);
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select pg_temp.expect('Ben sees no courses', (select count(*) from public.courses), 0::bigint);
select pg_temp.expect('Ben sees no grades', (select count(*) from public.course_grades), 0::bigint);
select pg_temp.expect('Ben sees only his own profile', (select count(*) from public.profiles), 1::bigint);
select pg_temp.expect('Ben sees the built-in grading scale', (select count(*) from public.grading_scale_bands), 13::bigint);

with changed as (
  update public.assignments set actual_score = 0 returning 1
)
select pg_temp.expect('Ben cannot update Ana''s assignments', (select count(*) from changed), 0::bigint);

do $$
begin
  insert into public.courses (student_id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Hijacked');
  raise exception 'FAILED: Ben inserted a course for Ana';
exception when insufficient_privilege then
  raise notice 'ok  Ben cannot insert rows for Ana';
end;
$$;

do $$
begin
  update public.profiles set email = 'spoof@example.com';
  raise exception 'FAILED: profile email was editable';
exception when insufficient_privilege then
  raise notice 'ok  email can only change through Supabase Auth';
end;
$$;

-- Ben loads his own sample; it is separate from Ana's.
select public.load_sample_gradebook();
select pg_temp.expect('Ben has his own five courses', (select count(*) from public.courses), 5::bigint);
select pg_temp.expect('Ben''s Calc midterm is still a forecast (Ana''s change did not leak)',
  (select current_percent from public.course_grades where course_name = 'AP Calculus BC'), 90.00);

-- Pointing a row at another student's parent is rejected by the composite
-- foreign key, even when the row itself is labeled with Ben's own id.
do $$
begin
  insert into public.categories (period_id, student_id, name)
  values (current_setting('test.ana_period_id')::uuid, 'b0000000-0000-0000-0000-00000000000b', 'Sneaky');
  raise exception 'FAILED: cross-student category insert succeeded';
exception when foreign_key_violation then
  raise notice 'ok  a category cannot point at another student''s period';
end;
$$;

rollback;
