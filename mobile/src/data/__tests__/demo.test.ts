import { describe, expect, it } from '@jest/globals';
import { createDemoGradebook } from '../demo';
import { isGradebook } from '../storage';

const NOW = new Date(2026, 8, 24, 10, 0, 0); // Thu Sep 24 2026, 10:00 local

describe('createDemoGradebook', () => {
  const gradebook = createDemoGradebook(NOW);

  it('is a valid gradebook with courses and upcoming items', () => {
    expect(isGradebook(gradebook)).toBe(true);
    expect(gradebook.courses.length).toBeGreaterThanOrEqual(4);
    expect(gradebook.upcoming.length).toBeGreaterThanOrEqual(5);
  });

  it('uses unique ids everywhere', () => {
    const ids: string[] = [];
    for (const course of gradebook.courses) {
      ids.push(course.id);
      for (const period of course.periods) {
        ids.push(period.id);
        for (const category of period.categories) {
          ids.push(category.id);
          ids.push(...category.assignments.map((a) => a.id));
        }
      }
    }
    ids.push(...gradebook.upcoming.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives weighted courses category weights that add up to 100 in every period', () => {
    for (const course of gradebook.courses.filter((c) => c.gradingMode === 'weighted')) {
      for (const period of course.periods) {
        const total = period.categories.reduce((sum, c) => sum + (c.weight ?? 0), 0);
        expect({ course: course.id, period: period.name, total }).toEqual({
          course: course.id,
          period: period.name,
          total: 100,
        });
      }
    }
  });

  it('leaves category weights empty in points-based courses', () => {
    const pointsCourses = gradebook.courses.filter((c) => c.gradingMode === 'points');
    expect(pointsCourses.length).toBeGreaterThan(0);
    for (const course of pointsCourses) {
      for (const period of course.periods) {
        for (const category of period.categories) {
          expect(category.weight).toBeNull();
        }
      }
    }
  });

  it('includes the edge cases the grade engine must handle', () => {
    const all = gradebook.courses.flatMap((c) =>
      c.periods.flatMap((p) => p.categories.flatMap((cat) => cat.assignments)),
    );
    expect(all.some((a) => a.excused)).toBe(true);
    expect(all.some((a) => a.extraCredit)).toBe(true);
    expect(all.some((a) => a.score === null)).toBe(true);
    expect(
      gradebook.courses.some((c) =>
        c.periods.some((p) => p.categories.some((cat) => (cat.dropLowest ?? 0) > 0)),
      ),
    ).toBe(true);
  });

  it('dates graded work in the past and upcoming items in the future', () => {
    const today = '2026-09-24';
    for (const course of gradebook.courses) {
      for (const period of course.periods) {
        for (const category of period.categories) {
          for (const assignment of category.assignments) {
            expect(assignment.dueDate! <= today).toBe(true);
          }
        }
      }
    }
    for (const item of gradebook.upcoming) {
      expect(new Date(item.dueAt).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('links every upcoming item to a real course or to none', () => {
    const courseIds = new Set(gradebook.courses.map((c) => c.id));
    for (const item of gradebook.upcoming) {
      expect(item.courseId === null || courseIds.has(item.courseId)).toBe(true);
    }
  });
});
