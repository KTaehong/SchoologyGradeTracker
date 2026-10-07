import { describe, expect, it } from '@jest/globals';

import { firstName, greeting } from '../greeting';

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(new Date(2026, 9, 6, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 6, 13))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 6, 21))).toBe('Good evening');
  });
});

describe('firstName', () => {
  it('takes the first word of full_name or name', () => {
    expect(firstName({ full_name: '  Ana  Park ' })).toBe('Ana');
    expect(firstName({ name: 'Ben Ortiz' })).toBe('Ben');
  });

  it('is null when there is no name', () => {
    expect(firstName(undefined)).toBeNull();
    expect(firstName({ full_name: '   ' })).toBeNull();
    expect(firstName({ full_name: 42 })).toBeNull();
  });
});
