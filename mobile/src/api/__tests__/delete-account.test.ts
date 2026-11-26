import { describe, expect, it, jest } from '@jest/globals';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';

import { deleteMyAccount } from '../delete-account';
import { ApiError } from '../errors';
import type { RpcCaller } from '../rpc';

type GetUser = () => Promise<{ data: { user: unknown }; error: Error | null }>;

function client(getUser: GetUser) {
  const fn = jest.fn(getUser);
  return { client: { auth: { getUser: fn } } as unknown as SupabaseClient, getUser: fn };
}

const timedOut: RpcCaller = async () => {
  throw new ApiError('network', 'The server took too long to answer.');
};

describe('deleteMyAccount', () => {
  it('deletes and does not ask again when the server answers', async () => {
    const call = jest.fn<RpcCaller>(async () => null);
    const { client: c, getUser } = client(async () => ({ data: { user: null }, error: null }));
    await deleteMyAccount(call, c);
    expect(call).toHaveBeenCalledWith('delete_my_account');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('counts a timed-out delete as done when the account is gone', async () => {
    const gone = new AuthApiError('User from sub claim in JWT does not exist', 403, 'user_not_found');
    const { client: c } = client(async () => ({ data: { user: null }, error: gone }));
    await expect(deleteMyAccount(timedOut, c)).resolves.toBeUndefined();
  });

  it('counts a timed-out delete as done when the session is gone with it', async () => {
    const { client: c } = client(async () => ({ data: { user: null }, error: new AuthSessionMissingError() }));
    await expect(deleteMyAccount(timedOut, c)).resolves.toBeUndefined();
  });

  it('keeps the error when the account still exists', async () => {
    const { client: c } = client(async () => ({ data: { user: { id: 'ana' } }, error: null }));
    await expect(deleteMyAccount(timedOut, c)).rejects.toMatchObject({ kind: 'network' });
  });

  it('keeps the error when the phone is still offline', async () => {
    const { client: c } = client(async () => ({
      data: { user: null },
      error: new AuthRetryableFetchError('Network request failed', 0),
    }));
    await expect(deleteMyAccount(timedOut, c)).rejects.toMatchObject({ kind: 'network' });
  });

  it('does not ask when the server refused the delete', async () => {
    const refused: RpcCaller = async () => {
      throw new ApiError('not_signed_in', 'Sign in to use cloud features.');
    };
    const { client: c, getUser } = client(async () => ({ data: { user: null }, error: new AuthSessionMissingError() }));
    await expect(deleteMyAccount(refused, c)).rejects.toMatchObject({ kind: 'not_signed_in' });
    expect(getUser).not.toHaveBeenCalled();
  });
});
