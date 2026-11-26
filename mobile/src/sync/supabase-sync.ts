/**
 * The cloud side of sync: the two RPCs, and a Realtime listener that tells
 * this phone when another device pushed (so it can pull right away instead of
 * waiting for the next app launch).
 */
import { getSupabase } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { RpcCaller } from '@/api/rpc';

import type { ChangeSet, PullResult, PushResult } from './changes';
import type { SyncTransport } from './sync-engine';

/** PostgREST: no function with these argument names (the server is older than this app). */
const NO_SUCH_FUNCTION = 'PGRST202';

export function createSupabaseTransport(call: RpcCaller): SyncTransport {
  return {
    pull: async (since) => (await call('pull_changes', { p_since: since })) as PullResult,
    push: async (changes: ChangeSet, base: number) => {
      try {
        return (await call('push_changes', { p_changes: changes, p_base: base })) as PushResult;
      } catch (error) {
        // A server without migration 11 does not know p_base: push the old way
        // (last write wins) rather than not at all.
        if (error instanceof ApiError && error.code === NO_SUCH_FUNCTION) {
          return (await call('push_changes', { p_changes: changes })) as PushResult;
        }
        throw error;
      }
    },
  };
}

/**
 * Calls `onChange` whenever the student's sync revision moves (any device
 * pushed, including this one). Returns a function that stops listening.
 */
export function watchRemoteChanges(userId: string, onChange: () => void): () => void {
  const supabase = getSupabase();
  const channel = supabase
    .channel(`sync-state:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sync_state', filter: `student_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
