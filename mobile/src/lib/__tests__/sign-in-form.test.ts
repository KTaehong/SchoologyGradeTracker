import { describe, expect, it } from '@jest/globals';

import { ApiError } from '@/api/errors';

import { accountLabel, isUsername, signInErrorMessage, toSignInEmail } from '../sign-in-form';

describe('toSignInEmail', () => {
  it('turns a username into the demo account email', () => {
    expect(toSignInEmail('maya_torres')).toBe('maya_torres@demo.example.com');
    expect(toSignInEmail('  Maya_Torres ')).toBe('maya_torres@demo.example.com');
  });

  it('leaves an email address alone', () => {
    expect(toSignInEmail(' someone@school.org ')).toBe('someone@school.org');
  });

  it('leaves nothing as nothing', () => {
    expect(toSignInEmail('  ')).toBe('');
  });
});

describe('isUsername', () => {
  it('tells usernames from emails', () => {
    expect(isUsername('sam_nguyen')).toBe(true);
    expect(isUsername('sam@school.org')).toBe(false);
    expect(isUsername('')).toBe(false);
  });
});

describe('accountLabel', () => {
  it('shows the username for a demo account and the email otherwise', () => {
    expect(accountLabel({ email: 'jordan_brooks@demo.example.com' })).toBe('jordan_brooks');
    expect(accountLabel({ email: 'someone@school.org' })).toBe('someone@school.org');
    expect(accountLabel({ email: null, phone: '+12065550101' })).toBe('+12065550101');
    expect(accountLabel({})).toBe('Account');
  });
});

describe('signInErrorMessage', () => {
  it('explains a wrong username or password', () => {
    const error = new ApiError('invalid_input', 'Invalid login credentials', 'invalid_credentials');
    expect(signInErrorMessage(error)).toBe('Wrong username or password.');
  });

  it('explains an unconfirmed email', () => {
    const error = new ApiError('invalid_input', 'Email not confirmed', 'email_not_confirmed');
    expect(signInErrorMessage(error)).toMatch(/Confirm your email/);
  });

  it('falls back to the usual message', () => {
    expect(signInErrorMessage(new ApiError('network', 'fetch failed'))).toMatch(/Could not reach/);
  });
});
