import { describe, expect, it } from '@jest/globals';

import { readApiConfig } from '../config';
import { ApiError, toApiError } from '../errors';

describe('toApiError', () => {
  it.each([
    ['28000', 'not_signed_in'],
    ['PGRST301', 'not_signed_in'],
    ['PGRST303', 'not_signed_in'],
    ['42501', 'forbidden'],
    ['P0002', 'not_found'],
    ['22023', 'invalid_input'],
    ['23514', 'invalid_input'],
    ['23503', 'server'],
    ['XX000', 'server'],
  ])('maps SQLSTATE %s to %s', (code, kind) => {
    const error = toApiError({ code, message: 'boom' });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe(kind);
    expect(error.code).toBe(code);
    expect(error.message).toBe('boom');
  });

  it('recognizes a failed request as a network error', () => {
    expect(toApiError({ code: '', message: 'TypeError: Network request failed' }).kind).toBe(
      'network',
    );
  });
});

describe('readApiConfig', () => {
  it('needs both the URL and the anon key', () => {
    expect(readApiConfig({})).toBeNull();
    expect(readApiConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(
      readApiConfig({
        EXPO_PUBLIC_SUPABASE_URL: ' https://x.supabase.co ',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' });
  });
});
