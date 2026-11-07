import { describe, expect, it } from '@jest/globals';

import { calendarDate, clipText, fitToServer } from '../server-limits';

describe('clipText', () => {
  it('cuts long text without splitting an emoji', () => {
    expect(clipText('abc', 5)).toBe('abc');
    expect(clipText('ab😀cd', 3)).toBe('ab😀');
    expect(Array.from(clipText('😀'.repeat(250), 200))).toHaveLength(200);
  });
});

describe('calendarDate', () => {
  it('builds real dates only', () => {
    expect(calendarDate(2026, 2, 28)).toBe('2026-02-28');
    expect(calendarDate(2026, 2, 31)).toBeNull();
    expect(calendarDate(2028, 2, 29)).toBe('2028-02-29');
    expect(calendarDate(2026, 13, 1)).toBeNull();
  });
});

describe('fitToServer', () => {
  it('fixes every assignment value the server would refuse', () => {
    expect(
      fitToServer('assignments', {
        id: 'a',
        title: '  ',
        due_date: '2026-02-31',
        max_score: 0,
        actual_score: 5e9,
        forecast_score: -3,
        excused: false,
        extra_credit: false,
        is_placeholder: true,
      }),
    ).toEqual({
      id: 'a',
      title: 'Assignment',
      due_date: null,
      max_score: 0,
      actual_score: 999999.99,
      forecast_score: 0,
      excused: false,
      extra_credit: true,
      is_placeholder: false,
    });
  });

  it('leaves good rows alone', () => {
    const row = { id: 'p', course_id: 'c', name: 'Q1', kind: 'quarter', semester: 1, weight: 25, position: 1 };
    expect(fitToServer('grading_periods', row)).toEqual(row);
  });

  it('clips names and weights, and drops a bad semester', () => {
    const fitted = fitToServer('grading_periods', { name: 'x'.repeat(150), weight: 20000, semester: 3 });
    expect([(fitted.name as string).length, fitted.weight, fitted.semester]).toEqual([100, 9999.99, null]);
    expect(fitToServer('categories', { name: 'Tests', weight: null, drop_lowest: 2.7 })).toEqual({
      name: 'Tests',
      weight: null,
      drop_lowest: 2,
    });
  });
});
