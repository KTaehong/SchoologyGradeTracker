import { describe, expect, it } from '@jest/globals';

import { parseStoredSession, sessionStorageKey } from '../stored-session';

describe('the session saved on the phone', () => {
  it('uses the key supabase-js has always used, so an update signs nobody out', () => {
    expect(sessionStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
  });

  it('is read even when its access token has expired', () => {
    const saved = { access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } };
    expect(parseStoredSession(JSON.stringify(saved))?.user.id).toBe('u1');
  });

  it.each([null, '', 'not json', 'null', '{}', '{"access_token":"a","user":{"id":"u1"}}'])('is nobody for %s', (raw) => {
    expect(parseStoredSession(raw)).toBeNull();
  });
});
