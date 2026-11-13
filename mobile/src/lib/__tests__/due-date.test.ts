import { describe, expect, it } from '@jest/globals';

import { dueDateFieldText, formatDueDate, parseDueDate } from '../due-date';

const today = new Date(2026, 10, 13); // Nov 13, 2026

describe('parseDueDate', () => {
  it.each([
    ['', ''],
    ['   ', ''],
    ['2026-11-23', '2026-11-23'],
    ['2026-1-5', '2026-01-05'],
    ['11/23/2026', '2026-11-23'],
    ['11/23/26', '2026-11-23'],
    ['11-23-2026', '2026-11-23'],
    ['1/12/27', '2027-01-12'],
    ['Nov 23', '2026-11-23'],
    ['nov. 23', '2026-11-23'],
    ['November 23rd', '2026-11-23'],
    ['November 23, 2027', '2027-11-23'],
    ['Sept 5', '2026-09-05'],
    [' May 1 ', '2027-05-01'],
  ])('reads %p as %p', (typed, iso) => {
    expect(parseDueDate(typed, today)).toBe(iso);
  });

  it('picks the nearest year when none is written', () => {
    expect(parseDueDate('11/23', today)).toBe('2026-11-23');
    expect(parseDueDate('1/12', today)).toBe('2027-01-12'); // next January, not last
    expect(parseDueDate('9/5', today)).toBe('2026-09-05'); // this September
    expect(parseDueDate('3/1', new Date(2027, 1, 20))).toBe('2027-03-01');
    expect(parseDueDate('12/18', new Date(2027, 0, 5))).toBe('2026-12-18');
  });

  it.each(['2/31', '2026-02-30', '13/1/2026', 'tomorrow', 'Mayhem 3', 'Nov', '23', '11/23/202', 'Novembers 3'])(
    'refuses %p',
    (typed) => {
      expect(parseDueDate(typed, today)).toBeNull();
    },
  );
});

describe('formatDueDate', () => {
  it('leaves out the year when it is this year', () => {
    expect(formatDueDate('2026-11-04', today)).toBe('Nov 4');
    expect(formatDueDate('2027-01-12', today)).toBe('Jan 12, 2027');
  });

  it('shows anything else unchanged', () => {
    expect(formatDueDate('soon', today)).toBe('soon');
  });
});

describe('dueDateFieldText', () => {
  it('can be read back by parseDueDate', () => {
    expect(dueDateFieldText('2027-01-12')).toBe('Jan 12, 2027');
    expect(parseDueDate(dueDateFieldText('2027-01-12'), today)).toBe('2027-01-12');
    expect(dueDateFieldText(null)).toBe('');
  });
});
