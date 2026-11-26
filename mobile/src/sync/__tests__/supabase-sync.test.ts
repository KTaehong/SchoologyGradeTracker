import { describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '@/api/errors';
import type { RpcCaller } from '@/api/rpc';

import { createSupabaseTransport } from '../supabase-sync';

jest.mock('@/api/client', () => ({ getSupabase: jest.fn() }));

const changes = { deleted: [] };

describe('createSupabaseTransport', () => {
  it('sends the revision of the last pull with each push', async () => {
    const call = jest.fn<RpcCaller>(async () => ({ revision: 8, conflicts: [] }));
    await expect(createSupabaseTransport(call).push(changes, 7)).resolves.toEqual({ revision: 8, conflicts: [] });
    expect(call).toHaveBeenCalledWith('push_changes', { p_changes: changes, p_base: 7 });
  });

  it('pushes the old way to a server that does not know the revision yet', async () => {
    const call = jest.fn<RpcCaller>(async (_fn, args) => {
      if (args && 'p_base' in args) {
        throw new ApiError('server', 'Could not find the function public.push_changes(p_base, p_changes)', 'PGRST202');
      }
      return { revision: 8 };
    });
    await expect(createSupabaseTransport(call).push(changes, 7)).resolves.toEqual({ revision: 8 });
    expect(call).toHaveBeenLastCalledWith('push_changes', { p_changes: changes });
  });

  it('does not retry other errors', async () => {
    const call = jest.fn<RpcCaller>(async () => {
      throw new ApiError('network', 'Network request failed');
    });
    await expect(createSupabaseTransport(call).push(changes, 7)).rejects.toMatchObject({ kind: 'network' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});
