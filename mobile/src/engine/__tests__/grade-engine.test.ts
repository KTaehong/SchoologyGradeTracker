import { describe, expect, it } from '@jest/globals';

import { createSampleGradebook } from '@/data/sample-gradebook';

import {
  categoryGrade,
  computeCourseGrades,
  coursePercent,
  letterFor,
  requiredScore,
  round2,
  semesterOf,
} from '../grade-engine';
import type { GradeAssignment, GradeCategory, GradeCourse } from '../types';

function counter() {
  let n = 0;
  return () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`;
}

const { courses } = createSampleGradebook(counter(), new Date(2026, 9, 6));
const course = (name: string) => {
  const found = courses.find((c) => c.name === name);
  if (!found) throw new Error(name);
  return found;
};
const grades = (name: string) => computeCourseGrades(course(name));

function item(id: string, actual: number | null, max: number, extra: Partial<GradeAssignment> = {}): GradeAssignment {
  return {
    id,
    title: id,
    dueDate: null,
    maxScore: max,
    actualScore: actual,
    forecastScore: null,
    excused: false,
    extraCredit: false,
    isPlaceholder: false,
    position: 0,
    ...extra,
  };
}

function cat(assignments: GradeAssignment[], extra: Partial<GradeCategory> = {}): GradeCategory {
  return { id: 'c', name: 'c', weight: null, dropLowest: 0, position: 0, assignments, ...extra };
}

// The same hand-checked numbers as supabase/tests/gradebook_test.sql and grade_api_test.sql.
describe('matches the server on the sample gradebook', () => {
  it('Calc BC: current 90 A-, projected 89 B+', () => {
    const calc = grades('AP Calculus BC');
    expect(calc.current).toEqual({ percent: 90, letter: 'A-' });
    expect(calc.projected).toEqual({ percent: 89, letter: 'B+' });
  });

  it('Calc BC: Q1 Homework drops the 0, Q2 has no current grade, semester 1 projects 89', () => {
    const calc = grades('AP Calculus BC');
    expect(calc.periods.map((p) => p.name)).toEqual(['Q1', 'Q2', 'Midterm Exam']);
    const homework = calc.periods[0].categories.find((c) => c.name === 'Homework');
    expect(homework?.currentPercent).toBe(90);
    expect(calc.periods[1].currentPercent).toBeNull();
    expect(calc.semesters).toHaveLength(1);
    expect(calc.semesters[0]).toMatchObject({ label: 'Midterm', examWeight: 20, projectedPercent: 89 });
  });

  it('Calc BC: lists the ungraded work', () => {
    expect(grades('AP Calculus BC').ungraded.map((u) => u.title).sort()).toEqual([
      'Quiz 2.2',
      'Semester 1 Midterm Exam',
      'Unit 3 Test: Integrals',
    ]);
  });

  it('Physics leaves the excused lab out: 86.90 B', () => {
    expect(grades('AP Physics C: E&M').current).toEqual({ percent: 86.9, letter: 'B' });
    expect(grades('AP Physics C: E&M').ungraded).toHaveLength(0);
  });

  it('English counts extra credit: 92.22', () => {
    expect(grades('AP English Literature').current.percent).toBe(92.22);
  });

  it('Spanish is a points course: 89.74', () => {
    expect(grades('AP Spanish Language').current.percent).toBe(89.74);
  });

  it('US Gov: 89.49, and an actual grade beats its forecast', () => {
    const gov = grades('AP US Government');
    expect(gov.current.percent).toBe(89.49);
    expect(gov.projected.percent).toBe(89.49);
  });

  it('forecast changes move the projection like the server (86.25 → 87.50 → 90.50)', () => {
    const calc = structuredClone(course('AP Calculus BC'));
    const q2Quizzes = calc.periods[1].categories.find((c) => c.name === 'Quizzes')!;
    q2Quizzes.assignments.push(item('new', null, 10, { forecastScore: 8, isPlaceholder: true }));
    let g = computeCourseGrades(calc);
    expect(g.periods[1].projectedPercent).toBe(86.25);
    expect(g.semesters[0].projectedPercent).toBe(87.5);

    q2Quizzes.assignments[q2Quizzes.assignments.length - 1].forecastScore = 10;
    g = computeCourseGrades(calc);
    expect(g.periods[1].projectedPercent).toBe(93.75);
    expect(g.semesters[0].projectedPercent).toBe(90.5);
    expect(g.current.percent).toBe(90);
  });

  it('required score on the Calc midterm', () => {
    const calc = course('AP Calculus BC');
    const midterm = calc.periods[2].categories[0].assignments[0];
    expect(requiredScore(calc, midterm.id, 90)).toEqual({
      status: 'needed',
      requiredScore: 90,
      requiredPercent: 90,
    });
    expect(requiredScore(calc, midterm.id, 93)).toEqual({ status: 'not_possible' });
    expect(requiredScore(calc, midterm.id, 70)).toEqual({ status: 'already_secured' });
  });
});

describe('category rules', () => {
  it('leaves out excused and ungraded work', () => {
    const g = categoryGrade(cat([item('a', 8, 10), item('b', null, 10), item('c', 0, 10, { excused: true })]));
    expect(g).toEqual({ earned: 8, possible: 10, percent: 80 });
  });

  it('drops the lowest by percent but always keeps one', () => {
    expect(categoryGrade(cat([item('a', 5, 10), item('b', 9, 10)], { dropLowest: 1 })).percent).toBe(90);
    expect(categoryGrade(cat([item('a', 5, 10)], { dropLowest: 3 })).percent).toBe(50);
  });

  it('never drops extra credit', () => {
    const g = categoryGrade(
      cat([item('a', 5, 10), item('b', 9, 10), item('x', 2, 0, { extraCredit: true })], { dropLowest: 1 }),
    );
    expect(g).toEqual({ earned: 11, possible: 10, percent: 110 });
  });

  it('is N/A with only extra credit', () => {
    expect(categoryGrade(cat([item('x', 2, 0, { extraCredit: true })])).percent).toBeNull();
  });

  it('uses forecasts only when projecting', () => {
    const c = cat([item('a', null, 10, { forecastScore: 7 })]);
    expect(categoryGrade(c).percent).toBeNull();
    expect(categoryGrade(c, { projected: true }).percent).toBe(70);
  });
});

describe('course rules', () => {
  const twoCategories = (weights: [number | null, number | null], mode: GradeCourse['gradingMode']): GradeCourse => ({
    id: 'k',
    name: 'k',
    teacher: null,
    gradingMode: mode,
    position: 0,
    periods: [
      {
        id: 'p',
        name: 'Q1',
        kind: 'quarter',
        semester: null,
        weight: null,
        position: 0,
        categories: [
          cat([item('a', 10, 10)], { id: 'x', weight: weights[0] }),
          cat([item('b', 50, 100)], { id: 'y', weight: weights[1] }),
        ],
      },
    ],
  });

  it('weighted: normalizes over categories with a grade', () => {
    expect(coursePercent(twoCategories([75, 25], 'weighted'))).toBe(87.5);
  });

  it('weighted with no weights: categories count equally', () => {
    expect(coursePercent(twoCategories([null, null], 'weighted'))).toBe(75);
  });

  it('points: pools every point', () => {
    expect(round2(coursePercent(twoCategories([75, 25], 'points')))).toBe(54.55);
  });

  it('is N/A with nothing graded', () => {
    const empty = twoCategories([50, 50], 'weighted');
    empty.periods[0].categories.forEach((c) => (c.assignments = []));
    expect(computeCourseGrades(empty).current).toEqual({ percent: null, letter: null });
  });
});

describe('helpers', () => {
  it('letters use the rounded percent', () => {
    expect(letterFor(89.996)).toBe('A-');
    expect(letterFor(89.994)).toBe('B+');
    expect(letterFor(null)).toBeNull();
  });

  it('rounds half away from zero', () => {
    expect(round2(86.905)).toBe(86.91);
    expect(round2(1.005)).toBe(1.01);
  });

  it('infers the semester from the name', () => {
    expect(semesterOf({ semester: null, name: 'Q2' })).toBe(1);
    expect(semesterOf({ semester: null, name: 'Quarter 3' })).toBe(2);
    expect(semesterOf({ semester: null, name: 'Final Exam' })).toBe(2);
    expect(semesterOf({ semester: null, name: 'Q10' })).toBeNull();
    expect(semesterOf({ semester: 2, name: 'Q1' })).toBe(2);
  });
});
