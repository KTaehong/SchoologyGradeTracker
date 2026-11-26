-- =============================================================================
-- Tests for 20261126001100_sync_conflicts_and_cleanup.sql.
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
  ('33333333-0000-0000-0000-000000000001', 'conflict@example.com',
   '{"username": "conflict_c"}', '{"providers": ["email"]}');

-- -----------------------------------------------------------------------------
-- 1. push_changes does not overwrite a row changed after the phone's pull.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-0000-0000-0000-000000000001", "role": "authenticated"}';

create temp table r (base bigint) on commit drop;
grant all on r to authenticated;

select pg_temp.expect('a first push has no conflicts',
  public.push_changes('{"courses": [{"id": "44444444-0000-0000-0000-000000000001", "name": "Art", "grading_mode": "points"},
                                    {"id": "44444444-0000-0000-0000-000000000002", "name": "Band", "grading_mode": "points"}]}'::jsonb,
                      0) -> 'conflicts',
  '[]'::jsonb);
-- The phone pulled here.
insert into r select (public.pull_changes(0) ->> 'revision')::bigint;

-- Another device renames Art after that pull.
select public.push_changes('{"courses": [{"id": "44444444-0000-0000-0000-000000000001", "name": "Art 2", "grading_mode": "points"}]}'::jsonb,
                           (select base from r));

select pg_temp.expect('a late push based on the old pull is refused for that row',
  public.push_changes('{"courses": [{"id": "44444444-0000-0000-0000-000000000001", "name": "Old art", "grading_mode": "points"},
                                    {"id": "44444444-0000-0000-0000-000000000002", "name": "Band 2", "grading_mode": "points"}]}'::jsonb,
                      (select base from r)) -> 'conflicts',
  '[{"row_id": "44444444-0000-0000-0000-000000000001", "table_name": "courses"}]'::jsonb);
select pg_temp.expect('the newer name stays',
  (select name from public.courses where id = '44444444-0000-0000-0000-000000000001'), 'Art 2');
select pg_temp.expect('the other row in the same push is saved',
  (select name from public.courses where id = '44444444-0000-0000-0000-000000000002'), 'Band 2');

select pg_temp.expect('a late delete of a newer row is refused',
  public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
    'table_name', 'courses', 'row_id', '44444444-0000-0000-0000-000000000001'))), (select base from r)) -> 'conflicts',
  '[{"row_id": "44444444-0000-0000-0000-000000000001", "table_name": "courses"}]'::jsonb);
select pg_temp.expect('so the row is still there',
  (select count(*)::int from public.courses where id = '44444444-0000-0000-0000-000000000001'), 1);

select pg_temp.expect('with an up-to-date base the push is saved',
  public.push_changes('{"courses": [{"id": "44444444-0000-0000-0000-000000000001", "name": "Art 3", "grading_mode": "points"}]}'::jsonb,
                      (public.pull_changes(0) ->> 'revision')::bigint) -> 'conflicts',
  '[]'::jsonb);
select pg_temp.expect('and wins',
  (select name from public.courses where id = '44444444-0000-0000-0000-000000000001'), 'Art 3');

-- Deleted elsewhere after the pull: a late edit does not bring the row back.
update r set base = (public.pull_changes(0) ->> 'revision')::bigint;
select public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
  'table_name', 'courses', 'row_id', '44444444-0000-0000-0000-000000000002'))), (select base from r));
select pg_temp.expect('a late edit of a row deleted after the pull is refused',
  public.push_changes('{"courses": [{"id": "44444444-0000-0000-0000-000000000002", "name": "Band 3", "grading_mode": "points"}]}'::jsonb,
                      (select base from r)) -> 'conflicts',
  '[{"row_id": "44444444-0000-0000-0000-000000000002", "table_name": "courses"}]'::jsonb);
select pg_temp.expect('and the row stays deleted',
  (select count(*)::int from public.courses where id = '44444444-0000-0000-0000-000000000002'), 0);

select pg_temp.expect('without a base (older app versions) the last write wins as before',
  public.push_changes('{"courses": [{"id": "44444444-0000-0000-0000-000000000001", "name": "Art 4", "grading_mode": "points"}]}'::jsonb)
    -> 'conflicts',
  '[]'::jsonb);
select pg_temp.expect('the old one-argument call still saves',
  (select name from public.courses where id = '44444444-0000-0000-0000-000000000001'), 'Art 4');
reset role;

select pg_temp.expect('signed-out callers cannot push',
  has_function_privilege('anon', 'public.push_changes(jsonb, bigint)', 'execute'), false);
select pg_temp.expect('the old push_changes(jsonb) is gone',
  (select count(*)::int from pg_proc where proname = 'push_changes' and pronamespace = 'public'::regnamespace), 1);

-- -----------------------------------------------------------------------------
-- 2. A username taken between the check and the insert does not fail sign-up.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('35555555-0000-0000-0000-000000000002', 'thief@example.com', '{}', '{"providers": ["email"]}');

-- Stands in for a second sign-up that takes "race_r" at that very moment.
create function pg_temp.take_name() returns trigger language plpgsql as $$
begin
  if new.username = 'race_r' then
    update public.profiles set username = 'race_r' where id = '35555555-0000-0000-0000-000000000002';
  end if;
  return new;
end;
$$;
create trigger take_name before insert on public.profiles
  for each row execute function pg_temp.take_name();

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('33333333-0000-0000-0000-000000000003', 'race@example.com', '{"username": "race_r"}', '{"providers": ["email"]}');
drop trigger take_name on public.profiles;

select pg_temp.expect('the sign-up still made a profile, with a generated name',
  (select username from public.profiles where id = '33333333-0000-0000-0000-000000000003'), 'student_3333333300');
select pg_temp.expect('and its settings',
  (select count(*)::int from public.user_settings where student_id = '33333333-0000-0000-0000-000000000003'), 1);

-- -----------------------------------------------------------------------------
-- 3. Indexes and policies.
-- -----------------------------------------------------------------------------
select pg_temp.expect('every foreign key in public has a covering index',
  (select count(*)::int
     from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
         where i.indrelid = c.conrelid
           and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] @> c.conkey
           and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] <@ c.conkey)),
  0);
select pg_temp.expect('one SELECT policy on grading_scales and grading_scale_bands',
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('grading_scales', 'grading_scale_bands')
      and cmd in ('SELECT', 'ALL')),
  2);

set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-0000-0000-0000-000000000001", "role": "authenticated"}';
insert into public.grading_scales (id, student_id, name)
values ('44444444-0000-0000-0000-0000000000aa', '33333333-0000-0000-0000-000000000001', 'Mine');
insert into public.grading_scale_bands (scale_id, letter, min_percent)
values ('44444444-0000-0000-0000-0000000000aa', 'P', 50);
update public.grading_scale_bands set min_percent = 60 where scale_id = '44444444-0000-0000-0000-0000000000aa';
select pg_temp.expect('a student can still write their own scale',
  (select min_percent::int from public.grading_scale_bands where scale_id = '44444444-0000-0000-0000-0000000000aa'), 60);
select pg_temp.expect('and still reads the built-in one',
  (select count(*)::int from public.grading_scale_bands where scale_id = '00000000-0000-0000-0000-000000000001'), 13);
update public.grading_scale_bands set min_percent = 1 where scale_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.expect('but cannot change it',
  (select min(min_percent)::int from public.grading_scale_bands where scale_id = '00000000-0000-0000-0000-000000000001'), 0);
delete from public.grading_scales where id = '44444444-0000-0000-0000-0000000000aa';
select pg_temp.expect('and can delete their own',
  (select count(*)::int from public.grading_scales where id = '44444444-0000-0000-0000-0000000000aa'), 0);
reset role;

-- -----------------------------------------------------------------------------
-- 4. The opt-in sync switch is gone.
-- -----------------------------------------------------------------------------
select pg_temp.expect('user_settings has no sync_enabled column',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'user_settings' and column_name = 'sync_enabled'), 0);

rollback;
