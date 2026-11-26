import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError, toApiError } from './errors';

/** Calls one SQL function (`supabase/migrations/*_grade_api.sql`) and returns its JSON result. */
export type RpcCaller = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * Wraps `client.rpc` for signed-in calls:
 * - fails fast with `not_signed_in` when there is no session, instead of
 *   sending a request the server will refuse;
 * - lets supabase-js attach (and, if needed, refresh) the access token;
 * - gives up after REQUEST_TIMEOUT_MS, so a dead connection cannot hang a sync,
 *   and cancels the request then, so it cannot reach the server later (a late
 *   push could otherwise overwrite a newer edit; push_changes also refuses rows
 *   changed after the phone's pull, for a request that is already on its way);
 * - turns errors into `ApiError`s.
 *
 * With `accountId`, calls are refused once someone else is signed in, so one
 * account's changes can never be sent as another's.
 *
 * `getClient` is called on every request so a missing configuration surfaces as
 * a rejected promise (`not_configured`), not a crash at import time.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

export function withTimeout<T>(
  work: PromiseLike<T>,
  ms: number = REQUEST_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new ApiError('network', 'The server took too long to answer.'));
    }, ms);
    Promise.resolve(work)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

export function createRpcCaller(getClient: () => SupabaseClient, accountId?: string): RpcCaller {
  return async (fn, args) => {
    const client = getClient();

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError && (sessionError.name === 'AuthRetryableFetchError' || sessionError.status === 0)) {
      // Signed in, but the session could not be refreshed without a connection.
      throw new ApiError('network', sessionError.message);
    }
    if (sessionError || !sessionData.session) {
      throw new ApiError('not_signed_in', 'Sign in to use cloud features.');
    }
    if (accountId !== undefined && sessionData.session.user.id !== accountId) {
      throw new ApiError('not_signed_in', 'Someone else is signed in now.');
    }

    let response;
    try {
      const controller = new AbortController();
      response = await withTimeout(client.rpc(fn, args).abortSignal(controller.signal), REQUEST_TIMEOUT_MS, () =>
        controller.abort(),
      );
    } catch (thrown) {
      if (thrown instanceof ApiError) throw thrown;
      throw new ApiError('network', thrown instanceof Error ? thrown.message : String(thrown));
    }
    if (response.error) {
      throw toApiError(response.error);
    }
    return response.data;
  };
}
