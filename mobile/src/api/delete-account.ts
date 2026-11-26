import { isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors';
import type { RpcCaller } from './rpc';

/**
 * Deletes the signed-in account (`delete_my_account`).
 *
 * The phone stops waiting after the request timeout, but the request can still
 * reach the server and delete the account. So after a network error it asks the
 * server once whether the account still exists: if it is gone, the delete
 * worked and the caller goes on to sign out. Otherwise the error stands.
 */
export async function deleteMyAccount(call: RpcCaller, client: SupabaseClient): Promise<void> {
  try {
    await call('delete_my_account');
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'network' && (await accountIsGone(client))) {
      return;
    }
    throw error;
  }
}

/** `true` only when the server says the account (or its session) no longer exists. */
export async function accountIsGone(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getUser();
    if (data.user || !error) return false;
    if (isAuthSessionMissingError(error)) return true;
    const code = (error as { code?: string }).code;
    return code === 'user_not_found' || code === 'session_not_found' || error.status === 401 || error.status === 403;
  } catch {
    return false;
  }
}
