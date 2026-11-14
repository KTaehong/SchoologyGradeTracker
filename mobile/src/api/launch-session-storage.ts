/**
 * Makes every fresh launch start signed out.
 *
 * supabase-js saves the session so it can refresh the token while the app is
 * open. This wrapper hides (and deletes) a session saved by an earlier launch,
 * so the student signs in again each time the app is opened. A session saved
 * during this launch is read back normally.
 *
 * The one-time secret for emailed links ("confirm your account", "reset your
 * password") is kept: the link often opens the app fresh, and only works on
 * the phone that still has the secret.
 */
import type { SessionStorage } from './secure-session-storage';

const KEPT_SUFFIX = '-code-verifier';

export function startSignedOut(storage: SessionStorage): SessionStorage {
  const savedThisLaunch = new Set<string>();
  return {
    async getItem(key) {
      if (key.endsWith(KEPT_SUFFIX) || savedThisLaunch.has(key)) {
        return storage.getItem(key);
      }
      await storage.removeItem(key);
      return null;
    },
    async setItem(key, value) {
      savedThisLaunch.add(key);
      await storage.setItem(key, value);
    },
    async removeItem(key) {
      savedThisLaunch.delete(key);
      await storage.removeItem(key);
    },
  };
}

/** The browser's localStorage as a SessionStorage; memory only where there is none. */
export function createWebSessionStorage(): SessionStorage {
  const memory = new Map<string, string>();
  const local = (): Storage | null => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  };
  return {
    async getItem(key) {
      return local()?.getItem(key) ?? memory.get(key) ?? null;
    },
    async setItem(key, value) {
      const storage = local();
      if (storage) storage.setItem(key, value);
      else memory.set(key, value);
    },
    async removeItem(key) {
      local()?.removeItem(key);
      memory.delete(key);
    },
  };
}
