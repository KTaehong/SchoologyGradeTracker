/**
 * Keeps the phone's gradebook and the cloud copy in step (F14).
 *
 * One sync = pull, then push:
 *   1. pull_changes(cursor) — only rows changed since this phone's cursor (the
 *      server's revision number works like an ETag: an empty reply means the
 *      phone is up to date). Saved with applyRemoteChanges.
 *   2. push_changes — every row changed here since the last push.
 *
 * Syncs never overlap: asking for one while another runs queues exactly one
 * more, which picks up anything that changed in the meantime.
 */
import { ApiError } from '@/api/errors';
import { countPendingChanges, getMeta, setMeta } from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';

import { applyRemoteChanges, collectLocalChanges, markPushed, type ChangeSet, type PullResult } from './changes';

export type SyncTransport = {
  pull(since: number): Promise<PullResult>;
  push(changes: ChangeSet): Promise<{ revision: number }>;
};

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncStatus = {
  state: SyncState;
  /** ISO 8601, when the last sync finished. */
  lastSyncedAt: string | null;
  /** Changes on this phone not yet in the cloud. */
  pending: number;
  error: string | null;
};

export const CURSOR_KEY = 'sync_cursor';
export const LAST_SYNCED_KEY = 'last_synced_at';

export type SyncEngineOptions = {
  db: SqlDb;
  transport: SyncTransport;
  /** Called after a pull changed rows on this phone, so screens can redraw. */
  onRemoteChange?: () => void;
  onStatus?: (status: SyncStatus) => void;
  now?: () => Date;
};

export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private status: SyncStatus = { state: 'idle', lastSyncedAt: null, pending: 0, error: null };

  constructor(private readonly options: SyncEngineOptions) {}

  getStatus(): SyncStatus {
    return this.status;
  }

  /** Syncs now, or right after the sync already running. Never rejects. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Re-reads the pending count (after a local change) without syncing. */
  async refreshStatus(): Promise<void> {
    const { db } = this.options;
    this.setStatus({
      pending: await countPendingChanges(db),
      lastSyncedAt: await getMeta(db, LAST_SYNCED_KEY),
    });
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.options.onStatus?.(this.status);
  }

  private async runOnce(): Promise<void> {
    const { db, transport } = this.options;
    this.setStatus({ state: 'syncing', error: null });
    try {
      const cursor = Number((await getMeta(db, CURSOR_KEY)) ?? 0);
      const pulled = await transport.pull(cursor);
      const applied = await applyRemoteChanges(db, pulled);
      // Our own pushes come back in the next pull; saving them again is harmless.
      // The cursor only moves to what was pulled, never to a push's revision,
      // so changes another device made between our pull and push are not skipped.
      await setMeta(db, CURSOR_KEY, String(pulled.revision));
      if (applied > 0) {
        this.options.onRemoteChange?.();
      }

      const local = await collectLocalChanges(db);
      if (local) {
        await transport.push(local.changes);
        await markPushed(db, local.sent);
      }

      const now = (this.options.now?.() ?? new Date()).toISOString();
      await setMeta(db, LAST_SYNCED_KEY, now);
      this.setStatus({ state: 'idle', lastSyncedAt: now, pending: await countPendingChanges(db) });
    } catch (error) {
      const offline = error instanceof ApiError && error.kind === 'network';
      this.setStatus({
        state: offline ? 'offline' : 'error',
        error: error instanceof Error ? error.message : String(error),
        pending: await countPendingChanges(db).catch(() => this.status.pending),
      });
    }
  }
}
