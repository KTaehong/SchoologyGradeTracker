import { describe, expect, it } from '@jest/globals';

import { signInProviders } from '../sign-in-providers';

describe('signInProviders', () => {
  it('offers Google and Microsoft on Android', () => {
    expect(signInProviders('android').map((p) => p.provider)).toEqual(['google', 'azure']);
  });

  it('adds Apple first on iPhone', () => {
    expect(signInProviders('ios').map((p) => p.provider)).toEqual(['apple', 'google', 'azure']);
  });
});
