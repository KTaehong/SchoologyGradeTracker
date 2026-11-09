#!/usr/bin/env node
/**
 * Copies the Supabase URL and publishable key from mobile/.env.local to EAS,
 * for the development, preview and production builds:
 *
 *   cd mobile
 *   npm run eas:env
 *
 * Run it once (and again if the key changes). Needs `eas login` first.
 * Without this, App Store / TestFlight builds have no server settings.
 */
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { checkPublicKey } = require('./supabase-key-check');

const ENVIRONMENTS = ['development', 'preview', 'production'];
const NAMES = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) {
      values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

let values;
try {
  values = readEnvFile(join(__dirname, '..', '.env.local'));
} catch {
  console.error('mobile/.env.local was not found. Copy .env.example to .env.local and fill it in first.');
  process.exit(1);
}

for (const name of NAMES) {
  if (!values[name] || values[name].includes('<')) {
    console.error(`${name} is missing in mobile/.env.local.`);
    process.exit(1);
  }
}
const problem = checkPublicKey(values.EXPO_PUBLIC_SUPABASE_ANON_KEY);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
for (const environment of ENVIRONMENTS) {
  for (const name of NAMES) {
    console.log(`→ ${name} for ${environment}`);
    const result = spawnSync(
      npx,
      [
        'eas-cli@latest', 'env:create',
        '--environment', environment,
        '--name', name,
        '--value', values[name],
        '--visibility', 'plaintext',
        '--scope', 'project',
        '--type', 'string',
        '--force',
        '--non-interactive',
      ],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );
    if (result.status !== 0) {
      console.error(`Could not save ${name} for ${environment}. Run \`npx eas-cli login\` and try again.`);
      process.exit(result.status ?? 1);
    }
  }
}
console.log('\nDone. Every EAS build (development, preview, production) now has sign-in and sync.');
