/**
 * Test helper: an in-memory database on Node's built-in SQLite, behind the
 * same SqlDb interface the app uses with expo-sqlite.
 */
import { migrate } from '@/db/schema';
import { createQueue, type SqlDb } from '@/db/sql';

type NodeStatement = { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] };
type NodeDatabase = { exec(sql: string): void; prepare(sql: string): NodeStatement };

export async function createTestDatabase(): Promise<SqlDb> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => NodeDatabase };
  const native = new DatabaseSync(':memory:');
  const enqueue = createQueue();
  const db: SqlDb = {
    exec: async (sql) => native.exec(sql),
    run: async (sql, params = []) => {
      native.prepare(sql).run(...params);
    },
    // Plain objects, like expo-sqlite returns.
    all: async <T>(sql: string, params: unknown[] = []) =>
      native.prepare(sql).all(...params).map((row) => ({ ...(row as object) })) as T[],
    transaction: (work) =>
      enqueue(async () => {
        native.exec('begin');
        try {
          const result = await work();
          native.exec('commit');
          return result;
        } catch (error) {
          native.exec('rollback');
          throw error;
        }
      }),
  };
  await migrate(db);
  return db;
}
