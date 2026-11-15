import { describe, expect, it } from '@jest/globals';

import { ApiError } from '@/api/errors';

import {
  accountLabel,
  checkUsername,
  isUsername,
  isValidEmail,
  needsConfirmation,
  signInErrorMessage,
  toSignInEmail,
} from '../sign-in-form';

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

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const ok of ['name@gmail.com', ' pl1007463@ahschool.com ', 'a.b+c@mail.school.org']) {
      expect(isValidEmail(ok)).toBe(true);
    }
  });

  it('refuses what the server would refuse', () => {
    for (const bad of ['', 'name', 'name@', '@gmail.com', 'name@gmail', 'name@gmail.c', 'a b@gmail.com', 'a@b@c.com', 'name@.com', 'name@gmail..com']) {
      expect(isValidEmail(bad)).toBe(false);
    }
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

  it('explains an unconfirmed email, and offers to send it again', () => {
    const error = new ApiError('invalid_input', 'Email not confirmed', 'email_not_confirmed');
    expect(signInErrorMessage(error)).toMatch(/not confirmed yet/);
    expect(needsConfirmation(error)).toBe(true);
    expect(needsConfirmation(new ApiError('invalid_input', 'x', 'invalid_credentials'))).toBe(false);
  });

  it('explains what the server says about a new account email', () => {
    const cases: [string, RegExp][] = [
      ['validation_failed', /real email address/],
      ['email_address_invalid', /cannot be used/],
      ['user_already_exists', /already exists/],
      ['over_email_send_rate_limit', /Too many emails/],
      ['email_address_not_authorized', /cannot send email/],
    ];
    for (const [code, message] of cases) {
      expect(signInErrorMessage(new ApiError('invalid_input', 'server text', code))).toMatch(message);
    }
  });

  it('falls back to the usual message', () => {
    expect(signInErrorMessage(new ApiError('network', 'fetch failed'))).toMatch(/Could not reach/);
  });
});

describe('checkUsername', () => {
  it('accepts an empty or well-formed username', () => {
    for (const ok of ['', '  ', 'ben', 'Ben.Ortiz_07', 'a'.repeat(30)]) {
      expect(checkUsername(ok)).toBeNull();
    }
  });

  it('explains a username the server would quietly replace', () => {
    for (const bad of ['ab', 'ben ortiz', 'ben@home', 'a'.repeat(31), 'bén']) {
      expect(checkUsername(bad)).toMatch(/3 to 30/);
    }
  });
});
