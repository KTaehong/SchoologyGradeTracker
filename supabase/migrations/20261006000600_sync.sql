-- =============================================================================
-- Cloud sync (F14): every device keeps a full copy of the gradebook in SQLite
-- and exchanges changed rows with the server.
--
-- How a device knows what changed (our version of an ETag):
--   * sync_state.revision is a counter per student. Every insert, update or
--     delete of one of the student's gradebook rows takes the next number and
--     stamps it on the row (`revision`), or on a tombstone for a delete.
--   * A device remembers the highest revision it has pulled (its cursor).
--     pull_changes(cursor) returns only rows with a higher revision — an empty
--     reply means "nothing changed", like an HTTP 304.
--   * The counter row is locked until the writing transaction commits, so
--     revisions commit in order and a cursor never skips a row.
--   * sync_state is published to Supabase Realtime: when one device pushes,
--     the others see the new revision and pull right away.
--
-- Conflicts: last write wins per row. A device pulls before it pushes, and its
-- own unsynced edits win over what it pulled (see mobile/src/sync/).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Revision on every synced row.
-- -----------------------------------------------------------------------------
alter table public.courses         add column revision bigint not null default 0;
alter table public.grading_periods add column revision bigint not null default 0;
alter table public.categories      add column revision bigint not null default 0;
alter table public.assignments     add column revision bigint not null default 0;
alter table public.upcoming_items  add column revision bigint not null default 0;

create index courses_revision_idx         on public.courses (student_id, revision);
create index grading_periods_revision_idx on public.grading_periods (student_id, revision);
create index categories_revision_idx      on public.categories (student_id, revision);
create index assignments_revision_idx     on public.assignments (student_id, revision);
create index upcoming_items_revision_idx  on public.upcoming_items (student_id, revision);

-- -----------------------------------------------------------------------------
-- sync_tombstones: deleted rows, so other devices delete them too.
-- -----------------------------------------------------------------------------
create table public.sync_tombstones (
  table_name text   not null,
  row_id     uuid   not null,
  student_id uuid   not null references public.profiles (id) on delete cascade,
  revision   bigint not null,
  deleted_at timestamptz not null default now(),
  primary key (table_name, row_id)
);

create index sync_tombstones_revision_idx on public.sync_tombstones (student_id, revision);

alter table public.sync_tombstones enable row level security;
create policy "sync_tombstones: read own" on public.sync_tombstones
  for select to authenticated using (student_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- next_sync_revision: the student's next revision number.
-- SECURITY DEFINER so triggers can bump it whoever writes; it only ever
-- touches the row of the student whose data is changing.
-- -----------------------------------------------------------------------------
create or replace function public.next_sync_revision(p_student_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.sync_state as s (student_id, revision)
  values (p_student_id, 1)
  on conflict (student_id) do update set revision = s.revision + 1
  returning s.revision;
$$;

revoke execute on function public.next_sync_revision(uuid) from public, anon, authenticated;

create or replace function public.stamp_sync_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.revision := public.next_sync_revision(new.student_id);
  if tg_op = 'INSERT' then
    -- The id is back (for example, a delete was undone): it is no longer deleted.
    delete from public.sync_tombstones where table_name = tg_table_name and row_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.record_sync_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- When the whole account is deleted the profile is already gone: nothing to sync.
  if exists (select 1 from public.profiles where id = old.student_id) then
    insert into public.sync_tombstones (table_name, row_id, student_id, revision)
    values (tg_table_name, old.id, old.student_id, public.next_sync_revision(old.student_id))
    on conflict (table_name, row_id) do update
      set revision = excluded.revision, deleted_at = now();
  end if;
  return old;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['courses', 'grading_periods', 'categories', 'assignments', 'upcoming_items'] loop
    execute format(
      'create trigger %1$s_stamp_revision before insert or update on public.%1$I
         for each row execute function public.stamp_sync_revision()', t);
    execute format(
      'create trigger %1$s_tombstone after delete on public.%1$I
         for each row execute function public.record_sync_tombstone()', t);
  end loop;
end;
$$;

-- Rows that existed before this migration get a revision, so a first pull sees them.
update public.courses         set revision = 0 where revision = 0;
update public.grading_periods set revision = 0 where revision = 0;
update public.categories      set revision = 0 where revision = 0;
update public.assignments     set revision = 0 where revision = 0;
update public.upcoming_items  set revision = 0 where revision = 0;

-- Realtime: devices listen for their own sync_state row changing.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sync_state;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- pull_changes: everything that changed after `p_since`.
--
--   supabase.rpc('pull_changes', { p_since: 0 })   → the whole gradebook
--
-- Returns { "revision": <new cursor>, "courses": [...], "grading_periods": [...],
--           "categories": [...], "assignments": [...], "upcoming_items": [...],
--           "deleted": [ { "table_name", "row_id" } ] }
-- -----------------------------------------------------------------------------
create or replace function public.pull_changes(p_since bigint default 0)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_student uuid := public.require_student();
  v_head    bigint;
begin
  -- Read the head first: every row at or below it has committed (revisions
  -- commit in order), so returning rows up to the head never skips one.
  select coalesce((select revision from public.sync_state where student_id = v_student), 0)
    into v_head;

  return jsonb_build_object(
    'revision', v_head,
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'teacher', teacher, 'grading_mode', grading_mode,
        'position', position, 'source', source, 'archived_at', archived_at,
        'updated_at', updated_at, 'revision', revision) order by revision)
      from public.courses
      where student_id = v_student and revision > p_since and revision <= v_head), '[]'::jsonb),
    'grading_periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'course_id', course_id, 'name', name, 'kind', kind, 'semester', semester,
        'weight', weight, 'position', position, 'updated_at', updated_at,
        'revision', revision) order by revision)
      from public.grading_periods
      where student_id = v_student and revision > p_since and revision <= v_head), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'period_id', period_id, 'name', name, 'weight', weight,
        'drop_lowest', drop_lowest, 'position', position, 'updated_at', updated_at,
        'revision', revision) order by revision)
      from public.categories
      where student_id = v_student and revision > p_since and revision <= v_head), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'category_id', category_id, 'title', title, 'due_date', due_date,
        'max_score', max_score, 'actual_score', actual_score, 'forecast_score', forecast_score,
        'excused', excused, 'extra_credit', extra_credit, 'is_placeholder', is_placeholder,
        'source', source, 'position', position, 'updated_at', updated_at,
        'revision', revision) order by revision)
      from public.assignments
      where student_id = v_student and revision > p_since and revision <= v_head), '[]'::jsonb),
    'upcoming_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'course_id', course_id, 'external_uid', external_uid, 'title', title,
        'due_at', due_at, 'url', url, 'revision', revision) order by revision)
      from public.upcoming_items
      where student_id = v_student and revision > p_since and revision <= v_head), '[]'::jsonb),
    'deleted', coalesce((
      select jsonb_agg(jsonb_build_object('table_name', table_name, 'row_id', row_id) order by revision)
      from public.sync_tombstones
      where student_id = v_student and revision > p_since and revision <= v_head), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- push_changes: save a device's changed rows in one transaction.
--
--   supabase.rpc('push_changes', { p_changes: {
--     courses: [...], grading_periods: [...], categories: [...],
--     assignments: [...], upcoming_items: [...],
--     deleted: [ { table_name, row_id } ] } })
--
-- Rows use the same fields pull_changes returns (no revision or student_id:
-- the server sets those). A row whose parent no longer exists (another device
-- deleted it) is skipped, so one stale row can never block a whole push.
-- Returns { "revision": <the student's revision after the push> }.
-- -----------------------------------------------------------------------------
create or replace function public.push_changes(p_changes jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_student uuid := public.require_student();
begin
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'p_changes must be an object' using errcode = '22023';
  end if;

  insert into public.courses as t (id, student_id, name, teacher, grading_mode, position, source, archived_at)
  select r.id, v_student, r.name, r.teacher, r.grading_mode, coalesce(r.position, 0),
         coalesce(r.source, 'manual'), r.archived_at
  from jsonb_to_recordset(coalesce(p_changes -> 'courses', '[]')) as r (
    id uuid, name text, teacher text, grading_mode public.grading_mode, position integer,
    source public.data_source, archived_at timestamptz)
  on conflict (id) do update set
    name = excluded.name, teacher = excluded.teacher, grading_mode = excluded.grading_mode,
    position = excluded.position, source = excluded.source, archived_at = excluded.archived_at;

  insert into public.grading_periods as t (id, course_id, student_id, name, kind, semester, weight, position)
  select r.id, r.course_id, v_student, r.name, r.kind, r.semester, r.weight, coalesce(r.position, 0)
  from jsonb_to_recordset(coalesce(p_changes -> 'grading_periods', '[]')) as r (
    id uuid, course_id uuid, name text, kind public.period_kind, semester smallint,
    weight numeric, position integer)
  where exists (select 1 from public.courses p where p.id = r.course_id and p.student_id = v_student)
  on conflict (id) do update set
    course_id = excluded.course_id, name = excluded.name, kind = excluded.kind,
    semester = excluded.semester, weight = excluded.weight, position = excluded.position;

  insert into public.categories as t (id, period_id, student_id, name, weight, drop_lowest, position)
  select r.id, r.period_id, v_student, r.name, r.weight, coalesce(r.drop_lowest, 0), coalesce(r.position, 0)
  from jsonb_to_recordset(coalesce(p_changes -> 'categories', '[]')) as r (
    id uuid, period_id uuid, name text, weight numeric, drop_lowest smallint, position integer)
  where exists (select 1 from public.grading_periods p where p.id = r.period_id and p.student_id = v_student)
  on conflict (id) do update set
    period_id = excluded.period_id, name = excluded.name, weight = excluded.weight,
    drop_lowest = excluded.drop_lowest, position = excluded.position;

  insert into public.assignments as t (
    id, category_id, student_id, title, due_date, max_score, actual_score, forecast_score,
    excused, extra_credit, is_placeholder, source, position)
  select r.id, r.category_id, v_student, r.title, r.due_date, r.max_score, r.actual_score,
         r.forecast_score, coalesce(r.excused, false), coalesce(r.extra_credit, false),
         coalesce(r.is_placeholder, false), coalesce(r.source, 'manual'), coalesce(r.position, 0)
  from jsonb_to_recordset(coalesce(p_changes -> 'assignments', '[]')) as r (
    id uuid, category_id uuid, title text, due_date date, max_score numeric, actual_score numeric,
    forecast_score numeric, excused boolean, extra_credit boolean, is_placeholder boolean,
    source public.data_source, position integer)
  where exists (select 1 from public.categories p where p.id = r.category_id and p.student_id = v_student)
  on conflict (id) do update set
    category_id = excluded.category_id, title = excluded.title, due_date = excluded.due_date,
    max_score = excluded.max_score, actual_score = excluded.actual_score,
    forecast_score = excluded.forecast_score, excused = excluded.excused,
    extra_credit = excluded.extra_credit, is_placeholder = excluded.is_placeholder,
    source = excluded.source, position = excluded.position;

  -- Two devices can each fetch the same calendar event under different ids.
  -- Keep the pushed one; deleting the other leaves a tombstone, so the device
  -- that made it drops its copy on its next pull.
  delete from public.upcoming_items u
   using jsonb_to_recordset(coalesce(p_changes -> 'upcoming_items', '[]')) as r (id uuid, external_uid text)
   where u.student_id = v_student
     and u.external_uid = coalesce(r.external_uid, r.id::text)
     and u.id <> r.id;

  insert into public.upcoming_items as t (id, student_id, course_id, external_uid, title, due_at, url)
  select r.id, v_student,
         case when exists (select 1 from public.courses p where p.id = r.course_id and p.student_id = v_student)
              then r.course_id end,
         coalesce(r.external_uid, r.id::text), r.title, r.due_at, r.url
  from jsonb_to_recordset(coalesce(p_changes -> 'upcoming_items', '[]')) as r (
    id uuid, course_id uuid, external_uid text, title text, due_at timestamptz, url text)
  on conflict (id) do update set
    course_id = excluded.course_id, external_uid = excluded.external_uid, title = excluded.title,
    due_at = excluded.due_at, url = excluded.url;

  -- Deletes last: a parent's delete cascades to children pushed above.
  -- Row-level security limits each delete to the student's own rows.
  delete from public.assignments
   where id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'assignments');
  delete from public.categories
   where id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'categories');
  delete from public.grading_periods
   where id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'grading_periods');
  delete from public.courses
   where id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'courses');
  delete from public.upcoming_items
   where id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'upcoming_items');

  return jsonb_build_object(
    'revision', coalesce((select revision from public.sync_state where student_id = v_student), 0));
end;
$$;

revoke execute on function public.pull_changes(bigint) from public, anon;
revoke execute on function public.push_changes(jsonb) from public, anon;
grant execute on function public.pull_changes(bigint) to authenticated, service_role;
grant execute on function public.push_changes(jsonb) to authenticated, service_role;
