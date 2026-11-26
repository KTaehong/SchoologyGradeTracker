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
 *
 * An engine belongs to one account. A request can still be running when the
 * student signs out or someone else signs in, so every read and write of the
 * gradebook first checks, in the same transaction, that it is still that
 * account's.
 */
import { ApiError } from '@/api/errors';
import { countPendingChanges, getMeta, setMeta } from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';

import {
  applyRemoteChanges,
  collectLocalChanges,
  markPushed,
  type ChangeSet,
  type PullResult,
  type PushResult,
} from './changes';

export type SyncTransport = {
  pull(since: number): Promise<PullResult>;
  /** `base`: the revision of the pull just before; rows changed in the cloud after it are not overwritten. */
  push(changes: ChangeSet, base: number): Promise<PushResult>;
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

/** The account the phone's gradebook belongs to (see ./account.ts). */
export const ACCOUNT_KEY = 'account_id';
export const CURSOR_KEY = 'sync_cursor';
export const LAST_SYNCED_KEY = 'last_synced_at';

/** The sync was cut short because the engine was stopped or the account changed. */
class StoppedError extends Error {}

export type SyncEngineOptions = {
  db: SqlDb;
  /** The account this engine syncs. It stops touching the gradebook once that changes. */
  accountId?: string;
  transport: SyncTransport;
  /** Called after a pull changed rows on this phone, so screens can redraw. */
  onRemoteChange?: () => void;
  onStatus?: (status: SyncStatus) => void;
  /**
   * Every sync waits for this first. The app passes the account switch, so no
   * sync can pull or push before the phone's gradebook belongs to the signed-in
   * account (otherwise a previous account's unsent rows could be uploaded to it).
   * If it rejects, syncs report the error and send nothing.
   */
  ready?: Promise<unknown>;
  now?: () => Date;
};

export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  /** True while a sync re-sends rows the server skipped, so it is tried only once. */
  private resending = false;
  private status: SyncStatus = { state: 'idle', lastSyncedAt: null, pending: 0, error: null };

  constructor(private readonly options: SyncEngineOptions) {}

  getStatus(): SyncStatus {
    return this.status;
  }

  /** Ends this engine (sign-out, another account). A request still running changes nothing. */
  stop(): void {
    this.stopped = true;
    this.again = false;
  }

  /** Throws unless the gradebook is still this engine's. Runs inside its transactions. */
  private readonly check = async (): Promise<void> => {
    const { db, accountId } = this.options;
    if (this.stopped || (accountId !== undefined && (await getMeta(db, ACCOUNT_KEY)) !== accountId)) {
      throw new StoppedError();
    }
  };

  /** Syncs now, or right after the sync already running. Never rejects. */
  sync(): Promise<void> {
    if (this.stopped) {
      return Promise.resolve();
    }
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        await this.options.ready;
      } catch (error) {
        this.setStatus({ state: 'error', error: error instanceof Error ? error.message : String(error) });
        return;
      }
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
    if (this.stopped) return;
    this.status = { ...this.status, ...patch };
    this.options.onStatus?.(this.status);
  }

  private async runOnce(): Promise<void> {
    const { db, transport } = this.options;
    this.setStatus({ state: 'syncing', error: null });
    try {
      const cursor = Number((await getMeta(db, CURSOR_KEY)) ?? 0);
      await this.check();
      const pulled = await transport.pull(cursor);
      // Our own pushes come back in the next pull; saving them again is harmless.
      // The cursor only moves to what was pulled, never to a push's revision,
      // so changes another device made between our pull and push are not skipped.
      const applied = await applyRemoteChanges(db, pulled, this.check, () =>
        setMeta(db, CURSOR_KEY, String(pulled.revision)),
      );
      if (applied > 0) {
        this.options.onRemoteChange?.();
      }

      const local = await collectLocalChanges(db, this.check);
      if (local) {
        const result = await transport.push(local.changes, pulled.revision);
        const sendAgain = await markPushed(db, local.sent, result, this.check);
        if (sendAgain && !this.resending) {
          this.resending = true;
          this.again = true;
        } else {
          this.resending = false;
        }
      }

      const now = (this.options.now?.() ?? new Date()).toISOString();
      await db.transaction(async () => {
        await this.check();
        await setMeta(db, LAST_SYNCED_KEY, now);
      });
      this.setStatus({ state: 'idle', lastSyncedAt: now, pending: await countPendingChanges(db) });
    } catch (error) {
      if (error instanceof StoppedError) return;
      this.resending = false;
      const offline = error instanceof ApiError && error.kind === 'network';
      this.setStatus({
        state: offline ? 'offline' : 'error',
        error: error instanceof Error ? error.message : String(error),
        pending: await countPendingChanges(db).catch(() => this.status.pending),
      });
    }
  }
}
