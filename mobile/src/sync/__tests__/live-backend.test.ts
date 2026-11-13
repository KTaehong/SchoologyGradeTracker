/**
 * End-to-end check against the LIVE hosted backend (the Supabase project in
 * mobile/.env), over the real network: sign in, sync two phones, Realtime,
 * the server's grade API, row-level security, and account deletion.
 *
 * It is skipped unless a throwaway, already-confirmed test account is given,
 * because it DELETES that account at the end:
 *
 *   LIVE_TEST_EMAIL=… LIVE_TEST_PASSWORD=… npm run test:live
 *
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';

import { createGradesApi } from '@/api/grades';
import { createRpcCaller, type RpcCaller } from '@/api/rpc';
import { createSampleGradebook } from '@/data/sample-gradebook';
import { addCourse, insertCourses, insertUpcoming, readCourses, readUpcoming, updateAssignment } from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import { createTestDatabase } from '@/test-support/node-sqlite';

import { attachAccount } from '../account';
import type { ChangeSet, PullResult } from '../changes';
import { SyncEngine, type SyncStatus, type SyncTransport } from '../sync-engine';

const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const describeLive = email && password ? describe : describe.skip;

function readEnvFile(): { url: string; key: string } {
  const text = readFileSync(join(__dirname, '..', '..', '..', '.env'), 'utf8');
  const get = (name: string) => new RegExp(`^${name}=(.+)$`, 'm').exec(text)?.[1].trim() ?? '';
  return { url: get('EXPO_PUBLIC_SUPABASE_URL'), key: get('EXPO_PUBLIC_SUPABASE_ANON_KEY') };
}

// Jest's Expo preset swaps `fetch` for a stub with no network. Node's own
// fetch and WebSocket live outside the test sandbox; this reaches them.
const realFetch = runInThisContext('fetch') as typeof fetch;
const RealWebSocket = runInThisContext('WebSocket') as typeof WebSocket;

const newClient = (): SupabaseClient => {
  const { url, key } = readEnvFile();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: realFetch },
    realtime: { transport: RealWebSocket },
  });
};

// Same shape as createSupabaseTransport, without the app's Keychain-backed client.
const transportFor = (call: RpcCaller): SyncTransport => ({
  pull: async (since) => (await call('pull_changes', { p_since: since })) as PullResult,
  push: async (changes: ChangeSet) => (await call('push_changes', { p_changes: changes })) as { revision: number },
});

let supabase: SupabaseClient;
let call: RpcCaller;
let userId: string;

async function phone() {
  const db = await createTestDatabase();
  let last: SyncStatus | null = null;
  const engine = new SyncEngine({ db, transport: transportFor(call), onStatus: (s) => (last = s) });
  await attachAccount(db, userId);
  return {
    db,
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

describeLive('the live backend', () => {
  beforeAll(async () => {
    supabase = newClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
    expect(error).toBeNull();
    userId = data.user!.id;
    call = createRpcCaller(() => supabase);
  }, 30_000);

  afterAll(async () => {
    await supabase?.removeAllChannels();
  });

  it('refuses signed-out callers and a wrong password', async () => {
    const anon = newClient();
    expect((await anon.rpc('pull_changes', { p_since: 0 })).error).not.toBeNull();
    expect((await anon.rpc('get_grades')).error).not.toBeNull();
    expect((await anon.from('courses').select('id')).data).toEqual([]);
    expect((await anon.from('profiles').select('id')).data).toEqual([]);
    const wrong = await anon.auth.signInWithPassword({ email: email!, password: `${password}x` });
    expect(wrong.error).not.toBeNull();
  }, 30_000);

  it('made a profile at sign-up, and shows a student only their own', async () => {
    const { data } = await supabase.from('profiles').select('id');
    expect(data).toEqual([{ id: userId }]);
  }, 30_000);

  it('syncs two phones, tells the other phone in real time, and agrees on every grade', async () => {
    let realtimeEvents = 0;
    // "Subscribed to PostgreSQL" arrives a moment after the channel itself joins.
    const subscribed = new Promise<void>((resolve, reject) => {
      supabase
        .channel(`sync-state:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sync_state', filter: `student_id=eq.${userId}` },
          () => realtimeEvents++,
        )
        .on('system', {}, (message: { extension?: string; status?: string }) => {
          if (message.extension === 'postgres_changes' && message.status === 'ok') resolve();
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Realtime: ${status}`));
        });
    });
    await subscribed;

    const a = await phone();
    const sample = createSampleGradebook(randomUUID, new Date());
    await insertCourses(a.db, sample.courses, 'manual');
    await insertUpcoming(a.db, sample.upcoming);
    await a.sync();

    const b = await phone();
    await b.sync();
    expect((await readCourses(b.db)).length).toBe((await readCourses(a.db)).length);
    expect(await grades(b.db)).toEqual(await grades(a.db));
    expect((await readUpcoming(b.db)).length).toBe((await readUpcoming(a.db)).length);

    // An edit on phone B reaches phone A.
    const course = (await readCourses(b.db))[0];
    const assignment = course.periods[0].categories[0].assignments.find((x) => x.actualScore !== null)!;
    await updateAssignment(b.db, assignment.id, {
      title: 'Edited on phone B',
      dueDate: assignment.dueDate,
      maxScore: assignment.maxScore,
      actualScore: 0,
      excused: false,
      extraCredit: false,
    });
    await addCourse(b.db, randomUUID, { name: 'Added on phone B', teacher: null, gradingMode: 'points' }, [
      { name: 'Quarter 1', kind: 'quarter' },
    ]);
    await b.sync();
    await a.sync();
    expect(await grades(a.db)).toEqual(await grades(b.db));
    expect((await readCourses(a.db)).map((c) => c.name)).toContain('Added on phone B');

    // The server's grade engine agrees with the phone's, course by course.
    const snapshot = await createGradesApi(call).getGrades();
    const byId = new Map(snapshot.courses.map((c) => [c.courseId, c]));
    const local = await readCourses(a.db);
    expect(snapshot.courses.length).toBe(local.length);
    for (const c of local) {
      const mine = computeCourseGrades(c);
      const cloud = byId.get(c.id)!;
      expect([c.name, cloud.current, cloud.projected]).toEqual([c.name, mine.current, mine.projected]);
    }

    // Realtime told this client about the pushes.
    for (let i = 0; i < 50 && realtimeEvents === 0; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(realtimeEvents).toBeGreaterThan(0);
  }, 120_000);

  it('deletes the account and everything in it', async () => {
    const { error } = await supabase.rpc('delete_my_account');
    expect(error).toBeNull();
    const again = await newClient().auth.signInWithPassword({ email: email!, password: password! });
    expect(again.error).not.toBeNull();
  }, 30_000);
});
