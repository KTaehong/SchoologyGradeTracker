import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  addCourse,
  importCourses,
  insertUpcoming,
  NotFoundError,
  readCourses,
  readUpcoming,
  removeFeedItems,
  saveFeedItems,
  saveScreenshotRows,
  type FeedItemInput,
} from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';
import { FEED_UID_PREFIX } from '@/import/calendar-feed';
import { parseReportLines } from '@/import/report-parser';
import { createTestDatabase } from '@/test-support/node-sqlite';

function uuids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

let db: SqlDb;
let newId: () => string;

beforeEach(async () => {
  db = await createTestDatabase();
  newId = uuids();
});

const report = (title: string, score: string) =>
  parseReportLines([title, 'Quarter 1 (100%)', 'Tests (100%)', `Unit Test ${score}`], newId).courses;

describe('importCourses', () => {
  it('replaces one class with two imported classes of the same name', async () => {
    await importCourses(db, report('Debate', '4 / 5'), []);
    const [old] = await readCourses(db);
    const twins = [...report('Debate', '5 / 5'), ...report('Debate', '3 / 5')];
    await importCourses(db, twins, [old.id, old.id]);
    expect((await readCourses(db)).map((c) => c.name)).toEqual(['Debate', 'Debate']);
  });

  it('adds report classes after the existing ones, marked as from a report', async () => {
    await addCourse(db, newId, { name: 'Art', teacher: null, gradingMode: 'points' }, [{ name: 'Q1', kind: 'quarter' }]);
    await importCourses(db, report('Biology: P3', '45 / 50'), []);

    const courses = await readCourses(db);
    expect(courses.map((c) => [c.name, c.position])).toEqual([
      ['Art', 1],
      ['Biology: P3', 2],
    ]);
    expect(courses[1].periods[0].categories[0].assignments[0].actualScore).toBe(45);
    const sources = await db.all<{ source: string }>("select source from courses where name = 'Biology: P3'");
    expect(sources[0].source).toBe('report');
  });

  it('replaces a class when asked, leaving a tombstone to sync', async () => {
    await importCourses(db, report('Biology: P3', '40 / 50'), []);
    const [old] = await readCourses(db);
    await importCourses(db, report('Biology: P3', '48 / 50'), [old.id]);

    const courses = await readCourses(db);
    expect(courses).toHaveLength(1);
    expect(courses[0].id).not.toBe(old.id);
    expect(courses[0].position).toBe(1);
    expect(courses[0].periods[0].categories[0].assignments[0].actualScore).toBe(48);
    const tomb = await db.all<{ deleted: number }>('select deleted from courses where id = ?', [old.id]);
    expect(tomb[0].deleted).toBe(1);
  });

  it('saves nothing when a class to replace is gone', async () => {
    await expect(importCourses(db, report('Bio: P3', '1 / 2'), ['missing-id'])).rejects.toThrow(NotFoundError);
    expect(await readCourses(db)).toEqual([]);
  });
});

describe('saveFeedItems', () => {
  const item = (uid: string, title: string, dueAt: string, courseId: string | null = null): FeedItemInput => ({
    externalUid: FEED_UID_PREFIX + uid,
    title,
    dueAt,
    url: null,
    courseId,
  });

  it('adds, updates in place, and removes items to match the feed', async () => {
    const first = await saveFeedItems(
      db,
      newId,
      [item('a', 'Essay', '2026-11-10T04:59:00.000Z'), item('b', 'Quiz', '2026-11-12T13:00:00.000Z')],
      FEED_UID_PREFIX,
    );
    expect(first).toEqual({ added: 2, updated: 0, removed: 0 });
    const before = await readUpcoming(db);

    const second = await saveFeedItems(
      db,
      newId,
      [item('a', 'Essay (final)', '2026-11-10T04:59:00.000Z'), item('c', 'Lab', '2026-11-13T13:00:00.000Z')],
      FEED_UID_PREFIX,
    );
    expect(second).toEqual({ added: 1, updated: 1, removed: 1 });

    const after = await readUpcoming(db);
    expect(after.map((u) => u.title)).toEqual(['Essay (final)', 'Lab']);
    expect(after[0].id).toBe(before.find((u) => u.title === 'Essay')?.id);
  });

  it('changes nothing when the feed is the same', async () => {
    const items = [item('a', 'Essay', '2026-11-10T04:59:00.000Z')];
    await saveFeedItems(db, newId, items, FEED_UID_PREFIX);
    await db.run('update upcoming_items set dirty = 0');
    expect(await saveFeedItems(db, newId, items, FEED_UID_PREFIX)).toEqual({ added: 0, updated: 0, removed: 0 });
    const dirty = await db.all<{ n: number }>('select count(*) as n from upcoming_items where dirty > 0');
    expect(dirty[0].n).toBe(0);
  });

  it('keeps an earlier class when the new fetch could not place the item', async () => {
    const courseId = await addCourse(db, newId, { name: 'Bio', teacher: null, gradingMode: 'points' }, []);
    await saveFeedItems(db, newId, [item('a', 'Essay', '2026-11-10T04:59:00.000Z', courseId)], FEED_UID_PREFIX);
    await saveFeedItems(db, newId, [item('a', 'Essay', '2026-11-10T04:59:00.000Z', null)], FEED_UID_PREFIX);
    expect((await readUpcoming(db))[0].courseId).toBe(courseId);
  });

  it('brings back a deleted row instead of making a second one for the same item', async () => {
    await saveFeedItems(db, newId, [item('a', 'Essay', '2026-11-10T04:59:00.000Z')], FEED_UID_PREFIX);
    await saveFeedItems(db, newId, [], FEED_UID_PREFIX);
    expect(await readUpcoming(db)).toEqual([]);
    expect(await saveFeedItems(db, newId, [item('a', 'Essay', '2026-11-10T04:59:00.000Z')], FEED_UID_PREFIX)).toEqual({
      added: 1,
      updated: 0,
      removed: 0,
    });
    const rows = await db.all<{ n: number }>('select count(*) as n from upcoming_items');
    expect(rows[0].n).toBe(1);
  });

  it('drops a duplicate made by another device for the same item', async () => {
    await insertUpcoming(db, [
      { id: 'x1', title: 'Essay', courseId: null, dueAt: '2026-11-10T04:59:00.000Z', externalUid: 'ical:a' },
      { id: 'x2', title: 'Essay', courseId: null, dueAt: '2026-11-10T04:59:00.000Z', externalUid: 'ical:a' },
    ]);
    await saveFeedItems(db, newId, [item('a', 'Essay', '2026-11-10T04:59:00.000Z')], FEED_UID_PREFIX);
    expect((await readUpcoming(db)).map((u) => u.id)).toEqual(['x1']);
  });

  it('leaves items that did not come from the feed alone', async () => {
    await insertUpcoming(db, [{ id: 's1', title: 'Sample', courseId: null, dueAt: '2026-11-10T04:59:00.000Z' }]);
    await saveFeedItems(db, newId, [], FEED_UID_PREFIX);
    await removeFeedItems(db, FEED_UID_PREFIX);
    expect((await readUpcoming(db)).map((u) => u.id)).toEqual(['s1']);
  });

  it('removeFeedItems deletes every feed item', async () => {
    await saveFeedItems(db, newId, [item('a', 'Essay', '2026-11-10T04:59:00.000Z')], FEED_UID_PREFIX);
    await removeFeedItems(db, FEED_UID_PREFIX);
    expect(await readUpcoming(db)).toEqual([]);
  });
});

describe('saveScreenshotRows', () => {
  it('adds new rows and updates ones already in the category', async () => {
    await importCourses(db, report('Biology: P3', '45 / 50'), []);
    const [course] = await readCourses(db);
    const tests = course.periods[0].categories[0];

    const first = await saveScreenshotRows(db, newId, [
      { categoryId: tests.id, title: 'unit  test', dueDate: '2026-11-02', maxScore: 50, actualScore: 48, excused: false },
      { categoryId: tests.id, title: 'Unit 2 Test', dueDate: null, maxScore: 40, actualScore: null, excused: false },
    ]);
    expect(first).toEqual({ added: 1, updated: 1 });
    const again = await saveScreenshotRows(db, newId, [
      { categoryId: tests.id, title: 'Unit 2 Test', dueDate: null, maxScore: 40, actualScore: 36, excused: false },
    ]);
    expect(again).toEqual({ added: 0, updated: 1 });

    const rows = (await readCourses(db))[0].periods[0].categories[0].assignments;
    expect(rows.map((a) => [a.title, a.actualScore, a.maxScore, a.dueDate])).toEqual([
      ['Unit Test', 48, 50, '2026-11-02'],
      ['Unit 2 Test', 36, 40, null],
    ]);
  });

  it('saves nothing when a category is gone', async () => {
    await expect(
      saveScreenshotRows(db, newId, [
        { categoryId: 'missing', title: 'A', dueDate: null, maxScore: 1, actualScore: 1, excused: false },
      ]),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await readCourses(db)).toEqual([]);
  });
});
