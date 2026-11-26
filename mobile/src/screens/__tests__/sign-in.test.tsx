/**
 * The sign-in screen: form checks before anything is sent, a username signs
 * in as a demo account, "check your email" after sign-up, sending the email
 * again, password reset, and Google.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemePreferenceProvider } from '@/theme/theme-preference';

import SignInScreen from '@/app/sign-in';

const mockApi = {
  signInWithEmail: jest.fn<(email: string, password: string) => Promise<unknown>>(),
  signUpWithEmail: jest.fn<(form: object) => Promise<unknown>>(),
  resendConfirmation: jest.fn<(email: string) => Promise<void>>(),
  requestPasswordReset: jest.fn<(email: string) => Promise<void>>(),
  signInWithProvider: jest.fn<(provider: string) => Promise<unknown>>(),
  signInWithApple: jest.fn<() => Promise<unknown>>(),
};
const mockRouter = { replace: jest.fn(), push: jest.fn() };

jest.mock('expo-router', () => ({ router: mockRouter }));
jest.mock('@/components/apple-sign-in-button', () => ({ AppleSignInButton: () => null }));
jest.mock('@/api', () => ({
  // Looked up on each call: the mock module is made before mockApi is set.
  signInWithEmail: (...args: [string, string]) => mockApi.signInWithEmail(...args),
  signUpWithEmail: (form: object) => mockApi.signUpWithEmail(form),
  resendConfirmation: (email: string) => mockApi.resendConfirmation(email),
  requestPasswordReset: (email: string) => mockApi.requestPasswordReset(email),
  signInWithProvider: (provider: string) => mockApi.signInWithProvider(provider),
  signInWithApple: () => mockApi.signInWithApple(),
  isApiConfigured: () => true,
  useSession: () => ({ status: 'signed_out', session: null }),
}));

async function open() {
  await render(
    <ThemePreferenceProvider>
      <SignInScreen />
    </ThemePreferenceProvider>,
  );
}

const type = (label: string | RegExp, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
const tap = async (text: string) => fireEvent.press(await screen.findByText(text));

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(mockApi)) fn.mockResolvedValue(null as never);
});

describe('Sign in', () => {
  it('asks for both fields before calling the server', async () => {
    await open();
    await tap('Sign in');
    expect(await screen.findByText('Enter your username (or email) and password.')).toBeTruthy();
    expect(mockApi.signInWithEmail).not.toHaveBeenCalled();
  });

  it('signs a username in as its demo account', async () => {
    await open();
    await type('Username or email', 'Maya_Torres');
    await type('Password', 'secret12');
    await tap('Sign in');
    expect(mockApi.signInWithEmail).toHaveBeenCalledWith('maya_torres@demo.example.com', 'secret12');
  });

  it('says "wrong username or password" in plain words', async () => {
    mockApi.signInWithEmail.mockRejectedValue(new ApiError('invalid_input', 'Invalid login credentials', 'invalid_credentials'));
    await open();
    await type('Username or email', 'ana@example.com');
    await type('Password', 'nope');
    await tap('Sign in');
    expect(await screen.findByText('Wrong username or password.')).toBeTruthy();
  });

  it('offers to send the email again for an unconfirmed account, and sends it', async () => {
    mockApi.signInWithEmail.mockRejectedValue(new ApiError('invalid_input', 'Email not confirmed', 'email_not_confirmed'));
    await open();
    await type('Username or email', 'ana@example.com');
    await type('Password', 'secret12');
    await tap('Sign in');
    await tap('Send the email again');
    expect(mockApi.resendConfirmation).toHaveBeenCalledWith('ana@example.com');
    expect(await screen.findByText(/We sent the link to ana@example.com again/)).toBeTruthy();
  });

  it('needs an email, not a username, for a password reset', async () => {
    await open();
    await type('Username or email', 'maya_torres');
    await tap('Forgot password?');
    expect(await screen.findByText(/only be reset for an account with an email/)).toBeTruthy();
    expect(mockApi.requestPasswordReset).not.toHaveBeenCalled();

    await type('Username or email', ' ana@example.com ');
    await tap('Forgot password?');
    expect(mockApi.requestPasswordReset).toHaveBeenCalledWith('ana@example.com');
    expect(await screen.findByText(/a link to choose a new password is on its way/)).toBeTruthy();
  });

  it('signs in with Google', async () => {
    await open();
    await tap('Continue with Google');
    expect(mockApi.signInWithProvider).toHaveBeenCalledWith('google');
  });
});

describe('Create an account', () => {
  async function openSignUp() {
    await open();
    await tap('Create an account');
    await screen.findByText('Create account');
  }

  it.each([
    [{ name: '', username: '', email: 'ana@example.com', password: 'secret12' }, 'Enter your name.'],
    [{ name: 'Ana', username: 'a b', email: 'ana@example.com', password: 'secret12' }, /A username is 3 to 30/],
    [{ name: 'Ana', username: '', email: 'ana@example', password: 'secret12' }, /Enter a real email address/],
    [{ name: 'Ana', username: '', email: 'ana@example.com', password: 'short' }, /Use a password with at least/],
  ])('checks %p before sending', async (form, message) => {
    await openSignUp();
    await type('Name', form.name);
    await type('Username (optional)', form.username);
    await type('Email', form.email);
    await type(/^Password \(at least/, form.password);
    await tap('Create account');
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockApi.signUpWithEmail).not.toHaveBeenCalled();
  });

  it('says to check the email when the account needs confirming', async () => {
    await openSignUp();
    await type('Name', ' Ana Park ');
    await type('Username (optional)', 'Ana_P');
    await type('Email', 'ana@example.com');
    await type(/^Password \(at least/, 'secret12');
    await tap('Create account');
    expect(mockApi.signUpWithEmail).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secret12',
      fullName: 'Ana Park',
      username: 'ana_p',
    });
    expect(await screen.findByText(/Check ana@example.com for a link/)).toBeTruthy();
    // Back on sign-in, with the email ready to be sent again.
    expect(screen.getByText('Send the email again')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });
});
