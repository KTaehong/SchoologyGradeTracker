/**
 * The gradebook as the grade engine sees it: one course, nested
 * course → grading period → category → assignment.
 *
 * These mirror the Supabase tables (supabase/migrations/*_gradebook.sql) so the
 * same rows can live on the phone (SQLite) and in the cloud.
 */
import type { PeriodKind } from '@/api/grades';
import type { GradingMode } from '@/data/types';

export type { GradingMode, PeriodKind };

export type GradeAssignment = {
  id: string;
  title: string;
  /** `YYYY-MM-DD`, when known. */
  dueDate: string | null;
  maxScore: number;
  /** The real grade, or `null` when not graded yet. */
  actualScore: number | null;
  /** The grade the student expects; used by "projected" when there is no actual grade. */
  forecastScore: number | null;
  /** Excused work never counts. */
  excused: boolean;
  /** Adds earned points without adding possible points. */
  extraCredit: boolean;
  /** A forecast for work that is not in Schoology yet. */
  isPlaceholder: boolean;
  position: number;
};

export type GradeCategory = {
  id: string;
  name: string;
  /** Percent of the period grade in a weighted course; `null` = no weight set. */
  weight: number | null;
  dropLowest: number;
  position: number;
  assignments: GradeAssignment[];
};

export type GradePeriod = {
  id: string;
  name: string;
  kind: PeriodKind;
  /** 1 or 2; when `null` it is inferred from the name (Q1/Q2/Midterm → 1). */
  semester: number | null;
  /** Share of the course grade; for a semester exam, its share of the semester. */
  weight: number | null;
  position: number;
  categories: GradeCategory[];
};

export type GradeCourse = {
  id: string;
  name: string;
  teacher: string | null;
  gradingMode: GradingMode;
  position: number;
  periods: GradePeriod[];
};
