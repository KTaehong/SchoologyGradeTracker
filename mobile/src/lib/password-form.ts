/** The shortest password Supabase accepts for this project. */
export const MIN_PASSWORD_LENGTH = 6;

/** What is wrong with a new password typed twice, or `null` when it can be saved. */
export function checkNewPassword(password: string, again: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== again) {
    return 'The two passwords do not match.';
  }
  return null;
}

/** The parts of a signed-in user that say how they sign in. */
type SignInMethods = { app_metadata?: { provider?: string; providers?: string[] } };

/**
 * Whether the account signs in with an email and password. Google and Apple
 * accounts have no password here, so "Change password" is hidden for them.
 */
export function hasPassword(user: SignInMethods): boolean {
  const meta = user.app_metadata ?? {};
  return meta.provider === 'email' || (meta.providers ?? []).includes('email');
}
