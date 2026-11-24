-- =============================================================================
-- Small fixes to sync and sign-up, found in the November 2026 code review.
--
--   1. push_changes also returns "skipped": the rows whose parent is not in the
--      cloud. The phone used to mark those as synced, so the phone and the cloud
--      disagreed without anyone knowing. (Older app versions ignore the field.)
--   2. Tombstones belong to one student: inserting a row with another student's
--      deleted id no longer removes that student's tombstone.
--   3. A name that is too long, or a phone number in another format, no longer
--      makes the whole sign-up fail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. push_changes reports what it skipped.
--    Returns { "revision": <after the push>,
--              "skipped": [ { "table_name", "row_id" } ] }.
-- -----------------------------------------------------------------------------
create or replace function public.push_changes(p_changes jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_student uuid := public.require_student();
  v_skipped jsonb;
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
  ) s;

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
    'revision', coalesce((select revision from public.sync_state where student_id = v_student), 0),
    'skipped', v_skipped);
end;
$$;

-- "create or replace" keeps the grants; repeated so this file stands on its own.
revoke execute on function public.push_changes(jsonb) from public, anon;
grant execute on function public.push_changes(jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. One student's tombstones cannot be touched through another's rows.
-- -----------------------------------------------------------------------------
alter table public.sync_tombstones drop constraint sync_tombstones_pkey;
alter table public.sync_tombstones add primary key (student_id, table_name, row_id);

create or replace function public.stamp_sync_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.student_id) then
    return new;
  end if;
  new.revision := public.next_sync_revision(new.student_id);
  if tg_op = 'INSERT' then
    -- The id is back (for example, a delete was undone): it is no longer deleted.
    delete from public.sync_tombstones
     where student_id = new.student_id and table_name = tg_table_name and row_id = new.id;
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
    on conflict (student_id, table_name, row_id) do update
      set revision = excluded.revision, deleted_at = now();
  end if;
  return old;
end;
$$;

revoke execute on function public.stamp_sync_revision()   from public, anon, authenticated;
revoke execute on function public.record_sync_tombstone() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Sign-up never fails because of a name or phone number.
-- -----------------------------------------------------------------------------

-- E.164 ("+12065550123"), or NULL when it cannot be read as that. Supabase Auth
-- stores phone numbers without the plus sign.
create or replace function public.clean_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d.phone ~ '^\+[1-9][0-9]{6,14}$' then d.phone end
  from (select '+' || regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as phone) d;
$$;

revoke execute on function public.clean_phone(text) from public, anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_username text := lower(meta ->> 'username');
begin
  if wanted_username is null
     or wanted_username !~ '^[a-z0-9_.]{3,30}$'
     or exists (select 1 from public.profiles p where p.username = wanted_username) then
    wanted_username := 'student_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, full_name, username, email, phone)
  values (
    new.id,
    coalesce(nullif(left(btrim(meta ->> 'full_name'), 100), ''),
             nullif(left(btrim(meta ->> 'name'), 100), ''),
             'Student'),
    wanted_username,
    new.email,
    coalesce(public.clean_phone(new.phone), public.clean_phone(meta ->> 'phone'))
  );

  insert into public.user_settings (student_id) values (new.id);
  return new;
end;
$$;

create or replace function public.handle_auth_user_contact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email,
         phone = coalesce(public.clean_phone(new.phone), phone)
   where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user()            from public, anon, authenticated;
revoke execute on function public.handle_auth_user_contact_change() from public, anon, authenticated;
