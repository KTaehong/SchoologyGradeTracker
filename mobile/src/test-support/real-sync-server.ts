/**
 * Test helper: the real cloud database, run in memory with PGlite (Postgres
 * compiled to WebAssembly). It applies every file in supabase/migrations/, so
 * pushes are checked against the real tables, CHECK constraints, triggers and
 * the real pull_changes / push_changes — unlike FakeSyncServer, which only
 * copies the sync rules.
 *
 * Each call runs as a signed-in student, the way PostgREST runs an RPC.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApiError, toApiError } from '@/api/errors';
import type { RpcCaller } from '@/api/rpc';
import type { ChangeSet, PullResult } from '@/sync/changes';
import type { SyncTransport } from '@/sync/sync-engine';

const SUPABASE_DIR = join(__dirname, '..', '..', '..', 'supabase');

export class RealSyncServer {
  private constructor(private readonly pg: PGlite) {}

  /** Should every call fail like a phone with no connection? */
  offline = false;

  static async start(): Promise<RealSyncServer> {
    // Jest's module loader hides import.meta.url, so PGlite cannot find its own
    // files: load them here and hand them over.
    // React Native's Jest setup also defines `window`, which makes PGlite think
    // it is in a browser, so hide it while PGlite starts.
    const dist = join(require.resolve('@electric-sql/pglite'), '..');
    const g = globalThis as { window?: unknown };
    const savedWindow = g.window;
    delete g.window;
    let pg: PGlite;
    try {
      pg = await PGlite.create({
        pgliteWasmModule: await WebAssembly.compile(readFileSync(join(dist, 'pglite.wasm'))),
        initdbWasmModule: await WebAssembly.compile(readFileSync(join(dist, 'initdb.wasm'))),
        fsBundle: new Blob([readFileSync(join(dist, 'pglite.data'))]),
      });
    } finally {
      g.window = savedWindow;
    }
    await pg.exec(readFileSync(join(SUPABASE_DIR, 'tests', 'local', 'supabase_stub.sql'), 'utf8'));
    await pg.exec('create publication supabase_realtime');
    const migrations = readdirSync(join(SUPABASE_DIR, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const file of migrations) {
      await pg.exec(readFileSync(join(SUPABASE_DIR, 'migrations', file), 'utf8'));
    }
    return new RealSyncServer(pg);
  }

  /** Creates an account (the sign-up trigger makes its profile). */
  async addStudent(id: string, username: string): Promise<void> {
    await this.pg.query(
      `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
       values ($1, $2, $3, '{"providers": ["email"]}')`,
      [id, `${username}@example.com`, JSON.stringify({ full_name: username, username })],
    );
  }

  /** Runs `fn(args)` as the student, like supabase.rpc(fn, args) (named arguments). */
  async rpc(studentId: string, fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (this.offline) throw new ApiError('network', 'Network request failed');
    const names = Object.keys(args);
    const params = names.map((name) => {
      const value = args[name];
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    });
    const call = `public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(', ')})`;
    try {
      return await this.pg.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: studentId, role: 'authenticated' }),
        ]);
        const { rows } = await tx.query<{ result: unknown }>(`select ${call} as result`, params);
        return rows[0].result;
      });
    } catch (e) {
      const error = e as { message: string; code?: string };
      throw toApiError({ message: error.message, code: error.code ?? null });
    }
  }

  /** An RpcCaller signed in as the student (for createGradesApi and friends). */
  caller(studentId: string): RpcCaller {
    return (fn, args) => this.rpc(studentId, fn, args);
  }

  transport(studentId: string): SyncTransport {
    return {
      pull: async (since) => (await this.rpc(studentId, 'pull_changes', { p_since: since })) as PullResult,
      push: async (changes: ChangeSet) =>
        (await this.rpc(studentId, 'push_changes', { p_changes: changes })) as { revision: number },
    };
  }

  /** A plain query with no row-level security (to check what the cloud holds). */
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  close(): Promise<void> {
    return this.pg.close();
  }
}
