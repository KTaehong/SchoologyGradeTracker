/**
 * Screenshot import (F04), last step: decides where each row read off the
 * picture goes, before anything is saved. Plain functions, tested in Jest.
 */
import type { ScreenshotRow } from '@/db/gradebook-repo';
import { matchCategory, type ParsedRow } from '@/import/screenshot-parser';
import { clipText, MAX_SCORE, NAME_LIMITS } from '@/sync/server-limits';

type Category = { id: string; name: string };

export type PlannedRow = {
  row: ParsedRow;
  /** Where it will be saved, or `null` when it will be skipped. */
  category: Category | null;
  /** Why it will be skipped, for the student. */
  skip: string | null;
};

export type ScreenshotPlan = {
  rows: PlannedRow[];
  /** What to save (the rows that are not skipped). */
  save: ScreenshotRow[];
  /** Rows with no matching category heading (they go to the fallback category). */
  unmatched: number;
};

/**
 * Each row goes to the category its heading names (like "Tests (40%)"), or to
 * `fallbackId` when the heading was cut off or matches nothing. Rows that show
 * no points possible ("Missing" on its own) cannot be saved: there is nothing
 * to grade them out of.
 */
export function planScreenshotRows(
  rows: ParsedRow[],
  categories: Category[],
  fallbackId: string | null,
): ScreenshotPlan {
  const fallback = categories.find((c) => c.id === fallbackId) ?? null;
  let unmatched = 0;
  const planned = rows.map((row): PlannedRow => {
    const matched = matchCategory(row.category, categories);
    if (!matched) unmatched++;
    const category = matched ?? fallback;
    if (row.max === null || !(row.max > 0)) {
      return { row, category: null, skip: 'No points possible on the screenshot' };
    }
    if (!category) {
      return { row, category: null, skip: 'Pick a category for this row' };
    }
    return { row, category, skip: null };
  });

  const save = planned
    .filter((p): p is PlannedRow & { category: Category } => p.category !== null)
    .map(
      ({ row, category }): ScreenshotRow => ({
        categoryId: category.id,
        title: clipText(row.title, NAME_LIMITS.assignment),
        dueDate: row.dueDate,
        maxScore: Math.min(row.max as number, MAX_SCORE),
        actualScore: row.status === 'graded' && row.earned !== null ? Math.min(row.earned, MAX_SCORE) : null,
        excused: row.status === 'excused',
      }),
    );
  return { rows: planned, save, unmatched };
}
