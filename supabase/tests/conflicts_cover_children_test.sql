-- =============================================================================
-- Tests for 20261126001200_conflicts_cover_children.sql.
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
  ('66666666-0000-0000-0000-000000000001', 'children@example.com',
   '{"username": "children_c"}', '{"providers": ["email"]}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "66666666-0000-0000-0000-000000000001", "role": "authenticated"}';

create temp table r (base bigint) on commit drop;
grant all on r to authenticated;

-- A class with one period, one category and one assignment.
select public.push_changes('{
  "courses":         [{"id": "77777777-0000-0000-0000-0000000000c1", "name": "Bio", "grading_mode": "weighted"}],
  "grading_periods": [{"id": "77777777-0000-0000-0000-0000000000a1", "course_id": "77777777-0000-0000-0000-0000000000c1", "name": "Q1", "kind": "quarter"}],
  "categories":      [{"id": "77777777-0000-0000-0000-0000000000b1", "period_id": "77777777-0000-0000-0000-0000000000a1", "name": "Tests", "weight": 50}],
  "assignments":     [{"id": "77777777-0000-0000-0000-0000000000d1", "category_id": "77777777-0000-0000-0000-0000000000b1", "title": "Unit 1", "max_score": 50, "actual_score": 40}]
}'::jsonb, 0);
-- The deleting phone pulled here.
insert into r select (public.pull_changes(0) ->> 'revision')::bigint;

-- Another device then regrades the assignment.
select public.push_changes('{"assignments": [{"id": "77777777-0000-0000-0000-0000000000d1",
  "category_id": "77777777-0000-0000-0000-0000000000b1", "title": "Unit 1", "max_score": 50, "actual_score": 45}]}'::jsonb,
  (public.pull_changes(0) ->> 'revision')::bigint);

select pg_temp.expect('a class delete based on the old pull is refused',
  public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
    'table_name', 'courses', 'row_id', '77777777-0000-0000-0000-0000000000c1'))), (select base from r)) -> 'conflicts',
  '[{"row_id": "77777777-0000-0000-0000-0000000000c1", "table_name": "courses"}]'::jsonb);
select pg_temp.expect('a period delete too',
  public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
    'table_name', 'grading_periods', 'row_id', '77777777-0000-0000-0000-0000000000a1'))), (select base from r)) -> 'conflicts',
  '[{"row_id": "77777777-0000-0000-0000-0000000000a1", "table_name": "grading_periods"}]'::jsonb);
select pg_temp.expect('a category delete too',
  public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
    'table_name', 'categories', 'row_id', '77777777-0000-0000-0000-0000000000b1'))), (select base from r)) -> 'conflicts',
  '[{"row_id": "77777777-0000-0000-0000-0000000000b1", "table_name": "categories"}]'::jsonb);
select pg_temp.expect('so the regraded assignment is still there',
  (select actual_score::int from public.assignments where id = '77777777-0000-0000-0000-0000000000d1'), 45);

select pg_temp.expect('after a new pull the delete goes through',
  public.push_changes(jsonb_build_object('deleted', jsonb_build_array(jsonb_build_object(
    'table_name', 'courses', 'row_id', '77777777-0000-0000-0000-0000000000c1'))),
    (public.pull_changes(0) ->> 'revision')::bigint) -> 'conflicts',
  '[]'::jsonb);
select pg_temp.expect('and takes everything in the class with it',
  (select count(*)::int from public.assignments where id = '77777777-0000-0000-0000-0000000000d1'), 0);
reset role;

select pg_temp.expect('signed-out callers still cannot push',
  has_function_privilege('anon', 'public.push_changes(jsonb, bigint)', 'execute'), false);

rollback;
