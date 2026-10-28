import type { OAuthProvider } from '@/api/auth';

export type ProviderButton = { provider: OAuthProvider; label: string };

/** The "Continue with …" buttons that open the provider in a browser. */
export function signInProviders(): ProviderButton[] {
  return [
    { provider: 'google', label: 'Continue with Google' },
    { provider: 'azure', label: 'Continue with Microsoft' },
  ];
}

/**
 * Apple's own "Sign in with Apple" button is shown on iPhone only, above the
 * others (Apple's App Review rule). On Android it would need an Apple Services
 * ID and a web flow, which this project has not set up.
 */
export function showsAppleButton(os: string): boolean {
  return os === 'ios';
}
