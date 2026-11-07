import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeCourseGrades } from '@/engine/grade-engine';
import {
  decodeEntities,
  findSameNamedCourses,
  htmlToLines,
  looksLikeHtml,
  parseReport,
  parseReportLines,
} from '@/import/report-parser';

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

const fixture = readFileSync(join(__dirname, 'fixtures', 'saved-grades-report.html'), 'utf8');

describe('htmlToLines', () => {
  it('keeps each table row on one line and drops scripts, styles and comments', () => {
    const lines = htmlToLines(fixture);
    expect(lines).toContain('AP Biology: Section 3');
    expect(lines).toContain('Unit 1 Test: Cells Due 9/18/26 11:59 pm 45 / 50');
    expect(lines.join('\n')).not.toMatch(/Quarter 9|99 \/ 100|1 \/ 2|made-up/);
  });

  it('decodes entities', () => {
    expect(decodeEntities('A &amp; B&nbsp;&#8212;&#x2013;&lt;')).toBe('A & B —–<');
    expect(decodeEntities('&bogus;')).toBe('&bogus;');
  });
});

describe('parseReport', () => {
  const { courses, assignmentCount } = parseReport(fixture, ids());

  it('finds both classes, in page order', () => {
    expect(courses.map((c) => c.name)).toEqual(['AP Biology: Section 3', 'English 11: P4']);
    expect(courses.map((c) => c.position)).toEqual([1, 2]);
    expect(assignmentCount).toBe(9);
  });

  it('recovers periods and categories with their weights', () => {
    const bio = courses[0];
    expect(bio.gradingMode).toBe('weighted');
    expect(bio.periods.map((p) => [p.name, p.weight, p.kind])).toEqual([
      ['Quarter 1', 50, 'quarter'],
      ['Quarter 2', 50, 'quarter'],
    ]);
    expect(bio.periods[0].categories.map((k) => [k.name, k.weight])).toEqual([
      ['Tests', 60],
      ['Homework', 40],
    ]);
  });

  it('reads scores, ungraded rows, excused rows and due dates', () => {
    const [tests, homework] = courses[0].periods[0].categories;
    expect(tests.assignments.map((a) => [a.title, a.actualScore, a.maxScore, a.dueDate])).toEqual([
      ['Unit 1 Test: Cells', 45, 50, '2026-09-18'],
      ['Unit 2 Test & Lab Practical', null, 50, '2026-10-09'],
    ]);
    expect(homework.assignments.map((a) => [a.title, a.actualScore, a.maxScore, a.excused, a.dueDate])).toEqual([
      ['HW 1.1', 10, 10, false, '2026-09-04'],
      ['HW 1.2', null, 10, true, null],
      ['HW 1.3', 9.5, 10, false, '2026-09-11'],
    ]);
  });

  it('puts rows without a category heading in "Assignments" and flags extra credit', () => {
    const english = courses[1];
    expect(english.gradingMode).toBe('points');
    const [only] = english.periods[0].categories;
    expect(only.name).toBe('Assignments');
    expect(only.weight).toBeNull();
    const titles = only.assignments.map((a) => a.title);
    expect(titles).toEqual(['Gatsby Essay Draft', 'Reading Quiz 3', 'Bonus: Poetry Slam']);
    expect(only.assignments[1].actualScore).toBeNull();
    expect(only.assignments[2].extraCredit).toBe(true);
  });

  it('gives grades the engine can compute and that match a hand calculation', () => {
    const bio = computeCourseGrades(courses[0]);
    // Q1: Tests 45/50 = 90%, Homework (10 + 9.5) / 20 = 97.5% → 0.6·90 + 0.4·97.5 = 93.
    // Q2 has nothing graded, so the course grade is Q1's.
    expect(bio.current.percent).toBeCloseTo(93, 5);
    // English: (44 + 3) / 50 = 94% (extra credit adds points, not possible points).
    expect(computeCourseGrades(courses[1]).current.percent).toBeCloseTo(94, 5);
  });

  it('gives every row a fresh id', () => {
    const all = courses.flatMap((c) => [
      c.id,
      ...c.periods.flatMap((p) => [p.id, ...p.categories.flatMap((k) => [k.id, ...k.assignments.map((a) => a.id)])]),
    ]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('parseReportLines', () => {
  it('treats exam periods as semester exams', () => {
    const { courses } = parseReportLines(
      [
        'Chemistry: P2',
        'Quarter 1 (40%) 90% A-',
        'Lab 1 9 / 10',
        'Quarter 2 (40%)',
        'Lab 2 8 / 10',
        'Midterm Exam (20%)',
        'Midterm 80 / 100',
      ],
      ids(),
    );
    expect(courses).toHaveLength(1);
    expect(courses[0].periods.map((p) => [p.name, p.kind])).toEqual([
      ['Quarter 1', 'quarter'],
      ['Quarter 2', 'quarter'],
      ['Midterm Exam', 'semester_exam'],
    ]);
  });

  it('drops headings that never got any assignments', () => {
    const { courses } = parseReportLines(['Grades', 'Some Club: Members', 'Quarter 1 (100%)'], ids());
    expect(courses).toEqual([]);
  });

  it('starts a new class when a titled block follows a class with periods', () => {
    const { courses } = parseReportLines(
      ['Art: P1', 'Quarter 1', 'Sketch 5 / 5', 'Music: P2', 'Quarter 1', 'Scales 4 / 5'],
      ids(),
    );
    expect(courses.map((c) => c.name)).toEqual(['Art: P1', 'Music: P2']);
  });
});

describe('rows the cloud could not store', () => {
  it('skips rows with no points possible, which cannot change a grade', () => {
    const { courses, assignmentCount } = parseReportLines(
      [
        'Chemistry: P2',
        'Quarter 1',
        'Lab 1 9 / 10',
        'Lab 2 Due 10/09/26 11:59 pm',
        'Lab 3 — / 0',
        'Lab 4 Excused',
        'Bonus 2 / 0',
      ],
      ids(),
    );
    const rows = courses[0].periods[0].categories[0].assignments;
    expect(rows.map((a) => [a.title, a.actualScore, a.maxScore, a.extraCredit])).toEqual([
      ['Lab 1', 9, 10, false],
      ['Bonus', 2, 0, true],
    ]);
    expect(assignmentCount).toBe(2);
  });

  it('drops due dates that do not exist', () => {
    const { courses } = parseReportLines(['Chemistry: P2', 'Quarter 1', 'Lab Due 2/31/26 9 / 10', 'Quiz Due 2/28/26 9 / 10'], ids());
    expect(courses[0].periods[0].categories[0].assignments.map((a) => a.dueDate)).toEqual([null, '2026-02-28']);
  });

  it('keeps names and numbers within the cloud limits', () => {
    const long = 'Word '.repeat(100).trim();
    const { courses } = parseReportLines(
      [long, `Quarter 1 (123456%)`, `${long} (50%)`, `${long} 5 / 123456789`],
      ids(),
    );
    const [course] = courses;
    const [period] = course.periods;
    const [category] = period.categories;
    expect(course.name.length).toBeLessThanOrEqual(200);
    expect(period.weight).toBeLessThanOrEqual(9999.99);
    expect(category.name.length).toBeLessThanOrEqual(100);
    expect(category.assignments[0].title.length).toBeLessThanOrEqual(300);
    expect(category.assignments[0].maxScore).toBe(999999.99);
  });
});

describe('looksLikeHtml', () => {
  it('accepts a web page and rejects other text', () => {
    expect(looksLikeHtml(fixture)).toBe(true);
    expect(looksLikeHtml('%PDF-1.7 binary')).toBe(false);
  });
});

describe('findSameNamedCourses', () => {
  it('pairs imported classes with existing ones of the same name', () => {
    expect(
      findSameNamedCourses(
        [{ name: 'AP Biology: Section 3' }, { name: 'English 11: P4' }],
        [
          { id: 'x', name: 'ap biology:  section 3' },
          { id: 'y', name: 'Art' },
        ],
      ),
    ).toEqual(['x', null]);
  });
});
