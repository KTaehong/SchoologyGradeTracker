import { describe, expect, it } from '@jest/globals';

import { appleDisplayName } from '../apple-name';

describe('appleDisplayName', () => {
  it('joins the given, middle and family names', () => {
    expect(appleDisplayName({ givenName: 'Taehong', middleName: null, familyName: 'Kim' })).toBe(
      'Taehong Kim',
    );
  });

  it('is null when Apple sends no name (every sign-in after the first)', () => {
    expect(appleDisplayName(null)).toBeNull();
    expect(appleDisplayName({ givenName: null, familyName: null })).toBeNull();
    expect(appleDisplayName({ givenName: '  ', familyName: '' })).toBeNull();
  });

  it('falls back to the nickname', () => {
    expect(appleDisplayName({ givenName: null, nickname: 'TK' })).toBe('TK');
  });

  it('fits the profile limit of 100 characters', () => {
    expect(appleDisplayName({ givenName: 'a'.repeat(120) })).toHaveLength(100);
  });
});
