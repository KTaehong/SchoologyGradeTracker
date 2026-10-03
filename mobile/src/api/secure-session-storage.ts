/**
 * Keeps the Supabase sign-in session in the phone's secure storage (Keychain on
 * iOS, Keystore on Android), as F14 requires.
 *
 * SecureStore values should stay under 2 KB, and a session (access token,
 * refresh token, user record) is usually bigger, so each value is split into
 * chunks: `<key>.count` holds how many, and `<key>.0`, `<key>.1`, … hold the text.
 */

/** The part of expo-secure-store this adapter uses (so tests can pass a fake). */
export type SecureStoreBackend = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** The storage interface supabase-js expects for `auth.storage`. */
export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Characters per chunk. UTF-8 uses up to 4 bytes per character, so 500 stays under 2 KB. */
export const CHUNK_SIZE = 500;

/** SecureStore keys may only use letters, digits, `.`, `-`, and `_`. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createSecureSessionStorage(store: SecureStoreBackend): SessionStorage {
  async function readCount(key: string): Promise<number> {
    const raw = await store.getItemAsync(`${key}.count`);
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  async function deleteChunks(key: string, from: number, to: number): Promise<void> {
    for (let i = from; i < to; i++) {
      await store.deleteItemAsync(`${key}.${i}`);
    }
  }

  return {
    async getItem(rawKey) {
      const key = safeKey(rawKey);
      const count = await readCount(key);
      if (count === 0) {
        return null;
      }
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await store.getItemAsync(`${key}.${i}`);
        if (chunk === null) {
          // A half-written save; treat it as signed out rather than a broken session.
          return null;
        }
        chunks.push(chunk);
      }
      return chunks.join('');
    },

    async setItem(rawKey, value) {
      const key = safeKey(rawKey);
      const previous = await readCount(key);
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < count; i++) {
        await store.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await store.setItemAsync(`${key}.count`, String(count));
      await deleteChunks(key, count, previous);
    },

    async removeItem(rawKey) {
      const key = safeKey(rawKey);
      const count = await readCount(key);
      await store.deleteItemAsync(`${key}.count`);
      await deleteChunks(key, 0, count);
    },
  };
}
