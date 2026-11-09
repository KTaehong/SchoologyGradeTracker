-- =============================================================================
-- Lock down the public API.
--
-- Supabase exposes every table, view and function in `public` through its REST
-- (PostgREST), GraphQL and Realtime APIs, and by default grants all of them to
-- `anon` (anyone holding the app's publishable key, i.e. anyone with the app).
-- Row-level security already returned nothing to signed-out callers, but the
-- endpoints were still open: they answered, listed the schema in GraphQL, and
-- ran functions. This migration closes them, so the only things a caller can
-- do without signing in are sign up and sign in (Supabase Auth, not this schema).
--
--   1. `anon` loses every privilege on tables, views, sequences and functions in
--      `public`, now and for objects added later. Signed-out calls get
--      "permission denied" (HTTP 401/403) instead of an empty answer.
--   2. Trigger functions can only be fired by their triggers, never called.
--   3. Signed-in students cannot TRUNCATE (which skips row-level security) or
--      write tables that only the server's triggers maintain: sync_state,
--      sync_tombstones, score_history, login_methods, and creating/deleting
--      profiles and settings rows.
--
-- What a signed-in student can do is unchanged: read and write their own
-- gradebook rows (row-level security), and call the API / sync functions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nothing for anon.
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Functions are granted to PUBLIC (every role) when created, plus anon by
-- Supabase's default privileges. Revoke both, and keep them for signed-in
-- students and the server. Functions that belong to an extension are left alone.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;

alter default privileges in schema public revoke all     on tables    from anon;
alter default privileges in schema public revoke all     on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
-- Postgres still gives PUBLIC (and so anon) EXECUTE on every new function; that
-- default is global and cannot be removed for one schema without breaking the
-- SQL editor. So a migration that adds a function must end with
--   revoke execute on function public.<name>(<args>) from public, anon;
-- supabase/tests/api_security_test.sql fails if one is missed.

-- -----------------------------------------------------------------------------
-- 2. Trigger functions are not API endpoints.
-- -----------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from authenticated', f);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Signed-in students: only what the app needs.
-- -----------------------------------------------------------------------------

-- TRUNCATE skips row-level security; REFERENCES and TRIGGER are never needed.
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- sync_state is the student's revision counter. Only the server bumps it (in
-- next_sync_revision); the app just reads it and listens for changes over
-- Realtime. Before, a student could set it by hand and confuse their devices.
drop policy if exists "sync_state: own rows" on public.sync_state;
create policy "sync_state: read own" on public.sync_state
  for select to authenticated using (student_id = (select auth.uid()));
revoke insert, update, delete on public.sync_state from authenticated;

-- Written only by SECURITY DEFINER triggers; students may read their own rows.
revoke insert, update, delete on public.sync_tombstones from authenticated;
revoke insert, update, delete on public.score_history  from authenticated;
revoke insert, update, delete on public.login_methods  from authenticated;

-- Profiles and settings rows are made by the sign-up trigger and removed with
-- the account (delete_my_account). Students edit them, nothing more.
revoke insert, delete on public.profiles      from authenticated;
revoke insert, delete on public.user_settings from authenticated;
