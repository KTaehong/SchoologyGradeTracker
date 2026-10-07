# Offline storage and cloud sync

How the app keeps grades on the phone, works offline, and keeps several devices
in step. Feature IDs refer to [`mvp.md`](mvp.md) (F07 grade engine, F13 local
storage, F14 cloud sync).

## The short version

- **The phone is the source of truth for what the student sees.** The whole
  gradebook lives in SQLite on the phone, and the grade engine computes every
  grade on the phone. Signed in or not, online or not, the screens read the same
  local data.
- **The cloud is a copy that devices sync through.** When the student is signed
  in, each device sends the rows it changed and receives the rows other devices
  changed.
- **Change detection is a revision number, our version of an ETag.** An empty
  pull means "nothing changed", like HTTP `304 Not Modified`.
- **Other devices hear about a change through Supabase Realtime** while the app is
  open, and catch up on the next launch or foreground when it is not.

```
 Phone A                         Supabase                         Phone B
 SQLite ──push_changes──▶  rows + revision 42  ──Realtime "42"──▶  pull_changes(41)
 (dirty rows)              sync_state.revision                      ◀── rows 42
```

## The parts

| Part | File | What it does |
|---|---|---|
| Grade engine | [`mobile/src/engine/grade-engine.ts`](../mobile/src/engine/grade-engine.ts) | Same rules as the SQL engine; tests check the same hand-computed numbers. |
| Local database | [`mobile/src/db/`](../mobile/src/db/) | expo-sqlite, same tables as Supabase plus `dirty` / `deleted`. |
| Sync engine | [`mobile/src/sync/sync-engine.ts`](../mobile/src/sync/sync-engine.ts) | Pull, then push. Never two syncs at once. |
| Row mapping | [`mobile/src/sync/changes.ts`](../mobile/src/sync/changes.ts) | Collect changed rows; apply pulled rows. |
| Accounts | [`mobile/src/sync/account.ts`](../mobile/src/sync/account.ts) | First sign-in, switching accounts, sign-out. |
| Triggers | [`mobile/src/data/gradebook-store.tsx`](../mobile/src/data/gradebook-store.tsx) | When to sync (below). |
| Server | [`supabase/migrations/20261006000600_sync.sql`](../supabase/migrations/20261006000600_sync.sql) | Revisions, tombstones, `pull_changes`, `push_changes`. |

## SQLite on the phone

We use **expo-sqlite** (built into Expo, works in Expo Go). The tables mirror the
Supabase tables column for column, so a row moves between phone and cloud with
no translation. Two extra columns track sync:

- `dirty` — 0 when the row matches the cloud. Each local edit adds 1. After a
  push, the row is marked clean **only if `dirty` still has the value that was
  sent**, so an edit made during the push is not lost.
- `deleted` — a local delete is kept as a "tombstone" until the delete is pushed.

Signed out, rows stay dirty and nothing is sent. On the first sign-in they are
uploaded (except the untouched sample, which is dropped).

## Refresh logic: when the app syncs

| When | Why |
|---|---|
| App launch (once signed in) | Catch up on anything from other devices. |
| App comes back to the foreground | Same, after time in the background. |
| Phone reconnects to the internet (NetInfo) | Send edits made offline right away. |
| Realtime says the revision moved | Another device pushed; pull now. |
| 1.5 s after an edit on this phone | Push it; a burst of edits goes in one push. |
| Pull to refresh (Home, Grades, Upcoming) and Settings → Sync now | The student asked. |

A sync is always **pull, then push**. Asking for a sync while one runs queues
exactly one more.

## Connectivity detection

[`@react-native-community/netinfo`](https://github.com/react-native-netinfo/react-native-netinfo)
reports when the phone goes offline and back online
([`mobile/src/sync/connectivity.ts`](../mobile/src/sync/connectivity.ts)). We do
**not** skip syncs while "offline": NetInfo can be wrong (captive portals,
school Wi-Fi), so a sync just tries, and a network error marks the status
`offline` with the number of changes waiting. Edits are never blocked: they go
to SQLite first.

## Checking the backend for updates (the ETag question)

Supabase RPCs do not send HTTP `ETag` / `If-None-Match` headers, so we build the
same idea into the data:

- `sync_state.revision` is a counter per student. Every insert, update, or delete
  of one of their rows takes the next number and stamps it on the row
  (`revision` column) or on a tombstone (`sync_tombstones`).
- The phone stores the highest revision it has pulled (its **cursor**).
  `pull_changes(cursor)` returns only rows with a higher revision. Nothing
  changed → empty lists, the same answer as a `304`.
- The counter row is locked until the write commits, so revisions commit in
  order and a cursor can never skip a row.

This is better than one ETag for the whole gradebook: the reply contains only the
rows that changed, not the whole gradebook again.

## Telling other devices to refresh (the push-notification question)

**Built: Supabase Realtime.** Each signed-in device listens for its own
`sync_state` row changing
([`watchRemoteChanges`](../mobile/src/sync/supabase-sync.ts)). When any device
pushes, the others pull within a second or two — while the app is open. Row-level
security applies, so a device only hears about its own student's row. When the
app is closed, nothing is needed: it syncs on the next launch or foreground.

**Not built yet: real push notifications** (to wake a closed app). Reasons to wait:
- Expo Go on Android can no longer receive remote push; it needs a development
  build with Firebase Cloud Messaging (FCM) set up.
- It needs a server-side sender (a Supabase Edge Function or database webhook on
  `sync_state`) and storing each device's push token (the `user_devices` table
  already exists for this).
- A grade tracker gains little from waking up just to re-sync; the next launch
  does the same. Push becomes worth it for features like "new grade posted".

If we add it later: `expo-notifications` for the token → save it in
`user_devices` → an Edge Function on `sync_state` updates sends a silent/data
message to the student's *other* devices via the Expo Push API.

## Conflicts

**Last write wins, per row.** Because a sync pulls before it pushes, and a
pulled row never overwrites a row the phone has not pushed yet, the most recent
unsynced edit on a phone wins. Two phones editing the *same* assignment offline
→ the one that syncs last wins. For a one-student gradebook this is rare and
easy to understand; field-by-field merging is not worth the complexity now.

Other cases:
- A row whose parent was deleted on another device is skipped by
  `push_changes` (never an error that blocks every later push).
- Two devices adding the same calendar event under different ids → the server
  keeps one and tombstones the other.

## Accounts

| Situation | What happens |
|---|---|
| First sign-in on a phone with its own courses | They are uploaded and merged with the account. |
| First sign-in, phone has only the sample | The sample is dropped, the account's grades come down. |
| Signing in as a different account | The phone's copy is cleared first. |
| Sign out | One last sync, then the phone's copy is removed (the cloud keeps it). Settings warns if changes could not be sent. |
| Session expires on its own | Nothing is deleted; signing back in continues where it left off. |

## Testing

- `mobile/src/sync/__tests__/sync-engine.test.ts` runs the real SQL against Node's
  built-in SQLite and a fake server with the same rules: two phones converging,
  offline edits, deletes, conflicts, accounts.
- `supabase/tests/sync_test.sql` checks the server: first pull, empty pull at the
  head, one change → one row, tombstones and cascades, pushes, orphans,
  duplicates, and that one student cannot read or overwrite another's rows.

## Known limits

- Web: expo-sqlite runs on WebAssembly and needs a cross-origin-isolated page;
  `metro.config.js` sets this up for the dev server. Static web export is off
  (`web.output: "single"`).
- A pull returns all changes in one reply (no paging). Fine for one student's
  gradebook (a few hundred rows).
