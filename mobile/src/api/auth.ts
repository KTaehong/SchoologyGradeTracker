/**
 * Sign-in (F14). Supabase Auth owns passwords and tokens;
 * the session it returns is saved in secure storage by the client in ./client.ts
 * and sent with every API call automatically.
 */
import type { AuthError, Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase, isApiConfigured, readStoredSession } from './client';
import { ApiError } from './errors';
import { parseOAuthCallback } from './oauth-callback';

export type { Session };

function toAuthApiError(error: AuthError): ApiError {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return new ApiError('network', error.message, error.code ?? null);
  }
  if (error.status === 429) {
    return new ApiError('server', error.message, error.code ?? 'over_request_rate_limit');
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
 * student to confirm their email before the first sign-in. An email that
 * already has an account gets the same answer (and no email), so this never
 * reveals who has one.
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
    options: {
      data: { full_name: fullName, username },
      // The confirmation link opens the app, which finishes the sign-in (auth/callback).
      emailRedirectTo: oauthRedirectUrl(),
    },
  });
  if (error) {
    throw toAuthApiError(error);
  }
  return data.session;
}

/** Sends the "confirm your account" email again. */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: oauthRedirectUrl() },
  });
  if (error) {
    throw toAuthApiError(error);
  }
}

let browserSignInActive = false;

/** Browser sign-in providers that are turned on in Supabase, by their Supabase names. */
export type OAuthProvider = 'google';

/** Where the provider sends the student back: `gradetracker://auth/callback` in a build. */
export function oauthRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/**
 * Signs in with Google in a secure in-app browser. (Apple: see signInWithApple.)
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
    },
  });
  if (error) {
    throw toAuthApiError(error);
  }

  // On Android the redirect also opens the auth/callback screen; this tells it
  // the code belongs to this function, so the code is not used twice.
  browserSignInActive = true;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  } finally {
    browserSignInActive = false;
  }
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

/**
 * Signs in with Apple's own sheet on iPhone (no browser). Apple signs an ID
 * token for the app's bundle ID; Supabase checks it, so the bundle ID must be in
 * Authentication → Sign In / Providers → Apple → Client IDs.
 * Resolves to `null` if the student cancels.
 */
export async function signInWithApple(): Promise<Session | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    throw e;
  }
  if (!credential.identityToken) {
    throw new ApiError('server', 'Apple did not return a sign-in token. Please try again.');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) {
    throw toAuthApiError(error);
  }

  // Apple shares the name only on the first sign-in, and not in the token, so
  // the new profile starts as "Student". Save the real name while we have it.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);
  if (fullName) {
    await saveFullName(data.user.id, fullName);
  }
  return data.session;
}

/** Saves the name Apple shares only once, trying again if the first try fails. */
async function saveFullName(userId: string, fullName: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { error } = await getSupabase().from('profiles').update({ full_name: fullName }).eq('id', userId);
    if (!error) return;
    if (attempt === 3) {
      // Not worth failing the sign-in: the profile keeps the name "Student".
      console.warn(`Could not save the name from Sign in with Apple: ${error.message}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

/**
 * Emails a link to choose a new password. The link opens the app on the
 * auth/callback screen, which signs the student in and shows the new-password
 * screen. Supabase answers the same way whether or not the email has an
 * account, so this never reveals who has one.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: oauthRedirectUrl(),
  });
  if (error) {
    throw toAuthApiError(error);
  }
}

/** Sets a new password for the signed-in student. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) {
    throw toAuthApiError(error);
  }
}

/** What opening an emailed link did. `ignored`: the link was not for this screen. */
export type AuthLinkResult = 'ignored' | 'signed_in' | 'recovery';

const LINK_FAILED =
  'This link has expired or was opened on a different phone. Open it on the phone where you asked for it, or ask for a new one.';

const openedLinks = new Map<string, Promise<AuthLinkResult>>();

/**
 * Finishes a link from an email (confirm your account, or reset your password)
 * that opened the app at `auth/callback?code=…`. The one-time code only works
 * on the phone that asked for the email, because the matching secret is saved
 * there. Asking twice about the same code gives the same answer.
 */
export function finishAuthLink(params: {
  code?: string;
  error?: string;
  error_description?: string;
}): Promise<AuthLinkResult> {
  if (browserSignInActive || !isApiConfigured()) {
    return Promise.resolve('ignored');
  }
  const failure = params.error_description || params.error;
  if (failure) {
    return Promise.reject(new ApiError('invalid_input', LINK_FAILED));
  }
  const code = params.code;
  if (!code) {
    return Promise.resolve('ignored');
  }
  let opened = openedLinks.get(code);
  if (!opened) {
    opened = exchangeLinkCode(code);
    openedLinks.set(code, opened);
  }
  return opened;
}

async function exchangeLinkCode(code: string): Promise<AuthLinkResult> {
  let recovery = false;
  const { data: listener } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovery = true;
    }
  });
  try {
    const { data, error } = await getSupabase().auth.exchangeCodeForSession(code);
    if (error) {
      if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
        throw toAuthApiError(error);
      }
      throw new ApiError('invalid_input', LINK_FAILED, error.code ?? null);
    }
    const redirectType = (data as { redirectType?: string | null }).redirectType;
    return recovery || redirectType === 'recovery' ? 'recovery' : 'signed_in';
  } finally {
    listener.subscription.unsubscribe();
  }
}

/**
 * Signs out and deletes the saved session from secure storage. When the server
 * cannot be reached (or refuses), the session is still removed from this phone;
 * it then ends on the server when its tokens expire or are replaced.
 * `local` signs out only this phone; `global` ends the account's other sessions too.
 */
export async function signOut(scope: 'global' | 'local' = 'global'): Promise<void> {
  if (!isApiConfigured()) {
    return;
  }
  const { error } = await getSupabase().auth.signOut({ scope });
  if (!error) {
    return;
  }
  await getSupabase().auth.signOut({ scope: 'local' });
  if (await readStoredSession()) {
    throw toAuthApiError(error);
  }
}

/**
 * Who is signed in on this phone, or `null`. Works with no internet, also when
 * the access token has expired: supabase-js refreshes it once it can, and
 * `onSessionChange` reports it if the server ends the session.
 */
export async function getSession(): Promise<Session | null> {
  if (!isApiConfigured()) {
    return null;
  }
  getSupabase(); // starts supabase-js, which refreshes the session
  return readStoredSession();
}

/**
 * Calls `listener` whenever the student signs in, signs out, or the token
 * refreshes. With no internet, supabase-js first reports "no session" for an
 * expired one it could not refresh; the saved one still counts.
 */
export function onSessionChange(listener: (session: Session | null) => void): () => void {
  if (!isApiConfigured()) {
    return () => undefined;
  }
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' && !session) {
      readStoredSession().then(listener, () => listener(null));
    } else {
      listener(session);
    }
  });
  return () => data.subscription.unsubscribe();
}
