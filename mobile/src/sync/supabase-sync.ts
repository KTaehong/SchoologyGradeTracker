/**
 * The cloud side of sync: the two RPCs, and a Realtime listener that tells
 * this phone when another device pushed (so it can pull right away instead of
 * waiting for the next app launch).
 */
import { getSupabase } from '@/api/client';
import type { RpcCaller } from '@/api/rpc';

import type { ChangeSet, PullResult } from './changes';
import type { SyncTransport } from './sync-engine';

export function createSupabaseTransport(call: RpcCaller): SyncTransport {
  return {
    pull: async (since) => (await call('pull_changes', { p_since: since })) as PullResult,
    push: async (changes: ChangeSet) =>
      (await call('push_changes', { p_changes: changes })) as { revision: number },
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
