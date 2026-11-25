#!/usr/bin/env bash
# Apply every migration to a fresh local Postgres database and run the tests.
# Needs psql and a local server; set PG* env vars (PGHOST, PGUSER, …) if needed.
#   supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

db="${TEST_DB:-grade_tracker_test}"
psql -q -d postgres -c "drop database if exists $db" -c "create database $db"
# Roles are cluster-wide; ignore "already exists" from an earlier run.
psql -q -d "$db" -f tests/local/supabase_stub.sql 2>&1 | grep -v 'already exists' || true

for f in migrations/*.sql; do
  echo "migrate  $f"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"
done

# Every test file, so a new one is never skipped. Each runs in its own
# transaction and rolls back. demo_accounts_test.sql runs at the end, after its seed.
for t in tests/*_test.sql; do
  [ "$t" = tests/demo_accounts_test.sql ] && continue
  echo "test     $t"
  if ! psql -q -v ON_ERROR_STOP=1 -o /dev/null -d "$db" -f "$t" 2>&1 \
       | sed 's/^psql:[^ ]* NOTICE:  //'; then
    echo "Tests FAILED."
    exit 1
  fi
done
echo "seed     seed.sql (twice, to check it is safe to repeat)"
psql -q -v ON_ERROR_STOP=1 -d "$db" -f seed.sql
psql -q -v ON_ERROR_STOP=1 -d "$db" -f seed.sql

echo "demo     demo_accounts.sql (twice; refused until a password is set)"
if psql -q -v ON_ERROR_STOP=1 -d "$db" -f demo_accounts.sql 2>/dev/null; then
  echo "demo_accounts.sql ran with the placeholder password."
  exit 1
fi
for pw in local-test-password-1 local-test-password-2; do
  sed "s/'CHANGE-ME'/'$pw'/" demo_accounts.sql | psql -q -v ON_ERROR_STOP=1 -d "$db"
done
psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/demo_accounts_test.sql

echo "demo     ../docs/database/demo.sql"
psql -q -v ON_ERROR_STOP=1 -o /dev/null -d "$db" -f ../docs/database/demo.sql

echo "All tests passed."
