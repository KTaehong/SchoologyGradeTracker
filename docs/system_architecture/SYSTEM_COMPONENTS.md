# BessyV2 — System Components & Architecture

*A "Better Schoology" grades app — Flutter client backed by a cloud service. Assignment deliverable (a): major system components. See the companion architecture diagram for the visual reference.*

---

## 0. Overview — a three-tier, database-backed system

BessyV2 is a **three-tier application**:

1. **Client tier** — the apps people use: a Flutter student app (Android/iOS), a caregiver/parent mode, and a separate internal admin console.
2. **Application / API tier** — a hosted API that is the single access path to the backend, plus the services around it (auth, background workers, push).
3. **Data tier** — a **PostgreSQL** database that is the system of record, plus object storage and a cache.

Grade data is captured **keyless** on the device (screenshots + OCR, saved HTML report, iCal feed — nothing is scraped or automated), then **synced up** to the API and stored in the database. Putting the data in a server database is what unlocks the features a single offline phone cannot provide: **cross-device sync, grade-change push notifications, caregiver access, and human support / administration.**

**What already exists vs. what you're building.** The Flutter client, the grade engine, and the keyless import layer are built (P0/P1, running today against on-device storage). The **backend API/logic tier is now built too** — a self-contained Dart service (`server/`) implementing the Student, Caregiver and Admin/Support API sets, auth/identity, gradebook sync with change-detection, notification fan-out, and the audited admin tooling, all behind a swappable `Store` (in-memory today, PostgreSQL via `server/db/schema.sql`). What remains: standing it up on a managed PostgreSQL + object storage, real APNs/FCM push, and the standalone admin **web console** UI (the admin *API* exists). Every component below is marked `[built]`, `[built – API/logic]`, or `[to build]`.

**The seam that makes this cheap.** The client already talks to its data through one interface, `GradeRepository`. A network-backed implementation (`SyncRepository`) plugs in behind that same interface, so adding the backend does **not** require rewriting the UI or the grade math.

---

## 1. Client Tier — applications & user-facing modes

### 1.1 Student app `[built]`
The existing cross-platform **Flutter** app (Android / iOS; web for dev preview). Internally layered:

| Layer | Responsibility | Key pieces |
|---|---|---|
| **Presentation (UI)** | Screens | `home_screen`, `course_detail` (grades + What-If), `import_screen` (capture cascade), `upcoming_screen`, `settings`, onboarding |
| **State** | Live state, UI ↔ data | **Riverpod** — `gradebookProvider`, `whatIfProvider`, `upcomingProvider`, `themeModeProvider` |
| **Domain / logic** | The grade math — no I/O | `GradeEngine` (weighted + points-based, category→period→course rollup, excused/drop-lowest, What-If, final-grade solver); models `Course → GradingPeriod → Category → Assignment` |
| **Import / ingestion** | User's raw data → domain objects | `screenshot_classifier`, `html_report_parser`, `ical_parser` + `assignment_matcher` |
| **Data access** | The swappable seam | `GradeRepository` interface + a new `SyncRepository` `[to build]` that talks to the API |
| **Local cache** | Offline-first store | SharedPreferences (JSON) + Keychain/Keystore (secrets) — now a **cache** in front of the server, not the only copy |

### 1.2 Caregiver / Parent mode `[to build]`
The same app, in a read-only mode, or a lightweight companion. A guardian the student invites can view the linked student's grades and upcoming work. No edit rights.

### 1.3 Admin console `[to build]`
A **separate internal web application** for staff — never shipped to end users. This is where support agents and system admins operate on accounts (see §5). Kept distinct so end-user builds carry no admin code.

---

## 2. Application / API Tier `[to build]`

### 2.1 API layer — three separately-authorized sets
A hosted API (REST or GraphQL) behind a gateway. Not one API with an `isAdmin` flag — **distinct sets with distinct authorization and logging**:

- **Student API** — auth, sync the gradebook up/down, register device push tokens, create/manage caregiver invites.
- **Caregiver API** — accept an invite, read-only access to a linked student's grades.
- **Admin / Support API** — privileged, fully-audited account operations (§5). Separate surface, separate auth, least privilege.

### 2.2 Authentication / Identity service `[to build]`
Account sign-up and login (email + password and/or SSO), token issuance for the APIs, session and refresh handling, password-reset flows.

### 2.3 Change-detection & notification worker `[to build]`
A scheduled background job that diffs a user's newest imported/synced gradebook against the stored copy, detects grade changes, and enqueues notifications.

### 2.4 Push dispatch `[to build]`
Sends alerts to devices via **APNs (iOS)** and **FCM (Android)** using the stored `device_tokens`, respecting each user's `notification_prefs`.

---

## 3. Data Tier — the database `[to build]`

### 3.1 PostgreSQL — system of record
A managed relational database. Core tables:

| Table | Holds |
|---|---|
| `users` | Student + caregiver accounts (id, email, auth metadata, status: active/deactivated) |
| `auth_sessions` | Tokens / refresh, device sessions |
| `courses` | Synced course rows (owner = user), name, term, color |
| `grading_periods` | Quarter/semester rows with weight + date range |
| `categories` | Weighted category rows (Form/Sum buckets) |
| `assignments` | Item name, due date, score `earned/max`, ungraded flag |
| `share_links` | Student ↔ caregiver relationships and scope |
| `device_tokens` | APNs/FCM tokens per device, per user |
| `notification_prefs` | What each user wants to be alerted about |
| `audit_log` | Every admin/support action — actor, target, action, timestamp (append-only) |

Grades stay **owned by the user**; the DB is a synced copy, not a new authority over the data.

### 3.2 Object storage `[to build]`
For larger blobs the DB shouldn't hold: uploaded screenshots and saved HTML reports (if retained), export files.

### 3.3 Cache `[optional]`
A Redis (or similar) cache for hot reads (a student's current gradebook, session lookups) to keep the API fast.

---

## 4. User Modes (client roles)

| Mode | Who | Can do |
|---|---|---|
| **Student** | Primary end user | Everything in the app + sync, notifications, invite a caregiver |
| **Caregiver / Parent** | A guardian the student invites | Read-only view of the linked student |
| **Support Agent** | Internal staff | Account maintenance on request — §5 |
| **System Admin** | Internal owner | Everything Support can + manage agents, system config, view audit logs |

Student and Caregiver are the same student app in different modes; Support Agent and System Admin use the separate admin console (§1.3).

---

## 5. System Administration & Support Tooling `[to build]`

The staff-facing operations the assignment calls for. All live behind the **Admin/Support API** (§2.1), are gated by the Support/Admin **roles** (§4), and write to the **`audit_log`** (§3.1):

- **Reset a password** (or send a reset link) for a locked-out user.
- **Update an account email address** (fix a typo'd signup email).
- **Deactivate** an account (reversible) or **delete** it (permanent data erasure, on user request — GDPR/CCPA-style).
- **Scoped account lookup** to support a ticket — minimal fields, not open access to a student's grades.
- **View the audit log** so every one of the above is attributable and reviewable.

---

## 6. Component summary (at a glance)

| # | Component | Tier | Status |
|---|---|---|---|
| 1 | Flutter **student app** (UI, state, engine, import, local cache) | Client | `[built]` |
| 2 | **Caregiver mode** — invite/accept + read-only gradebook API | Client + App | `[built – API/logic]`; client mode UI `[to build]` |
| 3 | **Admin console** (internal web app) | Client | `[to build]` (admin API exists) |
| 4 | **API layer** — Student / Caregiver / Admin-Support sets | Application | `[built]` (`server/`) |
| 5 | **Auth / Identity** service | Application | `[built]` — signup/login/refresh, JWT, PBKDF2 |
| 6 | **Change-detection worker** + **push dispatch** (APNs/FCM) | Application | change-detection `[built]`; push behind `PushDispatcher`, real APNs/FCM `[to build]` |
| 7 | **PostgreSQL** database (system of record) | Data | schema `[built]` (`server/db/schema.sql`); managed instance `[to build]` |
| 8 | **Object storage** (screenshots / HTML / exports) | Data | `[to build]` |
| 9 | **Cache** (Redis) | Data | `[optional]` |
| 10 | **Keyless import** (screenshots+OCR, HTML report, iCal) | Client | `[built]` |
| 11 | **System administration** (reset pw, email change, deactivate/delete, lookup, audit) | Application | `[built]` — audited, role-gated |
| 12 | **Sync seam** — `SyncRepository` + `ApiClient` + Cloud-Sync settings UI | Client | `[built]` |

---

## 7. Build order — progress

1. ✅ **Database schema** — `server/db/schema.sql` models every §3.1 table.
2. ✅ **API + auth** — `server/` implements the Student API (signup/login/refresh, gradebook sync) and Auth/Identity (JWT + PBKDF2).
3. ✅ **Wire the client** — `SyncRepository` behind `GradeRepository`, plus `ApiClient` and an opt-in Cloud-Sync settings section; the local store stays the offline-first source of truth.
4. ✅ **Caregiver sharing** — `share_links`, invite/accept flow, Caregiver read-only gradebook API. *Remaining:* the in-app caregiver *mode* UI.
5. ◐ **Notifications** — change-detection worker + `notification_prefs` filtering + device registration are built; real APNs/FCM dispatch plugs into `PushDispatcher`.
6. ◐ **Admin** — the Admin/Support API + audit log + all §5 tooling are built; the standalone admin **web console** UI is still to build.

*Also remaining to go live:* a managed PostgreSQL instance behind a `PostgresStore`, object storage, and moving client session tokens to the Keychain/Keystore.

---

## 8. Design principles

1. **Three-tier, database-backed.** The PostgreSQL database is the system of record; the API is the single access path; the clients are thin over it.
2. **One swappable data seam (`GradeRepository` → `SyncRepository`).** The backend plugs in behind the interface the client already uses — the UI and grade engine are reused unchanged.
3. **Keyless ingestion stays client-side.** No Schoology API key, no OAuth, no stored password, no automated login. The student supplies their own data; the app syncs it up.
4. **Privacy as a constraint, not the whole model.** Cloud sync is opt-in; prefer end-to-end encryption (server stores ciphertext) and data minimization. Offline-first: the device keeps a usable local cache.
5. **Separate, audited admin surface.** System administration is never a flag on the student app — it is a distinct API set, a distinct role, a distinct client, and every action is logged.
