import { describe, expect, it } from '@jest/globals';

import { parseOAuthCallback } from '../oauth-callback';

describe('parseOAuthCallback', () => {
  it('reads the one-time code', () => {
    expect(parseOAuthCallback('gradetracker://auth/callback?code=abc-123')).toEqual({
      kind: 'code',
      code: 'abc-123',
    });
  });

  it('works with Expo Go links', () => {
    expect(parseOAuthCallback('exp://192.168.1.5:8081/--/auth/callback?code=xyz')).toEqual({
      kind: 'code',
      code: 'xyz',
    });
  });

  it('reports a provider error from the query or the fragment', () => {
    expect(
      parseOAuthCallback('gradetracker://auth/callback?error=access_denied&error_description=User+cancelled'),
    ).toEqual({ kind: 'error', message: 'User cancelled' });
    expect(parseOAuthCallback('gradetracker://auth/callback#error=server_error')).toEqual({
      kind: 'error',
      message: 'server_error',
    });
  });

  it('treats a link with neither as unfinished', () => {
    expect(parseOAuthCallback('gradetracker://auth/callback').kind).toBe('error');
  });
});
