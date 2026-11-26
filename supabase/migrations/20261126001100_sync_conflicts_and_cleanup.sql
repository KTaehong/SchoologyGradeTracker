-- =============================================================================
-- Fixes from the third code review (26 November 2026).
--
--   1. push_changes takes the revision the phone last pulled (p_base). A row
--      that changed in the cloud after that pull is not overwritten: it comes
--      back in "conflicts", the phone keeps it unsent, pulls, and pushes again.
--      So a push that timed out and reaches the server late can no longer
--      overwrite a newer edit (review finding N6). Without p_base (older app
--      versions) nothing changes: last write wins, as before.
--   2. Two sign-ups that ask for the same free username at the same moment:
--      the second one gets a generated name instead of failing (N7).
--   3. Indexes for the foreign keys the performance advisor listed, and one
--      SELECT policy per table on grading_scales / grading_scale_bands (N5).
--   4. user_settings.sync_enabled is removed: sync is always on (N4).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. push_changes(p_changes, p_base)
--    Returns { "revision": <after the push>,
--              "skipped":   [ { "table_name", "row_id" } ],   -- parent not in the cloud
--              "conflicts": [ { "table_name", "row_id" } ] }  -- changed after p_base, not saved
-- -----------------------------------------------------------------------------
drop function public.push_changes(jsonb);

create function public.push_changes(p_changes jsonb, p_base bigint default null)
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

-- -----------------------------------------------------------------------------
-- 2. Sign-up never fails because someone took the same username a moment earlier.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  generated_username text := 'student_' || substr(replace(new.id::text, '-', ''), 1, 10);
  wanted_username text := lower(meta ->> 'username');
  v_full_name text := coalesce(nullif(left(btrim(meta ->> 'full_name'), 100), ''),
                               nullif(left(btrim(meta ->> 'name'), 100), ''),
                               'Student');
  v_phone text := coalesce(public.clean_phone(new.phone), public.clean_phone(meta ->> 'phone'));
begin
  if wanted_username is null
     or wanted_username !~ '^[a-z0-9_.]{3,30}$'
     or exists (select 1 from public.profiles p where p.username = wanted_username) then
    wanted_username := generated_username;
  end if;

  begin
    insert into public.profiles (id, full_name, username, email, phone)
    values (new.id, v_full_name, wanted_username, new.email, v_phone);
  exception when unique_violation then
    -- Another sign-up took the name between the check and the insert.
    if wanted_username = generated_username then
      raise;
    end if;
    insert into public.profiles (id, full_name, username, email, phone)
    values (new.id, v_full_name, generated_username, new.email, v_phone);
  end;

  insert into public.user_settings (student_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Performance advisor: index every foreign key, one SELECT policy per table.
-- -----------------------------------------------------------------------------
create index if not exists grading_scales_student_idx        on public.grading_scales (student_id);
create index if not exists imports_student_idx               on public.imports (student_id);
create index if not exists courses_grading_scale_idx         on public.courses (grading_scale_id);
create index if not exists grading_periods_course_student_idx on public.grading_periods (course_id, student_id);
create index if not exists categories_period_student_idx     on public.categories (period_id, student_id);
create index if not exists assignments_category_student_idx  on public.assignments (category_id, student_id);
create index if not exists assignments_import_student_idx    on public.assignments (import_id, student_id);
create index if not exists score_history_assignment_student_idx on public.score_history (assignment_id, student_id);
create index if not exists grade_targets_course_student_idx  on public.grade_targets (course_id, student_id);
create index if not exists grade_targets_solve_for_idx       on public.grade_targets (solve_for_assignment_id, student_id);
create index if not exists upcoming_items_course_student_idx on public.upcoming_items (course_id, student_id);
create index if not exists sync_state_last_pushed_device_idx on public.sync_state (last_pushed_device_id);

-- "write own" was `for all`, so it was a second SELECT policy next to "read
-- built-in and own". Split it into insert / update / delete.
drop policy "grading_scales: write own" on public.grading_scales;
create policy "grading_scales: insert own" on public.grading_scales
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "grading_scales: update own" on public.grading_scales
  for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy "grading_scales: delete own" on public.grading_scales
  for delete to authenticated using (student_id = (select auth.uid()));

drop policy "grading_scale_bands: write own" on public.grading_scale_bands;
create policy "grading_scale_bands: insert own" on public.grading_scale_bands
  for insert to authenticated
  with check (exists (select 1 from public.grading_scales s
                      where s.id = scale_id and s.student_id = (select auth.uid())));
create policy "grading_scale_bands: update own" on public.grading_scale_bands
  for update to authenticated
  using (exists (select 1 from public.grading_scales s
                 where s.id = scale_id and s.student_id = (select auth.uid())))
  with check (exists (select 1 from public.grading_scales s
                      where s.id = scale_id and s.student_id = (select auth.uid())));
create policy "grading_scale_bands: delete own" on public.grading_scale_bands
  for delete to authenticated
  using (exists (select 1 from public.grading_scales s
                 where s.id = scale_id and s.student_id = (select auth.uid())));

-- -----------------------------------------------------------------------------
-- 4. Sync is always on, so the old opt-in switch goes.
-- -----------------------------------------------------------------------------
alter table public.user_settings drop column if exists sync_enabled;
