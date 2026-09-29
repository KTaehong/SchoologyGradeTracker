/**
 * Where the cloud API lives. Set these in `mobile/.env.local` (see mobile/README.md):
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
 *
 * The anon key is safe to ship in the app: row-level security decides what each
 * signed-in student can see. Never put the service_role key here.
 */
export type ApiConfig = { url: string; anonKey: string };

type ApiEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

// Expo only inlines `process.env.EXPO_PUBLIC_*` when each is written out in full.
const BUILD_ENV: ApiEnv = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

/** The API settings, or `null` when they are missing (the app then stays offline-only). */
export function readApiConfig(env: ApiEnv = BUILD_ENV): ApiConfig | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}
