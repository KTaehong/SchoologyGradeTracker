/**
 * Rules for a new password (sign-up, reset, change). Supabase checks its own
 * minimum too; this gives a clear message before the request is sent.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt, which Supabase uses, ignores anything longer

/** A message saying what is wrong with `password`, or `null` when it is fine. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use a password with at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Use at least one letter and one number in your password.';
  }
  if (password.trim() !== password) {
    return 'A password cannot start or end with a space.';
  }
  if (confirm !== undefined && confirm !== password) {
    return 'The two passwords do not match.';
  }
  return null;
}

/** A light check that an email address looks complete before it is sent. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
