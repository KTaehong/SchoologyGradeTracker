import { describe, expect, it } from '@jest/globals';

import { showsAppleButton, signInProviders } from '../sign-in-providers';

describe('signInProviders', () => {
  it('offers Google and Microsoft in the browser', () => {
    expect(signInProviders().map((p) => p.provider)).toEqual(['google', 'azure']);
  });
});

describe('showsAppleButton', () => {
  it('shows the Apple button on iPhone only', () => {
    expect(showsAppleButton('ios')).toBe(true);
    expect(showsAppleButton('android')).toBe(false);
    expect(showsAppleButton('web')).toBe(false);
  });
});
