import type { OAuthProvider } from '@/api/auth';

export type ProviderButton = { provider: OAuthProvider; label: string };

/**
 * The "Continue with …" buttons that open the provider in a browser. Only
 * providers turned on in Supabase belong here: a button for one that is off
 * fails every time. Microsoft ('azure') needs an Azure directory first; add
 * `{ provider: 'azure', label: 'Continue with Microsoft' }` once it is set up.
 */
export function signInProviders(): ProviderButton[] {
  return [{ provider: 'google', label: 'Continue with Google' }];
}

/**
 * Apple's own "Sign in with Apple" button is shown on iPhone only, above the
 * others (Apple's App Review rule). On Android it would need an Apple Services
 * ID and a web flow, which this project has not set up.
 */
export function showsAppleButton(os: string): boolean {
  return os === 'ios';
}
