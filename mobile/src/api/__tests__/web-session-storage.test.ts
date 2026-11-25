import { afterEach, describe, expect, it } from '@jest/globals';

import { createWebSessionStorage } from '../web-session-storage';

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function fakeLocalStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

function setLocalStorage(get: () => Storage | undefined) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('createWebSessionStorage', () => {
  it('keeps the session in localStorage, so a reload stays signed in', async () => {
    const local = fakeLocalStorage();
    setLocalStorage(() => local);

    await createWebSessionStorage().setItem('sb-x-auth-token', 'saved');
    // A new page load makes a new storage object over the same localStorage.
    await expect(createWebSessionStorage().getItem('sb-x-auth-token')).resolves.toBe('saved');

    await createWebSessionStorage().removeItem('sb-x-auth-token');
    expect(local.getItem('sb-x-auth-token')).toBeNull();
  });

  it('falls back to memory where there is no localStorage', async () => {
    setLocalStorage(() => undefined);
    const storage = createWebSessionStorage();

    await expect(storage.getItem('key')).resolves.toBeNull();
    await storage.setItem('key', 'value');
    await expect(storage.getItem('key')).resolves.toBe('value');
    await storage.removeItem('key');
    await expect(storage.getItem('key')).resolves.toBeNull();
  });

  it('falls back to memory when the browser blocks localStorage', async () => {
    setLocalStorage(() => {
      throw new Error('SecurityError: access denied');
    });
    const storage = createWebSessionStorage();

    await storage.setItem('key', 'value');
    await expect(storage.getItem('key')).resolves.toBe('value');
  });
});
