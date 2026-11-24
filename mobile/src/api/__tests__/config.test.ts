import { describe, expect, it } from '@jest/globals';

import { checkPublicKey } from '../../../scripts/supabase-key-check';
import { readApiConfig } from '../config';

const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
const EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';

describe('the key in the app', () => {
  it('may be a publishable or anon key', () => {
    for (const key of ['sb_publishable_x', jwt('anon'), '']) expect(checkPublicKey(key)).toBeNull();
    expect(readApiConfig({ EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x' })).not.toBeNull();
  });

  it('may never be a secret key', () => {
    for (const key of ['sb_secret_x', jwt('service_role')]) expect(checkPublicKey(key)).toMatch(/Only|SECRET/);
    expect(readApiConfig({ EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_x' })).toBeNull();
  });
});
