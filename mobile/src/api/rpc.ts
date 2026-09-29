import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError, toApiError } from './errors';

/** Calls one SQL function (`supabase/migrations/*_grade_api.sql`) and returns its JSON result. */
export type RpcCaller = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * Wraps `client.rpc` for signed-in calls:
 * - fails fast with `not_signed_in` when there is no session, instead of
 *   sending a request the server will refuse;
 * - lets supabase-js attach (and, if needed, refresh) the access token;
 * - turns errors into `ApiError`s.
 *
 * `getClient` is called on every request so a missing configuration surfaces as
 * a rejected promise (`not_configured`), not a crash at import time.
 */
export function createRpcCaller(getClient: () => SupabaseClient): RpcCaller {
  return async (fn, args) => {
    const client = getClient();

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session) {
      throw new ApiError('not_signed_in', 'Sign in to use cloud features.');
    }

    let response;
    try {
      response = await client.rpc(fn, args);
    } catch (thrown) {
      throw new ApiError('network', thrown instanceof Error ? thrown.message : String(thrown));
    }
    if (response.error) {
      throw toApiError(response.error);
    }
    return response.data;
  };
}
