/**
 * Makes sure only Supabase's *public* key ends up in the app. The publishable
 * (or older "anon") key is meant to be inside every copy of the app; row-level
 * security protects the data. The secret (service_role) key skips all of that.
 *
 * Returns a message when `key` is a secret key, otherwise null.
 */
function checkPublicKey(key) {
  if (key.startsWith('sb_secret_')) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY is a SECRET key (sb_secret_…). Use the publishable key (sb_publishable_…) and replace the secret key in Supabase.';
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const { role } = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (role && role !== 'anon') {
        return `EXPO_PUBLIC_SUPABASE_ANON_KEY is a "${role}" key. Only the publishable (or anon) key may go in the app; replace this one in Supabase.`;
      }
    } catch {
      // Not a JWT.
    }
  }
  return null;
}

module.exports = { checkPublicKey };
