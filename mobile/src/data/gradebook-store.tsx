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

import { getSession, signOut as apiSignOut } from '@/api/auth';
import { getSupabase, isApiConfigured } from '@/api/client';
import type { CourseGrades, NewForecast } from '@/api/grades';
import { createRpcCaller } from '@/api/rpc';
import { useSession } from '@/api/use-session';
import {
  addAssignment,
  addCategory,
  addCourse as addCourseRows,
  addForecast as addForecastRow,
  deleteAssignment as deleteAssignmentRow,
  deleteCategory as deleteCategoryRow,
  deleteCourse as deleteCourseRow,
  eraseGradebook,
  getMeta,
  importCourses,
  insertCourses,
  insertUpcoming,
  readCourses,
  readUpcoming,
  removeFeedItems,
  removeForecast as removeForecastRow,
  saveFeedItems,
  saveScreenshotRows,
  setForecast as setForecastRow,
  setMeta,
  updateAssignment,
  updateCategory,
  updateCourse as updateCourseRow,
  type AssignmentFields,
  type CategoryFields,
  type CourseFields,
  type FeedSaveResult,
  type NewPeriod,
  type ScreenshotRow,
  type ScreenshotSaveResult,
} from '@/db/gradebook-repo';
import { openGradebookDatabase } from '@/db/open-database';
import type { SqlDb } from '@/db/sql';
import { computeCourseGrades } from '@/engine/grade-engine';
import type { GradeCourse } from '@/engine/types';
import { FEED_UID_PREFIX, fetchCalendar, normalizeFeedUrl, toFeedItems } from '@/import/calendar-feed';
import { forgetCalendarLink, readCalendarLink, saveCalendarLink } from '@/import/calendar-link';
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

export type CalendarStatus = {
  /** `null` while the saved link is still being looked up. */
  connected: boolean | null;
  refreshing: boolean;
  /** When the feed was last read on this phone (ISO 8601). */
  refreshedAt: string | null;
  /** Why the last automatic refresh failed, if it did. */
  error: string | null;
};

type GradebookContextValue = {
  state: GradebookState;
  calendar: CalendarStatus;
  /** Saves assignments read off a screenshot (F04). */
  importScreenshot: (rows: ScreenshotRow[]) => Promise<ScreenshotSaveResult>;
  /** Adds classes read from a saved report (F05), first deleting `replaceIds`. */
  importReport: (courses: GradeCourse[], replaceIds: string[]) => Promise<void>;
  /** Checks the link by loading it, then saves it and the feed's items (F11). */
  connectCalendar: (link: string) => Promise<FeedSaveResult>;
  /** Reads the feed again. Rejects with a message for the student. */
  refreshCalendar: () => Promise<FeedSaveResult>;
  /** Forgets the link and removes the feed's items. */
  disconnectCalendar: () => Promise<void>;
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
  /** Adds an empty class (F06). Resolves to its id. */
  addCourse: (fields: CourseFields, periods: NewPeriod[]) => Promise<string>;
  updateCourse: (courseId: string, fields: CourseFields) => Promise<void>;
  /** Deletes a class and everything in it. */
  deleteCourse: (courseId: string) => Promise<void>;
  /** Adds a category to `periodId`, or changes the category `categoryId`. */
  saveCategory: (target: { periodId: string } | { categoryId: string }, fields: CategoryFields) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  /** Adds an assignment to `categoryId`, or changes the assignment `assignmentId`. */
  saveAssignment: (
    target: { categoryId: string } | { assignmentId: string },
    fields: AssignmentFields,
  ) => Promise<void>;
  deleteAssignment: (assignmentId: string) => Promise<void>;
  /** Pull-to-refresh: sync now. Resolves when done (never rejects). */
  syncNow: () => Promise<void>;
  /** Signs out and removes this phone's copy of the account's grades. */
  signOut: () => Promise<void>;
  /** Permanently deletes the account and its cloud gradebook, then signs out. */
  deleteAccount: () => Promise<void>;
};

const GradebookContext = createContext<GradebookContextValue | null>(null);

/** Wait this long after a change before syncing, so a burst of edits goes in one push. */
const PUSH_DELAY_MS = 1500;
const LEGACY_IMPORTED_KEY = 'legacy_imported';
const CALENDAR_REFRESHED_KEY = 'calendar_refreshed_at';
/** Re-read the calendar on launch when it is older than this. */
const CALENDAR_STALE_MS = 60 * 60 * 1000;

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
  const [calendar, setCalendar] = useState<CalendarStatus>({
    connected: null,
    refreshing: false,
    refreshedAt: null,
    error: null,
  });

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
    // Nothing syncs until the gradebook belongs to this account (see `ready`).
    const attached = attachAccount(db, userId);
    const engine = new SyncEngine({
      db,
      ready: attached,
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
      try {
        await attached;
        if (stopped) return;
        await reload(db);
        await engine.refreshStatus();
      } catch {
        // The sync below reports a failed account switch as a sync error.
      }
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
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [db, userId, reload]);

  /** Reads the feed at `url` into the gradebook. */
  const loadFeed = useCallback(async (database: SqlDb, url: string) => {
    const events = await fetchCalendar(url);
    const items = toFeedItems(events, await readCourses(database));
    const result = await saveFeedItems(database, newId, items, FEED_UID_PREFIX);
    const refreshedAt = new Date().toISOString();
    await setMeta(database, CALENDAR_REFRESHED_KEY, refreshedAt);
    return { result, refreshedAt };
  }, []);

  // Is a calendar connected? If so and it is stale, read it again.
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    (async () => {
      const [link, refreshedAt] = await Promise.all([
        readCalendarLink().catch(() => null),
        getMeta(db, CALENDAR_REFRESHED_KEY),
      ]);
      if (cancelled) return;
      setCalendar((c) => ({ ...c, connected: link !== null, refreshedAt }));
      const stale = !refreshedAt || Date.now() - new Date(refreshedAt).getTime() > CALENDAR_STALE_MS;
      if (!link || !stale) return;
      setCalendar((c) => ({ ...c, refreshing: true }));
      try {
        const { refreshedAt: at } = await loadFeed(db, link);
        if (!cancelled) setCalendar((c) => ({ ...c, refreshing: false, refreshedAt: at, error: null }));
        await changedRef.current?.(db);
      } catch (e) {
        if (!cancelled) {
          setCalendar((c) => ({ ...c, refreshing: false, error: e instanceof Error ? e.message : String(e) }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, loadFeed]);

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
  const changedRef = useRef<typeof changed | null>(null);
  changedRef.current = changed;

  const value = useMemo<GradebookContextValue>(() => {
    const edit = async (action: (database: SqlDb) => Promise<void>) => {
      if (!db) throw new Error('The gradebook is still opening. Try again in a moment.');
      await action(db);
      await changed(db);
    };
    const refreshWith = async (url: string) => {
      if (!db) throw new Error('The gradebook is still opening. Try again in a moment.');
      setCalendar((c) => ({ ...c, refreshing: true }));
      try {
        const { result, refreshedAt } = await loadFeed(db, url);
        setCalendar((c) => ({ ...c, connected: true, refreshing: false, refreshedAt, error: null }));
        await changed(db);
        return result;
      } catch (e) {
        setCalendar((c) => ({ ...c, refreshing: false }));
        throw e;
      }
    };
    return {
      state,
      calendar,
      importReport: (courses, replaceIds) => edit((d) => importCourses(d, courses, replaceIds)),
      importScreenshot: async (rows) => {
        let result: ScreenshotSaveResult = { added: 0, updated: 0 };
        await edit(async (d) => {
          result = await saveScreenshotRows(d, newId, rows);
        });
        return result;
      },
      connectCalendar: async (link) => {
        const url = normalizeFeedUrl(link);
        const result = await refreshWith(url);
        await saveCalendarLink(url);
        return result;
      },
      refreshCalendar: async () => {
        const url = await readCalendarLink();
        if (!url) throw new Error('Connect your Schoology calendar in Settings first.');
        return refreshWith(url);
      },
      disconnectCalendar: async () => {
        await forgetCalendarLink();
        await edit(async (d) => {
          await removeFeedItems(d, FEED_UID_PREFIX);
          await setMeta(d, CALENDAR_REFRESHED_KEY, null);
        });
        setCalendar({ connected: false, refreshing: false, refreshedAt: null, error: null });
      },
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
      addCourse: async (fields, periods) => {
        let id = '';
        await edit(async (d) => {
          id = await addCourseRows(d, newId, fields, periods);
        });
        return id;
      },
      updateCourse: (courseId, fields) => edit((d) => updateCourseRow(d, courseId, fields)),
      deleteCourse: (courseId) => edit((d) => deleteCourseRow(d, courseId)),
      saveCategory: (target, fields) =>
        edit((d) =>
          'categoryId' in target
            ? updateCategory(d, target.categoryId, fields)
            : addCategory(d, newId(), target.periodId, fields),
        ),
      deleteCategory: (categoryId) => edit((d) => deleteCategoryRow(d, categoryId)),
      saveAssignment: (target, fields) =>
        edit((d) =>
          'assignmentId' in target
            ? updateAssignment(d, target.assignmentId, fields)
            : addAssignment(d, newId(), target.categoryId, fields),
        ),
      deleteAssignment: (assignmentId) => edit((d) => deleteAssignmentRow(d, assignmentId)),
      syncNow: async () => {
        if (engineRef.current) await engineRef.current.sync();
        else if (db) await reload(db);
      },
      signOut: async () => {
        // Last chance to send changes made here.
        if (engineRef.current) await engineRef.current.sync();
        try {
          await apiSignOut();
        } catch (e) {
          // With no connection the server cannot be told, but the phone
          // still forgets the session. Only a session that is still here
          // means the sign-out really failed.
          if (await getSession().catch(() => null)) throw e;
        }
        if (db) {
          await detachAccount(db);
          await reload(db);
        }
      },
      deleteAccount: async () => {
        await createRpcCaller(getSupabase)('delete_my_account');
        if (pushTimer.current) clearTimeout(pushTimer.current);
        // The account is gone, so the server may refuse the sign-out; the
        // phone forgets the session either way.
        await apiSignOut().catch(() => undefined);
        if (db) {
          await detachAccount(db);
          await reload(db);
        }
      },
    };
  }, [state, calendar, sync, online, db, userId, changed, reload, loadFeed]);

  return <GradebookContext.Provider value={value}>{children}</GradebookContext.Provider>;
}

export function useGradebook() {
  const context = useContext(GradebookContext);
  if (!context) {
    throw new Error('useGradebook must be used inside GradebookProvider');
  }
  return context;
}

/** One course's raw gradebook (for editing), or `undefined` while loading / when it is gone. */
export function useCourse(courseId: string | undefined): GradeCourse | undefined {
  const { state } = useGradebook();
  return state.status === 'ready' ? state.courses.find((c) => c.id === courseId) : undefined;
}

/** One course's grades, or `undefined` while loading / when it is gone. */
export function useCourseGrades(courseId: string): CourseGrades | undefined {
  const { state } = useGradebook();
  return state.status === 'ready' ? state.grades.find((g) => g.courseId === courseId) : undefined;
}
