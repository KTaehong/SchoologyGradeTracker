/**
 * The Settings screen's sign-out flow: it asks first, says how many changes
 * have not reached the cloud, and never deletes unsent changes without a
 * second, explicit "Sign out anyway".
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { ThemePreferenceProvider } from '@/theme/theme-preference';

import SettingsScreen from '@/app/(tabs)/settings';

type Gradebook = {
  signOut: jest.Mock<(discardUnsent?: boolean) => Promise<void>>;
  sync: { state: string; pending: number; lastSyncedAt: string | null; error: string | null } | null;
  [key: string]: unknown;
};

const mockGradebook: Gradebook = { signOut: jest.fn(), sync: null };

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('@/api', () => ({
  isApiConfigured: () => true,
  useSession: () => ({
    status: 'signed_in',
    session: { user: { id: 'ana', email: 'ana@example.com', app_metadata: { providers: ['email'] } } },
  }),
}));
jest.mock('@/data/gradebook-store', () => {
  class UnsentChangesError extends Error {
    count: number;
    constructor(mockCount: number) {
      super(`${mockCount} changes have not reached the cloud yet. Connect to the internet and try again.`);
      this.count = mockCount;
    }
  }
  return { UnsentChangesError, useGradebook: () => mockGradebook };
});

const { UnsentChangesError } = jest.requireMock<{ UnsentChangesError: new (count: number) => Error }>(
  '@/data/gradebook-store',
);

/** Every Alert shown, so a test can read it and press one of its buttons. */
let alerts: { title?: string | null; message?: string | null; buttons?: AlertButton[] }[] = [];

async function press(alertIndex: number, buttonText: string) {
  await waitFor(() => expect(alerts.length).toBeGreaterThan(alertIndex));
  const button = alerts[alertIndex].buttons?.find((b) => b.text === buttonText);
  const onPress = button?.onPress;
  if (!onPress) throw new Error(`No "${buttonText}" button in "${alerts[alertIndex].title}"`);
  // The button starts async work that updates the screen; let it all settle.
  await act(async () => {
    onPress();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openSettings() {
  await render(
    <ThemePreferenceProvider>
      <SettingsScreen />
    </ThemePreferenceProvider>,
  );
  await fireEvent.press(await screen.findByText('Sign out'));
}

beforeEach(() => {
  alerts = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title, message, buttons });
  });
  Object.assign(mockGradebook, {
    signOut: jest.fn(async () => undefined),
    sync: { state: 'idle', pending: 0, lastSyncedAt: '2026-11-25T12:00:00.000Z', error: null },
    online: true,
    calendar: { connected: false, refreshing: false, refreshedAt: null, error: null },
    syncNow: jest.fn(),
    deleteAccount: jest.fn(),
    loadSample: jest.fn(),
    eraseAll: jest.fn(),
  });
});

describe('Settings: sign out', () => {
  it('asks first, then signs out', async () => {
    await openSettings();
    expect(alerts[0].title).toBe('Sign out?');
    expect(mockGradebook.signOut).not.toHaveBeenCalled();

    await press(0, 'Sign out');
    await waitFor(() => expect(mockGradebook.signOut).toHaveBeenCalledTimes(1));
    expect(mockGradebook.signOut).toHaveBeenCalledWith();
  });

  it('does nothing when the student cancels', async () => {
    await openSettings();
    // Cancel only closes the dialog: it has no action of its own.
    const cancel = alerts[0].buttons?.find((b) => b.text === 'Cancel');
    expect(cancel).toEqual({ text: 'Cancel', style: 'cancel' });
    expect(mockGradebook.signOut).not.toHaveBeenCalled();
  });

  it('says how many changes are not in the cloud yet', async () => {
    mockGradebook.sync = { state: 'offline', pending: 3, lastSyncedAt: null, error: null };
    await openSettings();
    expect(alerts[0].message).toMatch(/^3 changes have not reached the cloud yet/);
  });

  it('keeps unsent changes unless the student chooses to lose them', async () => {
    mockGradebook.signOut.mockImplementation(async (discard) => {
      if (!discard) throw new UnsentChangesError(2);
    });
    await openSettings();
    await press(0, 'Sign out');

    // The sync could not send them: a second question, with "stay" as the safe answer.
    await waitFor(() => expect(alerts[1]?.title).toBe('Not everything is saved'));
    expect(alerts[1].message).toContain('they are lost');
    await press(1, 'Stay signed in');
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
    expect(mockGradebook.signOut).toHaveBeenCalledTimes(1);
    expect(mockGradebook.signOut).toHaveBeenLastCalledWith();
  });

  it('signs out and drops unsent changes only after "Sign out anyway"', async () => {
    mockGradebook.signOut.mockImplementation(async (discard) => {
      if (!discard) throw new UnsentChangesError(1);
    });
    await openSettings();
    await press(0, 'Sign out');
    await press(1, 'Sign out anyway');

    await waitFor(() => expect(mockGradebook.signOut).toHaveBeenCalledTimes(2));
    expect(mockGradebook.signOut).toHaveBeenLastCalledWith(true);
  });

  it('shows a message when signing out fails for another reason', async () => {
    mockGradebook.signOut.mockRejectedValue(new Error('Could not reach the server.'));
    await openSettings();
    await press(0, 'Sign out');

    await waitFor(() => expect(alerts[1]?.title).toBe('Could not sign out'));
    expect(alerts[1].message).toContain('Could not reach the server.');
  });
});
