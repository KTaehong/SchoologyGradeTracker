import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { readApiConfig } from './config';
import { ApiError } from './errors';
import { createWebSessionStorage, signOutOnResume, startSignedOut } from './launch-session-storage';
import { createSecureSessionStorage } from './secure-session-storage';

let client: SupabaseClient | null = null;

/** Whether the cloud API settings are present in this build. */
export function isApiConfigured(): boolean {
  return readApiConfig() !== null;
}

/**
 * The one Supabase client for the whole app.
 *
 * After sign-in, supabase-js keeps the session in secure storage until the app
 * is closed, refreshes the access token before it expires, and sends it as
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
      // Every launch starts signed out (see startSignedOut). The web build has
      // no Keychain, so it uses localStorage.
      storage: startSignedOut(
        Platform.OS === 'web' ? createWebSessionStorage() : createSecureSessionStorage(SecureStore),
      ),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // Google / Apple / Microsoft sign-in returns a one-time code to the app,
      // which is swapped for a session (see signInWithProvider in auth.ts).
      flowType: 'pkce',
    },
  });

  // Refresh tokens only while the app is on screen, as Supabase recommends for
  // mobile. Coming back after a long time away counts as a new launch: the
  // session is dropped from this phone (the account and its grades are kept).
  if (Platform.OS !== 'web') {
    let backgroundSince: number | null = null;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const away = backgroundSince;
        backgroundSince = null;
        if (signOutOnResume(away, Date.now())) {
          created.auth.signOut({ scope: 'local' }).catch(() => undefined);
          return;
        }
        created.auth.startAutoRefresh();
      } else {
        if (state === 'background' && backgroundSince === null) backgroundSince = Date.now();
        created.auth.stopAutoRefresh();
      }
    });
  }

  client = created;
  return created;
}
