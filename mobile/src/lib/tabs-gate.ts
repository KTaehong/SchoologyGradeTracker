import type { SessionState } from '@/api/use-session';

/**
 * What the tabs show at launch: wait, send a new student to Welcome, or open
 * the tabs.
 *
 * Once Welcome has been seen, the tabs open without waiting for the sign-in
 * check. That check can take 30 s or more when the saved token has expired and
 * the network is slow or off (Supabase retries the refresh), and the gradebook
 * is on the phone anyway. Sync starts when the check finishes.
 */
export function tabsGate(
  seenWelcome: boolean | null,
  session: SessionState['status'],
): 'wait' | 'welcome' | 'tabs' {
  if (seenWelcome === null) return 'wait';
  if (seenWelcome) return 'tabs';
  if (session === 'loading') return 'wait';
  return session === 'signed_out' ? 'welcome' : 'tabs';
}
