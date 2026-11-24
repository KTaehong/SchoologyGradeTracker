import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { getSession, onSessionChange, signInWithApple, signOut, signUpWithEmail, type Session } from '../auth';
import { getSupabase, readStoredSession } from '../client';

jest.mock('../client', () => ({
  isApiConfigured: () => true,
  getSupabase: jest.fn(),
  readStoredSession: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: async () => ({ identityToken: 'token', fullName: { givenName: 'Ana', familyName: 'Park' } }),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `gradetracker://${path}` }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'nonce',
  digestStringAsync: async () => 'hash',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

const session = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;
const offline = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 };

const client = (auth: object, rest: object = {}) =>
  (getSupabase as unknown as jest.Mock).mockReturnValue({ auth, ...rest });
const stored = (value: Session | null) =>
  (readStoredSession as unknown as jest.Mock<() => Promise<Session | null>>).mockResolvedValue(value);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('opening the app', () => {
  it('knows who is signed in without asking the server', async () => {
    client({});
    stored(session);
    await expect(getSession()).resolves.toBe(session);
  });

  it('keeps the saved session when an expired token cannot be refreshed offline', async () => {
    let emit: (event: string, s: Session | null) => void = () => undefined;
    client({
      onAuthStateChange: (l: typeof emit) => {
        emit = l;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    });
    stored(session);
    const heard: (Session | null)[] = [];
    onSessionChange((s) => heard.push(s));
    emit('INITIAL_SESSION', null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(heard).toEqual([session]);
    emit('SIGNED_OUT', null);
    expect(heard).toEqual([session, null]);
  });
});

describe('signOut', () => {
  it('removes the session from the phone when the server cannot be reached', async () => {
    const calls: unknown[] = [];
    client({
      signOut: async (options: { scope: string }) => {
        calls.push(options.scope);
        return { error: offline };
      },
    });
    stored(null);
    await expect(signOut()).resolves.toBeUndefined();
    expect(calls).toEqual(['global', 'local']);
  });

  it('says so when the session is still there', async () => {
    client({ signOut: async () => ({ error: offline }) });
    stored(session);
    await expect(signOut()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('signUpWithEmail', () => {
  it('answers the same for an email that already has an account', async () => {
    client({ signUp: async () => ({ data: { session: null, user: { identities: [] } }, error: null }) });
    await expect(signUpWithEmail({ email: 'a@b.co', password: 'x', fullName: 'A' })).resolves.toBeNull();
  });
});

describe('signInWithApple', () => {
  it('tries again to save the name, which Apple shares only once', async () => {
    const results = [{ error: { message: 'timeout' } }, { error: null }];
    const saved: unknown[] = [];
    client(
      { signInWithIdToken: async () => ({ data: { session, user: { id: 'u1' } }, error: null }) },
      { from: () => ({ update: (row: unknown) => ({ eq: async () => (saved.push(row), results.shift()) }) }) },
    );
    await expect(signInWithApple()).resolves.toBe(session);
    expect(saved).toEqual([{ full_name: 'Ana Park' }, { full_name: 'Ana Park' }]);
  });
});
