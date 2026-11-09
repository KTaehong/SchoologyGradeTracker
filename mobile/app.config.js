/**
 * Adds build-time checks on top of app.json.
 *
 * The app reads the Supabase URL and publishable key from EXPO_PUBLIC_* values
 * that are baked in when the app is built. `.env.local` is never uploaded to
 * EAS, so a cloud build that has not been given them (see
 * `npm run eas:env`) used to come out with sign-in and sync switched off
 * ("Cloud sync is not set up in this version of the app"). Now such a build
 * stops with a clear message instead of shipping.
 */
const { checkPublicKey } = require('./scripts/supabase-key-check');

module.exports = ({ config }) => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (key) {
    const problem = checkPublicKey(key);
    if (problem) {
      throw new Error(problem);
    }
  }
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
    throw new Error(`EXPO_PUBLIC_SUPABASE_URL should look like https://<project>.supabase.co, not ${url}`);
  }

  if (process.env.EAS_BUILD === 'true' && (!url || !key)) {
    throw new Error(
      `This EAS build (${process.env.EAS_BUILD_PROFILE ?? 'unknown profile'}) has no Supabase settings, ` +
        'so sign-in and sync would be off. Run `npm run eas:env` in mobile/ once, then build again.',
    );
  }
  return config;
};
