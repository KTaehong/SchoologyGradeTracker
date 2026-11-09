-- =============================================================================
-- Tests for the API lockdown (20261109000800_lock_down_api.sql).
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
-- 1. Signed out (anon): no table, view, sequence or function is reachable.
-- -----------------------------------------------------------------------------
select pg_temp.expect('anon has no privilege on any table or view',
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and (has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update')
        or has_table_privilege('anon', c.oid, 'delete')
        or has_table_privilege('anon', c.oid, 'truncate'))),
  null::text);

select pg_temp.expect('anon has no privilege on any sequence',
  (select string_agg(c.relname, ', ')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
      and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage,select,update') end),
  null::text);

select pg_temp.expect('anon cannot run any function',
  (select string_agg(p.oid::regprocedure::text, ', ')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d
                       where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')),
  null::text);

select pg_temp.expect('signed-in students cannot call trigger functions',
  (select string_agg(p.oid::regprocedure::text, ', ')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')),
  null::text);

-- New tables are locked down too (default privileges). New functions are not:
-- each migration revokes them, and the check above catches one that does not.
create table public.lockdown_probe (id int);
select pg_temp.expect('a new table is not granted to anon',
  has_table_privilege('anon', 'public.lockdown_probe', 'select'), false);
select pg_temp.expect('a new table cannot be truncated by students',
  has_table_privilege('authenticated', 'public.lockdown_probe', 'truncate'), false);
drop table public.lockdown_probe;

-- And the database really refuses (not just an empty answer).
set local role anon;
do $$
begin
  perform 1 from public.courses;
  raise exception 'FAILED: anon may read courses';
exception when insufficient_privilege then
  raise notice 'ok  anon reading courses → permission denied';
end;
$$;
do $$
begin
  perform 1 from public.course_grades;
  raise exception 'FAILED: anon may read the course_grades view';
exception when insufficient_privilege then
  raise notice 'ok  anon reading a view → permission denied';
end;
$$;
do $$
begin
  insert into public.profiles (id, username, full_name) values (gen_random_uuid(), 'x_x', 'X');
  raise exception 'FAILED: anon may insert a profile';
exception when insufficient_privilege then
  raise notice 'ok  anon writing → permission denied';
end;
$$;
do $$
begin
  perform public.load_sample_gradebook();
  raise exception 'FAILED: anon may call load_sample_gradebook';
exception when insufficient_privilege then
  raise notice 'ok  anon calling a function → permission denied';
end;
$$;
do $$
begin
  perform public.pull_changes(0);
  raise exception 'FAILED: anon may call pull_changes';
exception when insufficient_privilege then
  raise notice 'ok  anon calling pull_changes → permission denied';
end;
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. Signed in: the app still works, but server-maintained tables are read-only.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('f0000000-0000-0000-0000-00000000000f', 'fay@example.com',
   '{"full_name": "Fay Wu", "username": "fay_w"}', '{"providers": ["email"]}'),
  ('90000000-0000-0000-0000-000000000009', 'gus@example.com',
   '{"full_name": "Gus Hale", "username": "gus_h"}', '{"providers": ["email"]}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "f0000000-0000-0000-0000-00000000000f", "role": "authenticated"}';

select public.load_sample_gradebook();
select pg_temp.expect('students still get their grades',
  jsonb_array_length(public.get_grades() -> 'courses'), 5);
select pg_temp.expect('students still pull their changes',
  jsonb_array_length(public.pull_changes(0) -> 'courses'), 5);
select pg_temp.expect('students still read the grade views',
  (select count(*)::int from public.course_grades), 5);
select pg_temp.expect('students still read their sync revision',
  (select count(*)::int from public.sync_state), 1);
update public.profiles set full_name = 'Fay W.';
select pg_temp.expect('students still edit their profile',
  (select full_name from public.profiles), 'Fay W.');

do $$
begin
  update public.sync_state set revision = 0;
  raise exception 'FAILED: a student may reset their sync revision';
exception when insufficient_privilege then
  raise notice 'ok  sync_state is read-only for students';
end;
$$;
do $$
begin
  delete from public.score_history;
  raise exception 'FAILED: a student may delete score history';
exception when insufficient_privilege then
  raise notice 'ok  score_history is read-only for students';
end;
$$;
do $$
begin
  insert into public.sync_tombstones (student_id, table_name, row_id, revision)
  values ('f0000000-0000-0000-0000-00000000000f', 'courses', gen_random_uuid(), 1);
  raise exception 'FAILED: a student may write tombstones';
exception when insufficient_privilege then
  raise notice 'ok  sync_tombstones is read-only for students';
end;
$$;
do $$
begin
  delete from public.profiles;
  raise exception 'FAILED: a student may delete their profile row';
exception when insufficient_privilege then
  raise notice 'ok  profiles cannot be deleted directly';
end;
$$;
do $$
begin
  truncate public.courses;
  raise exception 'FAILED: a student may truncate a table';
exception when insufficient_privilege then
  raise notice 'ok  students cannot truncate';
end;
$$;
do $$
begin
  perform public.next_sync_revision('f0000000-0000-0000-0000-00000000000f');
  raise exception 'FAILED: a student may bump a revision by hand';
exception when insufficient_privilege then
  raise notice 'ok  next_sync_revision is not callable';
end;
$$;

-- A push still bumps the revision (through the server's own function).
select set_config('test.rev', (select revision::text from public.sync_state), true);
select public.push_changes(jsonb_build_object('courses', jsonb_build_array(jsonb_build_object(
  'id', gen_random_uuid(), 'name', 'Lockdown Test', 'grading_mode', 'weighted'))));
select pg_temp.expect('a push still moves the revision forward',
  (select revision from public.sync_state) > current_setting('test.rev')::bigint, true);

-- Another student sees none of it.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "90000000-0000-0000-0000-000000000009", "role": "authenticated"}';
select pg_temp.expect('another student sees no courses',
  (select count(*)::int from public.courses), 0);
select pg_temp.expect('another student sees no sync state',
  (select count(*)::int from public.sync_state), 0);
reset role;

rollback;
