import type { OAuthProvider } from '@/api/auth';

export type ProviderButton = { provider: OAuthProvider; label: string };

/**
 * The "Continue with …" buttons for this phone. Apple is shown on iPhone only:
 * on Android it needs an Apple Services ID from a paid Apple Developer
 * account, which this project has deferred.
 */
export function signInProviders(os: string): ProviderButton[] {
  const providers: ProviderButton[] = [
    { provider: 'google', label: 'Continue with Google' },
    { provider: 'azure', label: 'Continue with Microsoft' },
  ];
  return os === 'ios' ? [{ provider: 'apple', label: 'Continue with Apple' }, ...providers] : providers;
}
