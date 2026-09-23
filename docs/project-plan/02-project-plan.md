# Project Plan — Schoology Grade Tracker MVP

*Start Thu 2026-09-24 · Dev cutoff Fri 2026-12-04 · ~38 planned hrs (see
[`01-availability.md`](01-availability.md)). Feature IDs (F01–F14) reference
[`../mvp.md`](../mvp.md). Effort is **base** AI-assisted hours; **Planned** =
base × 1.5.*

## Scope framing

This plan treats the MVP as a **build from scratch**: every one of the 14 MVP
features is scheduled as work to build, test, and verify. Existing code is not
counted as done.

- **Platforms: iOS and Android.** Every feature is only "done" when it works on
  **both** an iPhone and an Android phone.
- **The timeline holds product work only** — features, testing, and release.
  Tool installation and technical decisions are not scheduled as tasks; they are
  handled inside the task that needs them.
- Tasks are chosen to be **AI-verifiable with little human back-and-forth**
  (parsers, calculations, and test suites that Claude can drive to a green,
  checkable result).

---

## Milestones

| # | Milestone | Target | Proves |
|---|-----------|:------:|--------|
| **M1** | Core app: grades you can see | **Fri Oct 9** | The app opens on iOS and Android, stores a gradebook on the phone, and shows courses with grades that match Schoology's math. |
| **M2** | Getting grades in | **Sun Nov 8** | A student can fill the app with real grades: by hand, from a screenshot, or from a saved report, plus see what's due next. |
| **M3** | Projection tools + cloud sync | **Sun Nov 22** | What-If, final-grade, and semester tools work; opt-in sync moves a gradebook between two phones. |
| **M4** | MVP QA'd + release builds | **Fri Dec 4** | Every MVP feature passes QA on both platforms; release builds run on real iOS and Android phones. |

*Then Dec 7–18: live-demo setup (reserved, not scheduled here).*

---

## M1 — Core app: grades you can see
**Target: Fri Oct 9 · Thu Sep 24 → Fri Oct 9 · 6.5 base / 9.75 planned hrs**

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T1.1** App shell: navigation between screens + light/dark theme | 1.0 → 1.5 | — | Sun Sep 27 | **F12** | The app opens on iOS and Android, moves between placeholder screens, and switches between light and dark theme. |
| **T1.2** Gradebook data (course → period → category → assignment) saved on the phone | 1.5 → 2.25 | T1.1 | Wed Sep 30 | **F13** | Data survives closing and reopening the app; the app works fully in airplane mode. |
| **T1.3** Onboarding: first-run "get started" with no login | 0.5 → 0.75 | T1.1 | Fri Oct 2 | **F01** | A fresh install shows onboarding once, then lands on the grades home. |
| **T1.4** Grade engine matching Schoology's math | 2.0 → 3.0 | T1.2 | Wed Oct 7 | **F07** | Tests pass for weighted and points grading, excused/ungraded, extra credit, drop-lowest, and the +/- letter scale; a real course's grade matches Schoology. |
| **T1.5** Grades home + course detail screens | 1.5 → 2.25 | T1.4 | Fri Oct 9 | **F02, F03** | Home lists courses with percent + letter (or `N/A`); tapping one shows periods → categories → assignments with weights. |

**M1 done when:** the app runs on an iPhone and an Android phone, keeps its data
offline, and shows courses with engine-computed grades that match Schoology.

---

## M2 — Getting grades in
**Target: Sun Nov 8 · Mon Oct 12 → Sun Nov 8 (lighter weeks: S&D + college apps) · 7.0 base / 10.5 planned hrs**

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T2.1** Manual entry: create a class, add categories and assignments by hand | 1.0 → 1.5 | T1.5 | Fri Oct 16 | **F06** | A student can build a full class from zero, and its grade computes correctly. |
| **T2.2** Screenshot import: photo → on-device text reading → auto-sort into class → category → rows | 3.0 → 4.5 | T2.1 | Fri Oct 30 | **F04** | A photo of a real grades screen imports on iOS and Android; class/category auto-detect or fall back to a manual pick; rows land with correct scores after review. |
| **T2.3** Saved-report import: read a saved Schoology Grades page | 2.0 → 3.0 | T1.4 | Fri Nov 6 | **F05** | A real saved report imports with course → period → category → assignment structure and correct weights/scores. |
| **T2.4** Upcoming assignments from the Schoology calendar feed | 1.0 → 1.5 | T1.5 | Sun Nov 8 | **F11** | The agenda loads from the real feed on both phones and matches items to classes where possible. |

**M2 done when:** a real screenshot **and** a real saved report both import
correctly on iOS and Android, manual entry works, and the upcoming list loads.

---

## M3 — Projection tools + cloud sync
**Target: Sun Nov 22 · Mon Nov 9 → Sun Nov 22 · 5.5 base / 8.25 planned hrs**

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T3.1** What-If grades: edit or add pretend scores, see the grade update instantly | 1.0 → 1.5 | T1.5 | Thu Nov 12 | **F08** | Pretend scores recompute the grade live and never change the real imported data. |
| **T3.2** Final-grade calculator: "what do I need on the final?" | 1.0 → 1.5 | T1.4 | Sun Nov 15 | **F09** | For a target grade, the app shows the needed score, and it checks out by hand. |
| **T3.3** Semester grades: midterm = Q1+Q2+exam, final = Q3+Q4+exam | 1.0 → 1.5 | T1.4 | Wed Nov 18 | **F10** | Quarters count 50/50, the exam weight is editable (default 20%), and results match a hand calculation. |
| **T3.4** Opt-in cloud sync: private account, push/pull the gradebook, login kept in the phone's secure storage | 2.5 → 3.75 | T1.2 | Sun Nov 22 | **F14** | Signing in on a second phone pulls the gradebook from the first; sync stays off unless turned on; nothing sensitive sits in plain storage. |

**M3 done when:** all three projection tools give correct answers on both
platforms and opt-in sync moves a gradebook between two phones.

---

## M4 — MVP QA'd + release builds
**Target: Fri Dec 4 · Mon Nov 23 → Fri Dec 4 (Thanksgiving week is light) · 3.5 base / 5.25 planned hrs**

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T4.1** Full QA pass of F01–F14 on an iPhone **and** an Android phone | 1.0 → 1.5 | M2, M3 | Sun Nov 29 | F01–F14 | A written checklist of all 14 features × 2 platforms marked pass/fail, with every bug logged. |
| **T4.2** Bug-fix + polish: empty/error states, both themes, rough edges from QA | 1.0 → 1.5 | T4.1 | Wed Dec 2 | F01–F14 | No P0/P1 bugs open on either platform; both themes checked; empty/error states present. |
| **T4.3** Release builds for iOS and Android; run them on real phones | 1.0 → 1.5 | T4.2 | Thu Dec 3 | all | A release build opens and works on an iPhone and on an Android phone that never had the dev build. |
| **T4.4** Update README with what's in/out and known limits | 0.5 → 0.75 | T4.3 | Fri Dec 4 | — | The README lists shipped features, known limits, and how to run the demo build. |

**M4 done when:** every MVP feature works on the iOS and Android release builds,
no P0/P1 bugs are open, and both builds are ready for demo prep.

---

## Effort roll-up

| Milestone | Base hrs | Planned hrs (×1.5) |
|-----------|:--:|:--:|
| M1 — Core app | 6.5 | 9.75 |
| M2 — Getting grades in | 7.0 | 10.5 |
| M3 — Projection tools + sync | 5.5 | 8.25 |
| M4 — QA + release builds | 3.5 | 5.25 |
| **Total** | **22.5** | **≈ 33.75** |

**Net planned capacity ≈ 38 hrs.** The plan fits with a **~4 hr (≈11%) buffer**,
plus the 2 sick-day hours held in reserve.

---

## Risk & the cut list (protects the Dec 4 date)

Building 14 features on two platforms in ~38 hours is tight, so slippage is
expected. Cut in this order — top first:

1. **T3.4 cloud sync (F14)** — it is opt-in and off by default; the app is fully
   usable offline without it. Demo on one phone instead.
2. **Depth of T4.2 polish** — fix P0/P1 only; defer cosmetic issues.
3. **T2.3 saved-report import (F05)** — screenshots (F04) and manual entry (F06)
   still get grades in.

**Do not cut:** T1.4 (grade engine), T1.5 (grades screens), T2.2 (screenshot
import), T4.1/T4.3 (QA + release builds) — without these there is nothing to demo.

**Re-baseline trigger:** after W2 (Oct 11), if logged actuals exceed planned by
>25% ([`03-velocity-tracking.md`](03-velocity-tracking.md)), raise the padding
factor and pull the cut list forward rather than pushing the date.
