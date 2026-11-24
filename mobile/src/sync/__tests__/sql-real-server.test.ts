/**
 * Runs the SQL test files in supabase/tests/ in the in-memory Postgres, so
 * `npm test` checks row-level security and grants without a database install.
 * (demo_accounts_test.sql needs pgcrypto; CI runs it through run_local.sh.)
 */
import { afterAll, beforeAll, describe, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RealSyncServer } from '@/test-support/real-sync-server';

const cloud = process.execArgv.some((arg) => arg.includes('experimental-vm-modules'));
const describeCloud = cloud ? describe : describe.skip;
const DIR = join(__dirname, '..', '..', '..', '..', 'supabase', 'tests');
const files = readdirSync(DIR).filter((f) => f.endsWith('_test.sql') && f !== 'demo_accounts_test.sql');

let server: RealSyncServer;

beforeAll(async () => {
  if (cloud) server = await RealSyncServer.start();
}, 60_000);

afterAll(async () => {
  await server?.close();
});

describeCloud('SQL tests', () => {
  it.each(files)(
    '%s',
    async (file) => {
      await server.script(readFileSync(join(DIR, file), 'utf8'));
    },
    60_000,
  );
});
