import { beforeEach, describe, expect, it } from '@jest/globals';

import { createSampleGradebook } from '@/data/sample-gradebook';
import {
  addAssignment,
  addCategory,
  addCourse,
  addForecast,
  countPendingChanges,
  deleteCourse,
  eraseGradebook,
  getMeta,
  insertCourses,
  insertUpcoming,
  readCourses,
  readUpcoming,
  removeForecast,
  setForecast,
  updateAssignment,
  updateCourse,
} from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import { FakeSyncServer } from '@/test-support/fake-sync-server';
import { createTestDatabase } from '@/test-support/node-sqlite';

import { AccountSwitchCancelled, attachAccount, detachAccount } from '../account';
import { ACCOUNT_KEY, CURSOR_KEY, SyncEngine, type SyncStatus, type SyncTransport } from '../sync-engine';

function uuids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

async function device(server: FakeSyncServer) {
  const db = await createTestDatabase();
  const statuses: SyncStatus[] = [];
  let remoteChanges = 0;
  const engine = new SyncEngine({
    db,
    transport: server.transport(),
    onStatus: (s) => statuses.push(s),
    onRemoteChange: () => remoteChanges++,
  });
  return { db, engine, statuses, remoteChanges: () => remoteChanges };
}

async function loadSample(db: SqlDb, source: 'sample' | 'manual' = 'manual') {
  const sample = createSampleGradebook(uuids(), new Date(2026, 9, 6));
  await insertCourses(db, sample.courses, source);
  await insertUpcoming(db, sample.upcoming);
  return sample;
}

const titles = async (db: SqlDb) => (await readCourses(db)).map((c) => c.name);

const findAssignment = async (db: SqlDb, title: string) => {
  for (const c of await readCourses(db))
    for (const p of c.periods)
      for (const k of p.categories)
        for (const a of k.assignments) if (a.title === title) return { course: c, category: k, assignment: a };
  throw new Error(`no ${title}`);
};

describe('local gradebook', () => {
  it('stores the sample and grades it like the server', async () => {
    const db = await createTestDatabase();
    await loadSample(db);
    const courses = await readCourses(db);
    expect(courses.map((c) => c.name)).toEqual([
      'AP Calculus BC',
      'AP Physics C: E&M',
      'AP English Literature',
      'AP Spanish Language',
      'AP US Government',
    ]);
    const calc = computeCourseGrades(courses[0]);
    expect(calc.current).toEqual({ percent: 90, letter: 'A-' });
    expect(calc.projected).toEqual({ percent: 89, letter: 'B+' });
    expect(await readUpcoming(db)).toHaveLength(7);
  });

  it('adds, changes, and removes forecasts', async () => {
    const db = await createTestDatabase();
    await loadSample(db);
    const { category } = await findAssignment(db, 'Quiz 1.1');

    await addForecast(db, 'f0000000-0000-4000-8000-000000000001', {
      categoryId: category.id,
      title: 'Quiz 1.3',
      maxScore: 10,
      forecastScore: 6,
    });
    expect((await findAssignment(db, 'Quiz 1.3')).assignment).toMatchObject({
      forecastScore: 6,
      isPlaceholder: true,
      actualScore: null,
    });

    await setForecast(db, 'f0000000-0000-4000-8000-000000000001', 9);
    expect((await findAssignment(db, 'Quiz 1.3')).assignment.forecastScore).toBe(9);

    await removeForecast(db, 'f0000000-0000-4000-8000-000000000001');
    await expect(findAssignment(db, 'Quiz 1.3')).rejects.toThrow();

    const quiz22 = (await findAssignment(db, 'Quiz 2.2')).assignment;
    await removeForecast(db, quiz22.id);
    expect((await findAssignment(db, 'Quiz 2.2')).assignment.forecastScore).toBeNull();
  });

  it('erases everything', async () => {
    const db = await createTestDatabase();
    await loadSample(db);
    await eraseGradebook(db, false);
    expect(await readCourses(db)).toEqual([]);
    expect(await countPendingChanges(db)).toBe(0);
  });
});

describe('sync', () => {
  let server: FakeSyncServer;
  beforeEach(() => {
    server = new FakeSyncServer();
  });

  it('uploads a phone gradebook, then another phone downloads it', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    expect(phone.engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 });

    const tablet = await device(server);
    await attachAccount(tablet.db, 'ana');
    await tablet.engine.sync();
    expect(await titles(tablet.db)).toEqual(await titles(phone.db));
    expect(computeCourseGrades((await readCourses(tablet.db))[0]).projected.percent).toBe(89);
    expect(tablet.remoteChanges()).toBe(1);
  });

  it('a second sync with nothing new pulls nothing and pushes nothing', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    await phone.engine.sync(); // pulls back its own push once
    const pushes = server.pushes;
    const before = phone.remoteChanges();
    await phone.engine.sync();
    expect(server.pushes).toBe(pushes);
    expect(phone.remoteChanges()).toBe(before);
  });

  it('carries a forecast and a delete from one phone to the other', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    const tablet = await device(server);
    await attachAccount(tablet.db, 'ana');
    await tablet.engine.sync();

    const quiz = (await findAssignment(phone.db, 'Quiz 2.2')).assignment;
    await setForecast(phone.db, quiz.id, 4);
    const unit3 = (await findAssignment(phone.db, 'Unit 3 Test: Integrals')).assignment;
    await removeForecast(phone.db, unit3.id);
    expect(await countPendingChanges(phone.db)).toBe(2);
    await phone.engine.sync();
    await tablet.engine.sync();

    expect((await findAssignment(tablet.db, 'Quiz 2.2')).assignment.forecastScore).toBe(4);
    await expect(findAssignment(tablet.db, 'Unit 3 Test: Integrals')).rejects.toThrow();
  });

  it('carries a class built by hand, its edits, and its delete to the other phone', async () => {
    const newId = uuids();
    const phone = await device(server);
    await attachAccount(phone.db, 'ana');
    const tablet = await device(server);
    await attachAccount(tablet.db, 'ana');

    const courseId = await addCourse(phone.db, newId, { name: 'Chem', teacher: null, gradingMode: 'weighted' }, [
      { name: 'Q1', kind: 'quarter' },
    ]);
    const periodId = (await readCourses(phone.db))[0].periods[0].id;
    const labs = newId();
    await addCategory(phone.db, labs, periodId, { name: 'Labs', weight: 100, dropLowest: 0 });
    const lab = newId();
    const lab1 = { title: 'Lab 1', dueDate: null, maxScore: 10, actualScore: 7, excused: false, extraCredit: false };
    await addAssignment(phone.db, lab, labs, lab1);
    await phone.engine.sync();
    await tablet.engine.sync();
    expect(computeCourseGrades((await readCourses(tablet.db))[0]).current.percent).toBe(70);

    await updateCourse(tablet.db, courseId, { name: 'Chemistry', teacher: 'Mr. Ode', gradingMode: 'weighted' });
    await updateAssignment(tablet.db, lab, { ...lab1, actualScore: 9 });
    await tablet.engine.sync();
    await phone.engine.sync();
    const [course] = await readCourses(phone.db);
    expect(course).toMatchObject({ name: 'Chemistry', teacher: 'Mr. Ode' });
    expect(computeCourseGrades(course).current.percent).toBe(90);

    await deleteCourse(phone.db, courseId);
    await phone.engine.sync();
    await tablet.engine.sync();
    expect(await readCourses(tablet.db)).toEqual([]);
    expect(phone.engine.getStatus()).toMatchObject({ pending: 0 });
  });

  it('keeps edits made offline and sends them when back online', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();

    server.offline = true;
    const quiz = (await findAssignment(phone.db, 'Quiz 2.2')).assignment;
    await setForecast(phone.db, quiz.id, 10);
    await phone.engine.sync();
    expect(phone.engine.getStatus()).toMatchObject({ state: 'offline', pending: 1 });
    expect((await findAssignment(phone.db, 'Quiz 2.2')).assignment.forecastScore).toBe(10);

    server.offline = false;
    await phone.engine.sync();
    expect(phone.engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 });
    const tablet = await device(server);
    await attachAccount(tablet.db, 'ana');
    await tablet.engine.sync();
    expect((await findAssignment(tablet.db, 'Quiz 2.2')).assignment.forecastScore).toBe(10);
  });

  it('an unsynced edit on this phone wins over an older one pulled from the cloud', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    const tablet = await device(server);
    await attachAccount(tablet.db, 'ana');
    await tablet.engine.sync();

    const id = (await findAssignment(phone.db, 'Quiz 2.2')).assignment.id;
    await setForecast(tablet.db, id, 5);
    await tablet.engine.sync();
    await setForecast(phone.db, id, 8); // made later, still unsynced
    await phone.engine.sync();
    await tablet.engine.sync();

    expect((await findAssignment(phone.db, 'Quiz 2.2')).assignment.forecastScore).toBe(8);
    expect((await findAssignment(tablet.db, 'Quiz 2.2')).assignment.forecastScore).toBe(8);
  });

  it('erasing on one phone erases on the other', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    const tablet = await device(server);
    await attachAccount(tablet.db, 'ana');
    await tablet.engine.sync();

    await eraseGradebook(phone.db, true);
    await phone.engine.sync();
    await tablet.engine.sync();
    expect(await readCourses(tablet.db)).toEqual([]);
    expect(await readUpcoming(tablet.db)).toEqual([]);
    expect(await countPendingChanges(phone.db)).toBe(0);
  });

  it('overlapping sync calls run one after another', async () => {
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await Promise.all([phone.engine.sync(), phone.engine.sync(), phone.engine.sync()]);
    expect(server.pushes).toBe(1);
    expect(phone.engine.getStatus().pending).toBe(0);
  });
});

describe('waiting for the account', () => {
  it('does not pull or push until `ready` settles', async () => {
    const server = new FakeSyncServer();
    const db = await createTestDatabase();
    await loadSample(db);
    let attach!: () => void;
    const ready = new Promise<void>((resolve) => {
      attach = resolve;
    });
    const engine = new SyncEngine({ db, transport: server.transport(), ready });
    const syncing = engine.sync();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.pushes).toBe(0);
    await attachAccount(db, 'ana');
    attach();
    await syncing;
    expect(server.pushes).toBe(1);
  });

  it('sends nothing and reports an error when the account switch fails', async () => {
    const server = new FakeSyncServer();
    const db = await createTestDatabase();
    await loadSample(db);
    const ready = Promise.reject(new Error('disk full'));
    ready.catch(() => undefined);
    const engine = new SyncEngine({ db, transport: server.transport(), ready });
    await engine.sync();
    expect(server.pushes).toBe(0);
    expect(engine.getStatus()).toMatchObject({ state: 'error', error: 'disk full' });
  });
});

describe('accounts', () => {
  it('drops the untouched sample on first sign-in instead of uploading it', async () => {
    const db = await createTestDatabase();
    await loadSample(db, 'sample');
    expect(await attachAccount(db, 'ana')).toBe('joined');
    expect(await readCourses(db)).toEqual([]);
  });

  it('keeps the student’s own courses on first sign-in, to upload', async () => {
    const db = await createTestDatabase();
    await loadSample(db, 'manual');
    await attachAccount(db, 'ana');
    expect(await readCourses(db)).toHaveLength(5);
    expect(await attachAccount(db, 'ana')).toBe('same_account');
  });

  it('a different account starts clean, and sign-out removes this phone’s copy', async () => {
    const db = await createTestDatabase();
    await loadSample(db, 'manual');
    await attachAccount(db, 'ana');
    expect(await attachAccount(db, 'ben', async () => true)).toBe('switched');
    expect(await readCourses(db)).toEqual([]);

    await loadSample(db, 'manual');
    await detachAccount(db);
    expect(await readCourses(db)).toEqual([]);
    expect(await getMeta(db, ACCOUNT_KEY)).toBeNull();
  });
});

describe('switching accounts', () => {
  it('asks before deleting the previous account’s unsent changes, and keeps them on "no"', async () => {
    const db = await createTestDatabase();
    await loadSample(db, 'manual');
    await attachAccount(db, 'ana');
    const unsent = await countPendingChanges(db);
    const asked: number[] = [];
    await expect(
      attachAccount(db, 'ben', async (n) => {
        asked.push(n);
        return false;
      }),
    ).rejects.toBeInstanceOf(AccountSwitchCancelled);
    expect(asked).toEqual([unsent]);
    expect(await getMeta(db, ACCOUNT_KEY)).toBe('ana');
    expect(await countPendingChanges(db)).toBe(unsent);
  });

  it('does not ask when everything was sent', async () => {
    const phone = await device(new FakeSyncServer());
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    const confirm = async () => {
      throw new Error('asked');
    };
    expect(await attachAccount(phone.db, 'ben', confirm)).toBe('switched');
  });

  /** Ana's phone, with her pull held back until `release` is called. */
  async function slowPull() {
    const server = new FakeSyncServer();
    const first = await device(server);
    await loadSample(first.db);
    await attachAccount(first.db, 'ana');
    await first.engine.sync();

    const db = await createTestDatabase();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = server.transport();
    const transport: SyncTransport = {
      pull: async (since) => {
        const result = await real.pull(since);
        await gate;
        return result;
      },
      push: real.push,
    };
    await attachAccount(db, 'ana');
    const engine = new SyncEngine({ db, accountId: 'ana', transport });
    const syncing = engine.sync();
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { server, db, engine, syncing, release };
  }

  it('a pull that returns after someone else signed in changes nothing', async () => {
    const { server, db, syncing, release } = await slowPull();
    const pushes = server.pushes;
    await attachAccount(db, 'ben');
    release();
    await syncing;
    expect(await readCourses(db)).toEqual([]);
    expect(await getMeta(db, CURSOR_KEY)).toBeNull();
    expect(server.pushes).toBe(pushes);
  });

  it('a stopped engine changes nothing and syncs no more', async () => {
    const { server, db, engine, syncing, release } = await slowPull();
    engine.stop();
    release();
    await syncing;
    await engine.sync();
    expect(await readCourses(db)).toEqual([]);
    expect(server.pushes).toBe(1);
  });
});

describe('an edit on one phone and a delete on another', () => {
  async function twoPhones() {
    const server = new FakeSyncServer();
    const a = await device(server);
    await loadSample(a.db);
    await attachAccount(a.db, 'ana');
    await a.engine.sync();
    const b = await device(server);
    await attachAccount(b.db, 'ana');
    await b.engine.sync();
    return { a, b };
  }
  const settle = async (a: Awaited<ReturnType<typeof device>>, b: Awaited<ReturnType<typeof device>>) => {
    for (const phone of [a, b, a, b]) await phone.engine.sync();
  };

  it('keeps the score, and the whole class with it, on both phones', async () => {
    const { a, b } = await twoPhones();
    const before = (await readCourses(b.db))[0];
    const { assignment } = await findAssignment(b.db, 'Quiz 2.2');
    await setForecast(b.db, assignment.id, 7);
    await deleteCourse(a.db, before.id);
    await settle(a, b);
    for (const phone of [a, b]) {
      const after = (await readCourses(phone.db)).find((c) => c.id === before.id);
      expect(after?.periods.flatMap((p) => p.categories.flatMap((c) => c.assignments)).length).toBe(
        before.periods.flatMap((p) => p.categories.flatMap((c) => c.assignments)).length,
      );
      expect((await findAssignment(phone.db, 'Quiz 2.2')).assignment.forecastScore).toBe(7);
      expect(await countPendingChanges(phone.db)).toBe(0);
    }
  });

  it('a renamed class does not come back empty', async () => {
    const { a, b } = await twoPhones();
    const before = (await readCourses(b.db))[0];
    await updateCourse(b.db, before.id, { name: 'Renamed', teacher: null, gradingMode: before.gradingMode });
    await deleteCourse(a.db, before.id);
    await settle(a, b);
    for (const phone of [a, b]) {
      const after = (await readCourses(phone.db)).find((c) => c.name === 'Renamed');
      expect(after?.periods).toHaveLength(before.periods.length);
      expect(computeCourseGrades(after!).current).toEqual(computeCourseGrades(before).current);
    }
  });

  it('still deletes a class with no unsent edits, and leaves edits in other classes alone', async () => {
    const { a, b } = await twoPhones();
    const [first, second] = await readCourses(b.db);
    await updateCourse(b.db, second.id, { name: 'Other', teacher: null, gradingMode: second.gradingMode });
    await deleteCourse(a.db, first.id);
    await settle(a, b);
    for (const phone of [a, b]) {
      const names = await titles(phone.db);
      expect(names).toContain('Other');
      expect(names).not.toContain(first.name);
      expect(names).toHaveLength(4);
    }
  });
});

describe('rows the server skips', () => {
  it('are sent again together with the parents the cloud is missing', async () => {
    const server = new FakeSyncServer();
    const phone = await device(server);
    await loadSample(phone.db);
    await attachAccount(phone.db, 'ana');
    await phone.engine.sync();
    const { course, assignment } = await findAssignment(phone.db, 'Quiz 2.2');
    // Another device deletes the class between this phone's pull and its push.
    for (const table of ['courses', 'grading_periods', 'categories', 'assignments'] as const) {
      for (const [id] of server.rows.get(table)!) {
        if (table !== 'courses' || id === course.id) server.rows.get(table)!.delete(id);
      }
    }
    await setForecast(phone.db, assignment.id, 6);
    await phone.engine.sync();
    expect(server.rows.get('assignments')!.get(assignment.id)?.row.forecast_score).toBe(6);
    expect(phone.engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 });
  });

  it('are dropped when their parent is gone here too, so they never block a sync', async () => {
    const server = new FakeSyncServer();
    const phone = await device(server);
    await attachAccount(phone.db, 'ana');
    await phone.db.run(
      "insert into categories (id, period_id, name, position, dirty) values ('k1', 'nowhere', 'Lost', 1, 1)",
    );
    await phone.engine.sync();
    expect(await countPendingChanges(phone.db)).toBe(0);
    expect(await phone.db.all('select id from categories')).toEqual([]);
  });
});
