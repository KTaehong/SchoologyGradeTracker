/**
 * Checks the manual-entry forms (F06) — class, category, assignment — so the
 * student sees a clear message before anything is saved. The limits match the
 * Supabase tables, so a saved row always syncs.
 */
import type { AssignmentFields, CategoryFields, CourseFields, NewPeriod } from '@/db/gradebook-repo';
import type { GradingMode } from '@/data/types';

import { isIsoDate, parseScore, type FormResult } from './forecast-form';

/** How the school year is split. Names follow Schoology, so semesters are inferred (Q1/Q2 → 1). */
export const PERIOD_PRESETS: { label: string; periods: NewPeriod[] }[] = [
  { label: 'Whole year', periods: [{ name: 'Year', kind: 'other' }] },
  {
    label: 'Quarters',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'].map((name) => ({ name, kind: 'quarter' })),
  },
  {
    label: 'Quarters + exams',
    periods: [
      { name: 'Q1', kind: 'quarter' },
      { name: 'Q2', kind: 'quarter' },
      { name: 'Midterm', kind: 'semester_exam' },
      { name: 'Q3', kind: 'quarter' },
      { name: 'Q4', kind: 'quarter' },
      { name: 'Final', kind: 'semester_exam' },
    ],
  },
];

export type CourseForm = { name: string; teacher: string; gradingMode: GradingMode };

export function validateCourse(form: CourseForm): FormResult<CourseFields> {
  const name = form.name.trim();
  if (!name) {
    return { ok: false, error: 'Give the class a name, for example "AP Biology".' };
  }
  if (name.length > 200) {
    return { ok: false, error: 'The class name is too long (200 characters at most).' };
  }
  const teacher = form.teacher.trim();
  if (teacher.length > 200) {
    return { ok: false, error: "The teacher's name is too long (200 characters at most)." };
  }
  return { ok: true, value: { name, teacher: teacher || null, gradingMode: form.gradingMode } };
}

export type CategoryForm = { name: string; weight: string; dropLowest: string };

/** An empty weight is allowed: when no category has a weight, they all count equally. */
export function validateCategory(form: CategoryForm): FormResult<CategoryFields> {
  const name = form.name.trim();
  if (!name) {
    return { ok: false, error: 'Give the category a name, for example "Tests".' };
  }
  if (name.length > 100) {
    return { ok: false, error: 'The category name is too long (100 characters at most).' };
  }

  let weight: number | null = null;
  if (form.weight.trim()) {
    weight = parseScore(form.weight.replace('%', ''));
    if (weight === null || weight > 1000) {
      return { ok: false, error: 'Write the weight as a percent, for example 40, or leave it empty.' };
    }
  }

  let dropLowest = 0;
  if (form.dropLowest.trim()) {
    const parsed = parseScore(form.dropLowest);
    if (parsed === null || !Number.isInteger(parsed) || parsed > 100) {
      return { ok: false, error: 'Drop lowest must be a whole number, for example 0, 1 or 2.' };
    }
    dropLowest = parsed;
  }
  return { ok: true, value: { name, weight, dropLowest } };
}

export type AssignmentForm = {
  title: string;
  /** Empty = not graded yet. */
  actualScore: string;
  maxScore: string;
  /** Optional, `YYYY-MM-DD`. */
  dueDate: string;
  excused: boolean;
  extraCredit: boolean;
};

export function validateAssignment(form: AssignmentForm): FormResult<AssignmentFields> {
  const title = form.title.trim();
  if (!title) {
    return { ok: false, error: 'Give the assignment a name, for example "Lab 3".' };
  }
  if (title.length > 300) {
    return { ok: false, error: 'The assignment name is too long (300 characters at most).' };
  }
  const maxScore = parseScore(form.maxScore);
  if (maxScore === null || (maxScore <= 0 && !form.extraCredit)) {
    return { ok: false, error: 'Points possible must be a number more than 0.' };
  }
  let actualScore: number | null = null;
  if (form.actualScore.trim()) {
    actualScore = parseScore(form.actualScore);
    if (actualScore === null) {
      return { ok: false, error: 'Enter the points you got, for example 18 or 18.5 — or leave it empty.' };
    }
  }
  if (maxScore > 999999 || (actualScore ?? 0) > 999999) {
    return { ok: false, error: 'That score is too large.' };
  }
  const dueDate = form.dueDate.trim();
  if (dueDate && !isIsoDate(dueDate)) {
    return { ok: false, error: 'Write the due date as YYYY-MM-DD, or leave it empty.' };
  }
  return {
    ok: true,
    value: {
      title,
      actualScore,
      maxScore,
      dueDate: dueDate || null,
      excused: form.excused,
      extraCredit: form.extraCredit,
    },
  };
}

/** Starting form text for a number that may be missing. */
export const numberText = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);
