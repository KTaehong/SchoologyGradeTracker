import type { OAuthProvider } from '@/api/auth';

export type ProviderButton = { provider: OAuthProvider; label: string };

/**
 * The "Continue with …" buttons for this phone. Apple is shown on iPhone only,
 * where it uses Apple's native sheet; on Android it would need an Apple
 * Services ID and web sign-in, which the MVP leaves out.
 */
export function signInProviders(os: string): ProviderButton[] {
  const providers: ProviderButton[] = [
    { provider: 'google', label: 'Continue with Google' },
    { provider: 'azure', label: 'Continue with Microsoft' },
  ];
  return os === 'ios' ? [{ provider: 'apple', label: 'Continue with Apple' }, ...providers] : providers;
}
