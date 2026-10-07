/**
 * The gradebook the whole app reads (F02, F07, F08, F13, F14).
 *
 * Grades always come from the phone: the gradebook lives in SQLite and the
 * grade engine computes every percent on the device, so the app works the
 * same with or without internet. When the student is signed in, the sync
 * engine keeps the phone and the cloud in step:
 *   - on launch and whenever the app comes back to the foreground,
 *   - when the phone gets its connection back,
 *   - when another device pushes (Supabase Realtime),
 *   - shortly after every change made here,
 *   - and when the student pulls to refresh.
 */
import * as Crypto from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { signOut as apiSignOut } from '@/api/auth';
import { getSupabase, isApiConfigured } from '@/api/client';
import type { CourseGrades, NewForecast } from '@/api/grades';
import { createRpcCaller } from '@/api/rpc';
import { useSession } from '@/api/use-session';
import {
  addForecast as addForecastRow,
  eraseGradebook,
  getMeta,
  insertCourses,
  insertUpcoming,
  readCourses,
  readUpcoming,
  removeForecast as removeForecastRow,
  setForecast as setForecastRow,
  setMeta,
} from '@/db/gradebook-repo';
import { openGradebookDatabase } from '@/db/open-database';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import type { GradeCourse } from '@/engine/types';
import { attachAccount, attachedAccount, detachAccount } from '@/sync/account';
import { onReconnect, useOnline } from '@/sync/connectivity';
import { createSupabaseTransport, watchRemoteChanges } from '@/sync/supabase-sync';
import { SyncEngine, type SyncStatus } from '@/sync/sync-engine';

import { createSampleGradebook } from './sample-gradebook';
import { readLegacyGradebook, removeLegacyGradebook } from './storage';
import type { UpcomingItem } from './types';

type GradebookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; courses: GradeCourse[]; grades: CourseGrades[]; upcoming: UpcomingItem[] };

type GradebookContextValue = {
  state: GradebookState;
  /** Sync progress, or `null` when the gradebook is only on this phone (signed out). */
  sync: SyncStatus | null;
  online: boolean;
  /** Adds the sample courses. */
  loadSample: () => Promise<void>;
  /** Erases every course and upcoming item (on every device, when signed in). */
  eraseAll: () => Promise<void>;
  setForecast: (assignmentId: string, score: number) => Promise<void>;
  addForecast: (forecast: NewForecast) => Promise<void>;
  removeForecast: (assignmentId: string) => Promise<void>;
  /** Pull-to-refresh: sync now. Resolves when done (never rejects). */
  syncNow: () => Promise<void>;
  /** Signs out and removes this phone's copy of the account's grades. */
  signOut: () => Promise<void>;
};

const GradebookContext = createContext<GradebookContextValue | null>(null);

/** Wait this long after a change before syncing, so a burst of edits goes in one push. */
const PUSH_DELAY_MS = 1500;
const LEGACY_IMPORTED_KEY = 'legacy_imported';

const newId = () => Crypto.randomUUID();

/** First run on this version: start with the sample, unless the student had erased everything. */
async function prepareDatabase(db: SqlDb): Promise<void> {
  if ((await getMeta(db, LEGACY_IMPORTED_KEY)) !== null) {
    return;
  }
  const legacy = await readLegacyGradebook().catch(() => 'missing' as const);
  if (legacy !== 'empty' && (await attachedAccount(db)) === null) {
    const sample = createSampleGradebook(newId);
    await insertCourses(db, sample.courses, 'sample');
    await insertUpcoming(db, sample.upcoming);
  }
  await setMeta(db, LEGACY_IMPORTED_KEY, '1');
  await removeLegacyGradebook().catch(() => undefined);
}

export function GradebookProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SqlDb | null>(null);
  const [state, setState] = useState<GradebookState>({ status: 'loading' });
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useSession();
  const online = useOnline();
  const userId = session.status === 'signed_in' ? session.session.user.id : null;

  const reload = useCallback(async (database: SqlDb) => {
    const [courses, upcoming] = await Promise.all([readCourses(database), readUpcoming(database)]);
    setState({
      status: 'ready',
      courses,
      grades: courses.map((c) => computeCourseGrades(c)),
      upcoming,
    });
  }, []);

  // Open the database once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const database = await openGradebookDatabase();
        await prepareDatabase(database);
        if (!cancelled) {
          setDb(database);
          await reload(database);
        }
      } catch (e) {
        if (!cancelled) {
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Signed in: join the account and keep syncing until sign-out.
  useEffect(() => {
    if (!db || !userId || !isApiConfigured()) {
      engineRef.current = null;
      return;
    }
    let stopped = false;
    const engine = new SyncEngine({
      db,
      transport: createSupabaseTransport(createRpcCaller(getSupabase)),
      onStatus: (status) => {
        if (!stopped) setSync(status);
      },
      onRemoteChange: () => {
        if (!stopped) reload(db);
      },
    });
    engineRef.current = engine;

    const syncSoon = () => {
      if (!stopped) engine.sync();
    };
    (async () => {
      await attachAccount(db, userId);
      if (stopped) return;
      await reload(db);
      await engine.refreshStatus();
      syncSoon();
    })();

    const stopRealtime = watchRemoteChanges(userId, syncSoon);
    const stopNet = onReconnect(syncSoon);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncSoon();
    });
    return () => {
      stopped = true;
      stopRealtime();
      stopNet();
      appState.remove();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [db, userId, reload]);

  /** After a change made here: redraw now, push a moment later. */
  const changed = useCallback(
    async (database: SqlDb) => {
      await reload(database);
      const engine = engineRef.current;
      if (!engine) return;
      await engine.refreshStatus();
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => engine.sync(), PUSH_DELAY_MS);
    },
    [reload],
  );

  const value = useMemo<GradebookContextValue>(() => {
    const edit = async (action: (database: SqlDb) => Promise<void>) => {
      if (!db) throw new Error('The gradebook is still opening. Try again in a moment.');
      await action(db);
      await changed(db);
    };
    return {
      state,
      // Only while an account is attached; signed out the status is meaningless.
      sync: db && userId && isApiConfigured() ? sync : null,
      online,
      loadSample: () =>
        edit(async (d) => {
          const sample = createSampleGradebook(newId);
          await insertCourses(d, sample.courses, 'sample');
          await insertUpcoming(d, sample.upcoming);
        }),
      eraseAll: () => edit((d) => eraseGradebook(d, engineRef.current !== null)),
      setForecast: (assignmentId, score) => edit((d) => setForecastRow(d, assignmentId, score)),
      addForecast: (forecast) => edit((d) => addForecastRow(d, newId(), forecast)),
      removeForecast: (assignmentId) => edit((d) => removeForecastRow(d, assignmentId)),
      syncNow: async () => {
        if (engineRef.current) await engineRef.current.sync();
        else if (db) await reload(db);
      },
      signOut: async () => {
        // Last chance to send changes made here.
        if (engineRef.current) await engineRef.current.sync();
        await apiSignOut();
        if (db) {
          await detachAccount(db);
          await reload(db);
        }
      },
    };
  }, [state, sync, online, db, userId, changed, reload]);

  return <GradebookContext.Provider value={value}>{children}</GradebookContext.Provider>;
}

export function useGradebook() {
  const context = useContext(GradebookContext);
  if (!context) {
    throw new Error('useGradebook must be used inside GradebookProvider');
  }
  return context;
}

/** One course's grades, or `undefined` while loading / when it is gone. */
export function useCourseGrades(courseId: string): CourseGrades | undefined {
  const { state } = useGradebook();
  return state.status === 'ready' ? state.grades.find((g) => g.courseId === courseId) : undefined;
}
