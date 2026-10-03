/**
 * The cloud API (opt-in, F14). Everything here needs a signed-in student;
 * calls made while signed out reject with `ApiError` kind `not_signed_in`.
 *
 *   import { gradesApi, signInWithEmail } from '@/api';
 *   await signInWithEmail(email, password);
 *   const { courses } = await gradesApi.getGrades();
 */
import { getSupabase } from './client';
import { createGradesApi } from './grades';
import { createRpcCaller } from './rpc';

export {
  getSession,
  oauthRedirectUrl,
  onSessionChange,
  signInWithEmail,
  signInWithProvider,
  signOut,
  signUpWithEmail,
} from './auth';
export type { OAuthProvider, Session, SignUp } from './auth';
export { getSupabase, isApiConfigured } from './client';
export { ApiError, errorMessage } from './errors';
export type { ApiErrorKind } from './errors';
export type {
  CategoryGrades,
  CourseGrades,
  ForecastAssignment,
  ForecastResult,
  GradesApi,
  GradesSnapshot,
  LetterGrade,
  NewForecast,
  PeriodGrades,
  PeriodKind,
  SemesterGrades,
  UngradedAssignment,
} from './grades';
export { useApiQuery } from './use-api-query';
export type { QueryState } from './use-api-query';
export { useSession } from './use-session';
export type { SessionState } from './use-session';

export const gradesApi = createGradesApi(createRpcCaller(getSupabase));
