/** The parts of Apple's `AppleAuthenticationFullName` the app uses. */
export type AppleFullName = {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
};

/**
 * The student's name from Sign in with Apple, or `null` when Apple sent none.
 * Apple shares the name only the first time a student signs in to the app, and
 * its ID token never carries it, so the app saves it to the profile itself.
 */
export function appleDisplayName(name: AppleFullName | null | undefined): string | null {
  if (!name) {
    return null;
  }
  const parts = [name.givenName, name.middleName, name.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  const full = parts.length > 0 ? parts.join(' ') : name.nickname?.trim();
  return full ? full.slice(0, 100) : null;
}
