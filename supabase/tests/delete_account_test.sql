-- =============================================================================
-- Tests for delete_my_account (20261107000700_delete_account.sql).
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
  ('d0000000-0000-0000-0000-00000000000d', 'dee@example.com',
   '{"full_name": "Dee Lane", "username": "dee_l"}', '{"providers": ["email"]}'),
  ('e0000000-0000-0000-0000-00000000000e', 'eli@example.com',
   '{"full_name": "Eli Moss", "username": "eli_m"}', '{"providers": ["email"]}');

-- Both students have a full gradebook, with upcoming items tied to classes.
set local role authenticated;
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-00000000000d", "role": "authenticated"}';
select public.load_sample_gradebook();
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e0000000-0000-0000-0000-00000000000e", "role": "authenticated"}';
select public.load_sample_gradebook();
reset role;

select set_config('test.eli_courses',
  (select count(*)::text from public.courses where student_id = 'e0000000-0000-0000-0000-00000000000e'), true);

-- 1. Signed out: refused.
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';
do $$
begin
  perform public.delete_my_account();
  raise exception 'FAILED: delete_my_account worked without a signed-in student';
exception when invalid_authorization_specification then
  raise notice 'ok  delete_my_account needs a signed-in student';
end;
$$;
reset role;

-- 2. Anonymous visitors cannot call it at all.
select pg_temp.expect('anon cannot run delete_my_account',
  has_function_privilege('anon', 'public.delete_my_account()', 'execute'), false);

-- 3. Dee deletes her account: everything of hers is gone, Eli's is untouched.
set local role authenticated;
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-00000000000d", "role": "authenticated"}';
select public.delete_my_account();
reset role;

select pg_temp.expect('auth user removed',
  (select count(*)::int from auth.users where id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('profile removed',
  (select count(*)::int from public.profiles where id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('courses removed',
  (select count(*)::int from public.courses where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('grading periods removed',
  (select count(*)::int from public.grading_periods where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('categories removed',
  (select count(*)::int from public.categories where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('assignments removed',
  (select count(*)::int from public.assignments where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('score history removed',
  (select count(*)::int from public.score_history where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('upcoming items removed',
  (select count(*)::int from public.upcoming_items where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('sync state removed',
  (select count(*)::int from public.sync_state where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('tombstones removed',
  (select count(*)::int from public.sync_tombstones where student_id = 'd0000000-0000-0000-0000-00000000000d'), 0);
select pg_temp.expect('other student keeps every course',
  (select count(*)::text from public.courses where student_id = 'e0000000-0000-0000-0000-00000000000e'),
  current_setting('test.eli_courses'));
select pg_temp.expect('other student keeps their profile',
  (select count(*)::int from public.profiles where id = 'e0000000-0000-0000-0000-00000000000e'), 1);

rollback;
