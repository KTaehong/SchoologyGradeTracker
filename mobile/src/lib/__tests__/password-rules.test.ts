import { describe, expect, it } from '@jest/globals';

import { looksLikeEmail, passwordProblem } from '../password-rules';

describe('passwordProblem', () => {
  it('accepts a password with letters and numbers, 8 or more characters', () => {
    expect(passwordProblem('grades2026')).toBeNull();
    expect(passwordProblem('grades2026', 'grades2026')).toBeNull();
  });

  it('refuses short, long, letter-only, number-only and padded passwords', () => {
    expect(passwordProblem('abc123')).toMatch(/at least 8/);
    expect(passwordProblem(`a1${'x'.repeat(80)}`)).toMatch(/at most 72/);
    expect(passwordProblem('abcdefghij')).toMatch(/letter and one number/);
    expect(passwordProblem('1234567890')).toMatch(/letter and one number/);
    expect(passwordProblem(' grades2026')).toMatch(/space/);
  });

  it('checks the confirmation', () => {
    expect(passwordProblem('grades2026', 'grades2025')).toMatch(/do not match/);
  });
});

describe('looksLikeEmail', () => {
  it('needs a name, an @ and a domain with a dot', () => {
    expect(looksLikeEmail('sam@school.org')).toBe(true);
    expect(looksLikeEmail(' sam@school.org ')).toBe(true);
    expect(looksLikeEmail('sam@school')).toBe(false);
    expect(looksLikeEmail('sam school.org')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});
