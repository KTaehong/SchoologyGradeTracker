-- =============================================================================
-- Tests for 20261123001000_sync_and_signup_fixes.sql.
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
-- 1. Sign-up with an awkward name and phone.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data) values
  ('11111111-0000-0000-0000-000000000001', 'long@example.com', '12065550123',
   jsonb_build_object('full_name', repeat('x', 300), 'username', 'long_l'), '{"providers": ["email"]}'),
  ('11111111-0000-0000-0000-000000000002', 'badphone@example.com', null,
   '{"full_name": "  ", "name": "Pat", "phone": "call me", "username": "pat_p"}', '{"providers": ["email"]}'),
  ('11111111-0000-0000-0000-000000000003', 'nice@example.com', null,
   '{"phone": "+1 (206) 555-0199", "username": "nice_n"}', '{"providers": ["email"]}');

select pg_temp.expect('a long name is cut to fit',
  (select char_length(full_name) from public.profiles where email = 'long@example.com'), 100);
select pg_temp.expect('a phone without the plus sign is kept',
  (select phone from public.profiles where email = 'long@example.com'), '+12065550123');
select pg_temp.expect('a blank name falls back to the next one',
  (select full_name from public.profiles where email = 'badphone@example.com'), 'Pat');
select pg_temp.expect('a phone that is not a number is left out',
  (select phone from public.profiles where email = 'badphone@example.com'), null::text);
select pg_temp.expect('a phone with spaces is cleaned up',
  (select phone from public.profiles where email = 'nice@example.com'), '+12065550199');
update auth.users set phone = '12065550000' where email = 'nice@example.com';
select pg_temp.expect('a changed phone is cleaned up too',
  (select phone from public.profiles where email = 'nice@example.com'), '+12065550000');

-- -----------------------------------------------------------------------------
-- 2. push_changes says what it skipped.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-0000-0000-0000-000000000001", "role": "authenticated"}';

select pg_temp.expect('an ordinary push skips nothing',
  public.push_changes('{"courses": [{"id": "22222222-0000-0000-0000-000000000001", "name": "Art", "grading_mode": "points"}]}'::jsonb) -> 'skipped',
  '[]'::jsonb);
select pg_temp.expect('a row with no parent is reported',
  public.push_changes('{"categories": [{"id": "22222222-0000-0000-0000-000000000002",
    "period_id": "22222222-0000-0000-0000-0000000000ff", "name": "Tests"}]}'::jsonb) -> 'skipped',
  '[{"row_id": "22222222-0000-0000-0000-000000000002", "table_name": "categories"}]'::jsonb);
select pg_temp.expect('an item whose class is gone is saved and reported',
  public.push_changes('{"upcoming_items": [{"id": "22222222-0000-0000-0000-000000000003", "title": "Essay",
    "due_at": "2026-12-01T00:00:00Z", "course_id": "22222222-0000-0000-0000-0000000000ff"}]}'::jsonb) -> 'skipped',
  '[{"row_id": "22222222-0000-0000-0000-000000000003", "table_name": "upcoming_items"}]'::jsonb);
select pg_temp.expect('that item is in the cloud without a class',
  (select count(*)::int from public.upcoming_items where course_id is null), 1);

-- -----------------------------------------------------------------------------
-- 3. Another student cannot remove my tombstone by reusing the id.
-- -----------------------------------------------------------------------------
delete from public.courses where id = '22222222-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-0000-0000-0000-000000000002", "role": "authenticated"}';
insert into public.courses (id, student_id, name)
values ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'Copy');
delete from public.courses where id = '22222222-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect('each student keeps their own tombstone',
  (select count(*)::int from public.sync_tombstones where row_id = '22222222-0000-0000-0000-000000000001'), 2);

rollback;
