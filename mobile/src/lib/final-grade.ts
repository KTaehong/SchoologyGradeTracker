/**
 * "What do I need on this to reach my target?" (F09): the choices and the
 * answer's wording. The math is requiredScore in src/engine/grade-engine.ts.
 */
import type { RequiredScore } from '@/engine/grade-engine';
import type { GradeCourse } from '@/engine/types';

import { formatNumber } from './format-grade';
import { parseScore, type FormResult } from './forecast-form';

export type CalculatorItem = { id: string; label: string; title: string; maxScore: number };

/** Work with no grade yet that can change the grade: exams first, then the latest due. */
export function calculatorItems(course: GradeCourse): CalculatorItem[] {
  const items = course.periods.flatMap((p) =>
    p.categories.flatMap((c) =>
      c.assignments
        .filter((a) => a.actualScore === null && !a.excused && !a.extraCredit && a.maxScore > 0)
        .map((a) => ({
          id: a.id,
          label: `${a.title} · ${p.name}`,
          title: a.title,
          maxScore: a.maxScore,
          exam: p.kind === 'semester_exam' || /\b(final|midterm|exam)\b/i.test(`${a.title} ${c.name}`),
          due: a.dueDate ?? '',
        })),
    ),
  );
  items.sort((a, b) => Number(b.exam) - Number(a.exam) || b.due.localeCompare(a.due) || a.title.localeCompare(b.title));
  return items.map(({ id, label, title, maxScore }) => ({ id, label, title, maxScore }));
}

/** The target typed by the student, in percent. */
export function parseTarget(text: string): FormResult<number> {
  const value = parseScore(text.replace('%', ''));
  if (value === null || value <= 0) {
    return { ok: false, error: 'Enter the grade you want in percent, for example 90.' };
  }
  if (value > 150) {
    return { ok: false, error: 'Enter a target of 150% or less.' };
  }
  return { ok: true, value };
}

/** The answer in words. */
export function describeRequired(result: RequiredScore | null, item: CalculatorItem, target: number): string {
  const goal = `${formatNumber(target)}%`;
  if (result === null) {
    return 'This work does not change your grade.';
  }
  switch (result.status) {
    case 'already_secured':
      return `You reach ${goal} even with a 0 on ${item.title}.`;
    case 'not_possible':
      return `Even full points on ${item.title} do not reach ${goal}. Try a lower target.`;
    case 'needed':
      return `You need ${formatNumber(result.requiredScore)} out of ${formatNumber(item.maxScore)} (${formatNumber(result.requiredPercent)}%) on ${item.title} to reach ${goal}.`;
  }
}
