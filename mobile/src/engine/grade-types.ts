/**
 * Grades as the screens show them, computed by ./grade-engine.ts.
 *
 * Percents are 0–100 rounded to 2 decimals; `null` means nothing is graded yet.
 * "Current" uses actual scores only; "projected" fills ungraded work with forecasts.
 */
import type { GradingMode } from '@/data/types';

export type LetterGrade = { percent: number | null; letter: string | null };

export type CategoryGrades = {
  categoryId: string;
  name: string;
  weight: number | null;
  dropLowest: number;
  currentPercent: number | null;
  projectedPercent: number | null;
};

export type PeriodKind = 'quarter' | 'semester_exam' | 'other';

export type PeriodGrades = {
  periodId: string;
  name: string;
  kind: PeriodKind;
  /** 1 or 2, from the period itself or its name (Q1/Q2/Midterm → 1). */
  semester: number | null;
  weight: number | null;
  currentPercent: number | null;
  projectedPercent: number | null;
  categories: CategoryGrades[];
};

export type SemesterGrades = {
  semester: number;
  label: 'Midterm' | 'Final' | null;
  /** The exam's share of the semester grade, in percent. */
  examWeight: number;
  currentPercent: number | null;
  projectedPercent: number | null;
};

/** Work with no actual grade yet: what a student can forecast. */
export type UngradedAssignment = {
  assignmentId: string;
  periodId: string;
  categoryId: string;
  title: string;
  /** `YYYY-MM-DD`, when known. */
  dueDate: string | null;
  maxScore: number;
  /** The forecast, or `null` when there is none yet. */
  forecastScore: number | null;
  /** `true` for work that is not in Schoology yet (added with `addForecast`). */
  isPlaceholder: boolean;
};

export type CourseGrades = {
  courseId: string;
  name: string;
  teacher: string | null;
  gradingMode: GradingMode;
  current: LetterGrade;
  projected: LetterGrade;
  periods: PeriodGrades[];
  semesters: SemesterGrades[];
  ungraded: UngradedAssignment[];
};

export type NewForecast = {
  /** The category the work belongs to (from `CourseGrades.periods[].categories[]`). */
  categoryId: string;
  title: string;
  /** Points possible; must be more than 0. */
  maxScore: number;
  /** Points you expect to earn. */
  forecastScore: number;
  /** `YYYY-MM-DD`. */
  dueDate?: string | null;
};
