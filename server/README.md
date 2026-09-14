# BessyV2 — Application / API tier

The hosted service between the Flutter clients and the PostgreSQL system of
record. Implements the three separately-authorized API sets from
[`docs/SYSTEM_COMPONENTS.md`](../docs/SYSTEM_COMPONENTS.md): **Student**,
**Caregiver**, and **Admin/Support** — plus auth, gradebook sync with
change-detection, notification fan-out, and audited account administration.

Written in Dart (one language with the client, so the model JSON contract is
shared). Self-contained: only `shelf`, `shelf_router`, and `crypto`.

## Run

```bash
cd server
dart pub get
BESSY_ADMIN_EMAIL=admin@bessy.app BESSY_ADMIN_PASSWORD=changeme123 \
  BESSY_TOKEN_SECRET=some-long-random-secret dart run bin/server.dart
# → BessyV2 API listening on http://0.0.0.0:8787
```

| Env var | Purpose | Default |
|---|---|---|
| `PORT` | Listen port | `8787` |
| `BESSY_TOKEN_SECRET` | HMAC secret for signing tokens | dev placeholder |
| `BESSY_ADMIN_EMAIL` / `BESSY_ADMIN_PASSWORD` | Bootstrap a first admin (staff can't self-serve `/signup`) | unset |

## Test

```bash
dart test          # 47 tests, sub-second, no external services
```

Covered: PBKDF2 against published vectors, token signing/tampering/expiry, grade
change-detection, the auth service, and an in-process end-to-end pass over the
real HTTP handler (signup → sync → change-detection → caregiver share → every
admin action → audit log).

## API surface (`/v1`)

**Auth (public)** — `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`

**Student / Caregiver (Bearer access token)**
- `GET /me`, `POST /auth/logout`
- `GET /gradebook`, `PUT /gradebook` — sync down / up; the PUT response reports
  detected grade changes
- `POST /devices`, `GET|PUT /notifications/prefs`
- `POST /caregiver/invites`, `GET /caregiver/invites`, `DELETE /caregiver/invites/<id>`
- `POST /caregiver/accept`, `GET /caregiver/students`,
  `GET /caregiver/students/<id>/gradebook` (read-only, link required)

**Admin / Support (Bearer token, role `support`/`admin` only, every call audited)**
- `GET /admin/users?query=` — scoped lookup
- `POST /admin/users/<id>/reset-password`
- `PATCH /admin/users/<id>/email`
- `POST /admin/users/<id>/deactivate` · `/reactivate`
- `DELETE /admin/users/<id>` — permanent erasure
- `GET /admin/audit-log`

## Architecture & the swappable data seam

```
bin/server.dart ─ HTTP entrypoint (dart:io + shelf)
lib/src/
  api/        router, JSON error boundary, auth middleware (role-gated)
  services/   auth · gradebook (sync + change-detection) · caregiver · admin · notifications
  security/   PBKDF2-HMAC-SHA256 passwords · HMAC-SHA256 tokens
  store/      Store interface + MemoryStore (production swaps in a PostgresStore)
  models/     user · gradebook (flatten + diff) · share_link · audit
db/schema.sql  the PostgreSQL DDL the Store maps to
```

`Store` is the persistence seam. The in-memory implementation backs tests and
local runs; a PostgreSQL implementation of the same interface — mapped to
`db/schema.sql` — backs production. Nothing above the store changes when you
swap it.

## Performance

- Hash-map store, O(1) user / gradebook / share lookups; the full test suite
  runs in well under a second.
- Change-detection is O(assignments): each gradebook is flattened once and diffed
  by key, so sync stays fast as a student accumulates work.
- Password hashing cost is configurable (`PasswordHasher(iterations:)`); tests
  use a low count, production a high one, and the cost is embedded per-hash so it
  can be raised later without invalidating existing passwords.
- The `PUT /gradebook` response returns an `updatedAt` stamp for cheap
  client-side "did anything change?" checks.

## Notes / next

- Push dispatch is abstracted behind `PushDispatcher`; the default logs instead
  of hitting APNs/FCM. Swap in a real dispatcher for production.
- Session tokens on the client are persisted in SharedPreferences for the beta;
  move them to the Keychain/Keystore before shipping.
