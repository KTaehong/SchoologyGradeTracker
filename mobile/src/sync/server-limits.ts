/**
 * The limits of the cloud tables (supabase/migrations/20260924000200_gradebook.sql).
 *
 * The server checks every row of a push, and one row it refuses fails the
 * whole push — so a single bad row would keep every later change on this
 * phone from reaching the cloud. Forms and importers already stay inside
 * these limits; `fitToServer` is the last line of defence, applied to every
 * row as it is sent.
 */
import type { SyncTable } from '@/db/tables';

/** Longest names, in characters (`char_length` in the CHECK constraints). */
export const NAME_LIMITS = {
  course: 200,
  period: 100,
  category: 100,
  assignment: 300,
} as const;

/** numeric(8, 2): scores. */
export const MAX_SCORE = 999999.99;
/** numeric(6, 2): weights. */
export const MAX_WEIGHT = 9999.99;
/** smallint. */
const MAX_DROP_LOWEST = 32767;

/** Cuts text to `limit` characters (whole characters, so emoji are never split). */
export function clipText(text: string, limit: number): string {
  const chars = Array.from(text);
  return chars.length <= limit ? text : chars.slice(0, limit).join('').trimEnd();
}

/** A real calendar date written `YYYY-MM-DD`. */
export function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** `YYYY-MM-DD` for a year, month and day, or `null` when there is no such day (Feb 31). */
export function calendarDate(year: number, month: number, day: number): string | null {
  const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isRealDate(text) ? text : null;
}

function name(value: unknown, limit: number, fallback: string): string {
  const text = typeof value === 'string' ? clipText(value.trim(), limit) : '';
  return text.length > 0 ? text : fallback;
}

function clamp(value: unknown, max: number): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, 0), max);
}

/** A copy of `row` that the server accepts. */
export function fitToServer(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  switch (table) {
    case 'courses':
      out.name = name(row.name, NAME_LIMITS.course, 'Class');
      break;
    case 'grading_periods':
      out.name = name(row.name, NAME_LIMITS.period, 'Grading period');
      out.weight = clamp(row.weight, MAX_WEIGHT);
      if (row.semester !== 1 && row.semester !== 2) out.semester = null;
      break;
    case 'categories':
      out.name = name(row.name, NAME_LIMITS.category, 'Category');
      out.weight = clamp(row.weight, MAX_WEIGHT);
      out.drop_lowest = Math.trunc(clamp(row.drop_lowest, MAX_DROP_LOWEST) ?? 0);
      break;
    case 'assignments': {
      out.title = name(row.title, NAME_LIMITS.assignment, 'Assignment');
      out.max_score = clamp(row.max_score, MAX_SCORE) ?? 0;
      out.actual_score = clamp(row.actual_score, MAX_SCORE);
      out.forecast_score = clamp(row.forecast_score, MAX_SCORE);
      if (typeof row.due_date !== 'string' || !isRealDate(row.due_date)) out.due_date = null;
      // Work with no points possible only fits as extra credit. The grade is
      // the same: it adds its points (if any) and no possible points.
      if ((out.max_score as number) <= 0) out.extra_credit = true;
      // A forecast-only placeholder has no actual score on the server.
      if (out.is_placeholder && out.actual_score !== null) out.is_placeholder = false;
      break;
    }
    case 'upcoming_items':
      break;
  }
  return out;
}
