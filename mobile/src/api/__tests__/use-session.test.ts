import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getSession, onSessionChange, type Session } from '../auth';
import { useSession } from '../use-session';

jest.mock('../auth', () => ({
  getSession: jest.fn(),
  onSessionChange: jest.fn(),
}));

const ana = { access_token: 'a', refresh_token: 'r', user: { id: 'ana' } } as unknown as Session;
const ben = { access_token: 'b', refresh_token: 'r', user: { id: 'ben' } } as unknown as Session;

let emit: (session: Session | null) => void = () => undefined;
const unsubscribe = jest.fn();

/** The saved session resolves when `release` is called, so a test can order it against events. */
function savedSession(value: Session | null | Error) {
  let release: () => void = () => undefined;
  const promise = new Promise<Session | null>((resolve, reject) => {
    release = () => (value instanceof Error ? reject(value) : resolve(value));
  });
  (getSession as jest.Mock<typeof getSession>).mockReturnValue(promise);
  return () => act(async () => release());
}

beforeEach(() => {
  jest.clearAllMocks();
  (onSessionChange as jest.Mock<typeof onSessionChange>).mockImplementation((listener) => {
    emit = listener;
    return unsubscribe;
  });
});

describe('useSession', () => {
  it('is loading until the saved session has been read', async () => {
    const release = savedSession(ana);
    const { result } = await renderHook(() => useSession());
    expect(result.current).toEqual({ status: 'loading' });

    await release();
    expect(result.current).toEqual({ status: 'signed_in', session: ana });
  });

  it('is signed out when nothing is saved, or the saved session cannot be read', async () => {
    const none = savedSession(null);
    const first = await renderHook(() => useSession());
    await none();
    expect(first.result.current).toEqual({ status: 'signed_out' });

    const broken = savedSession(new Error('Keychain locked'));
    const second = await renderHook(() => useSession());
    await broken();
    await waitFor(() => expect(second.result.current).toEqual({ status: 'signed_out' }));
  });

  it('follows sign-in and sign-out events', async () => {
    const release = savedSession(null);
    const { result } = await renderHook(() => useSession());
    await release();

    await act(async () => emit(ana));
    expect(result.current).toEqual({ status: 'signed_in', session: ana });
    await act(async () => emit(null));
    expect(result.current).toEqual({ status: 'signed_out' });
  });

  it('lets an event win over a saved session read that finishes later', async () => {
    const release = savedSession(ana);
    const { result } = await renderHook(() => useSession());

    // Ben signs in while Ana's saved session is still being read.
    await act(async () => emit(ben));
    await release();
    expect(result.current).toEqual({ status: 'signed_in', session: ben });
  });

  it('stops listening when the screen goes away', async () => {
    const release = savedSession(ana);
    const { result, unmount } = await renderHook(() => useSession());
    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    // A late answer does not touch the unmounted hook.
    await release();
    expect(result.current).toEqual({ status: 'loading' });
  });
});
