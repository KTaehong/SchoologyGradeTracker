import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  addAssignment,
  addCategory,
  addCourse,
  addForecast,
  deleteAssignment,
  deleteCategory,
  deleteCourse,
  insertUpcoming,
  NotFoundError,
  readCourses,
  readUpcoming,
  updateAssignment,
  updateCategory,
  updateCourse,
  type AssignmentFields,
} from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import { PERIOD_PRESETS } from '@/lib/gradebook-form';
import { createTestDatabase } from '@/test-support/node-sqlite';

function uuids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

const graded = (title: string, actualScore: number | null, maxScore: number): AssignmentFields => ({
  title,
  dueDate: null,
  maxScore,
  actualScore,
  excused: false,
  extraCredit: false,
});

const dirtyCount = async (db: SqlDb, table: string) =>
  (await db.all<{ n: number }>(`select count(*) as n from ${table} where dirty > 0`))[0].n;

describe('manual entry (F06)', () => {
  let db: SqlDb;
  let newId: () => string;

  beforeEach(async () => {
    db = await createTestDatabase();
    newId = uuids();
  });

  async function biology() {
    const courseId = await addCourse(
      db,
      newId,
      { name: 'AP Biology', teacher: 'Ms. Rivera', gradingMode: 'weighted' },
      PERIOD_PRESETS[1].periods,
    );
    const [course] = await readCourses(db);
    const q1 = course.periods[0].id;
    const tests = newId();
    const homework = newId();
    await addCategory(db, tests, q1, { name: 'Tests', weight: 60, dropLowest: 0 });
    await addCategory(db, homework, q1, { name: 'Homework', weight: 40, dropLowest: 1 });
    return { courseId, q1, tests, homework };
  }

  it('builds a full class from zero and grades it', async () => {
    const { tests, homework } = await biology();
    await addAssignment(db, newId(), tests, graded('Unit 1 Test', 45, 50)); // 90%
    await addAssignment(db, newId(), homework, graded('HW 1', 10, 10)); // 100%
    await addAssignment(db, newId(), homework, graded('HW 2', 5, 10)); // 50%, dropped
    await addAssignment(db, newId(), homework, graded('HW 3', 8, 10)); // 80%

    const [course] = await readCourses(db);
    expect(course).toMatchObject({ name: 'AP Biology', teacher: 'Ms. Rivera', gradingMode: 'weighted' });
    expect(course.periods.map((p) => p.name)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(course.periods[0].categories.map((c) => c.name)).toEqual(['Tests', 'Homework']);
    expect(course.periods[0].categories[1].assignments.map((a) => a.title)).toEqual(['HW 1', 'HW 2', 'HW 3']);

    // Tests 90% × 60 + Homework (100 + 80) / 2 = 90% × 40 → 90%.
    const grades = computeCourseGrades(course);
    expect(grades.periods[0].currentPercent).toBe(90);
    expect(grades.current.percent).toBe(90);
  });

  it('marks every new row to sync, with the source "manual"', async () => {
    await biology();
    expect(await dirtyCount(db, 'courses')).toBe(1);
    expect(await dirtyCount(db, 'grading_periods')).toBe(4);
    expect(await dirtyCount(db, 'categories')).toBe(2);
    const [row] = await db.all<{ source: string }>('select source from courses');
    expect(row.source).toBe('manual');
  });

  it('creates exam periods that the engine places in a semester', async () => {
    await addCourse(db, newId, { name: 'Chem', teacher: null, gradingMode: 'points' }, PERIOD_PRESETS[2].periods);
    const [course] = await readCourses(db);
    expect(course.periods.map((p) => `${p.name}:${p.kind}`)).toEqual([
      'Q1:quarter',
      'Q2:quarter',
      'Midterm:semester_exam',
      'Q3:quarter',
      'Q4:quarter',
      'Final:semester_exam',
    ]);
  });

  it('edits a class, and the grade follows the new grading mode', async () => {
    const { courseId, tests, homework } = await biology();
    await addAssignment(db, newId(), tests, graded('Test', 45, 50)); // 45/50
    await addAssignment(db, newId(), homework, graded('HW', 10, 10)); // 10/10

    await updateCourse(db, courseId, { name: 'AP Bio', teacher: null, gradingMode: 'points' });
    const [course] = await readCourses(db);
    expect(course).toMatchObject({ name: 'AP Bio', teacher: null, gradingMode: 'points' });
    // Points: 55 / 60.
    expect(computeCourseGrades(course).current.percent).toBe(91.67);
  });

  it('edits and deletes a category, taking its assignments with it', async () => {
    const { tests, homework } = await biology();
    const hw = newId();
    await addAssignment(db, hw, homework, graded('HW', 10, 10));

    await updateCategory(db, tests, { name: 'Exams', weight: 70, dropLowest: 0 });
    let [course] = await readCourses(db);
    expect(course.periods[0].categories[0]).toMatchObject({ name: 'Exams', weight: 70 });

    await deleteCategory(db, homework);
    [course] = await readCourses(db);
    expect(course.periods[0].categories.map((c) => c.name)).toEqual(['Exams']);
    const rows = await db.all<{ deleted: number }>('select deleted from assignments where id = ?', [hw]);
    expect(rows).toEqual([{ deleted: 1 }]);
  });

  it('edits an assignment: score, excused and extra credit', async () => {
    const { tests } = await biology();
    const id = newId();
    await addAssignment(db, id, tests, graded('Quiz', null, 20));

    await updateAssignment(db, id, { ...graded('Quiz 1', 18, 20), dueDate: '2026-10-20', extraCredit: true });
    let [course] = await readCourses(db);
    expect(course.periods[0].categories[0].assignments[0]).toMatchObject({
      title: 'Quiz 1',
      actualScore: 18,
      dueDate: '2026-10-20',
      extraCredit: true,
      excused: false,
    });

    await updateAssignment(db, id, { ...graded('Quiz 1', 18, 20), excused: true });
    [course] = await readCourses(db);
    expect(course.periods[0].categories[0].assignments[0].excused).toBe(true);
    expect(computeCourseGrades(course).current.percent).toBeNull();
  });

  it('turns a forecast-only item into a real assignment once it has a score', async () => {
    const { tests } = await biology();
    const id = newId();
    await addForecast(db, id, { categoryId: tests, title: 'Unit 2 Test', maxScore: 50, forecastScore: 40 });

    await updateAssignment(db, id, graded('Unit 2 Test', null, 50));
    let [course] = await readCourses(db);
    expect(course.periods[0].categories[0].assignments[0].isPlaceholder).toBe(true);

    await updateAssignment(db, id, graded('Unit 2 Test', 44, 50));
    [course] = await readCourses(db);
    expect(course.periods[0].categories[0].assignments[0]).toMatchObject({
      isPlaceholder: false,
      actualScore: 44,
      forecastScore: 40,
    });
  });

  it('deletes an assignment', async () => {
    const { tests } = await biology();
    const id = newId();
    await addAssignment(db, id, tests, graded('Quiz', 9, 10));
    await deleteAssignment(db, id);
    const [course] = await readCourses(db);
    expect(course.periods[0].categories[0].assignments).toEqual([]);
    await expect(deleteAssignment(db, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a whole class, leaving its upcoming items unfiled', async () => {
    const { courseId, tests } = await biology();
    await addAssignment(db, newId(), tests, graded('Quiz', 9, 10));
    await insertUpcoming(db, [{ id: newId(), title: 'Lab report', courseId, dueAt: '2026-10-20T23:59:00Z' }]);

    await deleteCourse(db, courseId);
    expect(await readCourses(db)).toEqual([]);
    expect((await readUpcoming(db))[0].courseId).toBeNull();
    // Tombstones for every row, so the delete reaches the cloud.
    for (const table of ['courses', 'grading_periods', 'categories', 'assignments']) {
      const live = await db.all(`select id from ${table} where deleted = 0`);
      expect(live).toEqual([]);
    }
    await expect(updateCourse(db, courseId, { name: 'x', teacher: null, gradingMode: 'points' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses to add to something that was deleted', async () => {
    const { q1, homework } = await biology();
    await deleteCategory(db, homework);
    await expect(addAssignment(db, newId(), homework, graded('HW', 1, 1))).rejects.toBeInstanceOf(NotFoundError);
    await expect(addCategory(db, newId(), 'missing', { name: 'X', weight: null, dropLowest: 0 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(q1).toBeTruthy();
  });

  it('puts new rows after the existing ones', async () => {
    const { tests } = await biology();
    await addAssignment(db, newId(), tests, graded('B first', 1, 1));
    await addAssignment(db, newId(), tests, graded('A second', 1, 1));
    const [course] = await readCourses(db);
    expect(course.periods[0].categories[0].assignments.map((a) => a.title)).toEqual(['B first', 'A second']);
  });
});
