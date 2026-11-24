import type { Session } from '@supabase/supabase-js';

/** Where supabase-js keeps the session; the same as its default, so nobody is signed out by an update. */
export function sessionStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

/** The saved session, or `null` when there is none or it cannot be read. */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) {
    return null;
  }
  try {
    const session = JSON.parse(raw) as Partial<Session> | null;
    return session?.access_token && session.refresh_token && session.user?.id ? (session as Session) : null;
  } catch {
    return null;
  }
}
