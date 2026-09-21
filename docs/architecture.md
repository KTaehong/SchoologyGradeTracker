# Schoology Grade Tracker — System Architecture

*Assignment deliverable: a plain-language description of the system architecture across five
dimensions — platform, user interface, application logic, data storage, and external services.
For the full component breakdown and build-status table, see
[system_architecture/SYSTEM_COMPONENTS.md](system_architecture/SYSTEM_COMPONENTS.md) and the
companion [architecture-diagram.html](system_architecture/architecture-diagram.html).*

---

## Summary

Schoology Grade Tracker is a **mobile application backed by hosted web services and a database** —
a classic **three-tier system**. Students capture their *own* grade data on the phone with no
Schoology API key, OAuth, or stored password (screenshots + on-device OCR, a saved Grade Report
HTML page, or an iCal feed). The app computes grades locally and, opt-in, **syncs** that data up to
a cloud API and PostgreSQL database. The database is what unlocks the features a single offline
phone cannot: cross-device sync, grade-change push notifications, caregiver (parent) access, and
human support/administration.

---

## 1. Platform

A **cross-platform mobile application interacting with hosted services and a database.**

- **Client:** native mobile (Android + iOS), built once from a **Flutter / Dart** codebase. A web
  target is used for development preview only, not as a shipped product.
- **Backend:** a hosted **HTTP API tier** plus a managed **relational database**, forming the second
  and third tiers.
- **Topology:** three-tier — **Client → Application/API → Data.** The API is the single access path
  to the backend; clients are thin over it.
- **Ingestion model:** *keyless.* Nothing is scraped or automated against Schoology; the student
  supplies their own data and the app syncs it. This is a deliberate response to Schoology's 2025
  lockdown of personal API keys.

## 2. User Interface

Multiple front-ends for distinct roles; the first two are the same Flutter app in different modes.

| Interface | Technology | Who / purpose |
|---|---|---|
| **Student app** | Flutter (Android/iOS) | Primary UI — grades home, course detail (grades + What‑If + midterm/final), screenshot-import cascade, upcoming assignments, settings. State via **Riverpod**. |
| **Caregiver / Parent mode** `[to build – UI]` | Flutter (same app, read-only mode) | A guardian the student invites views the linked student's grades and upcoming work. No edit rights. |
| **Admin console** `[to build – UI]` | Separate internal **web** application | Staff-only. Support agents and system admins operate on accounts (reset password, change email, deactivate/delete, scoped lookup, view audit log). Never shipped to end users. |

So there is both **mobile app functionality** (student, caregiver) and **web-based system-administration
functionality** (admin/support), kept as separate surfaces with separate authorization.

## 3. Application Logic

The web-services tier that hosts the application logic.

- **Language / framework:** a self-contained **Dart** service (`server/`, built on `shelf` /
  `shelf_router`), deliberately the same language as the client so both share the exact `Course`
  JSON contract. It is built and tested (in-memory store today; PostgreSQL swap documented).
- **API layer — three separately-authorized sets** behind one gateway (not one API with an
  `isAdmin` flag):
  - **Student API** — signup/login/refresh, sync the gradebook up/down, register device push tokens, manage caregiver invites.
  - **Caregiver API** — accept an invite, read-only access to a linked student's grades.
  - **Admin / Support API** — privileged, fully-audited account operations, least privilege.
- **Auth / Identity service** — email + password (PBKDF2-HMAC-SHA256), HMAC-SHA256 JWT access/refresh
  tokens with rotation, uniform-timing login, staff accounts not self-serviceable.
- **Change-detection & notification worker** — diffs a newly-synced gradebook against the stored copy
  (posted / raised / dropped), filters by each user's notification prefs, and fans out through a
  swappable `PushDispatcher`.
- **Grade math** — the pure-Dart `GradeEngine` (weighted + points-based, category → grading-period →
  course rollup, excused/drop-lowest, What‑If recompute, final-grade solver, midterm/final semester
  grades) runs **on the client**; the server stores and syncs, it does not recompute.

## 4. Data Storage

- **Primary database: PostgreSQL** — the system of record. Full DDL exists at
  `server/db/schema.sql`. Core tables: `users`, `auth_sessions`, `courses`, `grading_periods`,
  `categories`, `assignments` (name, due date, `earned/max`, ungraded flag), `share_links`
  (student ↔ caregiver), `device_tokens` (APNs/FCM), `notification_prefs`, and an append-only
  `audit_log` for every admin/support action.
- **On-device store:** SharedPreferences (JSON) for the gradebook and Keychain/Keystore for secrets —
  now an **offline-first cache** in front of the server, not the only copy.
- **Object storage** `[to build]` — for blobs the DB shouldn't hold: uploaded screenshots, saved HTML
  reports, export files.
- **Cache** `[optional]` — Redis (or similar) for hot reads (a student's current gradebook, session
  lookups).

Grades stay **owned by the user**; the database is a synced copy. Cloud sync is opt-in and off by
default, with data minimization and (planned) end-to-end encryption so the server can store ciphertext.

## 5. External Services

The MVP is **self-contained by design** — it does *not* depend on the Schoology API, OAuth, or any
third-party grade aggregator (Edlink, etc.). The external touch-points it does have:

| Service | Purpose | Notes |
|---|---|---|
| **Schoology (indirect, keyless)** | Source of the student's own data | The student exports their **iCal feed URL** (assignment due dates) and their **Grade Report HTML page / screenshots**; the app parses these locally. No API key, no login automation, no scraping. |
| **APNs** (Apple Push Notification service) `[to build]` | Grade-change push to iOS devices | Uses stored `device_tokens`, gated by `notification_prefs`. |
| **FCM** (Firebase Cloud Messaging) `[to build]` | Grade-change push to Android devices | Same dispatch path as APNs, behind `PushDispatcher`. |
| **On-device OCR** (Google ML Kit, Text Recognition) | Read item name + score from a grade screenshot | Runs **on the device**, not a cloud call — mobile only; web falls back to paste. |
| **Managed PostgreSQL host** `[to build]` | Run the production database | Cloud-hosted relational DB behind a `PostgresStore`. |
| **Object storage host** `[to build]` | Store screenshots / HTML / exports | See §4. |

---

## Architecture at a glance

```
  ┌──────────────────────── Client tier (Flutter / Dart) ────────────────────────┐
  │  Student app        Caregiver mode        Admin console (web) [to build]      │
  │  UI (Riverpod) · GradeEngine · Keyless import (OCR / HTML / iCal)             │
  │  Local cache: SharedPreferences + Keychain/Keystore                          │
  └───────────────────────────────┬──────────────────────────────────────────────┘
                                   │  HTTPS (opt-in sync)  —  GradeRepository → SyncRepository
  ┌───────────────────────────────▼──────────────────── Application / API tier (Dart) ┐
  │  API gateway → Student API · Caregiver API · Admin/Support API                 │
  │  Auth/Identity · Change-detection worker · Push dispatch → APNs / FCM          │
  └───────────────────────────────┬──────────────────────────────────────────────┘
  ┌───────────────────────────────▼──────────────────────── Data tier ────────────┐
  │  PostgreSQL (system of record)  ·  Object storage  ·  Redis cache [optional]    │
  └────────────────────────────────────────────────────────────────────────────────┘
```

**The seam that makes this cheap:** the client already reads data through one interface,
`GradeRepository`. A network-backed `SyncRepository` plugs in behind that same interface, so the
backend was added without rewriting the UI or the grade math.
