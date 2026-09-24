/**
 * The gradebook as stored on the phone: course → grading period → category → assignment,
 * plus the upcoming-assignments agenda.
 */

/** `weighted`: each category counts for a fixed percent. `points`: every point counts equally. */
export type GradingMode = 'weighted' | 'points';

export type Assignment = {
  id: string;
  title: string;
  /** Points earned, or `null` when not graded yet. */
  score: number | null;
  maxScore: number;
  /** Due date as `YYYY-MM-DD`, when known. */
  dueDate: string | null;
  /** Excused assignments never count toward the grade. */
  excused?: boolean;
  /** Extra-credit points add to the earned total without adding to the possible total. */
  extraCredit?: boolean;
};

export type Category = {
  id: string;
  name: string;
  /** Percent of the period grade (0–100) in a weighted course; `null` in a points course. */
  weight: number | null;
  /** How many of the lowest scores in this category are dropped. */
  dropLowest?: number;
  assignments: Assignment[];
};

export type GradingPeriod = {
  id: string;
  /** For example `Q1`, `Q2`, `Midterm exam`. */
  name: string;
  categories: Category[];
};

export type Course = {
  id: string;
  name: string;
  teacher: string | null;
  gradingMode: GradingMode;
  periods: GradingPeriod[];
};

export type UpcomingItem = {
  id: string;
  title: string;
  /** The course this item belongs to, or `null` when it could not be matched. */
  courseId: string | null;
  /** When it is due, as an ISO 8601 date-time. */
  dueAt: string;
  /** Link to the item in Schoology, when known. */
  url: string | null;
};

export const GRADEBOOK_SCHEMA_VERSION = 1;

export type Gradebook = {
  schemaVersion: typeof GRADEBOOK_SCHEMA_VERSION;
  courses: Course[];
  upcoming: UpcomingItem[];
  /** When the gradebook last changed, as an ISO 8601 date-time. */
  updatedAt: string;
};

export function createEmptyGradebook(now: Date = new Date()): Gradebook {
  return {
    schemaVersion: GRADEBOOK_SCHEMA_VERSION,
    courses: [],
    upcoming: [],
    updatedAt: now.toISOString(),
  };
}
