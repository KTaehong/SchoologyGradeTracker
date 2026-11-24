import type { SessionStorage } from './secure-session-storage';

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
