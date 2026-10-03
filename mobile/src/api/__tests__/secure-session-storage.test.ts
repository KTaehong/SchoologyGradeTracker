import { describe, expect, it } from '@jest/globals';

import {
  CHUNK_SIZE,
  createSecureSessionStorage,
  type SecureStoreBackend,
} from '../secure-session-storage';

function fakeSecureStore() {
  const items = new Map<string, string>();
  const backend: SecureStoreBackend = {
    async getItemAsync(key) {
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (!/^[A-Za-z0-9._-]+$/.test(key)) {
        throw new Error(`invalid SecureStore key ${key}`);
      }
      if (value.length > CHUNK_SIZE) {
        throw new Error('value too large for SecureStore');
      }
      items.set(key, value);
    },
    async deleteItemAsync(key) {
      items.delete(key);
    },
  };
  return { items, storage: createSecureSessionStorage(backend) };
}

describe('secure session storage', () => {
  it('returns null when nothing is saved', async () => {
    const { storage } = fakeSecureStore();
    await expect(storage.getItem('sb-demo-auth-token')).resolves.toBeNull();
  });

  it('round-trips a session larger than one SecureStore value', async () => {
    const { items, storage } = fakeSecureStore();
    const session = JSON.stringify({ access_token: 'a'.repeat(1400), user: { name: 'Zoë' } });
    await storage.setItem('sb-demo-auth-token', session);

    expect(items.get('sb-demo-auth-token.count')).toBe(
      String(Math.ceil(session.length / CHUNK_SIZE)),
    );
    await expect(storage.getItem('sb-demo-auth-token')).resolves.toBe(session);
  });

  it('round-trips an empty string', async () => {
    const { storage } = fakeSecureStore();
    await storage.setItem('k', '');
    await expect(storage.getItem('k')).resolves.toBe('');
  });

  it('deletes leftover chunks when a value gets shorter', async () => {
    const { items, storage } = fakeSecureStore();
    await storage.setItem('k', 'x'.repeat(CHUNK_SIZE * 3));
    await storage.setItem('k', 'short');

    expect([...items.keys()].sort()).toEqual(['k.0', 'k.count']);
    await expect(storage.getItem('k')).resolves.toBe('short');
  });

  it('removes every chunk', async () => {
    const { items, storage } = fakeSecureStore();
    await storage.setItem('k', 'y'.repeat(CHUNK_SIZE * 2 + 1));
    await storage.removeItem('k');

    expect(items.size).toBe(0);
    await expect(storage.getItem('k')).resolves.toBeNull();
  });

  it('treats a half-written session as signed out', async () => {
    const { items, storage } = fakeSecureStore();
    await storage.setItem('k', 'z'.repeat(CHUNK_SIZE * 2));
    items.delete('k.1');
    await expect(storage.getItem('k')).resolves.toBeNull();
  });

  it('replaces characters SecureStore does not allow in keys', async () => {
    const { items, storage } = fakeSecureStore();
    await storage.setItem('sb:demo/auth token', 'v');
    expect(items.has('sb_demo_auth_token.0')).toBe(true);
    await expect(storage.getItem('sb:demo/auth token')).resolves.toBe('v');
  });
});
