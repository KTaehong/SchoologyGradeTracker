import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../errors';
import { createRpcCaller, withTimeout } from '../rpc';

type RpcResponse = { data: unknown; error: { code: string; message: string } | null };

function fakeClient({
  signedIn = true,
  response,
}: { signedIn?: boolean; response?: RpcResponse } = {}) {
  const rpc = jest.fn(
    async (_fn: string, _args?: object) => response ?? { data: null, error: null },
  );
  const getSession = jest.fn(async () => ({
    data: { session: signedIn ? { access_token: 'jwt', user: { id: 'ana' } } : null },
    error: null,
  }));
  const client = { rpc, auth: { getSession } } as unknown as SupabaseClient;
  return { client, rpc, getSession };
}

describe('createRpcCaller', () => {
  it('does not call the server when no one is signed in', async () => {
    const { client, rpc } = fakeClient({ signedIn: false });
    const call = createRpcCaller(() => client);

    await expect(call('get_grades')).rejects.toMatchObject({ kind: 'not_signed_in' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the function name and arguments through', async () => {
    const { client, rpc } = fakeClient({ response: { data: { ok: true }, error: null } });
    const call = createRpcCaller(() => client);

    await expect(
      call('set_forecast', { p_assignment_id: 'a1', p_forecast_score: 9 }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(rpc).toHaveBeenCalledWith('set_forecast', {
      p_assignment_id: 'a1',
      p_forecast_score: 9,
    });
  });

  it('turns server errors into ApiErrors', async () => {
    const { client } = fakeClient({
      response: { data: null, error: { code: 'P0002', message: 'Assignment x not found' } },
    });
    const call = createRpcCaller(() => client);

    const error = await call('set_forecast').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'not_found', message: 'Assignment x not found' });
  });

  it('rejects (instead of throwing) when the API is not configured', async () => {
    const call = createRpcCaller(() => {
      throw new ApiError('not_configured', 'missing');
    });
    await expect(call('get_grades')).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('refuses to call as someone else', async () => {
    const { client, rpc } = fakeClient();
    await expect(createRpcCaller(() => client, 'ben')('pull_changes')).rejects.toMatchObject({ kind: 'not_signed_in' });
    expect(rpc).not.toHaveBeenCalled();
    await createRpcCaller(() => client, 'ana')('pull_changes');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('is offline, not signed out, when the session cannot be refreshed', async () => {
    const { client, getSession } = fakeClient();
    getSession.mockResolvedValueOnce({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 },
    } as never);
    await expect(createRpcCaller(() => client)('pull_changes')).rejects.toMatchObject({ kind: 'network' });
  });

  it('gives up on a server that never answers', async () => {
    await expect(withTimeout(new Promise(() => undefined), 5)).rejects.toMatchObject({ kind: 'network' });
  });
});
