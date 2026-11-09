/**
 * Makes sure only Supabase's *public* key ends up in the app. The publishable
 * (or legacy "anon") key is meant to be inside every copy of the app;
 * row-level security protects the data. The secret (service_role) key skips
 * all of that and must never be shipped.
 *
 * Returns a message when `key` is unsafe or malformed, otherwise null.
 */
function checkPublicKey(key) {
  if (key.startsWith('sb_secret_')) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY is a SECRET key (sb_secret_…). Use the publishable key (sb_publishable_…) instead, and rotate the secret key in Supabase.';
  }
  if (key.startsWith('sb_publishable_')) {
    return null;
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.role === 'anon') {
        return null;
      }
      if (payload.role) {
        return `EXPO_PUBLIC_SUPABASE_ANON_KEY is a "${payload.role}" key. Only the anon / publishable key may go in the app; rotate this one in Supabase.`;
      }
    } catch {
      // fall through
    }
  }
  return 'EXPO_PUBLIC_SUPABASE_ANON_KEY does not look like a Supabase publishable key (sb_publishable_…) or anon key.';
}

module.exports = { checkPublicKey };
