import { describe, expect, it } from '@jest/globals';

import { createSampleGradebook } from '@/data/sample-gradebook';
import { computeCourseGrades, requiredScore } from '@/engine/grade-engine';
import type { GradeAssignment, GradeCourse } from '@/engine/types';

import { calculatorItems, describeRequired, parseTarget } from '../final-grade';

const work = (id: string, actualScore: number | null, extra: Partial<GradeAssignment> = {}): GradeAssignment => ({
  id,
  title: id,
  dueDate: null,
  maxScore: 100,
  actualScore,
  forecastScore: null,
  excused: false,
  extraCredit: false,
  isPlaceholder: false,
  position: 0,
  ...extra,
});

const course = (assignments: GradeAssignment[]): GradeCourse => ({
  id: 'c',
  name: 'Chem',
  teacher: null,
  gradingMode: 'points',
  position: 0,
  periods: [
    {
      id: 'p',
      name: 'Q1',
      kind: 'quarter',
      semester: null,
      weight: null,
      position: 0,
      categories: [{ id: 'k', name: 'All', weight: null, dropLowest: 0, position: 0, assignments }],
    },
  ],
});

const answer = (c: GradeCourse, target: number, useForecasts = false) => {
  const [item] = calculatorItems(c);
  return describeRequired(requiredScore(c, item.id, target, useForecasts), item, target);
};

describe('calculatorItems', () => {
  it('offers only ungraded work that counts, exams first and then the latest due', () => {
    const c = course([
      work('Graded', 90),
      work('Excused', null, { excused: true }),
      work('Bonus', null, { extraCredit: true }),
      work('Quiz', null, { dueDate: '2026-11-01' }),
      work('Essay', null, { dueDate: '2026-12-01' }),
      work('Final exam', null),
    ]);
    expect(calculatorItems(c).map((i) => i.title)).toEqual(['Final exam', 'Essay', 'Quiz']);
  });

  it('finds nothing when everything is graded', () => {
    expect(calculatorItems(course([work('Graded', 90)]))).toEqual([]);
  });
});

describe('the answer', () => {
  it('says the score needed, and that score really reaches the target', () => {
    const c = course([work('Test', 80), work('Final', null)]);
    expect(answer(c, 90)).toBe('You need 100 out of 100 (100%) on Final to reach 90%.');
    expect(answer(c, 85)).toBe('You need 90 out of 100 (90%) on Final to reach 85%.');
    c.periods[0].categories[0].assignments[1].actualScore = 90;
    expect(computeCourseGrades(c).current.percent).toBe(85);
  });

  it('says when it is not possible, or already reached', () => {
    const c = course([work('Test', 80), work('Final', null)]);
    expect(answer(c, 95)).toMatch(/Even full points on Final do not reach 95%/);
    expect(answer(c, 40)).toMatch(/even with a 0 on Final/);
  });

  it('can count forecasts for the other work', () => {
    const c = course([work('Final', null), work('Paper', null, { forecastScore: 100 }), work('Test', 80)]);
    expect(answer(c, 90)).toBe('You need 100 out of 100 (100%) on Final to reach 90%.');
    expect(answer(c, 90, true)).toBe('You need 90 out of 100 (90%) on Final to reach 90%.');
  });

  it('works on every item of the sample gradebook', () => {
    let n = 0;
    const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    for (const c of createSampleGradebook(id, new Date(2026, 9, 6)).courses) {
      for (const item of calculatorItems(c)) {
        const result = requiredScore(c, item.id, 90);
        expect(describeRequired(result, item, 90)).not.toBe('');
      }
    }
  });
});

describe('parseTarget', () => {
  it.each(['90', ' 90 % ', '89.5', '89,5'])('accepts %s', (text) => {
    expect(parseTarget(text).ok).toBe(true);
  });
  it.each(['', 'A', '-5', '0', '1000'])('refuses %s', (text) => {
    expect(parseTarget(text).ok).toBe(false);
  });
});
