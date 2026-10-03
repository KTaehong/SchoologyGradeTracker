/**
 * Sign-in for opt-in cloud sync (F14). Supabase Auth owns passwords and tokens;
 * the session it returns is saved in secure storage by the client in ./client.ts
 * and sent with every API call automatically.
 */
import type { AuthError, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase, isApiConfigured } from './client';
import { ApiError } from './errors';
import { parseOAuthCallback } from './oauth-callback';

export type { Session };

function toAuthApiError(error: AuthError): ApiError {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return new ApiError('network', error.message, error.code ?? null);
  }
  if (error.status === 400 || error.status === 422) {
    return new ApiError('invalid_input', error.message, error.code ?? null);
  }
  return new ApiError('server', error.message, error.code ?? null);
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) {
    throw toAuthApiError(error);
  }
  return data.session;
}

export type SignUp = {
  email: string;
  password: string;
  fullName: string;
  /** 3–30 lowercase letters, digits, `_` or `.`; a generated one is used if taken. */
  username?: string;
};

/**
 * Creates the account. The database trigger makes the profile from
 * `full_name` / `username`. Resolves to `null` when the project requires the
 * student to confirm their email before the first sign-in.
 */
export async function signUpWithEmail({
  email,
  password,
  fullName,
  username,
}: SignUp): Promise<Session | null> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, username } },
  });
  if (error) {
    throw toAuthApiError(error);
  }
  return data.session;
}

/** Sign-in providers, by their Supabase names ('azure' is Microsoft). */
export type OAuthProvider = 'google' | 'apple' | 'azure';

/** Where the provider sends the student back: `gradetracker://auth/callback` in a build. */
export function oauthRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/**
 * Signs in with Google, Apple, or Microsoft in a secure in-app browser.
 * Resolves to `null` if the student closes the browser without finishing.
 *
 * Each provider must be turned on in Supabase (Authentication → Sign In /
 * Providers), and `oauthRedirectUrl()` must be in Authentication → URL
 * Configuration → Redirect URLs. See docs/database/README.md.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<Session | null> {
  const supabase = getSupabase();
  const redirectTo = oauthRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Microsoft only shares the email address when asked for it.
      scopes: provider === 'azure' ? 'email' : undefined,
    },
  });
  if (error) {
    throw toAuthApiError(error);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return null;
  }

  const callback = parseOAuthCallback(result.url);
  if (callback.kind === 'error') {
    throw new ApiError('invalid_input', callback.message);
  }
  const exchanged = await supabase.auth.exchangeCodeForSession(callback.code);
  if (exchanged.error) {
    throw toAuthApiError(exchanged.error);
  }
  return exchanged.data.session;
}

/** Signs out and deletes the saved session from secure storage. */
export async function signOut(): Promise<void> {
  if (!isApiConfigured()) {
    return;
  }
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    throw toAuthApiError(error);
  }
}

/** The saved session (refreshed if it had expired), or `null` when signed out. */
export async function getSession(): Promise<Session | null> {
  if (!isApiConfigured()) {
    return null;
  }
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

/** Calls `listener` whenever the student signs in, signs out, or the token refreshes. */
export function onSessionChange(listener: (session: Session | null) => void): () => void {
  if (!isApiConfigured()) {
    return () => undefined;
  }
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}
