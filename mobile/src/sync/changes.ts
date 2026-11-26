/**
 * Moving rows between the phone's database and the wire format of
 * pull_changes / push_changes (supabase/migrations/20261006000600_sync.sql).
 */
import { first, type SqlDb, type SqlValue } from '@/db/sql';
import { BOOLEAN_COLUMNS, CHILDREN, COLUMNS, isSyncTable, PARENT, SYNC_TABLES, type SyncTable } from '@/db/tables';

import { fitToServer } from './server-limits';

export type WireRow = Record<string, unknown>;
export type Deletion = { table_name: string; row_id: string };

export type ChangeSet = Partial<Record<SyncTable, WireRow[]>> & { deleted: Deletion[] };
export type PullResult = ChangeSet & { revision: number };
/**
 * `skipped`: rows whose parent is not in the cloud (missing from older servers).
 * `conflicts`: rows changed in the cloud after the pull this push was based on;
 * the server did not save them (missing from older servers).
 */
export type PushResult = { revision: number; skipped?: Deletion[]; conflicts?: Deletion[] };

/** What a push sent, so exactly those versions can be marked as synced afterwards. */
export type SentRow = { table: SyncTable; id: string; dirty: number };

function toWire(table: SyncTable, row: Record<string, SqlValue>): WireRow {
  const wire: WireRow = {};
  for (const column of COLUMNS[table]) {
    const value = row[column];
    wire[column] = BOOLEAN_COLUMNS.has(column) ? value === 1 : value;
  }
  return fitToServer(table, wire);
}

function toSql(column: string, value: unknown): SqlValue {
  if (BOOLEAN_COLUMNS.has(column)) return value ? 1 : 0;
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

/**
 * Runs first inside each transaction below. The sync engine uses it to check
 * that the gradebook still belongs to its account: if it throws, the
 * transaction reads and writes nothing.
 */
export type Check = () => Promise<void>;

/** Every row changed on this phone since the last push, or `null` when there is nothing to send. */
export async function collectLocalChanges(
  db: SqlDb,
  check?: Check,
): Promise<{ changes: ChangeSet; sent: SentRow[] } | null> {
  return db.transaction(async () => {
    await check?.();
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
  });
}

/**
 * After a successful push: rows not changed again meanwhile are now in sync,
 * and pushed deletes can be forgotten. Rows the server skipped stay unsent (see
 * repairSkipped). Rows in `conflicts` stay unsent too: the next sync pulls the
 * newer cloud version first and then sends them again. Returns whether
 * anything needs to be sent again.
 */
export async function markPushed(
  db: SqlDb,
  sent: SentRow[],
  { skipped = [], conflicts = [] }: Pick<PushResult, 'skipped' | 'conflicts'> = {},
  check?: Check,
): Promise<boolean> {
  const notSaved = new Set([...skipped, ...conflicts].map((s) => `${s.table_name}:${s.row_id}`));
  return db.transaction(async () => {
    await check?.();
    for (const row of sent) {
      if (notSaved.has(`${row.table}:${row.id}`)) continue;
      await db.run(`update ${row.table} set dirty = 0 where id = ? and dirty = ?`, [row.id, row.dirty]);
    }
    for (const table of SYNC_TABLES) {
      await db.run(`delete from ${table} where deleted = 1 and dirty = 0`);
    }
    let again = conflicts.length > 0;
    for (const row of skipped) {
      if (isSyncTable(row.table_name) && (await repairSkipped(db, row.table_name, row.row_id))) {
        again = true;
      }
    }
    return again;
  });
}

/**
 * The server could not save a row because its parent is not in the cloud. If
 * the parent is on this phone, send it (and its own parents) next time; if it
 * is gone here too, the row has nowhere to live.
 */
async function repairSkipped(db: SqlDb, table: SyncTable, id: string): Promise<boolean> {
  const link = PARENT[table];
  const row = await first<Record<string, SqlValue>>(db, `select * from ${table} where id = ? and deleted = 0`, [id]);
  if (!link || !row) return false;
  const parentId = row[link.column];
  if (parentId !== null && (await markWithParents(db, link.table, String(parentId)))) {
    return true;
  }
  if (table === 'upcoming_items') {
    // Saved in the cloud without its class, which is gone: the same here.
    await db.run('update upcoming_items set course_id = null, dirty = 0 where id = ?', [id]);
  } else {
    await hardDelete(db, table, id);
  }
  return false;
}

/** Marks a row and its parents as unsent. `false` when the row is not on this phone. */
async function markWithParents(db: SqlDb, table: SyncTable, id: string): Promise<boolean> {
  const row = await first<Record<string, SqlValue>>(db, `select * from ${table} where id = ? and deleted = 0`, [id]);
  if (!row) return false;
  await db.run(`update ${table} set dirty = dirty + 1 where id = ?`, [id]);
  const link = PARENT[table];
  if (link && row[link.column] !== null) {
    await markWithParents(db, link.table, String(row[link.column]));
  }
  return true;
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

/** Whether a row, or anything inside it, was changed on this phone and not pushed yet. */
async function hasUnsentEdits(db: SqlDb, table: SyncTable, id: string): Promise<boolean> {
  const row = await first<{ dirty: number; deleted: number }>(db, `select dirty, deleted from ${table} where id = ?`, [id]);
  if (row && row.dirty > 0 && row.deleted === 0) return true;
  for (const child of CHILDREN[table] ?? []) {
    const rows = await db.all<{ id: string }>(`select id from ${child.table} where ${child.column} = ?`, [id]);
    for (const r of rows) {
      if (await hasUnsentEdits(db, child.table, r.id)) return true;
    }
  }
  return false;
}

/** Marks a row and everything in it as unsent, and adds them to `kept`. */
async function keepWhole(db: SqlDb, table: SyncTable, id: string, kept: Set<string>): Promise<void> {
  await db.run(`update ${table} set dirty = dirty + 1 where id = ? and deleted = 0`, [id]);
  kept.add(`${table}:${id}`);
  for (const child of CHILDREN[table] ?? []) {
    const rows = await db.all<{ id: string }>(`select id from ${child.table} where ${child.column} = ?`, [id]);
    for (const row of rows) {
      await keepWhole(db, child.table, row.id, kept);
    }
  }
}

/** Whether two values of a column are the same, whatever form the server sent them in. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (a === b) return true;
  // Timestamps: "…T00:00:00.000Z" here, "…T00:00:00+00:00" from Postgres.
  const [x, y] = [String(a), String(b)];
  return /^\d{4}-\d{2}-\d{2}T/.test(x) && /^\d{4}-\d{2}-\d{2}T/.test(y) && Date.parse(x) === Date.parse(y);
}

/**
 * An edit beats a delete, also when the edit reached the cloud first: a pulled
 * row that this phone has deleted (and not pushed yet) and whose values differ
 * from this phone's copy was edited on another device. The delete is undone for
 * the whole of what was deleted with it (from the top-most deleted parent down),
 * so the class does not come back half empty. A pulled row with the same values
 * is this phone's own earlier push coming back, so that delete stands.
 *
 * Returns the restored rows as `table:id`.
 */
async function undoDeletesEditedElsewhere(db: SqlDb, pull: ChangeSet): Promise<Set<string>> {
  const restored = new Set<string>();
  for (const table of SYNC_TABLES) {
    for (const row of pull[table] ?? []) {
      const id = String(row.id);
      if (restored.has(`${table}:${id}`)) continue;
      const local = await first<Record<string, SqlValue>>(
        db,
        `select * from ${table} where id = ? and deleted = 1 and dirty > 0`,
        [id],
      );
      if (!local) continue;
      const mine = toWire(table, local);
      if (COLUMNS[table].every((c) => sameValue(mine[c], row[c]))) continue;

      // Climb to the top-most parent that was deleted here too.
      let [top, topId] = [table, id] as [SyncTable, string];
      for (;;) {
        const link = table === 'upcoming_items' ? undefined : PARENT[top];
        if (!link) break;
        const child = await first<Record<string, SqlValue>>(db, `select ${link.column} as parent from ${top} where id = ?`, [topId]);
        const parentId = child?.parent;
        if (parentId === null || parentId === undefined) break;
        const parent = await first<{ deleted: number }>(db, `select deleted from ${link.table} where id = ?`, [String(parentId)]);
        if (!parent || parent.deleted !== 1) break;
        [top, topId] = [link.table, String(parentId)];
      }
      await restoreWhole(db, top, topId, restored);
    }
  }
  return restored;
}

/** Undoes this phone's unsent delete of a row and everything in it. They stay unsent, so they are pushed back. */
async function restoreWhole(db: SqlDb, table: SyncTable, id: string, restored: Set<string>): Promise<void> {
  await db.run(`update ${table} set deleted = 0 where id = ? and deleted = 1`, [id]);
  restored.add(`${table}:${id}`);
  for (const child of CHILDREN[table] ?? []) {
    const rows = await db.all<{ id: string }>(
      `select id from ${child.table} where ${child.column} = ? and deleted = 1 and dirty > 0`,
      [id],
    );
    for (const row of rows) {
      await restoreWhole(db, child.table, row.id, restored);
    }
  }
}

/**
 * Saves rows pulled from the cloud. A row changed on this phone and not pushed
 * yet keeps the phone's version: it is pushed next, so the last phone to sync
 * wins (docs/sync.md).
 *
 * An edit beats a delete: when another device deleted a class (or a period or
 * category) and this phone has unsent edits anywhere in it, all of it is kept
 * and pushed back, so the edit is not lost and the class does not come back
 * half empty. The same holds the other way round: when this phone deleted
 * something another device has since edited, the delete is undone (see
 * undoDeletesEditedElsewhere).
 *
 * `check` and `after` run in the same transaction, first and last.
 * Returns how many rows changed here.
 */
export async function applyRemoteChanges(
  db: SqlDb,
  pull: ChangeSet,
  check?: Check,
  after?: () => Promise<void>,
): Promise<number> {
  let applied = 0;
  await db.transaction(async () => {
    await check?.();
    const restored = await undoDeletesEditedElsewhere(db, pull);
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
        // A restored row takes the other device's edit; the rest of what was
        // restored stays unsent and is pushed back as it is.
        if (local && local.dirty > 0 && !restored.has(`${table}:${String(row.id)}`)) {
          continue;
        }
        if (table === 'upcoming_items' && row.external_uid) {
          // This phone fetched the same calendar item under its own id and has
          // not pushed it yet. The push makes the server keep this phone's copy
          // (and delete the other), so taking the other here would show it twice.
          const twin = await first<{ id: string }>(
            db,
            'select id from upcoming_items where external_uid = ? and id <> ? and deleted = 0 and dirty > 0',
            [String(row.external_uid), String(row.id)],
          );
          if (twin) {
            continue;
          }
        }
        await db.run(
          upsert,
          columns.map((c) => toSql(c, row[c])),
        );
        applied++;
      }
    }
    // Parents before children, so a class that is kept keeps all of itself.
    const kept = new Set<string>();
    for (const table of SYNC_TABLES) {
      for (const deletion of pull.deleted) {
        if (deletion.table_name !== table || kept.has(`${table}:${deletion.row_id}`)) {
          continue;
        }
        const local = await first<{ id: string }>(db, `select id from ${table} where id = ?`, [deletion.row_id]);
        if (!local) {
          continue;
        }
        if (await hasUnsentEdits(db, table, deletion.row_id)) {
          await keepWhole(db, table, deletion.row_id, kept);
          continue;
        }
        await hardDelete(db, table, deletion.row_id);
        applied++;
      }
    }
    await after?.();
  });
  return applied;
}
