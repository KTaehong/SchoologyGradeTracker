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

export { getSession, onSessionChange, signInWithEmail, signOut, signUpWithEmail } from './auth';
export type { Session, SignUp } from './auth';
export { getSupabase, isApiConfigured } from './client';
export { ApiError } from './errors';
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
  PendingForecast,
  PeriodGrades,
  PeriodKind,
  SemesterGrades,
} from './grades';
export { useSession } from './use-session';
export type { SessionState } from './use-session';

export const gradesApi = createGradesApi(createRpcCaller(getSupabase));
