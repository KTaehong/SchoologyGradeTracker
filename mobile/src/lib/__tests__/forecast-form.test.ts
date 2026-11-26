import { describe, expect, it } from '@jest/globals';

import { parseScore, validateForecastScore, validateNewForecast } from '../forecast-form';
import { formatGrade, formatPercent, formatPoints } from '../format-grade';

describe('parseScore', () => {
  it.each([
    ['8', 8],
    [' 8.5 ', 8.5],
    ['8,5', 8.5],
    ['.5', 0.5],
    ['0', 0],
    // Rounded to cents, as the cloud stores it.
    ['18.555', 18.56],
    ['33.333', 33.33],
    ['0.001', 0],
  ])('reads %p as %p', (text, value) => {
    expect(parseScore(text)).toBe(value);
  });

  it.each(['', 'abc', '-1', '8.', '1e3', '8 points'])('rejects %p', (text) => {
    expect(parseScore(text)).toBeNull();
  });
});

describe('validateForecastScore', () => {
  it('accepts a number and explains a bad one', () => {
    expect(validateForecastScore('9')).toEqual({ ok: true, value: 9 });
    expect(validateForecastScore('nine').ok).toBe(false);
  });

  it('refuses a score too large for the cloud to store', () => {
    expect(validateForecastScore('999999.99').ok).toBe(true);
    expect(validateForecastScore('1000000').ok).toBe(false);
  });
});

describe('validateNewForecast', () => {
  const form = {
    categoryId: 'cat1',
    title: '  Unit 4 Test ',
    maxScore: '100',
    forecastScore: '92',
    dueDate: '',
  };

  it('builds the request', () => {
    expect(validateNewForecast(form)).toEqual({
      ok: true,
      value: { categoryId: 'cat1', title: 'Unit 4 Test', maxScore: 100, forecastScore: 92, dueDate: null },
    });
    expect(validateNewForecast({ ...form, dueDate: '2026-11-20' })).toMatchObject({
      ok: true,
      value: { dueDate: '2026-11-20' },
    });
  });

  it.each([
    [{ categoryId: null }, 'category'],
    [{ title: '  ' }, 'name'],
    [{ maxScore: '0' }, 'Points possible'],
    [{ maxScore: 'ten' }, 'Points possible'],
    [{ forecastScore: '' }, 'points you expect'],
    [{ dueDate: 'next week' }, 'due date'],
    [{ dueDate: '2026-02-30' }, 'due date'],
    [{ title: 'x'.repeat(301) }, 'too long'],
    [{ maxScore: '1000000' }, 'too large'],
    [{ forecastScore: '1000000' }, 'too large'],
  ])('rejects %p', (change, message) => {
    const result = validateNewForecast({ ...form, ...change });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain(message);
  });
});

describe('grade formatting', () => {
  it('formats percents, letters, and points', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(89)).toBe('89.00%');
    expect(formatGrade({ percent: 89, letter: 'B+' })).toBe('89.00% · B+');
    expect(formatGrade({ percent: null, letter: null })).toBe('—');
    expect(formatPoints(8, 10)).toBe('8 / 10');
    expect(formatPoints(8.5, 10)).toBe('8.5 / 10');
  });
});

describe('a mistyped score', () => {
  it('refuses a forecast far above the points possible', () => {
    expect(validateForecastScore('1000', 10).ok).toBe(false);
    expect(validateForecastScore('12', 10)).toEqual({ ok: true, value: 12 });
    expect(validateForecastScore('20', 10).ok).toBe(true);
  });

  it('checks a new forecast against its own points possible', () => {
    const form = { categoryId: 'c1', title: 'Quiz', maxScore: '10', forecastScore: '95', dueDate: '' };
    expect(validateNewForecast(form).ok).toBe(false);
    expect(validateNewForecast({ ...form, forecastScore: '9.5' }).ok).toBe(true);
  });
});
