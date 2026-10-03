import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { readApiConfig } from './config';
import { ApiError } from './errors';
import { createSecureSessionStorage } from './secure-session-storage';

let client: SupabaseClient | null = null;

/** Whether the cloud API settings are present in this build. */
export function isApiConfigured(): boolean {
  return readApiConfig() !== null;
}

/**
 * The one Supabase client for the whole app.
 *
 * After sign-in, supabase-js keeps the session in secure storage, refreshes the
 * access token before it expires, and sends it as `Authorization: Bearer …` on
 * every request. So API code never handles tokens: it only calls
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
      // The web build has no Keychain; supabase-js falls back to localStorage there.
      storage: Platform.OS === 'web' ? undefined : createSecureSessionStorage(SecureStore),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // Google / Apple / Microsoft sign-in returns a one-time code to the app,
      // which is swapped for a session (see signInWithProvider in auth.ts).
      flowType: 'pkce',
    },
  });

  // Refresh tokens only while the app is on screen, as Supabase recommends for mobile.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        created.auth.startAutoRefresh();
      } else {
        created.auth.stopAutoRefresh();
      }
    });
  }

  client = created;
  return created;
}
