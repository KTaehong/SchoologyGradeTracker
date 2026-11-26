/**
 * The sign-in paths of ./auth.ts with the Supabase client, the browser and
 * Apple's sheet mocked: email, Google, Apple, password reset, and how each
 * Supabase error reaches the screen.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

import {
  requestPasswordReset,
  resendConfirmation,
  signInWithApple,
  signInWithEmail,
  signInWithProvider,
  updatePassword,
  type Session,
} from '../auth';
import { getSupabase } from '../client';

jest.mock('../client', () => ({
  isApiConfigured: () => true,
  getSupabase: jest.fn(),
  readStoredSession: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `gradetracker://${path}` }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'raw-nonce',
  digestStringAsync: async () => 'hashed-nonce',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

/** A mock that accepts any arguments, so calls can be checked. */
const spy = (impl: (...args: unknown[]) => Promise<unknown>) => jest.fn(impl);

const session = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;
const client = (auth: object) => (getSupabase as unknown as jest.Mock).mockReturnValue({ auth });
const appleSheet = AppleAuthentication.signInAsync as unknown as jest.Mock<(options?: unknown) => Promise<unknown>>;
const browser = WebBrowser.openAuthSessionAsync as unknown as jest.Mock<(url: string, redirect: string) => Promise<unknown>>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('signInWithEmail', () => {
  it('returns the session', async () => {
    const signInWithPassword = spy(async () => ({ data: { session }, error: null }));
    client({ signInWithPassword });
    await expect(signInWithEmail('ana@example.com', 'secret12')).resolves.toBe(session);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secret12' });
  });

  it.each([
    [{ name: 'AuthApiError', message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }, 'invalid_input', 'invalid_credentials'],
    [{ name: 'AuthApiError', message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' }, 'invalid_input', 'email_not_confirmed'],
    [{ name: 'AuthApiError', message: 'Too many requests', status: 429 }, 'server', 'over_request_rate_limit'],
    [{ name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 }, 'network', null],
    [{ name: 'AuthApiError', message: 'Database error', status: 500, code: 'unexpected_failure' }, 'server', 'unexpected_failure'],
  ])('turns %p into a %s error', async (error, kind, code) => {
    client({ signInWithPassword: async () => ({ data: { session: null }, error }) });
    await expect(signInWithEmail('ana@example.com', 'x')).rejects.toMatchObject({ kind, code });
  });
});

describe('resendConfirmation', () => {
  it('sends the link back to the app', async () => {
    const resend = spy(async () => ({ error: null }));
    client({ resend });
    await resendConfirmation('ana@example.com');
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'ana@example.com',
      options: { emailRedirectTo: 'gradetracker://auth/callback' },
    });
  });

  it('reports a rate limit', async () => {
    client({ resend: async () => ({ error: { name: 'AuthApiError', message: 'slow down', status: 429 } }) });
    await expect(resendConfirmation('ana@example.com')).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('signInWithProvider (Google)', () => {
  const oauth = (exchange = spy(async () => ({ data: { session }, error: null }))) => {
    const signInWithOAuth = spy(async () => ({ data: { url: 'https://accounts.example/auth' }, error: null }));
    client({ signInWithOAuth, exchangeCodeForSession: exchange });
    return { signInWithOAuth, exchange };
  };

  it('opens the browser and trades the code for a session', async () => {
    const { signInWithOAuth, exchange } = oauth();
    browser.mockResolvedValue({ type: 'success', url: 'gradetracker://auth/callback?code=abc' });
    await expect(signInWithProvider('google')).resolves.toBe(session);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'gradetracker://auth/callback', skipBrowserRedirect: true },
    });
    expect(browser).toHaveBeenCalledWith('https://accounts.example/auth', 'gradetracker://auth/callback');
    expect(exchange).toHaveBeenCalledWith('abc');
  });

  it('is nothing when the student closes the browser', async () => {
    const { exchange } = oauth();
    browser.mockResolvedValue({ type: 'cancel' });
    await expect(signInWithProvider('google')).resolves.toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('shows the error the provider sent back', async () => {
    oauth();
    browser.mockResolvedValue({
      type: 'success',
      url: 'gradetracker://auth/callback#error=access_denied&error_description=The+user+denied+access',
    });
    await expect(signInWithProvider('google')).rejects.toMatchObject({
      kind: 'invalid_input',
      message: 'The user denied access',
    });
  });

  it('reports a failed code exchange', async () => {
    oauth(spy(async () => ({ data: { session: null }, error: { name: 'AuthApiError', message: 'bad code', status: 400 } })));
    browser.mockResolvedValue({ type: 'success', url: 'gradetracker://auth/callback?code=old' });
    await expect(signInWithProvider('google')).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('does not open the browser when Supabase refuses to start', async () => {
    client({ signInWithOAuth: async () => ({ data: { url: null }, error: { name: 'AuthApiError', message: 'Provider is not enabled', status: 400 } }) });
    await expect(signInWithProvider('google')).rejects.toMatchObject({ kind: 'invalid_input' });
    expect(browser).not.toHaveBeenCalled();
  });
});

describe('signInWithApple', () => {
  it('sends the hashed nonce to Apple and the raw one to Supabase', async () => {
    appleSheet.mockResolvedValue({ identityToken: 'id-token', fullName: null });
    const signInWithIdToken = spy(async () => ({ data: { session, user: { id: 'u1' } }, error: null }));
    client({ signInWithIdToken });
    await expect(signInWithApple()).resolves.toBe(session);
    expect(appleSheet).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'hashed-nonce' }));
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'id-token', nonce: 'raw-nonce' });
  });

  it('is nothing when the student cancels the sheet', async () => {
    appleSheet.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    client({});
    await expect(signInWithApple()).resolves.toBeNull();
  });

  it('passes other sheet errors on', async () => {
    appleSheet.mockRejectedValue(Object.assign(new Error('not available'), { code: 'ERR_UNAVAILABLE' }));
    client({});
    await expect(signInWithApple()).rejects.toThrow('not available');
  });

  it('explains a missing token', async () => {
    appleSheet.mockResolvedValue({ identityToken: null });
    client({});
    await expect(signInWithApple()).rejects.toMatchObject({ kind: 'server' });
  });

  it('reports a token Supabase refuses (for example another bundle ID)', async () => {
    appleSheet.mockResolvedValue({ identityToken: 'id-token' });
    client({
      signInWithIdToken: async () => ({
        data: { session: null, user: null },
        error: { name: 'AuthApiError', message: 'Unacceptable audience in id_token', status: 400 },
      }),
    });
    await expect(signInWithApple()).rejects.toMatchObject({ kind: 'invalid_input' });
  });
});

describe('password reset', () => {
  it('sends a link that opens the app', async () => {
    const resetPasswordForEmail = spy(async () => ({ error: null }));
    client({ resetPasswordForEmail });
    await requestPasswordReset('ana@example.com');
    expect(resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', {
      redirectTo: 'gradetracker://auth/callback',
    });
  });

  it('reports a weak new password', async () => {
    client({
      updateUser: async () => ({
        error: { name: 'AuthWeakPasswordError', message: 'Password should be at least 8 characters', status: 422, code: 'weak_password' },
      }),
    });
    await expect(updatePassword('short')).rejects.toMatchObject({ kind: 'invalid_input', code: 'weak_password' });
  });

  it('saves a new password', async () => {
    const updateUser = spy(async () => ({ error: null }));
    client({ updateUser });
    await updatePassword('a-long-password');
    expect(updateUser).toHaveBeenCalledWith({ password: 'a-long-password' });
  });
});
