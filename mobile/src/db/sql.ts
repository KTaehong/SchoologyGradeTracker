/**
 * The little bit of SQLite the app needs. On the phone this is expo-sqlite
 * (./open-database.ts); in tests it is Node's built-in SQLite, so the same
 * queries run in both places.
 */
export type SqlValue = string | number | null;

export interface SqlDb {
  /** Runs one or more statements with no parameters (schema changes). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /**
   * Runs `work` in a transaction: all of it is saved, or none of it.
   * Transactions run one at a time, so two writes never interleave.
   */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/** Runs async jobs one after another (SQLite has one writer at a time). */
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  };
}

export async function first<T>(db: SqlDb, sql: string, params?: SqlValue[]): Promise<T | null> {
  const rows = await db.all<T>(sql, params);
  return rows[0] ?? null;
}
