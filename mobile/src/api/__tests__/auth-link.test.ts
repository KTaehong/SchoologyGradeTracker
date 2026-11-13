import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { finishAuthLink } from '../auth';
import { getSupabase } from '../client';

jest.mock('../client', () => ({
  isApiConfigured: () => true,
  getSupabase: jest.fn(),
}));

type AuthListener = (event: string) => void;
type ExchangeResult = { data: unknown; error: unknown };

/** A stand-in for supabase.auth that sends `event` while the code is swapped. */
function fakeAuth(result: ExchangeResult, event?: string) {
  let listener: AuthListener = () => undefined;
  const exchangeCodeForSession = jest.fn(async () => {
    if (event) {
      listener(event);
    }
    return result;
  });
  const auth = {
    onAuthStateChange: (l: AuthListener) => {
      listener = l;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    },
    exchangeCodeForSession,
  };
  (getSupabase as jest.Mock).mockReturnValue({ auth });
  return exchangeCodeForSession;
}

const session = { user: { id: 'u1' } };

describe('finishAuthLink', () => {
  beforeEach(() => {
    (getSupabase as jest.Mock).mockReset();
  });

  it('ignores a link without a code', async () => {
    const exchange = fakeAuth({ data: { session }, error: null });
    await expect(finishAuthLink({})).resolves.toBe('ignored');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('signs in from a confirm-your-account link', async () => {
    fakeAuth({ data: { session, redirectType: null }, error: null }, 'SIGNED_IN');
    await expect(finishAuthLink({ code: 'confirm-1' })).resolves.toBe('signed_in');
  });

  it('reports a password-reset link, from the event or the result', async () => {
    fakeAuth({ data: { session }, error: null }, 'PASSWORD_RECOVERY');
    await expect(finishAuthLink({ code: 'reset-1' })).resolves.toBe('recovery');

    fakeAuth({ data: { session, redirectType: 'recovery' }, error: null });
    await expect(finishAuthLink({ code: 'reset-2' })).resolves.toBe('recovery');
  });

  it('uses each one-time code only once', async () => {
    const exchange = fakeAuth({ data: { session }, error: null });
    const [first, second] = await Promise.all([
      finishAuthLink({ code: 'once-1' }),
      finishAuthLink({ code: 'once-1' }),
    ]);
    expect([first, second]).toEqual(['signed_in', 'signed_in']);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('explains an expired link or one opened on another phone', async () => {
    fakeAuth({ data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'x' } });
    await expect(finishAuthLink({ code: 'old-1' })).rejects.toThrow(/expired or was opened on a different phone/);
    await expect(finishAuthLink({ error: 'access_denied', error_description: 'otp_expired' })).rejects.toThrow(
      /expired/,
    );
  });

  it('reports no internet as a network problem', async () => {
    fakeAuth({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' },
    });
    await expect(finishAuthLink({ code: 'offline-1' })).rejects.toMatchObject({ kind: 'network' });
  });
});
