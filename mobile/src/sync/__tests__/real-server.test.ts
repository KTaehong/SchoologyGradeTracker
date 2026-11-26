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

import { ApiError } from '@/api/errors';
import { createGradesApi } from '@/test-support/grades-api';
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
import type { GradeCourse } from '@/engine/types';
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

/** The same "random" numbers on every run (mulberry32), so a failure can be repeated. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A course that mixes every grade rule: weights, drops, extra credit, exams, forecasts. */
function randomCourse(random: () => number, index: number): GradeCourse {
  const int = (max: number) => Math.floor(random() * (max + 1));
  const maybe = (chance: number) => random() < chance;
  const cents = (max: number) => Math.round(random() * max * 100) / 100;
  const names = ['Q1', 'Q2', 'Midterm', 'Q3', 'Q4', 'Final'];
  const weightedPeriods = maybe(0.4);
  return {
    id: randomUUID(),
    name: `Course ${index}`,
    teacher: null,
    gradingMode: maybe(0.5) ? 'weighted' : 'points',
    position: index,
    periods: names.slice(0, 1 + int(names.length - 1)).map((name, p) => ({
      id: randomUUID(),
      name,
      kind: /Midterm|Final/.test(name) ? ('semester_exam' as const) : ('quarter' as const),
      semester: maybe(0.3) ? (p < 3 ? 1 : 2) : null,
      weight: weightedPeriods && maybe(0.8) ? int(60) : null,
      position: p,
      categories: Array.from({ length: int(3) }, (_, c) => ({
        id: randomUUID(),
        name: `Category ${c}`,
        weight: maybe(0.8) ? int(100) : null,
        dropLowest: int(2),
        position: c,
        assignments: Array.from({ length: int(6) }, (_, n) => {
          const extraCredit = maybe(0.15);
          const maxScore = extraCredit && maybe(0.5) ? 0 : 1 + int(99);
          return {
            id: randomUUID(),
            title: `Work ${n}`,
            dueDate: null,
            maxScore,
            actualScore: maybe(0.7) ? cents(Math.max(maxScore, 5) * 1.1) : null,
            forecastScore: maybe(0.4) ? cents(Math.max(maxScore, 5)) : null,
            excused: maybe(0.1),
            extraCredit,
            isPlaceholder: false,
            position: n,
          };
        }),
      })),
    })),
  };
}

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

  it('agrees with the server on random gradebooks', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const random = seededRandom(20261123);
    const books = Array.from({ length: 40 }, (_, i) => randomCourse(random, i));
    await insertCourses(a.db, books, 'manual');
    await a.sync();

    const snapshot = await createGradesApi(server.caller(student)).getGrades();
    const byId = new Map(snapshot.courses.map((c) => [c.courseId, c]));
    for (const course of await readCourses(a.db)) {
      const { ungraded: _phoneUngraded, ...phoneGrades } = computeCourseGrades(course);
      const { ungraded: _cloudUngraded, ...cloudGrades } = byId.get(course.id)!;
      expect(cloudGrades).toEqual(phoneGrades);
    }
  });

  it('keeps a whole class when one phone edits it and the other deletes it', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const b = await phone(student);
    await insertCourses(a.db, createSampleGradebook(randomUUID, new Date(2026, 9, 6)).courses, 'manual');
    await a.sync();
    await b.sync();
    const before = await grades(b.db);
    const course = (await readCourses(b.db))[0];
    const item = course.periods[0].categories[0].assignments[0];
    await updateAssignment(b.db, item.id, { ...item, title: 'Regraded' });
    await deleteCourse(a.db, course.id);
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();
    expect(await grades(a.db)).toEqual(before);
    expect(await grades(b.db)).toEqual(before);
  });

  it('keeps a whole class also when the edit reaches the cloud before the delete', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const b = await phone(student);
    await insertCourses(a.db, createSampleGradebook(randomUUID, new Date(2026, 9, 6)).courses, 'manual');
    await a.sync();
    await b.sync();
    const course = (await readCourses(b.db))[0];
    const item = course.periods[0].categories[0].assignments[0];
    // Both offline: B regrades an assignment, A deletes the class. B syncs first.
    await updateAssignment(b.db, item.id, { ...item, title: 'Regraded' });
    await deleteCourse(a.db, course.id);
    await b.sync();
    await a.sync();
    await b.sync();
    await a.sync();
    for (const db of [a.db, b.db]) {
      const kept = (await readCourses(db)).find((c) => c.id === course.id);
      expect(kept?.periods[0].categories[0].assignments[0].title).toBe('Regraded');
      expect(kept?.periods.flatMap((p) => p.categories.flatMap((c) => c.assignments))).toHaveLength(
        course.periods.flatMap((p) => p.categories.flatMap((c) => c.assignments)).length,
      );
    }
  });

  it('does not let a push that timed out overwrite a newer edit when it arrives late', async () => {
    const student = await newStudent();
    const db = await createTestDatabase();
    const real = server.transport(student);
    let held: Parameters<typeof real.push> | null = null;
    let holdNext = false;
    // A held push "times out": the phone gives up, but the request is still on its way.
    const transport = {
      pull: real.pull,
      push: async (...args: Parameters<typeof real.push>) => {
        if (holdNext) {
          holdNext = false;
          held = args;
          throw new ApiError('network', 'The server took too long to answer.');
        }
        return real.push(...args);
      },
    };
    const engine = new SyncEngine({ db, transport });
    await attachAccount(db, student);
    await insertCourses(db, createSampleGradebook(randomUUID, new Date(2026, 9, 6)).courses, 'manual');
    await engine.sync();
    const item = (await readCourses(db))[0].periods[0].categories[0].assignments[0];

    await updateAssignment(db, item.id, { ...item, actualScore: 80 });
    holdNext = true;
    await engine.sync(); // times out
    await updateAssignment(db, item.id, { ...item, actualScore: 90 });
    await engine.sync(); // the newer edit reaches the cloud
    expect(held).not.toBeNull();
    const late = await real.push(...held!); // the old request arrives after all
    expect(late.conflicts).toEqual([{ table_name: 'assignments', row_id: item.id }]);
    await engine.sync();

    const score = async () =>
      (await readCourses(db))[0].periods[0].categories[0].assignments.find((a) => a.id === item.id)?.actualScore;
    expect(await score()).toBe(90);
    expect(
      await server.query('select actual_score::float as s from public.assignments where id = $1', [item.id]),
    ).toEqual([{ s: 90 }]);
  });

  it('does not let a late class delete remove an edit made inside the class meanwhile', async () => {
    const student = await newStudent();
    const b = await phone(student);
    const db = await createTestDatabase();
    const real = server.transport(student);
    let held: Parameters<typeof real.push> | null = null;
    let holdNext = false;
    const engine = new SyncEngine({
      db,
      transport: {
        pull: real.pull,
        push: async (...args: Parameters<typeof real.push>) => {
          if (holdNext) {
            holdNext = false;
            held = args;
            throw new ApiError('network', 'The server took too long to answer.');
          }
          return real.push(...args);
        },
      },
    });
    await attachAccount(db, student);
    await insertCourses(db, createSampleGradebook(randomUUID, new Date(2026, 9, 6)).courses, 'manual');
    await engine.sync();
    await b.sync();
    const course = (await readCourses(b.db))[0];
    const item = course.periods[0].categories[0].assignments[0];

    await deleteCourse(db, course.id);
    holdNext = true;
    await engine.sync(); // the delete times out, but is on its way
    await updateAssignment(b.db, item.id, { ...item, title: 'Regraded' });
    await b.sync(); // the edit reaches the cloud first
    const late = await real.push(...held!);
    expect(late.conflicts).toContainEqual({ table_name: 'courses', row_id: course.id });
    await engine.sync();
    await b.sync();

    const count = (c: { periods: { categories: { assignments: unknown[] }[] }[] } | undefined) =>
      c?.periods.flatMap((p) => p.categories.flatMap((k) => k.assignments)).length;
    for (const phoneDb of [db, b.db]) {
      const kept = (await readCourses(phoneDb)).find((c) => c.id === course.id);
      expect(kept?.periods[0].categories[0].assignments[0].title).toBe('Regraded');
      // The whole class, not just the edited part.
      expect(count(kept)).toBe(count(course));
    }
    expect(
      await server.query(
        `select count(*)::int as n from public.assignments a
           join public.categories k on k.id = a.category_id
           join public.grading_periods p on p.id = k.period_id
          where p.course_id = $1`,
        [course.id],
      ),
    ).toEqual([{ n: count(course) }]);
  });

  it('sends a row again when another phone changed it between this pull and push', async () => {
    const student = await newStudent();
    const a = await phone(student);
    const b = await phone(student);
    await insertCourses(a.db, createSampleGradebook(randomUUID, new Date(2026, 9, 6)).courses, 'manual');
    await a.sync();
    await b.sync();
    const item = (await readCourses(a.db))[0].periods[0].categories[0].assignments[0];
    await updateAssignment(a.db, item.id, { ...item, actualScore: 70 });
    await updateAssignment(b.db, item.id, { ...item, actualScore: 75 });

    // B's push lands right after A's pull.
    const real = server.transport(student);
    let raced = false;
    const engine = new SyncEngine({
      db: a.db,
      transport: {
        pull: async (since) => {
          const result = await real.pull(since);
          if (!raced) {
            raced = true;
            await b.sync();
          }
          return result;
        },
        push: real.push,
      },
    });
    await engine.sync();
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0, error: null });
    await b.sync();
    // A synced last, so A's score wins on both phones and in the cloud.
    for (const db of [a.db, b.db]) {
      expect(
        (await readCourses(db))[0].periods[0].categories[0].assignments.find((x) => x.id === item.id)?.actualScore,
      ).toBe(70);
    }
  });

  it('lets a phone delete a class it edited itself before', async () => {
    // The phone's own pushed edit comes back in its next pull; that is not
    // someone else's edit, so it must not undo the delete.
    const student = await newStudent();
    const a = await phone(student);
    await insertCourses(a.db, createSampleGradebook(randomUUID, new Date(2026, 9, 6)).courses, 'manual');
    await a.sync();
    const course = (await readCourses(a.db))[0];
    const item = course.periods[0].categories[0].assignments[0];
    await updateAssignment(a.db, item.id, { ...item, title: 'Regraded' });
    await a.sync();
    await deleteCourse(a.db, course.id);
    await a.sync();
    await a.sync();
    expect((await readCourses(a.db)).some((c) => c.id === course.id)).toBe(false);
    expect(await server.query('select count(*)::int as n from public.courses where id = $1', [course.id])).toEqual([{ n: 0 }]);
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

  it('keeps syncing when points possible is too small for the server (0.001)', async () => {
    // The server stores two decimals: 0.001 became 0.00 and broke its check, so
    // every later push from this phone failed.
    const student = await newStudent();
    const a = await phone(student);
    const [course, period, category] = [randomUUID(), randomUUID(), randomUUID()];
    await a.db.run(`insert into courses (id, name, grading_mode, position, source, dirty) values (?, 'Art', 'points', 1, 'manual', 1)`, [
      course,
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
      `insert into assignments (id, category_id, title, max_score, actual_score, position, dirty)
       values (?, ?, 'Tiny', 0.001, null, 1, 1), (?, ?, 'Normal', 10, 9, 2, 1)`,
      [randomUUID(), category, randomUUID(), category],
    );
    await a.sync();
    expect(
      await server.query(
        'select title, max_score::float8 as max, extra_credit from public.assignments where student_id = $1 order by position',
        [student],
      ),
    ).toEqual([
      { title: 'Tiny', max: 0, extra_credit: true },
      { title: 'Normal', max: 10, extra_credit: false },
    ]);
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
