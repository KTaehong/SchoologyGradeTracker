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

/**
 * Whether `typed` looks like an email address someone can receive mail at:
 * a name, an @, and a domain with a dot and an ending of two or more letters.
 */
export function isValidEmail(typed: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(typed.trim());
}

/** The longest name a profile can hold (see supabase/migrations/*accounts.sql). */
export const MAX_NAME_LENGTH = 100;

/**
 * What is wrong with an optional new username, or `null` when it is fine (or
 * empty). The server would quietly swap a bad one for a made-up name.
 */
export function checkUsername(typed: string): string | null {
  const name = typed.trim().toLowerCase();
  if (name === '' || /^[a-z0-9_.]{3,30}$/.test(name)) {
    return null;
  }
  return 'A username is 3 to 30 letters, numbers, _ or . with no spaces. You can also leave it empty.';
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

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong username or password.',
  email_not_confirmed:
    'This account is not confirmed yet. Tap the link in the email we sent, or send the email again below.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  email_address_invalid:
    'That email address cannot be used. Use an address you can open on this phone, such as your school or Gmail address.',
  validation_failed: 'Enter a real email address, such as name@gmail.com.',
  email_address_not_authorized:
    'The app cannot send email to that address yet. Ask the app owner to set up email sending, or sign in with Google.',
  over_email_send_rate_limit:
    'Too many emails were sent in the last hour. Wait a while and try again, or sign in with Google.',
  over_request_rate_limit: 'Too many tries. Wait a minute and try again.',
  weak_password: 'Choose a stronger password: longer, and not a common word.',
  signup_disabled: 'New accounts cannot be made right now.',
};

/** A sign-in or sign-up failure in plain words. */
export function signInErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code && AUTH_MESSAGES[error.code]) {
    return AUTH_MESSAGES[error.code];
  }
  return errorMessage(error);
}

/** Whether the failure means the email was never confirmed (so "send again" helps). */
export function needsConfirmation(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'email_not_confirmed';
}
