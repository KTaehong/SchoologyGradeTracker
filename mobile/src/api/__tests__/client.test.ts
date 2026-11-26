import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Client = typeof import('../client');

const mockCreateClient = jest.fn();
const mockAddEventListener = jest.fn();
const mockSecureItems = new Map<string, string>();
let mockConfig: { url: string; anonKey: string } | null = null;
let mockOs = 'ios';

jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockSecureItems.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockSecureItems.set(key, value),
  deleteItemAsync: async (key: string) => void mockSecureItems.delete(key),
}));
jest.mock('react-native', () => ({
  AppState: { addEventListener: (...args: unknown[]) => mockAddEventListener(...args) },
  Platform: {
    get OS() {
      return mockOs;
    },
  },
}));
jest.mock('../config', () => ({ readApiConfig: () => mockConfig }));

const URL = 'https://abcd.supabase.co';
const KEY = 'sb-abcd-auth-token';

/** A fresh copy of client.ts, since it keeps one Supabase client for the whole app. */
function loadClient(): Client {
  let loaded: Client | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<Client>('../client');
  });
  return loaded!;
}

async function save(value: string) {
  const { createSecureSessionStorage } = jest.requireActual<typeof import('../secure-session-storage')>(
    '../secure-session-storage',
  );
  const SecureStore = jest.requireMock<import('../secure-session-storage').SecureStoreBackend>('expo-secure-store');
  await createSecureSessionStorage(SecureStore).setItem(KEY, value);
}

function fakeSupabase() {
  return { auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSecureItems.clear();
  mockConfig = { url: URL, anonKey: 'sb_publishable_x' };
  mockOs = 'ios';
  mockCreateClient.mockImplementation(() => fakeSupabase());
});

describe('getSupabase', () => {
  it('refuses to start without the API settings', () => {
    mockConfig = null;
    const { getSupabase, isApiConfigured } = loadClient();
    expect(isApiConfigured()).toBe(false);
    expect(() => getSupabase()).toThrow(expect.objectContaining({ kind: 'not_configured' }));
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('makes one client that keeps the session and signs in with PKCE', () => {
    const { getSupabase, isApiConfigured } = loadClient();
    expect(isApiConfigured()).toBe(true);
    const first = getSupabase();
    expect(getSupabase()).toBe(first);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      URL,
      'sb_publishable_x',
      expect.objectContaining({
        auth: expect.objectContaining({
          storageKey: KEY,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        }),
      }),
    );
  });

  it('refreshes tokens only while the app is on screen', () => {
    const supabase = loadClient().getSupabase() as unknown as ReturnType<typeof fakeSupabase>;
    const onChange = mockAddEventListener.mock.calls[0][1] as (state: string) => void;
    onChange('background');
    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    onChange('active');
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('has no app-state listener on the web', () => {
    mockOs = 'web';
    loadClient().getSupabase();
    expect(mockAddEventListener).not.toHaveBeenCalled();
  });
});

describe('readStoredSession', () => {
  it('reads the saved session from secure storage without the network', async () => {
    // Saved the way supabase-js saves it: through the chunked Keychain storage.
    const long = 'x'.repeat(1200); // a real session is bigger than one chunk
    await save(JSON.stringify({ access_token: long, refresh_token: 'r', user: { id: 'u1' } }));
    expect(mockSecureItems.get(`${KEY}.count`)).toBe('3');
    const session = await loadClient().readStoredSession();
    expect(session?.user.id).toBe('u1');
    expect(session?.access_token).toBe(long);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('is null when nothing usable is saved, or the API is not set up', async () => {
    await expect(loadClient().readStoredSession()).resolves.toBeNull();
    await save('{"access_token": "a"}');
    await expect(loadClient().readStoredSession()).resolves.toBeNull();
    mockConfig = null;
    await expect(loadClient().readStoredSession()).resolves.toBeNull();
  });
});
