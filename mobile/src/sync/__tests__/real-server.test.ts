/**
 * Sync against the real cloud database (every Supabase migration, run in
 * PGlite). These tests catch what FakeSyncServer cannot: a row the phone
 * accepts but a server CHECK constraint or column type refuses would make
 * every later push fail, so the student's changes would never reach the cloud.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createGradesApi } from '@/api/grades';
import { createSampleGradebook } from '@/data/sample-gradebook';
import {
  addAssignment,
  addCategory,
  addCourse,
  addForecast,
  deleteCourse,
  importCourses,
  insertCourses,
  insertUpcoming,
  readCourses,
  readUpcoming,
  saveFeedItems,
  saveScreenshotRows,
  setForecast,
  updateAssignment,
} from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import { FEED_UID_PREFIX } from '@/import/calendar-feed';
import { parseReport, parseReportLines } from '@/import/report-parser';
import { RealSyncServer } from '@/test-support/real-sync-server';
import { createTestDatabase } from '@/test-support/node-sqlite';

import { attachAccount } from '../account';
import { SyncEngine, type SyncStatus } from '../sync-engine';

// PGlite needs Node's --experimental-vm-modules, which breaks other suites,
// so these run on their own: `npm run test:cloud` (part of `npm test`).
const cloud = process.execArgv.some((arg) => arg.includes('experimental-vm-modules'));
const describeCloud = cloud ? describe : describe.skip;

let server: RealSyncServer;

beforeAll(async () => {
  if (cloud) server = await RealSyncServer.start();
}, 60_000);

afterAll(async () => {
  await server?.close();
});

let accounts = 0;
async function newStudent(): Promise<string> {
  const id = randomUUID();
  await server.addStudent(id, `student_${++accounts}`);
  return id;
}

async function phone(studentId: string) {
  const db = await createTestDatabase();
  let last: SyncStatus | null = null;
  const engine = new SyncEngine({
    db,
    transport: server.transport(studentId),
    onStatus: (s) => {
      last = s;
    },
  });
  await attachAccount(db, studentId);
  return {
    db,
    engine,
    /** Syncs and fails the test if the server refused anything. */
    async sync() {
      await engine.sync();
      const status = last as SyncStatus | null;
      expect(status?.error ?? null).toBeNull();
      expect(status?.state).toBe('idle');
      expect(status?.pending).toBe(0);
    },
  };
}

const grades = async (db: SqlDb) =>
  (await readCourses(db)).map((c) => {
    const g = computeCourseGrades(c);
    return [c.name, g.current.percent, g.projected.percent];
  });

const fixture = readFileSync(join(__dirname, '..', '..', 'import', '__tests__', 'fixtures', 'saved-grades-report.html'), 'utf8');

describeCloud('sync with the real server', () => {
  it('sends the sample gradebook to a second phone with the same grades the server computes', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const sample = createSampleGradebook(randomUUID, new Date(2026, 9, 6));
    await insertCourses(a.db, sample.courses, 'manual');
    await insertUpcoming(a.db, sample.upcoming);
    await a.sync();

    const b = await phone(student);
    await b.sync();
    expect(await grades(b.db)).toEqual(await grades(a.db));
    expect((await readUpcoming(b.db)).length).toBe(sample.upcoming.length);

    // The server's own grade engine agrees with the phone's.
    const snapshot = await createGradesApi(server.caller(student)).getGrades();
    const byId = new Map(snapshot.courses.map((c) => [c.courseId, c]));
    for (const course of await readCourses(a.db)) {
      const phoneGrades = computeCourseGrades(course);
      const cloud = byId.get(course.id)!;
      expect([course.name, cloud.current, cloud.projected]).toEqual([
        course.name,
        phoneGrades.current,
        phoneGrades.projected,
      ]);
      expect(cloud.semesters).toEqual(phoneGrades.semesters);
    }
  });

  it('syncs a saved-report import', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const report = parseReport(fixture, randomUUID);
    await importCourses(a.db, report.courses, []);
    await a.sync();

    const b = await phone(student);
    await b.sync();
    expect(await grades(b.db)).toEqual(await grades(a.db));
  });

  it('syncs a report row that has a due date but no score', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const { courses } = parseReportLines(
      ['Chemistry: P2', 'Quarter 1', 'Tests (60%)', 'Unit 1 Test 45 / 50', 'Unit 2 Test Due 10/09/26 11:59 pm'],
      randomUUID,
    );
    await importCourses(a.db, courses, []);
    await a.sync();
    expect(await server.query('select title from public.assignments')).toEqual(
      expect.arrayContaining([{ title: 'Unit 1 Test' }]),
    );
  });

  it('syncs a report row with an impossible date (February 31)', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const { courses } = parseReportLines(['Chemistry: P2', 'Quarter 1', 'Lab 1 Due 2/31/26 9 / 10'], randomUUID);
    expect(courses[0].periods[0].categories[0].assignments[0].dueDate).toBeNull();
    await importCourses(a.db, courses, []);
    await a.sync();
  });

  it('syncs report names longer than the server allows', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const long = 'Very long words '.repeat(30).trim();
    const { courses } = parseReportLines(
      [long, `Quarter 1 ${long}`, `${long} (50%)`, `${long} 9 / 10`],
      randomUUID,
    );
    await importCourses(a.db, courses, []);
    await a.sync();
  });

  it('syncs a report score too large for the server', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const { courses } = parseReportLines(['Chemistry: P2', 'Quarter 1', 'Lab 1 5 / 123456789'], randomUUID);
    await importCourses(a.db, courses, []);
    await a.sync();
  });

  it('unsticks rows an older version saved that the server refuses', async () => {
    // Before the fix, importing a report could save these; every push then failed.
    const student = await newStudent();
    const a = await phone(student);
    const [course, period, category] = [randomUUID(), randomUUID(), randomUUID()];
    await a.db.run(`insert into courses (id, name, grading_mode, position, source, dirty) values (?, ?, 'points', 1, 'report', 1)`, [
      course,
      'C'.repeat(500),
    ]);
    await a.db.run(`insert into grading_periods (id, course_id, name, kind, position, dirty) values (?, ?, 'Q1', 'quarter', 1, 1)`, [
      period,
      course,
    ]);
    await a.db.run(`insert into categories (id, period_id, name, position, dirty) values (?, ?, 'All', 1, 1)`, [
      category,
      period,
    ]);
    await a.db.run(
      `insert into assignments (id, category_id, title, due_date, max_score, actual_score, position, dirty)
       values (?, ?, 'Due only', '2026-02-31', 0, null, 1, 1), (?, ?, 'Huge', null, 123456789, 5, 2, 1)`,
      [randomUUID(), category, randomUUID(), category],
    );
    await a.sync();
    expect(await server.query('select count(*)::int as n from public.assignments where student_id = $1', [student])).toEqual([
      { n: 2 },
    ]);
    // The cloud's version comes back, so the phone and the cloud agree.
    await a.sync();
    expect((await readCourses(a.db))[0].name).toHaveLength(200);
  });

  it('syncs manual entry, forecasts, edits and deletes between two phones', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const b = await phone(student);

    const courseId = await addCourse(a.db, randomUUID, { name: 'Physics', teacher: null, gradingMode: 'weighted' }, [
      { name: 'Q1', kind: 'quarter' },
      { name: 'Midterm', kind: 'semester_exam' },
    ]);
    const [q1] = (await readCourses(a.db))[0].periods;
    const tests = randomUUID();
    await addCategory(a.db, tests, q1.id, { name: 'Tests', weight: 70, dropLowest: 0 });
    const labs = randomUUID();
    await addCategory(a.db, labs, q1.id, { name: 'Labs', weight: 30, dropLowest: 1 });
    const test1 = randomUUID();
    await addAssignment(a.db, test1, tests, {
      title: 'Test 1',
      dueDate: '2026-10-01',
      maxScore: 100,
      actualScore: 88,
      excused: false,
      extraCredit: false,
    });
    await addAssignment(a.db, randomUUID(), labs, {
      title: 'Bonus lab',
      dueDate: null,
      maxScore: 0,
      actualScore: 2,
      excused: false,
      extraCredit: true,
    });
    await addAssignment(a.db, randomUUID(), labs, {
      title: 'Lab 1',
      dueDate: null,
      maxScore: 10,
      actualScore: null,
      excused: true,
      extraCredit: false,
    });
    await addForecast(a.db, randomUUID(), {
      categoryId: tests,
      title: 'Test 2',
      maxScore: 100,
      forecastScore: 95,
      dueDate: null,
    });
    await a.sync();
    await b.sync();
    expect(await grades(b.db)).toEqual(await grades(a.db));

    // Phone B grades the test; phone A sees it.
    await updateAssignment(b.db, test1, {
      title: 'Test 1',
      dueDate: '2026-10-01',
      maxScore: 100,
      actualScore: 91,
      excused: false,
      extraCredit: false,
    });
    await setForecast(b.db, test1, 99);
    await b.sync();
    await a.sync();
    expect(await grades(a.db)).toEqual(await grades(b.db));

    // Phone A deletes the class; it is gone everywhere.
    await deleteCourse(a.db, courseId);
    await a.sync();
    await b.sync();
    expect(await readCourses(b.db)).toEqual([]);
    expect(await server.query('select id from public.courses where student_id = $1', [student])).toEqual([]);
  });

  it('syncs calendar feed items and keeps one copy when two phones fetch the same event', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const b = await phone(student);
    const items = [
      { externalUid: `${FEED_UID_PREFIX}abc`, title: 'Essay', dueAt: '2026-11-10T04:59:00.000Z', url: null, courseId: null },
    ];
    await saveFeedItems(a.db, randomUUID, items, FEED_UID_PREFIX);
    await saveFeedItems(b.db, randomUUID, items, FEED_UID_PREFIX);
    await a.sync();
    await b.sync();
    await a.sync();
    expect((await readUpcoming(a.db)).map((u) => u.title)).toEqual(['Essay']);
    expect((await readUpcoming(b.db)).map((u) => u.title)).toEqual(['Essay']);
  });

  it('syncs assignments saved from a screenshot', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const sample = createSampleGradebook(randomUUID, new Date(2026, 9, 6));
    await insertCourses(a.db, sample.courses, 'manual');
    const category = sample.courses[0].periods[0].categories[0];
    await saveScreenshotRows(a.db, randomUUID, [
      { categoryId: category.id, title: 'Unit 1 Test: Limits', dueDate: null, maxScore: 100, actualScore: 95, excused: false },
      { categoryId: category.id, title: 'Pop quiz', dueDate: '2026-11-03', maxScore: 5, actualScore: null, excused: true },
    ]);
    await a.sync();
    const b = await phone(student);
    await b.sync();
    expect(await grades(b.db)).toEqual(await grades(a.db));
  });

  it('deletes an account and everything in it', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const sample = createSampleGradebook(randomUUID, new Date(2026, 9, 6));
    await insertCourses(a.db, sample.courses, 'manual');
    await insertUpcoming(a.db, sample.upcoming);
    await saveFeedItems(a.db, randomUUID, [
      { externalUid: `${FEED_UID_PREFIX}x`, title: 'Essay', dueAt: '2026-11-10T04:59:00.000Z', url: null, courseId: sample.courses[0].id },
    ], FEED_UID_PREFIX);
    await a.sync();

    await server.rpc(student, 'delete_my_account');
    for (const table of ['profiles', 'courses', 'assignments', 'upcoming_items', 'sync_state']) {
      const column = table === 'profiles' ? 'id' : 'student_id';
      expect(await server.query(`select count(*)::int as n from public.${table} where ${column} = $1`, [student])).toEqual([
        { n: 0 },
      ]);
    }
  });

  it('keeps one student out of another student’s gradebook', async () => {
    const ana = await newStudent();
    const ben = await newStudent();
    const a = await phone(ana);
    await insertCourses(a.db, createSampleGradebook(randomUUID).courses, 'manual');
    await a.sync();
    const b = await phone(ben);
    await b.sync();
    expect(await readCourses(b.db)).toEqual([]);
  });
});
