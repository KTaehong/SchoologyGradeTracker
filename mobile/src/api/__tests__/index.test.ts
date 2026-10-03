import { describe, expect, it } from '@jest/globals';

import { gradesApi, getSession, isApiConfigured, signOut } from '..';

// Tests run without EXPO_PUBLIC_SUPABASE_*, like a build with cloud sync not set up.
describe('the API without configuration', () => {
  it('reports that it is not configured', () => {
    expect(isApiConfigured()).toBe(false);
  });

  it('is signed out, and signing out is harmless', async () => {
    await expect(getSession()).resolves.toBeNull();
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('rejects grade calls with not_configured', async () => {
    await expect(gradesApi.getGrades()).rejects.toMatchObject({ kind: 'not_configured' });
  });
});
