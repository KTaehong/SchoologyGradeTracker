/** What went wrong with an API call, in terms the app can act on. */
export type ApiErrorKind =
  /** EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are not set. */
  | 'not_configured'
  /** No one is signed in, or the session expired and could not be refreshed. */
  | 'not_signed_in'
  /** Signed in, but not allowed to do this. */
  | 'forbidden'
  /** The course, category, or assignment does not exist (or is not the student's). */
  | 'not_found'
  /** A bad argument, such as a negative score or an empty title. */
  | 'invalid_input'
  /** The phone could not reach the server. */
  | 'network'
  | 'server';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** The Postgres / PostgREST error code, when there is one. */
  readonly code: string | null;

  constructor(kind: ApiErrorKind, message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
  }
}

/** The fields of a supabase-js PostgrestError that matter here. */
type PostgrestLikeError = { message: string; code?: string | null };

/**
 * Turns a supabase-js error into an ApiError. The SQL functions raise these
 * SQLSTATE codes on purpose (see supabase/migrations/20260929000500_grade_api.sql).
 */
export function toApiError(error: PostgrestLikeError): ApiError {
  const code = error.code || null;
  const message = error.message;

  if (code === '28000' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
    return new ApiError('not_signed_in', message, code);
  }
  if (code === '42501') {
    return new ApiError('forbidden', message, code);
  }
  if (code === 'P0002' || code === 'PGRST116') {
    return new ApiError('not_found', message, code);
  }
  if (code !== null && (code.startsWith('22') || code === '23514' || code === '23502')) {
    return new ApiError('invalid_input', message, code);
  }
  if (!code && /network|fetch|timed? ?out/i.test(message)) {
    return new ApiError('network', message, code);
  }
  return new ApiError('server', message, code);
}
