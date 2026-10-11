import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';
import { createQueue, type SqlDb } from './sql';

const FILE_NAME = 'gradebook.db';

let opening: Promise<SqlDb> | null = null;

/** The phone's gradebook database, opened and upgraded once per app run. */
export function openGradebookDatabase(): Promise<SqlDb> {
  opening ??= (async () => {
    const native = await SQLite.openDatabaseAsync(FILE_NAME);
    await native.execAsync('pragma journal_mode = wal');
    const db = wrapExpoDatabase(native);
    await migrate(db);
    return db;
  })();
  return opening;
}

export function wrapExpoDatabase(native: SQLite.SQLiteDatabase): SqlDb {
  const enqueue = createQueue();
  return {
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params = []) => {
      await native.runAsync(sql, params);
    },
    all: (sql, params = []) => native.getAllAsync(sql, params),
    // withTransactionAsync does not stop other code from writing at the same
    // time, so transactions also wait their turn in a queue.
    transaction: (work) =>
      enqueue(async () => {
        let result!: Awaited<ReturnType<typeof work>>;
        await native.withTransactionAsync(async () => {
          result = await work();
        });
        return result;
      }),
  };
}
