/**
 * Test helper: an in-memory stand-in for pull_changes / push_changes with the
 * same rules as the real ones in supabase/migrations/ (per-row revisions,
 * tombstones, orphans skipped and reported, deletes cascade).
 */
import { ApiError } from '@/api/errors';
import { CHILDREN, isSyncTable, PARENT, SYNC_TABLES, type SyncTable } from '@/db/tables';
import type { ChangeSet, Deletion, PullResult, WireRow } from '@/sync/changes';
import type { SyncTransport } from '@/sync/sync-engine';

export class FakeSyncServer {
  revision = 0;
  rows = new Map<SyncTable, Map<string, { row: WireRow; revision: number }>>(
    SYNC_TABLES.map((t) => [t, new Map()]),
  );
  tombstones = new Map<string, { table_name: SyncTable; row_id: string; revision: number }>();
  /** Set to make every call fail like a phone with no connection. */
  offline = false;
  pushes = 0;

  private remove(table: SyncTable, id: string) {
    if (!this.rows.get(table)!.delete(id)) return;
    this.tombstones.set(`${table}:${id}`, { table_name: table, row_id: id, revision: ++this.revision });
    for (const child of CHILDREN[table] ?? []) {
      for (const [childId, { row }] of this.rows.get(child.table)!) {
        if (row[child.column] === id) this.remove(child.table, childId);
      }
    }
  }

  transport(): SyncTransport {
    const check = () => {
      if (this.offline) throw new ApiError('network', 'Network request failed');
    };
    return {
      pull: async (since) => {
        check();
        const result: PullResult = { revision: this.revision, deleted: [] };
        for (const table of SYNC_TABLES) {
          result[table] = [...this.rows.get(table)!.values()]
            .filter((r) => r.revision > since)
            .sort((a, b) => a.revision - b.revision)
            .map((r) => ({ ...r.row, revision: r.revision }));
        }
        result.deleted = [...this.tombstones.values()]
          .filter((t) => t.revision > since)
          .map(({ table_name, row_id }) => ({ table_name, row_id }));
        return structuredClone(result);
      },
      push: async (changes: ChangeSet) => {
        check();
        this.pushes++;
        const skipped: Deletion[] = [];
        for (const table of SYNC_TABLES) {
          for (const row of changes[table] ?? []) {
            const parent = PARENT[table];
            const saved = structuredClone(row);
            if (parent && row[parent.column] && !this.rows.get(parent.table)!.has(String(row[parent.column]))) {
              skipped.push({ table_name: table, row_id: String(row.id) });
              if (table !== 'upcoming_items') continue;
              saved[parent.column] = null;
            }
            this.tombstones.delete(`${table}:${row.id}`);
            this.rows.get(table)!.set(String(row.id), { row: saved, revision: ++this.revision });
          }
        }
        for (const d of changes.deleted) {
          if (isSyncTable(d.table_name)) this.remove(d.table_name, d.row_id);
        }
        return { revision: this.revision, skipped };
      },
    };
  }
}
