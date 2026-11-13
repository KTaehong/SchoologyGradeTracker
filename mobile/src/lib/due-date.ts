/**
 * Due dates the way a student writes and reads them. They are stored as
 * `YYYY-MM-DD`; this file turns typed text into that, and that into "Nov 23".
 */
import { calendarDate } from '@/sync/server-limits';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DUE_DATE_PLACEHOLDER = '11/23 or Nov 23';
export const DUE_DATE_ERROR = 'Write the due date like 11/23 or Nov 23, or leave it empty.';

/** A two-digit year means this century. */
const fullYear = (year: number) => (year < 100 ? 2000 + year : year);

/**
 * With no year written, a school date means the one nearest today: in
 * November, "1/12" is next January and "9/5" was this September.
 */
function nearestYear(month: number, day: number, today: Date): string | null {
  let best: { iso: string; distance: number } | null = null;
  for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const iso = calendarDate(year, month, day);
    if (!iso) continue;
    const distance = Math.abs(new Date(year, month - 1, day).getTime() - today.getTime());
    if (!best || distance < best.distance) best = { iso, distance };
  }
  return best?.iso ?? null;
}

/**
 * Reads a typed due date: `11/23`, `11/23/26`, `11/23/2026`, `Nov 23`,
 * `November 23, 2026` or `2026-11-23`. Returns `YYYY-MM-DD`, `''` for an empty
 * field, or `null` when it is not a date (or not a real day, like 2/31).
 */
export function parseDueDate(text: string, today: Date = new Date()): string | null {
  const typed = text.trim();
  if (!typed) return '';

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(typed);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(typed);
  if (numeric) {
    const [month, day] = [Number(numeric[1]), Number(numeric[2])];
    return numeric[3] ? calendarDate(fullYear(Number(numeric[3])), month, day) : nearestYear(month, day, today);
  }

  const named = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2}|\d{4}))?$/i.exec(typed);
  if (named) {
    const month = MONTHS.findIndex((m) => named[1].toLowerCase().startsWith(m.toLowerCase())) + 1;
    const isMonthName = month > 0 && MONTH_NAMES[month - 1].startsWith(named[1].toLowerCase());
    if (!isMonthName) return null;
    const day = Number(named[2]);
    return named[3] ? calendarDate(fullYear(Number(named[3])), month, day) : nearestYear(month, day, today);
  }
  return null;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** `2026-11-23` → "Nov 23", with the year when it is not this year. */
export function formatDueDate(iso: string, today: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const label = `${MONTHS[month - 1] ?? match[2]} ${day}`;
  return year === today.getFullYear() ? label : `${label}, ${year}`;
}

/** What the due date field shows when editing saved work: "Nov 23, 2026". */
export function dueDateFieldText(iso: string | null | undefined): string {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!match) return iso ?? '';
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[3])}, ${match[1]}`;
}
