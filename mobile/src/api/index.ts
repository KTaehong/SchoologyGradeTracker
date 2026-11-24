/**
 * The cloud API. Calls made while signed out reject with `ApiError` kind
 * `not_signed_in`.
 */
export {
  finishAuthLink,
  getSession,
  oauthRedirectUrl,
  onSessionChange,
  requestPasswordReset,
  resendConfirmation,
  signInWithApple,
  signInWithEmail,
  signInWithProvider,
  signOut,
  signUpWithEmail,
  updatePassword,
} from './auth';
export type { AuthLinkResult, OAuthProvider, Session, SignUp } from './auth';
export { getSupabase, isApiConfigured } from './client';
export { ApiError, errorMessage } from './errors';
export type { ApiErrorKind } from './errors';
export { useSession } from './use-session';
export type { SessionState } from './use-session';
