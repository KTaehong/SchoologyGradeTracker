/**
 * Reads the link Supabase sends back after Google / Apple / Microsoft sign-in,
 * for example `gradetracker://auth/callback?code=…`.
 *
 * With the PKCE flow the link carries a one-time `code`; on failure it carries
 * `error` / `error_description`, in the query or after `#`.
 */
export type OAuthCallback = { kind: 'code'; code: string } | { kind: 'error'; message: string };

export function parseOAuthCallback(url: string): OAuthCallback {
  const params = new Map<string, string>();
  const [beforeHash, hash = ''] = url.split('#', 2);
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=', 2);
      params.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' ')));
    }
  }

  const error = params.get('error_description') || params.get('error');
  if (error) {
    return { kind: 'error', message: error };
  }
  const code = params.get('code');
  if (code) {
    return { kind: 'code', code };
  }
  return { kind: 'error', message: 'Sign-in did not finish. Please try again.' };
}
