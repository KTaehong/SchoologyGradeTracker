import { describe, expect, it } from '@jest/globals';

import { RESUME_SIGN_OUT_MS, signOutOnResume, startSignedOut } from '../launch-session-storage';
import type { SessionStorage } from '../secure-session-storage';

function fakeStorage(initial: Record<string, string>): SessionStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
  };
}

const SESSION = 'sb-project-auth-token';
const VERIFIER = 'sb-project-auth-token-code-verifier';

describe('startSignedOut', () => {
  it('hides and deletes a session saved by an earlier launch', async () => {
    const inner = fakeStorage({ [SESSION]: 'old session' });
    const storage = startSignedOut(inner);
    await expect(storage.getItem(SESSION)).resolves.toBeNull();
    expect(inner.data.has(SESSION)).toBe(false);
  });

  it('reads back a session saved during this launch', async () => {
    const inner = fakeStorage({ [SESSION]: 'old session' });
    const storage = startSignedOut(inner);
    await storage.setItem(SESSION, 'new session');
    await expect(storage.getItem(SESSION)).resolves.toBe('new session');
  });

  it('starts signed out again on the next launch', async () => {
    const inner = fakeStorage({});
    await startSignedOut(inner).setItem(SESSION, 'session');
    await expect(startSignedOut(inner).getItem(SESSION)).resolves.toBeNull();
  });

  it('forgets a session after sign-out', async () => {
    const storage = startSignedOut(fakeStorage({}));
    await storage.setItem(SESSION, 'session');
    await storage.removeItem(SESSION);
    await expect(storage.getItem(SESSION)).resolves.toBeNull();
  });

  it('keeps the secret an emailed link needs', async () => {
    const storage = startSignedOut(fakeStorage({ [VERIFIER]: 'secret' }));
    await expect(storage.getItem(VERIFIER)).resolves.toBe('secret');
  });
});

describe('signOutOnResume', () => {
  it('keeps the session after a short trip out of the app', () => {
    expect(signOutOnResume(1_000, 1_000 + 60_000)).toBe(false);
  });

  it('signs out after a long time in the background', () => {
    expect(signOutOnResume(1_000, 1_000 + RESUME_SIGN_OUT_MS)).toBe(true);
  });

  it('does nothing when the app never went to the background', () => {
    expect(signOutOnResume(null, Date.now())).toBe(false);
  });
});
