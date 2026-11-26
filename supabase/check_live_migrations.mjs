#!/usr/bin/env node
// Checks that every file in supabase/migrations/ is applied to the live project.
//
//   SUPABASE_ACCESS_TOKEN=<personal access token> node supabase/check_live_migrations.mjs
//
// It reads the live migration history through the Supabase Management API
// (read only) and compares its versions with the file names (the number before
// the first "_"). It fails when a file is missing on live, so a merged
// migration that nobody applied is noticed the same day. Live entries with no
// file are reported but do not fail the check.
//
// The token is a personal access token (supabase.com → Account → Access
// tokens). In GitHub it is the repository secret SUPABASE_ACCESS_TOKEN; without
// it the check is skipped with a notice. Never commit the token.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'mjbujhsixgfaluhuvxnn';
const token = process.env.SUPABASE_ACCESS_TOKEN;

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ version: f.split('_')[0], file: f }));

/** The pure comparison, exported for the test. */
export function compare(fileList, liveVersions) {
  const live = new Set(liveVersions);
  const known = new Set(fileList.map((f) => f.version));
  return {
    missing: fileList.filter((f) => !live.has(f.version)),
    extra: [...live].filter((v) => !known.has(v)).sort(),
  };
}

async function main() {
  if (!token) {
    console.log('::notice::SUPABASE_ACCESS_TOKEN is not set, so the live migrations were not checked.');
    return;
  }
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/migrations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    console.error(`The Management API answered ${response.status}: ${await response.text()}`);
    process.exit(1);
  }
  const history = await response.json();
  if (!Array.isArray(history)) {
    console.error(`Unexpected answer from the Management API: ${JSON.stringify(history).slice(0, 200)}`);
    process.exit(1);
  }
  const { missing, extra } = compare(
    files,
    history.map((m) => String(m.version)),
  );
  for (const v of extra) console.log(`::warning::Live has migration ${v}, which has no file in supabase/migrations/.`);
  if (missing.length > 0) {
    for (const f of missing) console.error(`::error::Not applied to the live project: ${f.file}`);
    console.error('Apply them (see docs/database/README.md, "Applying a migration"), then run this again.');
    process.exit(1);
  }
  console.log(`All ${files.length} migrations are applied to the live project.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
