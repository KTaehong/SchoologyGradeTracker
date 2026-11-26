-- =============================================================================
-- push_changes: a delete of a class, period or category is also refused when
-- anything inside it changed after the phone's pull (found by the CLI challenge
-- pass of the third review, N-R3-1).
--
-- Migration 11 checked only the deleted row's own revision. Deleting a class
-- cascades to its periods, categories and assignments, so a late (or racing)
-- delete could still remove an assignment another device had just edited.
-- Now that delete comes back in "conflicts": the phone keeps it unsent, pulls
-- the edit, and "an edit beats a delete" restores the class (docs/sync.md).
-- Same signature and grants as migration 11; only the conflict check changes.
-- =============================================================================

create or replace function public.push_changes(p_changes jsonb, p_base bigint default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_student   uuid := public.require_student();
  v_skipped   jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_blocked   uuid[] := '{}';
begin
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'p_changes must be an object' using errcode = '22023';
  end if;

  -- Rows that changed in the cloud after the phone's pull. An upsert also
  -- conflicts with a newer delete (tombstone); a delete only with a newer edit.
  if p_base is not null then
    select coalesce(jsonb_agg(jsonb_build_object('table_name', s.table_name, 'row_id', s.id)), '[]'::jsonb),
           coalesce(array_agg(s.id), '{}')
      into v_conflicts, v_blocked
    from (
      select w.table_name, w.id
      from (
        select 'courses' as table_name, r.id, false as is_delete
          from jsonb_to_recordset(coalesce(p_changes -> 'courses', '[]')) as r (id uuid)
        union all
        select 'grading_periods', r.id, false
          from jsonb_to_recordset(coalesce(p_changes -> 'grading_periods', '[]')) as r (id uuid)
        union all
        select 'categories', r.id, false
          from jsonb_to_recordset(coalesce(p_changes -> 'categories', '[]')) as r (id uuid)
        union all
        select 'assignments', r.id, false
          from jsonb_to_recordset(coalesce(p_changes -> 'assignments', '[]')) as r (id uuid)
        union all
        select 'upcoming_items', r.id, false
          from jsonb_to_recordset(coalesce(p_changes -> 'upcoming_items', '[]')) as r (id uuid)
        union all
        select d ->> 'table_name', (d ->> 'row_id')::uuid, true
          from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
      ) w
      where coalesce((
        select max(x.revision) from (
          select c.revision from public.courses c
           where w.table_name = 'courses' and c.id = w.id and c.student_id = v_student
          union all
          select g.revision from public.grading_periods g
           where w.table_name = 'grading_periods' and g.id = w.id and g.student_id = v_student
          union all
          select c.revision from public.categories c
           where w.table_name = 'categories' and c.id = w.id and c.student_id = v_student
          union all
          select a.revision from public.assignments a
           where w.table_name = 'assignments' and a.id = w.id and a.student_id = v_student
          union all
          select u.revision from public.upcoming_items u
           where w.table_name = 'upcoming_items' and u.id = w.id and u.student_id = v_student
          union all
          -- Deleting a class, period or category also deletes what is in it:
          -- refuse when anything inside changed after the pull.
          select g.revision from public.grading_periods g
           where w.is_delete and w.table_name = 'courses' and g.course_id = w.id and g.student_id = v_student
          union all
          select c.revision from public.categories c
            join public.grading_periods g on g.id = c.period_id
           where w.is_delete and w.table_name = 'courses' and g.course_id = w.id and c.student_id = v_student
          union all
          select a.revision from public.assignments a
            join public.categories c on c.id = a.category_id
            join public.grading_periods g on g.id = c.period_id
           where w.is_delete and w.table_name = 'courses' and g.course_id = w.id and a.student_id = v_student
          union all
          select c.revision from public.categories c
           where w.is_delete and w.table_name = 'grading_periods' and c.period_id = w.id and c.student_id = v_student
          union all
          select a.revision from public.assignments a
            join public.categories c on c.id = a.category_id
           where w.is_delete and w.table_name = 'grading_periods' and c.period_id = w.id and a.student_id = v_student
          union all
          select a.revision from public.assignments a
           where w.is_delete and w.table_name = 'categories' and a.category_id = w.id and a.student_id = v_student
          union all
          select t.revision from public.sync_tombstones t
           where not w.is_delete and t.student_id = v_student
             and t.table_name = w.table_name and t.row_id = w.id
        ) x
      ), 0) > p_base
    ) s;
  end if;

  insert into public.courses as t (id, student_id, name, teacher, grading_mode, position, source, archived_at)
  select r.id, v_student, r.name, r.teacher, r.grading_mode, coalesce(r.position, 0),
         coalesce(r.source, 'manual'), r.archived_at
  from jsonb_to_recordset(coalesce(p_changes -> 'courses', '[]')) as r (
    id uuid, name text, teacher text, grading_mode public.grading_mode, position integer,
    source public.data_source, archived_at timestamptz)
  where r.id <> all (v_blocked)
  on conflict (id) do update set
    name = excluded.name, teacher = excluded.teacher, grading_mode = excluded.grading_mode,
    position = excluded.position, source = excluded.source, archived_at = excluded.archived_at;

  insert into public.grading_periods as t (id, course_id, student_id, name, kind, semester, weight, position)
  select r.id, r.course_id, v_student, r.name, r.kind, r.semester, r.weight, coalesce(r.position, 0)
  from jsonb_to_recordset(coalesce(p_changes -> 'grading_periods', '[]')) as r (
    id uuid, course_id uuid, name text, kind public.period_kind, semester smallint,
    weight numeric, position integer)
  where r.id <> all (v_blocked)
    and exists (select 1 from public.courses p where p.id = r.course_id and p.student_id = v_student)
  on conflict (id) do update set
    course_id = excluded.course_id, name = excluded.name, kind = excluded.kind,
    semester = excluded.semester, weight = excluded.weight, position = excluded.position;

  insert into public.categories as t (id, period_id, student_id, name, weight, drop_lowest, position)
  select r.id, r.period_id, v_student, r.name, r.weight, coalesce(r.drop_lowest, 0), coalesce(r.position, 0)
  from jsonb_to_recordset(coalesce(p_changes -> 'categories', '[]')) as r (
    id uuid, period_id uuid, name text, weight numeric, drop_lowest smallint, position integer)
  where r.id <> all (v_blocked)
    and exists (select 1 from public.grading_periods p where p.id = r.period_id and p.student_id = v_student)
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
  where r.id <> all (v_blocked)
    and exists (select 1 from public.categories p where p.id = r.category_id and p.student_id = v_student)
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
     and r.id <> all (v_blocked)
     and u.external_uid = coalesce(r.external_uid, r.id::text)
     and u.id <> r.id;

  insert into public.upcoming_items as t (id, student_id, course_id, external_uid, title, due_at, url)
  select r.id, v_student,
         case when exists (select 1 from public.courses p where p.id = r.course_id and p.student_id = v_student)
              then r.course_id end,
         coalesce(r.external_uid, r.id::text), r.title, r.due_at, r.url
  from jsonb_to_recordset(coalesce(p_changes -> 'upcoming_items', '[]')) as r (
    id uuid, course_id uuid, external_uid text, title text, due_at timestamptz, url text)
  where r.id <> all (v_blocked)
  on conflict (id) do update set
    course_id = excluded.course_id, external_uid = excluded.external_uid, title = excluded.title,
    due_at = excluded.due_at, url = excluded.url;

  -- What could not be saved as sent, because its parent is not in the cloud.
  select coalesce(jsonb_agg(jsonb_build_object('table_name', s.table_name, 'row_id', s.id)), '[]'::jsonb)
    into v_skipped
  from (
    select 'grading_periods' as table_name, r.id
    from jsonb_to_recordset(coalesce(p_changes -> 'grading_periods', '[]')) as r (id uuid, course_id uuid)
    where not exists (select 1 from public.courses p where p.id = r.course_id and p.student_id = v_student)
    union all
    select 'categories', r.id
    from jsonb_to_recordset(coalesce(p_changes -> 'categories', '[]')) as r (id uuid, period_id uuid)
    where not exists (select 1 from public.grading_periods p where p.id = r.period_id and p.student_id = v_student)
    union all
    select 'assignments', r.id
    from jsonb_to_recordset(coalesce(p_changes -> 'assignments', '[]')) as r (id uuid, category_id uuid)
    where not exists (select 1 from public.categories p where p.id = r.category_id and p.student_id = v_student)
    union all
    -- Saved, but without its class.
    select 'upcoming_items', r.id
    from jsonb_to_recordset(coalesce(p_changes -> 'upcoming_items', '[]')) as r (id uuid, course_id uuid)
    where r.course_id is not null
      and not exists (select 1 from public.courses p where p.id = r.course_id and p.student_id = v_student)
  ) s
  where s.id <> all (v_blocked);

  -- Deletes last: a parent's delete cascades to children pushed above.
  -- Row-level security limits each delete to the student's own rows.
  delete from public.assignments
   where id <> all (v_blocked)
     and id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'assignments');
  delete from public.categories
   where id <> all (v_blocked)
     and id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'categories');
  delete from public.grading_periods
   where id <> all (v_blocked)
     and id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'grading_periods');
  delete from public.courses
   where id <> all (v_blocked)
     and id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'courses');
  delete from public.upcoming_items
   where id <> all (v_blocked)
     and id in (select (d ->> 'row_id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')) d
                 where d ->> 'table_name' = 'upcoming_items');

  return jsonb_build_object(
    'revision', coalesce((select revision from public.sync_state where student_id = v_student), 0),
    'skipped', v_skipped,
    'conflicts', v_conflicts);
end;
$$;

revoke execute on function public.push_changes(jsonb, bigint) from public, anon;
grant execute on function public.push_changes(jsonb, bigint) to authenticated, service_role;
