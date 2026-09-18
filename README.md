# Schoology Grade Tracker

A privacy-first, cross-platform app that lets a student import **their own**
Schoology grades — with no API key, password, or scraping — and see accurate,
up-to-date grade calculations on their phone. Grades are imported from a
screenshot (on-device OCR), a saved grade-report page, or manual entry, computed
locally with the real Schoology weighting rules, and optionally synced to the
student's own private account.

> **Naming.** The product is **Schoology Grade Tracker**. `BessyV2` / `bessy` is
> only the internal project codename and Dart package id — it is a from-scratch
> rebuild of the discontinued "Bessy" ("Better Schoology") app. This app is not
> affiliated with, or endorsed by, Schoology or PowerSchool.

## Problem & intended users

Schoology's own gradebook is slow to navigate on mobile, does not show what-if
projections, and the district-locked API means third-party grade apps generally
cannot read a student's data at all. Students who want a fast, clear view of
where they stand — and want to answer "what do I need on the final?" — have no
good option since the original Bessy was pulled.

**Intended users (MVP): students.** A student imports their own grades and uses
the app to view, project, and plan. See [`docs/features.md`](docs/features.md)
for the full feature specifications, and [`docs/user-flows.md`](docs/user-flows.md)
for the screen-by-screen journeys.

## MVP overview

The MVP is the **student app plus opt-in cloud sync**: keyless import, an
on-device grade engine, what-if and final-grade projection, semester
(midterm/final) grades, an upcoming-assignments agenda, dark mode, offline-first
local storage, and an optional private account that syncs grades across the
student's own devices.

Caregiver/parent sharing, grade-change push notifications, and the admin/support
console are **explicitly out of MVP**. The full feature list, IDs, and the
exclusions are in [`docs/mvp.md`](docs/mvp.md).

## Platform overview

- **Client** — a [Flutter](https://flutter.dev) app (Dart). Primary targets are
  **Android and iOS**; the web build runs for development/preview (on-device OCR
  is mobile-only, so screenshot import degrades to paste on web). Built and
  verified today. State via Riverpod; local persistence via `shared_preferences`.
- **Cloud sync service** (`server/`) — a self-contained **Dart** HTTP service
  (`shelf`), sharing the client's grade JSON contract. It provides accounts and
  gradebook sync. **Status: runs against an in-memory store** for local
  development and tests; the PostgreSQL implementation behind the same `Store`
  interface (DDL in `server/db/schema.sql`) and any managed hosting are planned,
  not yet deployed. See [`server/README.md`](server/README.md).
- **Data** — on-device first (`shared_preferences`). Cloud data tier (PostgreSQL,
  object storage) is designed in
  [`docs/system_architecture/SYSTEM_COMPONENTS.md`](docs/system_architecture/SYSTEM_COMPONENTS.md)
  but not yet provisioned.

Grade data is captured **keyless** on the device (screenshots + OCR, a saved
grade-report page, or manual entry) — nothing is scraped or automated, and the
service never receives a Schoology credential.

## Developer setup

Prerequisites: the [Flutter SDK](https://docs.flutter.dev/get-started/install)
(Dart 3.13.2+) on your `PATH`. This repo was developed with Flutter 3.47.2 /
Dart 3.13.2.

> On the original dev machine Flutter lives at `C:\Users\thkim\flutter` and is
> **not** on `PATH`; commands there are prefixed with
> `export PATH="/c/Users/thkim/flutter/bin:$PATH"` (Git Bash) first. Skip this if
> `flutter` is already on your `PATH`.

### Run the client

```bash
flutter pub get
flutter run -d chrome        # web preview
# or target a connected device / emulator:
flutter run
```

A preconfigured web launch (port 8080) also exists in `.claude/launch.json`.

### Test & analyze the client

```bash
flutter test        # engine, import, and widget tests
flutter analyze     # static analysis (lints in analysis_options.yaml)
```

### Run the cloud sync service (optional, local/in-memory)

```bash
cd server
dart pub get
BESSY_ADMIN_EMAIL=admin@example.com BESSY_ADMIN_PASSWORD=changeme123 \
  BESSY_TOKEN_SECRET=some-long-random-secret dart run bin/server.dart
# → API listening on http://0.0.0.0:8787
dart test           # server tests, no external services required
```

In the app, cloud sync is opt-in under **Settings → Cloud Sync (beta)**: enter
the server URL, create or sign in to an account, and sync. It is off by default.
