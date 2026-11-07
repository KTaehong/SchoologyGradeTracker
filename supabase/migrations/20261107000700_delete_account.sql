-- =============================================================================
-- delete_my_account: the signed-in student deletes their own account.
--
-- App Store Review Guideline 5.1.1(v): an app that lets people create an
-- account must let them delete it from inside the app.
--
--   supabase.rpc('delete_my_account')
--
-- Deleting the auth.users row removes everything the student owns: the
-- profile and, through `on delete cascade`, every course, grading period,
-- category, assignment, score, upcoming item, device, setting and sync row.
-- The student's other devices are signed out the next time they call the API
-- (their user no longer exists).
--
-- SECURITY DEFINER because students cannot write to the auth schema. It only
-- ever deletes the caller's own row (auth.uid()).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fix: deleting a student failed (also from the Supabase dashboard). The
-- cascade runs `on delete set null` updates (assignments.import_id,
-- upcoming_items.course_id); their revision trigger then wrote a sync_state
-- row for a profile that was already gone, which broke the foreign key. A
-- student being deleted has nothing left to sync, so skip the stamp.
-- -----------------------------------------------------------------------------
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
    delete from public.sync_tombstones where table_name = tg_table_name and row_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := public.require_student();
begin
  delete from auth.users where id = v_student;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
