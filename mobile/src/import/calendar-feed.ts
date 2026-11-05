/**
 * Upcoming assignments from the Schoology calendar feed (F11, T2.4).
 *
 * Schoology gives each student a private calendar link (Calendar → the gear
 * menu → "iCal Feed", which looks like `webcal://…/ical/…`). It is an iCal
 * file listing assignments and events with their due times. The feed does not
 * say which class an item is for, so we guess it from the gradebook: the class
 * that already has an assignment with the same name, or whose name is in the
 * item's text. Items we cannot place show as "Unfiled".
 *
 * The link works like a password, so it is kept in the phone's secure storage
 * and only ever sent to Schoology.
 *
 * Parsing and matching are plain functions, tested in Jest.
 */
import type { GradeCourse } from '@/engine/types';

export type CalendarEvent = {
  uid: string;
  title: string;
  /** ISO 8601. All-day items are due at 11:59 PM local time that day. */
  dueAt: string;
  allDay: boolean;
  url: string | null;
  description: string | null;
};

/** What we store for one feed item (before it gets a row id). */
export type FeedItem = {
  externalUid: string;
  title: string;
  dueAt: string;
  url: string | null;
  courseId: string | null;
};

/** Feed rows are told apart from other upcoming items by this prefix on `external_uid`. */
export const FEED_UID_PREFIX = 'ical:';
/** Items due more than this many days ago are not kept. */
const KEEP_PAST_DAYS = 7;
/** Nor items due further ahead than this. */
const KEEP_FUTURE_DAYS = 180;

// ---------------------------------------------------------------------------
// iCal parsing
// ---------------------------------------------------------------------------

function unescapeText(value: string): string {
  // RFC 5545 escapes \\ \; \, and \n; some feeds also escape other characters.
  return value.replace(/\\(.)/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** `20261105`, `20261105T235900`, `20261105T235900Z`. */
function parseDateValue(value: string, isDate: boolean): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, utc] = m;
  if (isDate || h === undefined) {
    // An all-day item: due by the end of that day, on the phone's clock.
    return { date: new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 0), allDay: true };
  }
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)] as const;
  // Times with a TZID are read as the phone's local time: the student and their school share a zone.
  const date = utc ? new Date(Date.UTC(...parts)) : new Date(...parts);
  return Number.isNaN(date.getTime()) ? null : { date, allDay: false };
}

/** Reads every VEVENT in an iCal file. Events with no start are skipped. */
export function parseIcal(text: string): CalendarEvent[] {
  // Unfold: a line starting with a space or tab continues the previous one.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> & { start?: { date: Date; allDay: boolean } | null } | null = null;

  for (const line of lines) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) {
      current = {};
      continue;
    }
    if (/^END:VEVENT\s*$/i.test(line)) {
      if (current?.start) {
        events.push({
          uid: current.uid || `${current.title ?? ''}@${current.start.date.toISOString()}`,
          title: current.title?.trim() || '(untitled)',
          dueAt: current.start.date.toISOString(),
          allDay: current.start.allDay,
          url: current.url ?? null,
          description: current.description ?? null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    switch (name.toUpperCase()) {
      case 'UID':
        current.uid = value.trim();
        break;
      case 'SUMMARY':
        current.title = unescapeText(value);
        break;
      case 'DTSTART':
        current.start = parseDateValue(value, params.some((p) => /^VALUE=DATE$/i.test(p)));
        break;
      case 'URL':
        current.url = value.trim() || null;
        break;
      case 'DESCRIPTION':
        current.description = unescapeText(value);
        break;
    }
  }
  return events.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

// ---------------------------------------------------------------------------
// Matching items to classes
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** "AP Biology: Section 3" → "ap biology". */
const courseKey = (name: string) => norm(name.split(':')[0]);

/**
 * The class this calendar item belongs to, or `null`:
 *   1. a class with an assignment of exactly that name,
 *   2. a class whose name appears in the item's title or description,
 *   3. a class with an assignment whose name contains the item's (or the other way round).
 */
export function matchEventCourse(
  event: Pick<CalendarEvent, 'title' | 'description'>,
  courses: GradeCourse[],
): string | null {
  const title = norm(event.title);
  if (!title) return null;
  const text = ` ${title} ${norm(event.description ?? '')} `;

  let byName: string | null = null;
  let byContains: string | null = null;
  for (const course of courses) {
    const key = courseKey(course.name);
    if (!byName && key.length >= 3 && text.includes(` ${key} `)) {
      byName = course.id;
    }
    for (const period of course.periods) {
      for (const category of period.categories) {
        for (const a of category.assignments) {
          const name = norm(a.title);
          if (!name) continue;
          if (name === title) return course.id;
          if (!byContains && Math.min(name.length, title.length) > 6 && (name.includes(title) || title.includes(name))) {
            byContains = course.id;
          }
        }
      }
    }
  }
  return byName ?? byContains;
}

/** The feed's items worth keeping (last week through the next six months), placed in classes. */
export function toFeedItems(events: CalendarEvent[], courses: GradeCourse[], now: Date = new Date()): FeedItem[] {
  const from = now.getTime() - KEEP_PAST_DAYS * 86_400_000;
  const to = now.getTime() + KEEP_FUTURE_DAYS * 86_400_000;
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const event of events) {
    const at = new Date(event.dueAt).getTime();
    const externalUid = FEED_UID_PREFIX + event.uid;
    if (at < from || at > to || seen.has(externalUid)) continue;
    seen.add(externalUid);
    items.push({
      externalUid,
      title: event.title,
      dueAt: event.dueAt,
      url: event.url,
      courseId: matchEventCourse(event, courses),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// The link and fetching
// ---------------------------------------------------------------------------

export class CalendarFeedError extends Error {}

/** Accepts the link as Schoology shows it (`webcal://…`) or as `https://…`. */
export function normalizeFeedUrl(input: string): string {
  const trimmed = input.trim();
  const url = trimmed.replace(/^webcals?:\/\//i, 'https://');
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+\/\S*$/i.test(url)) {
    throw new CalendarFeedError('That does not look like a calendar link. It should start with webcal:// or https://.');
  }
  return url.replace(/^http:\/\//i, 'https://');
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** Downloads and reads the feed. Errors are worded for the student. */
export async function fetchCalendar(url: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<CalendarEvent[]> {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'text/calendar' } });
  } catch {
    throw new CalendarFeedError('Could not reach Schoology. Check your internet connection and try again.');
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new CalendarFeedError('Schoology did not accept this calendar link. Copy a fresh one from your Schoology calendar.');
  }
  if (!response.ok) {
    throw new CalendarFeedError(`Schoology's calendar did not load (error ${response.status}). Try again later.`);
  }
  const text = await response.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new CalendarFeedError('That link did not return a calendar. Make sure you copied the iCal feed link.');
  }
  return parseIcal(text);
}
