-- =============================================================================
-- Trigger functions are not part of the API.
--
-- Postgres lets every role run a new function by default, so the trigger
-- functions below showed up as callable at /rest/v1/rpc/<name> (Supabase's
-- security advisor flags the SECURITY DEFINER ones). Calling one directly
-- fails ("trigger functions can only be called as triggers"), so nothing was
-- exposed, but there is no reason to offer them at all.
--
-- Triggers keep working: Postgres checks EXECUTE on a trigger function when
-- the trigger is created, not each time it fires.
-- =============================================================================

revoke execute on function public.set_updated_at()                  from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user()            from public, anon, authenticated;
revoke execute on function public.handle_auth_user_contact_change() from public, anon, authenticated;
revoke execute on function public.sync_login_methods()              from public, anon, authenticated;
revoke execute on function public.stamp_assignment_scores()         from public, anon, authenticated;
revoke execute on function public.log_score_change()                from public, anon, authenticated;
revoke execute on function public.stamp_sync_revision()             from public, anon, authenticated;
revoke execute on function public.record_sync_tombstone()           from public, anon, authenticated;
