-- =============================================================================
-- Tests for the grade engine API (20260929000500_grade_api.sql): the grades
-- snapshot, manual forecasts, and sign-in checks.
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

-- The Calc BC course from a get_grades() snapshot.
create function pg_temp.calc(snapshot jsonb)
returns jsonb language sql as $$
  select c from jsonb_array_elements(snapshot -> 'courses') c
  where c ->> 'name' = 'AP Calculus BC';
$$;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'ana@example.com',
   '{"full_name": "Ana Park", "username": "ana_p"}', '{"providers": ["email"]}'),
  ('b0000000-0000-0000-0000-00000000000b', 'ben@example.com',
   '{"full_name": "Ben Ortiz", "username": "ben_o"}', '{"providers": ["email"]}');

-- -----------------------------------------------------------------------------
-- 1. Signed out: every endpoint refuses.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';

do $$
begin
  perform public.get_grades();
  raise exception 'FAILED: get_grades worked without a signed-in student';
exception when invalid_authorization_specification then
  raise notice 'ok  get_grades needs a signed-in student';
end;
$$;

do $$
begin
  perform public.set_forecast(gen_random_uuid(), 5);
  raise exception 'FAILED: set_forecast worked without a signed-in student';
exception when invalid_authorization_specification then
  raise notice 'ok  set_forecast needs a signed-in student';
end;
$$;

reset role;
set local role anon;
do $$
begin
  perform public.get_grades();
  raise exception 'FAILED: anon may call get_grades';
exception when insufficient_privilege then
  raise notice 'ok  anon cannot call the API at all';
end;
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. Snapshot: Ana's sample gradebook.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select public.load_sample_gradebook();

select pg_temp.expect('no arguments → every course',
  jsonb_array_length(public.get_grades() -> 'courses'), 5);
select pg_temp.expect('courses come in gradebook order',
  public.get_grades() -> 'courses' -> 0 ->> 'name', 'AP Calculus BC');
select pg_temp.expect('snapshot has a computed_at time',
  public.get_grades() ? 'computed_at', true);

-- Same numbers as the course_grades view (checked by hand in gradebook_test.sql).
select pg_temp.expect('Calc current percent',
  (pg_temp.calc(public.get_grades()) -> 'current' ->> 'percent')::numeric, 90.00);
select pg_temp.expect('Calc current letter',
  pg_temp.calc(public.get_grades()) -> 'current' ->> 'letter', 'A-');
select pg_temp.expect('Calc projected percent',
  (pg_temp.calc(public.get_grades()) -> 'projected' ->> 'percent')::numeric, 89.00);
select pg_temp.expect('snapshot matches the course_grades view for every course',
  (select count(*) from jsonb_array_elements(public.get_grades() -> 'courses') s
     join public.course_grades g on g.course_id = (s ->> 'course_id')::uuid
    where (s -> 'current' ->> 'percent')::numeric is not distinct from g.current_percent
      and (s -> 'projected' ->> 'percent')::numeric is not distinct from g.projected_percent),
  5::bigint);

select pg_temp.expect('Calc has Q1, Q2, and the midterm',
  (select string_agg(p ->> 'name', ',') from jsonb_array_elements(pg_temp.calc(public.get_grades()) -> 'periods') p),
  'Q1,Q2,Midterm Exam');
select pg_temp.expect('Q1 Homework drops the 0',
  (select (c ->> 'current_percent')::numeric
     from jsonb_array_elements(pg_temp.calc(public.get_grades()) -> 'periods') p,
          jsonb_array_elements(p -> 'categories') c
    where p ->> 'name' = 'Q1' and c ->> 'name' = 'Homework'), 90.00);
select pg_temp.expect('ungraded Q2 has no current percent',
  (select p -> 'current_percent'
     from jsonb_array_elements(pg_temp.calc(public.get_grades()) -> 'periods') p
    where p ->> 'name' = 'Q2'), 'null'::jsonb);
select pg_temp.expect('semester 1 card, projected',
  (pg_temp.calc(public.get_grades()) -> 'semesters' -> 0 ->> 'projected_percent')::numeric, 89.00);
select pg_temp.expect('ungraded work listed (Quiz 2.2, Unit 3 Test, midterm)',
  (select string_agg(u ->> 'title', ',' order by u ->> 'title')
     from jsonb_array_elements(pg_temp.calc(public.get_grades()) -> 'ungraded') u),
  'Quiz 2.2,Semester 1 Midterm Exam,Unit 3 Test: Integrals');
select pg_temp.expect('excused work is not listed as ungraded',
  (select count(*) from jsonb_array_elements(public.get_grades() -> 'courses') c,
          jsonb_array_elements(c -> 'ungraded') u
    where u ->> 'title' = 'Capacitor Lab'), 0::bigint);

select pg_temp.expect('one course by id',
  (select jsonb_array_length(public.get_grades(id) -> 'courses')
     from public.courses where name = 'AP Spanish Language'), 1);

do $$
begin
  perform public.get_grades(gen_random_uuid());
  raise exception 'FAILED: unknown course did not raise';
exception when no_data_found then
  raise notice 'ok  unknown course → not found';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Manual forecasts.
-- -----------------------------------------------------------------------------
-- Add a forecast-only Q2 Quiz: 8/10 in Quizzes (30%).
-- Q2 projected: Tests 90 (×50), Quizzes 80 (×30) → (4500 + 2400) / 80 = 86.25.
-- Semester 1 projected: (90 + 86.25) / 2 = 88.125 × 0.8 + 85 × 0.2 = 87.50.
select set_config('test.result', public.add_forecast(
  (select cat.id from public.categories cat
     join public.grading_periods gp on gp.id = cat.period_id
     join public.courses c on c.id = gp.course_id
    where c.name = 'AP Calculus BC' and gp.name = 'Q2' and cat.name = 'Quizzes'),
  '  Quiz 3.1  ', 10, 8, current_date + 3)::text, true);

select pg_temp.expect('add_forecast creates a placeholder',
  (current_setting('test.result')::jsonb -> 'assignment' ->> 'is_placeholder')::boolean, true);
select pg_temp.expect('add_forecast trims the title',
  current_setting('test.result')::jsonb -> 'assignment' ->> 'title', 'Quiz 3.1');
select pg_temp.expect('add_forecast returns the new projected grade',
  (current_setting('test.result')::jsonb -> 'course' -> 'projected' ->> 'percent')::numeric, 87.50);
select pg_temp.expect('current grade is unchanged by a forecast',
  (current_setting('test.result')::jsonb -> 'course' -> 'current' ->> 'percent')::numeric, 90.00);
select pg_temp.expect('the forecast is saved',
  (select forecast_score from public.assignments where title = 'Quiz 3.1'), 8.00);

-- Change it to 10/10: Q2 = (4500 + 3000) / 80 = 93.75,
-- semester 1 = (90 + 93.75) / 2 = 91.875 × 0.8 + 17 = 90.50.
select pg_temp.expect('set_forecast changes the projected grade',
  (public.set_forecast((select id from public.assignments where title = 'Quiz 3.1'), 10)
     -> 'course' -> 'projected' ->> 'percent')::numeric, 90.50);

-- Forecast on real, ungraded work: Problem Set 5 is graded, Quiz 2.2 is not.
select pg_temp.expect('set_forecast on an ungraded real assignment',
  (public.set_forecast((select id from public.assignments where title = 'Quiz 2.2'), 7)
     -> 'assignment' ->> 'forecast_score')::numeric, 7.00);
select pg_temp.expect('it stays a real assignment',
  (select is_placeholder from public.assignments where title = 'Quiz 2.2'), false);

-- remove_forecast: a real assignment keeps its row, a placeholder is deleted.
select pg_temp.expect('remove_forecast clears the forecast on a real assignment',
  public.remove_forecast((select id from public.assignments where title = 'Quiz 2.2'))
    -> 'assignment' -> 'forecast_score', 'null'::jsonb);
select pg_temp.expect('the real assignment is still there',
  (select count(*) from public.assignments where title = 'Quiz 2.2'), 1::bigint);
select pg_temp.expect('it is still listed as ungraded, now with no forecast',
  (select u -> 'forecast_score' from jsonb_array_elements(pg_temp.calc(public.get_grades()) -> 'ungraded') u
    where u ->> 'title' = 'Quiz 2.2'), 'null'::jsonb);
select pg_temp.expect('remove_forecast deletes a placeholder',
  public.remove_forecast((select id from public.assignments where title = 'Quiz 3.1')) -> 'assignment',
  'null'::jsonb);
select pg_temp.expect('placeholder is gone',
  (select count(*) from public.assignments where title = 'Quiz 3.1'), 0::bigint);
-- Back to the sample minus the Quiz 2.2 forecast: Quizzes Q1 = 27/30 = 90, same as before.
select pg_temp.expect('projected grade is back where it started',
  (pg_temp.calc(public.get_grades()) -> 'projected' ->> 'percent')::numeric, 89.00);

-- Score history records forecast changes made through the API.
select pg_temp.expect('score history logged the Quiz 2.2 forecast changes',
  (select string_agg(coalesce(h.new_score::text, 'null'), ',' order by h.id) from public.score_history h
     join public.assignments a on a.id = h.assignment_id
    where a.title = 'Quiz 2.2' and h.kind = 'forecast'), '9.00,7.00,null');

-- Bad input.
do $$
begin
  perform public.set_forecast((select id from public.assignments where title = 'Quiz 2.2'), -1);
  raise exception 'FAILED: negative forecast accepted';
exception when invalid_parameter_value then
  raise notice 'ok  negative forecast → bad request';
end;
$$;

do $$
begin
  perform public.add_forecast((select id from public.categories limit 1), '   ', 10, 5);
  raise exception 'FAILED: blank title accepted';
exception when invalid_parameter_value then
  raise notice 'ok  blank title → bad request';
end;
$$;

do $$
begin
  perform public.add_forecast((select id from public.categories limit 1), 'Zero', 0, 0);
  raise exception 'FAILED: zero points possible accepted';
exception when invalid_parameter_value then
  raise notice 'ok  zero points possible → bad request';
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Ben cannot read or forecast on Ana's gradebook.
-- -----------------------------------------------------------------------------
select set_config('test.ana_assignment', (select id::text from public.assignments where title = 'Quiz 2.2'), true);
select set_config('test.ana_category', (select id::text from public.categories limit 1), true);
select set_config('test.ana_course', (select id::text from public.courses limit 1), true);
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select pg_temp.expect('Ben''s snapshot is empty',
  public.get_grades() -> 'courses', '[]'::jsonb);

do $$
begin
  perform public.get_grades(current_setting('test.ana_course')::uuid);
  raise exception 'FAILED: Ben read Ana''s course';
exception when no_data_found then
  raise notice 'ok  Ana''s course is not found for Ben';
end;
$$;

do $$
begin
  perform public.set_forecast(current_setting('test.ana_assignment')::uuid, 10);
  raise exception 'FAILED: Ben forecast on Ana''s assignment';
exception when no_data_found then
  raise notice 'ok  Ben cannot forecast on Ana''s assignment';
end;
$$;

do $$
begin
  perform public.remove_forecast(current_setting('test.ana_assignment')::uuid);
  raise exception 'FAILED: Ben removed Ana''s forecast';
exception when no_data_found then
  raise notice 'ok  Ben cannot remove Ana''s forecast';
end;
$$;

do $$
begin
  perform public.add_forecast(current_setting('test.ana_category')::uuid, 'Sneaky', 10, 10);
  raise exception 'FAILED: Ben added a forecast to Ana''s category';
exception when no_data_found then
  raise notice 'ok  Ben cannot add a forecast to Ana''s category';
end;
$$;

rollback;
