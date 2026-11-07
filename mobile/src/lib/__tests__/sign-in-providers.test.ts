import { describe, expect, it } from '@jest/globals';

import { showsAppleButton, signInProviders } from '../sign-in-providers';

describe('signInProviders', () => {
  it('offers only providers that are turned on (Google)', () => {
    expect(signInProviders().map((p) => p.provider)).toEqual(['google']);
  });
});

describe('showsAppleButton', () => {
  it('shows the Apple button on iPhone only', () => {
    expect(showsAppleButton('ios')).toBe(true);
    expect(showsAppleButton('android')).toBe(false);
    expect(showsAppleButton('web')).toBe(false);
  });
});
