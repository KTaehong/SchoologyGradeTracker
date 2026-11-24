import 'react-native-url-polyfill/auto';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { readApiConfig } from './config';
import { ApiError } from './errors';
import { createSecureSessionStorage, type SessionStorage } from './secure-session-storage';
import { parseStoredSession, sessionStorageKey } from './stored-session';
import { createWebSessionStorage } from './web-session-storage';

let client: SupabaseClient | null = null;
let storage: SessionStorage | null = null;

/** The Keychain / Keystore on phones. The web build has neither, so it uses localStorage. */
function getSessionStorage(): SessionStorage {
  storage ??= Platform.OS === 'web' ? createWebSessionStorage() : createSecureSessionStorage(SecureStore);
  return storage;
}

/** Whether the cloud API settings are present in this build. */
export function isApiConfigured(): boolean {
  return readApiConfig() !== null;
}

/**
 * The one Supabase client for the whole app.
 *
 * After sign-in, supabase-js keeps the session in secure storage until the
 * student signs out, refreshes the access token before it expires, and sends it as
 * `Authorization: Bearer …` on every request. So API code never handles tokens: it only calls
 * `getSupabase().rpc(...)` or `.from(...)`.
 */
export function getSupabase(): SupabaseClient {
  if (client) {
    return client;
  }
  const config = readApiConfig();
  if (!config) {
    throw new ApiError(
      'not_configured',
      'Cloud sync is not set up: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing.',
    );
  }

  const created = createClient(config.url, config.anonKey, {
    auth: {
      storage: getSessionStorage(),
      storageKey: sessionStorageKey(config.url),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // Google sign-in returns a one-time code to the app,
      // which is swapped for a session (see signInWithProvider in auth.ts).
      flowType: 'pkce',
    },
  });

  // Refresh tokens only while the app is on screen, as Supabase recommends for mobile.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') created.auth.startAutoRefresh();
      else created.auth.stopAutoRefresh();
    });
  }

  client = created;
  return created;
}

/**
 * The session saved on this phone, read without the network. Its access token
 * may have expired: use this to know who is signed in (so the app opens with
 * no internet), never to call the server.
 */
export async function readStoredSession(): Promise<Session | null> {
  const config = readApiConfig();
  if (!config) {
    return null;
  }
  return parseStoredSession(await getSessionStorage().getItem(sessionStorageKey(config.url)));
}
