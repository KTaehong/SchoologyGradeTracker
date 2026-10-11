import { describe, expect, it } from '@jest/globals';

import type { SyncStatus } from '@/sync/sync-engine';

import { syncLabel } from '../sync-label';

const now = new Date('2026-10-06T18:00:00Z');
const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  state: 'idle',
  lastSyncedAt: '2026-10-06T17:57:00Z',
  pending: 0,
  error: null,
  ...patch,
});

describe('syncLabel', () => {
  it('signed out: the grades are on the phone', () => {
    expect(syncLabel(null, true, now)).toBe('Saved on this phone');
  });

  it('synced a few minutes ago', () => {
    expect(syncLabel(status({}), true, now)).toBe('Synced 3 min ago');
  });

  it('offline with changes waiting', () => {
    expect(syncLabel(status({ pending: 2 }), false, now)).toBe('Offline · 2 changes waiting');
    expect(syncLabel(status({ state: 'offline' }), true, now)).toBe('Offline · your grades still work');
  });

  it('errors and first sync', () => {
    expect(syncLabel(status({ state: 'error', pending: 1 }), true, now)).toBe(
      'Sync failed · 1 change waiting · pull down to retry',
    );
    expect(syncLabel(status({ lastSyncedAt: null }), true, now)).toBe('Not synced yet');
  });
});
