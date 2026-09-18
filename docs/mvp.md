# MVP — Schoology Grade Tracker

> **The MVP will allow a _student_ to _see accurate, up-to-date grades for their
> own courses and project future outcomes_ by using _keyless grade import, an
> on-device grade engine, what-if and final-grade tools, and an optional private
> cloud account that syncs those grades across their own devices_.**

Product name: **Schoology Grade Tracker** (internal codename `BessyV2`). Primary
MVP user: **student**. The cloud sync service is included so a student's grades
survive a reinstall and follow them to a second device — it is opt-in and off by
default.

Each feature has a stable ID (`F01`…) used for cross-reference in
[`features.md`](features.md) and [`user-flows.md`](user-flows.md).

## In scope — MVP features

| ID | Name | What it does |
|----|------|--------------|
| **F01** | Onboarding | First-run, keyless "get started" — no login, password, or API key required to begin. |
| **F02** | Grades home | Main screen: the list of the student's courses, each with its current computed grade (percent + letter) or `N/A` when nothing is graded. |
| **F03** | Course detail | A course's grading periods → categories/sections → assignments, with the overall course grade and each level's weighting. |
| **F04** | Import from screenshot (OCR) | Take/pick a photo of a grades page; on-device OCR reads it and a cascade auto-sorts it into a class, then a category, falling back to a manual pick when it can't. Rows are confirmed/edited, then committed. |
| **F05** | Import from saved report | Import a saved Schoology **Grades** page (HTML file or pasted text); the parser recovers course → period → category → assignment structure with exact scores and weights. |
| **F06** | Manual entry | Create a class, add sections/categories, and add assignments by hand — works with zero import. |
| **F07** | Grade engine | On-device calculation matching Schoology: weighted **and** points-based grading, present-weight normalization, excused/ungraded exclusion, extra credit, drop-lowest, and a US +/- letter scale. |
| **F08** | What-If grades | Edit or add hypothetical scores locally and see the course grade recompute instantly, without changing imported data. |
| **F09** | Final-grade calculator | "What do I need on the final (or any remaining item) to reach a target grade?" — solved locally. |
| **F10** | Semester (midterm/final) grades | Compute midterm = Q1+Q2+midterm exam and final = Q3+Q4+final exam; quarters count 50/50, the exam blends by weight (default 20%), present-weight normalized. Exam scores/weights are editable. |
| **F11** | Upcoming assignments | Subscribe to the student's Schoology **iCal feed**; show an agenda of what's due, matched to the owning class where possible, tappable through to Schoology. |
| **F12** | Theme / dark mode | Light and dark themes. |
| **F13** | On-device persistence | All grades are stored locally (offline-first); the app works fully with no network and no account. |
| **F14** | Opt-in cloud sync | Create or sign in to a private account and sync the gradebook up/down so it survives reinstalls and reaches a second device. Opt-in, off by default. |

## Explicitly NOT in the MVP

These are deliberately deferred. Some already have partial back-end support that
is **not** wired into a shippable user experience; they are still out of MVP.

- **Caregiver / parent sharing mode** — a parent viewing a linked student's
  grades. (Server invite/accept endpoints exist; there is no caregiver client
  UI.)
- **Grade-change push notifications** — alerting on posted/raised/dropped grades.
  (Server change-detection exists; no APNs/FCM integration and no client wiring.)
- **Admin / support console** — password reset, email change, deactivate/delete,
  account lookup, audit-log viewing. (Server admin API exists; there is no
  console UI, and this is an operator tool, not a student feature.)
- **Managed cloud data tier** — provisioned PostgreSQL persistence, object
  storage for uploaded screenshots/reports, and a cache. (The sync service runs
  against an in-memory store today; the schema is written but not deployed.)
- **End-to-end encryption of synced data** — a stated design goal for the cloud
  tier, not required to ship the MVP.
- **Weighted photo-built classes** — classes created purely from screenshots use
  default/points weighting; a per-section weight editor for them is deferred
  (real weights come from the HTML report path).
- **Extras**: multi-term GPA rollup, grade-goal tracking, and desktop (Windows)
  OCR (the OCR library is mobile-only).
