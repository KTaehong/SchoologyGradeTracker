/**
 * Apple's native sign-in sheet (iPhone only). It returns an ID token that
 * Supabase verifies directly (see `signInWithProvider` in ./auth.ts), so there
 * is no browser round trip and no Apple Services ID or signing key to manage.
 * Setup: docs/database/README.md → Apple.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { appleDisplayName } from '@/lib/apple-name';

import { ApiError } from './errors';

export type AppleCredential = {
  identityToken: string;
  /** Sent to Supabase; Apple got its SHA-256, so a stolen token can't be replayed. */
  rawNonce: string;
  /** Only on the student's first Apple sign-in to this app. */
  fullName: string | null;
};

/** Shows Apple's sheet. Resolves to `null` if the student cancels. */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    throw new ApiError('server', (error as Error).message || 'Sign in with Apple failed.');
  }
  if (!credential.identityToken) {
    throw new ApiError('server', 'Apple did not return a sign-in token.');
  }
  return {
    identityToken: credential.identityToken,
    rawNonce,
    fullName: appleDisplayName(credential.fullName),
  };
}
