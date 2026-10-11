/**
 * Shared data types. The gradebook tree itself (course → period → category →
 * assignment) is in src/engine/types.ts.
 */

/** `weighted`: each category counts for a fixed percent. `points`: every point counts equally. */
export type GradingMode = 'weighted' | 'points';

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
