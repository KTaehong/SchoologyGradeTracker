/**
 * Moving rows between the phone's database and the wire format of
 * pull_changes / push_changes (supabase/migrations/20261006000600_sync.sql).
 */
import { first, type SqlDb, type SqlValue } from '@/db/sql';
import { BOOLEAN_COLUMNS, CHILDREN, COLUMNS, isSyncTable, SYNC_TABLES, type SyncTable } from '@/db/tables';

export type WireRow = Record<string, unknown>;
export type Deletion = { table_name: string; row_id: string };

export type ChangeSet = Partial<Record<SyncTable, WireRow[]>> & { deleted: Deletion[] };
export type PullResult = ChangeSet & { revision: number };

/** What a push sent, so exactly those versions can be marked as synced afterwards. */
export type SentRow = { table: SyncTable; id: string; dirty: number };

function toWire(table: SyncTable, row: Record<string, SqlValue>): WireRow {
  const wire: WireRow = {};
  for (const column of COLUMNS[table]) {
    const value = row[column];
    wire[column] = BOOLEAN_COLUMNS.has(column) ? value === 1 : value;
  }
  return wire;
}

function toSql(column: string, value: unknown): SqlValue {
  if (BOOLEAN_COLUMNS.has(column)) return value ? 1 : 0;
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

/** Every row changed on this phone since the last push, or `null` when there is nothing to send. */
export async function collectLocalChanges(
  db: SqlDb,
): Promise<{ changes: ChangeSet; sent: SentRow[] } | null> {
  const changes: ChangeSet = { deleted: [] };
  const sent: SentRow[] = [];
  for (const table of SYNC_TABLES) {
    const rows = await db.all<Record<string, SqlValue> & { id: string; dirty: number; deleted: number }>(
      `select * from ${table} where dirty > 0`,
    );
    for (const row of rows) {
      sent.push({ table, id: row.id, dirty: row.dirty });
      if (row.deleted === 1) {
        changes.deleted.push({ table_name: table, row_id: row.id });
      } else {
        (changes[table] ??= []).push(toWire(table, row));
      }
    }
  }
  return sent.length > 0 ? { changes, sent } : null;
}

/**
 * After a successful push: rows not changed again meanwhile are now in sync,
 * and pushed deletes can be forgotten.
 */
export async function markPushed(db: SqlDb, sent: SentRow[]): Promise<void> {
  await db.transaction(async () => {
    for (const row of sent) {
      await db.run(`update ${row.table} set dirty = 0 where id = ? and dirty = ?`, [row.id, row.dirty]);
    }
    for (const table of SYNC_TABLES) {
      await db.run(`delete from ${table} where deleted = 1 and dirty = 0`);
    }
  });
}

async function hardDelete(db: SqlDb, table: SyncTable, id: string): Promise<void> {
  for (const child of CHILDREN[table] ?? []) {
    const rows = await db.all<{ id: string }>(`select id from ${child.table} where ${child.column} = ?`, [id]);
    for (const row of rows) {
      await hardDelete(db, child.table, row.id);
    }
  }
  await db.run(`delete from ${table} where id = ?`, [id]);
}

/**
 * Saves rows pulled from the cloud. A row changed on this phone and not pushed
 * yet keeps the phone's version: it is pushed next, so the latest edit wins.
 * Returns how many rows changed here.
 */
export async function applyRemoteChanges(db: SqlDb, pull: ChangeSet): Promise<number> {
  let applied = 0;
  await db.transaction(async () => {
    for (const table of SYNC_TABLES) {
      const columns = COLUMNS[table];
      const upsert = `insert into ${table} (${columns.join(', ')}, dirty, deleted)
        values (${columns.map(() => '?').join(', ')}, 0, 0)
        on conflict (id) do update set
          ${columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')},
          dirty = 0, deleted = 0`;
      for (const row of pull[table] ?? []) {
        const local = await first<{ dirty: number }>(db, `select dirty from ${table} where id = ?`, [
          String(row.id),
        ]);
        if (local && local.dirty > 0) {
          continue;
        }
        await db.run(
          upsert,
          columns.map((c) => toSql(c, row[c])),
        );
        applied++;
      }
    }
    for (const deletion of pull.deleted) {
      if (!isSyncTable(deletion.table_name)) {
        continue;
      }
      const local = await first<{ dirty: number; deleted: number }>(
        db,
        `select dirty, deleted from ${deletion.table_name} where id = ?`,
        [deletion.row_id],
      );
      if (!local || (local.dirty > 0 && local.deleted === 0)) {
        continue;
      }
      await hardDelete(db, deletion.table_name, deletion.row_id);
      applied++;
    }
  });
  return applied;
}
