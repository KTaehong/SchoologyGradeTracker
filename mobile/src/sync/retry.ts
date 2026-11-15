/**
 * When a sync fails, try again by itself. The phone's "back online" signal is
 * not enough: it can be missed, and a sync can also fail while the phone still
 * looks connected (a server hiccup, a Wi-Fi login page). Without a retry the
 * app would say "Offline" until the student did something.
 */
import type { SyncState } from './sync-engine';

/** Waits after the 1st, 2nd, 3rd… failure in a row; the last one repeats. */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * How long to wait before syncing again, or `null` when no retry is needed.
 * `failures` counts failed syncs in a row, starting at 1.
 */
export function retryDelayMs(state: SyncState, failures: number): number | null {
  if (state !== 'offline' && state !== 'error') return null;
  const index = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index];
}
