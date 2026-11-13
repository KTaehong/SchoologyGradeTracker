import { ApiError, errorMessage } from '@/api/errors';

/**
 * Demo accounts sign in with a username. Supabase only knows email addresses,
 * so a demo account's email is `<username>@demo.example.com` (a domain that
 * can never receive mail); see supabase/demo_accounts.sql.
 */
export const DEMO_EMAIL_DOMAIN = 'demo.example.com';

/** The email to sign in with, from what was typed in "Username or email". */
export function toSignInEmail(typed: string): string {
  const name = typed.trim();
  if (name === '' || name.includes('@')) {
    return name;
  }
  return `${name.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`;
}

/** Whether what was typed is a username (no email address to send a reset link to). */
export function isUsername(typed: string): boolean {
  const name = typed.trim();
  return name !== '' && !name.includes('@');
}

type AccountUser = { email?: string | null; phone?: string | null };

/** How Settings names the signed-in account: the username for a demo account, else the email. */
export function accountLabel(user: AccountUser): string {
  const email = user.email ?? '';
  const suffix = `@${DEMO_EMAIL_DOMAIN}`;
  if (email.endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }
  return email || user.phone || 'Account';
}

/** A sign-in failure in plain words. */
export function signInErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'invalid_credentials') {
      return 'Wrong username or password.';
    }
    if (error.code === 'email_not_confirmed') {
      return 'Confirm your email first: tap the link we sent you, on this phone.';
    }
  }
  return errorMessage(error);
}
