-- =============================================================================
-- Tests for cloud sync (20261006000600_sync.sql): revisions, tombstones,
-- pull_changes and push_changes.
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

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'ana@example.com',
   '{"full_name": "Ana Park", "username": "ana_p"}', '{"providers": ["email"]}'),
  ('b0000000-0000-0000-0000-00000000000b', 'ben@example.com',
   '{"full_name": "Ben Ortiz", "username": "ben_o"}', '{"providers": ["email"]}');

-- -----------------------------------------------------------------------------
-- 1. Signed out: refused.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';
do $$
begin
  perform public.pull_changes(0);
  raise exception 'FAILED: pull_changes worked without a signed-in student';
exception when invalid_authorization_specification then
  raise notice 'ok  pull_changes needs a signed-in student';
end;
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. A first pull returns the whole gradebook; an up-to-date pull returns nothing.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select pg_temp.expect('empty account starts at revision 0',
  (public.pull_changes(0) ->> 'revision')::bigint, 0::bigint);

select public.load_sample_gradebook();

select set_config('test.head', public.pull_changes(0) ->> 'revision', true);
select pg_temp.expect('loading the sample moved the revision',
  current_setting('test.head')::bigint > 0, true);
select pg_temp.expect('first pull has every course',
  jsonb_array_length(public.pull_changes(0) -> 'courses'), 5);
select pg_temp.expect('first pull has every assignment',
  jsonb_array_length(public.pull_changes(0) -> 'assignments'),
  (select count(*)::int from public.assignments));
select pg_temp.expect('first pull has the upcoming items',
  jsonb_array_length(public.pull_changes(0) -> 'upcoming_items'), 7);
select pg_temp.expect('pull at the head: nothing changed (like a 304)',
  public.pull_changes(current_setting('test.head')::bigint) - 'revision',
  '{"courses": [], "grading_periods": [], "categories": [], "assignments": [], "upcoming_items": [], "deleted": []}'::jsonb);

-- -----------------------------------------------------------------------------
-- 3. One change → only that row comes back.
-- -----------------------------------------------------------------------------
select public.set_forecast((select id from public.assignments where title = 'Quiz 2.2'), 7);
select pg_temp.expect('pull after a forecast returns just that assignment',
  (select string_agg(a ->> 'title', ',')
     from jsonb_array_elements(public.pull_changes(current_setting('test.head')::bigint) -> 'assignments') a),
  'Quiz 2.2');
select pg_temp.expect('with the new forecast',
  (public.pull_changes(current_setting('test.head')::bigint) -> 'assignments' -> 0 ->> 'forecast_score')::numeric,
  7::numeric);

-- -----------------------------------------------------------------------------
-- 4. Deletes leave tombstones (cascades too).
-- -----------------------------------------------------------------------------
select set_config('test.head', public.pull_changes(0) ->> 'revision', true);
select set_config('test.spanish', (select id::text from public.courses where name = 'AP Spanish Language'), true);
delete from public.courses where name = 'AP Spanish Language';

select pg_temp.expect('deleted course is in the pull',
  (select count(*) from jsonb_array_elements(public.pull_changes(current_setting('test.head')::bigint) -> 'deleted') d
    where d ->> 'table_name' = 'courses' and d ->> 'row_id' = current_setting('test.spanish')), 1::bigint);
select pg_temp.expect('its assignments are tombstoned too',
  (select count(*) from jsonb_array_elements(public.pull_changes(current_setting('test.head')::bigint) -> 'deleted') d
    where d ->> 'table_name' = 'assignments'), 4::bigint);

-- -----------------------------------------------------------------------------
-- 5. push_changes: new rows, edits, deletes, in one call.
-- -----------------------------------------------------------------------------
select set_config('test.head', public.pull_changes(0) ->> 'revision', true);
select public.push_changes(jsonb_build_object(
  'courses', jsonb_build_array(jsonb_build_object(
    'id', 'c1000000-0000-0000-0000-000000000001', 'name', 'Chemistry', 'teacher', null,
    'grading_mode', 'weighted', 'position', 9)),
  'grading_periods', jsonb_build_array(jsonb_build_object(
    'id', 'c2000000-0000-0000-0000-000000000001', 'course_id', 'c1000000-0000-0000-0000-000000000001',
    'name', 'Q1', 'kind', 'quarter', 'semester', 1, 'weight', null, 'position', 1)),
  'categories', jsonb_build_array(jsonb_build_object(
    'id', 'c3000000-0000-0000-0000-000000000001', 'period_id', 'c2000000-0000-0000-0000-000000000001',
    'name', 'Labs', 'weight', 100, 'drop_lowest', 0, 'position', 1)),
  'assignments', jsonb_build_array(
    jsonb_build_object(
      'id', 'c4000000-0000-0000-0000-000000000001', 'category_id', 'c3000000-0000-0000-0000-000000000001',
      'title', 'Titration Lab', 'due_date', '2026-10-01', 'max_score', 20, 'actual_score', 18,
      'forecast_score', null, 'excused', false, 'extra_credit', false, 'is_placeholder', false,
      'position', 1),
    -- Its category was deleted on another device: skipped, not an error.
    jsonb_build_object(
      'id', 'c4000000-0000-0000-0000-000000000002', 'category_id', 'c3000000-0000-0000-0000-0000000000ff',
      'title', 'Orphan', 'max_score', 10, 'position', 2)),
  'deleted', jsonb_build_array(jsonb_build_object(
    'table_name', 'assignments', 'row_id', (select id from public.assignments where title = 'Seminar 2')))
));

select pg_temp.expect('pushed course is saved for Ana',
  (select student_id from public.courses where name = 'Chemistry'),
  'a0000000-0000-0000-0000-00000000000a'::uuid);
select pg_temp.expect('pushed assignment is saved',
  (select actual_score from public.assignments where title = 'Titration Lab'), 18.00);
select pg_temp.expect('orphan row is skipped',
  (select count(*) from public.assignments where title = 'Orphan'), 0::bigint);
select pg_temp.expect('pushed delete removed the row',
  (select count(*) from public.assignments where title = 'Seminar 2'), 0::bigint);
select pg_temp.expect('the push shows up in the next pull',
  jsonb_array_length(public.pull_changes(current_setting('test.head')::bigint) -> 'courses'), 1);

-- Editing a pushed row bumps its revision again.
select set_config('test.head', public.pull_changes(0) ->> 'revision', true);
select public.push_changes(jsonb_build_object('assignments', jsonb_build_array(jsonb_build_object(
  'id', 'c4000000-0000-0000-0000-000000000001', 'category_id', 'c3000000-0000-0000-0000-000000000001',
  'title', 'Titration Lab', 'max_score', 20, 'actual_score', 19, 'position', 1))));
select pg_temp.expect('an edit is pulled once',
  (public.pull_changes(current_setting('test.head')::bigint) -> 'assignments' -> 0 ->> 'actual_score')::numeric,
  19::numeric);

-- The same calendar event pushed under a new id replaces the old copy.
select public.push_changes(jsonb_build_object('upcoming_items', jsonb_build_array(jsonb_build_object(
  'id', 'c5000000-0000-0000-0000-000000000001', 'external_uid', 'sample-1',
  'title', 'Problem Set 6', 'due_at', '2026-10-07T23:59:00Z'))));
select pg_temp.expect('duplicate calendar event is replaced, not doubled',
  (select count(*) from public.upcoming_items where external_uid = 'sample-1'), 1::bigint);

-- -----------------------------------------------------------------------------
-- 6. Ben sees none of it and cannot overwrite Ana's rows.
-- -----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select pg_temp.expect('Ben''s pull is empty',
  jsonb_array_length(public.pull_changes(0) -> 'courses') + jsonb_array_length(public.pull_changes(0) -> 'deleted'), 0);

do $$
begin
  perform public.push_changes(jsonb_build_object('courses', jsonb_build_array(jsonb_build_object(
    'id', 'c1000000-0000-0000-0000-000000000001', 'name', 'Hijacked', 'grading_mode', 'points'))));
  raise exception 'FAILED: Ben overwrote Ana''s course';
exception when insufficient_privilege then
  raise notice 'ok  Ben cannot overwrite Ana''s course';
end;
$$;

select public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
  'table_name', 'courses', 'row_id', 'c1000000-0000-0000-0000-000000000001'))));
reset role;
select pg_temp.expect('Ben''s delete of Ana''s course did nothing',
  (select name from public.courses where id = 'c1000000-0000-0000-0000-000000000001'), 'Chemistry');

rollback;
