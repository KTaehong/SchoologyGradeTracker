import { describe, expect, it } from '@jest/globals';

import { checkNewPassword, hasPassword } from '../password-form';

describe('checkNewPassword', () => {
  it('accepts a long enough password typed the same twice', () => {
    expect(checkNewPassword('secret1', 'secret1')).toBeNull();
  });

  it('refuses a short password before comparing', () => {
    expect(checkNewPassword('abc', 'abc')).toMatch(/at least 6/);
    expect(checkNewPassword('', '')).toMatch(/at least 6/);
  });

  it('refuses two different passwords', () => {
    expect(checkNewPassword('secret1', 'secret2')).toMatch(/do not match/);
  });
});

describe('hasPassword', () => {
  it('is true for email accounts, including ones that also linked Google', () => {
    expect(hasPassword({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(true);
    expect(hasPassword({ app_metadata: { provider: 'google', providers: ['google', 'email'] } })).toBe(
      true,
    );
  });

  it('is false for Google-only and Apple-only accounts', () => {
    expect(hasPassword({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(false);
    expect(hasPassword({ app_metadata: { provider: 'apple' } })).toBe(false);
    expect(hasPassword({})).toBe(false);
  });
});
