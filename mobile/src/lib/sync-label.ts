import type { SyncStatus } from '@/sync/sync-engine';

/** "Synced 3 min ago", "Offline · 2 changes waiting", … for the sync status line. */
export function syncLabel(
  sync: SyncStatus | null,
  online: boolean,
  now: Date = new Date(),
): string {
  if (sync === null) {
    return 'Saved on this phone';
  }
  const waiting = sync.pending > 0 ? ` · ${sync.pending} ${sync.pending === 1 ? 'change' : 'changes'} waiting` : '';
  if (!online || sync.state === 'offline') {
    return `Offline${waiting || ' · your grades still work'}`;
  }
  if (sync.state === 'syncing') {
    return 'Syncing…';
  }
  if (sync.state === 'error') {
    return `Sync failed${waiting} · pull down to retry`;
  }
  if (sync.lastSyncedAt === null) {
    return `Not synced yet${waiting}`;
  }
  return `Synced ${timeAgo(new Date(sync.lastSyncedAt), now)}${waiting}`;
}

export function timeAgo(then: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
