import { beforeEach, describe, expect, it } from '@jest/globals';

import { createSampleGradebook } from '@/data/sample-gradebook';
import {
  addForecast,
  countPendingChanges,
  eraseGradebook,
  insertCourses,
  insertUpcoming,
  readCourses,
  readUpcoming,
  removeForecast,
  setForecast,
} from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import { FakeSyncServer } from '@/test-support/fake-sync-server';
import { createTestDatabase } from '@/test-support/node-sqlite';

import { attachAccount, attachedAccount, detachAccount } from '../account';
import { SyncEngine, type SyncStatus } from '../sync-engine';

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
    expect(await attachAccount(db, 'ben')).toBe('switched');
    expect(await readCourses(db)).toEqual([]);

    await loadSample(db, 'manual');
    await detachAccount(db);
    expect(await readCourses(db)).toEqual([]);
    expect(await attachedAccount(db)).toBeNull();
  });
});
