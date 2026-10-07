/**
 * The synced tables: their columns (as in Supabase) and how they nest.
 * Listed parents first, which is the order to save them in.
 */
export const SYNC_TABLES = [
  'courses',
  'grading_periods',
  'categories',
  'assignments',
  'upcoming_items',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** The data columns of each table (not the `dirty` / `deleted` sync columns). */
export const COLUMNS: Record<SyncTable, readonly string[]> = {
  courses: ['id', 'name', 'teacher', 'grading_mode', 'position', 'source', 'archived_at'],
  grading_periods: ['id', 'course_id', 'name', 'kind', 'semester', 'weight', 'position'],
  categories: ['id', 'period_id', 'name', 'weight', 'drop_lowest', 'position'],
  assignments: [
    'id',
    'category_id',
    'title',
    'due_date',
    'max_score',
    'actual_score',
    'forecast_score',
    'excused',
    'extra_credit',
    'is_placeholder',
    'source',
    'position',
  ],
  upcoming_items: ['id', 'course_id', 'external_uid', 'title', 'due_at', 'url'],
};

/** Stored as 0/1 in SQLite, sent as true/false to the server. */
export const BOOLEAN_COLUMNS = new Set(['excused', 'extra_credit', 'is_placeholder']);

/** Each table's children: deleting a row deletes these too. */
export const CHILDREN: Partial<Record<SyncTable, { table: SyncTable; column: string }[]>> = {
  courses: [{ table: 'grading_periods', column: 'course_id' }],
  grading_periods: [{ table: 'categories', column: 'period_id' }],
  categories: [{ table: 'assignments', column: 'category_id' }],
};

export function isSyncTable(name: string): name is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(name);
}
