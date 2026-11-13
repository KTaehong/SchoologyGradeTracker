-- =============================================================================
-- Checks for demo_accounts.sql. Run after that file (run_local.sh does this,
-- having set the password twice; the second one is local-test-password-2).
-- Read-only. Any failed check stops the script with "FAILED: <what>".
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

-- 1. Three accounts that can sign in with the password from the second run.
select pg_temp.expect('three demo accounts',
  (select count(*) from auth.users where email like '%@demo.example.com'), 3::bigint);
select pg_temp.expect('each has an email identity',
  (select count(*) from auth.identities i join auth.users u on u.id = i.user_id
    where u.email like '%@demo.example.com' and i.provider = 'email'), 3::bigint);
select pg_temp.expect('the second run changed the password',
  (select count(*) from auth.users
    where email like '%@demo.example.com'
      and encrypted_password = extensions.crypt('local-test-password-2', encrypted_password)), 3::bigint);
select pg_temp.expect('each email is the username at demo.example.com',
  (select count(*) from auth.users u join public.profiles p on p.id = u.id
    where u.email = p.username || '@demo.example.com' and p.email = u.email), 3::bigint);
select pg_temp.expect('token columns are not null',
  (select count(*) from auth.users
    where email like '%@demo.example.com'
      and (confirmation_token is null or recovery_token is null
           or email_change is null or email_change_token_new is null)), 0::bigint);
select pg_temp.expect('profiles were created with the chosen usernames',
  (select string_agg(username, ',' order by username) from public.profiles
    where email like '%@demo.example.com'), 'jordan_brooks,maya_torres,sam_nguyen');

-- 2. Different courses for each student, and the second run added nothing.
select pg_temp.expect('courses per student (jordan, maya, sam)',
  (select string_agg(n::text, ',' order by username)
     from (select p.username, count(*) as n
             from public.courses c join public.profiles p on p.id = c.student_id
            where p.email like '%@demo.example.com' group by p.username) t), '5,4,4');
select pg_temp.expect('no course name is shared between demo students',
  (select count(*) from (
     select c.name from public.courses c join public.profiles p on p.id = c.student_id
      where p.email like '%@demo.example.com' group by c.name having count(*) > 1) t), 0::bigint);
select pg_temp.expect('no course is shared with the sample gradebook',
  (select count(*) from public.courses c join public.profiles p on p.id = c.student_id
    where p.email like '%@demo.example.com'
      and c.name in ('AP Calculus BC', 'AP Physics C: E&M', 'AP English Literature',
                     'AP Spanish Language', 'AP US Government')), 0::bigint);
select pg_temp.expect('every course has a grade',
  (select count(*) from public.course_grades g join public.profiles p on p.id = g.student_id
    where p.email like '%@demo.example.com'
      and (g.current_percent is null or g.projected_percent is null)), 0::bigint);
select pg_temp.expect('every upcoming item with a class found its course',
  (select count(*) from public.upcoming_items u join public.profiles p on p.id = u.student_id
    where p.email like '%@demo.example.com' and u.course_id is null), 1::bigint);

-- 3. Signed in as Maya: she sees her own rows only, and her phone can pull them.
set local role authenticated;
set local request.jwt.claims = '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}';
select pg_temp.expect('Maya sees only her 4 courses', (select count(*) from public.courses), 4::bigint);
select pg_temp.expect('Maya''s phone pulls her 4 courses',
  jsonb_array_length(public.pull_changes(0) -> 'courses'), 4);
reset role;

rollback;
