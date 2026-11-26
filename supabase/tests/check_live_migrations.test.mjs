// Runs with Node's built-in test runner: node --test supabase/tests/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compare } from '../check_live_migrations.mjs';

const files = [
  { version: '20260924000100', file: '20260924000100_accounts.sql' },
  { version: '20261126001100', file: '20261126001100_sync_conflicts_and_cleanup.sql' },
];

test('nothing is missing when live has every file', () => {
  assert.deepEqual(compare(files, ['20260924000100', '20261126001100']), { missing: [], extra: [] });
});

test('a file that is not applied live is missing', () => {
  assert.deepEqual(compare(files, ['20260924000100']).missing, [files[1]]);
});

test('a live entry with no file is reported as extra, not missing', () => {
  assert.deepEqual(compare(files, ['20260924000100', '20261126001100', '20261125230356']), {
    missing: [],
    extra: ['20261125230356'],
  });
});
