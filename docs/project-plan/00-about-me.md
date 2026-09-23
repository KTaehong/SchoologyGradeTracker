# About the Developer — planning context

*Captured 2026-09-21 so effort estimates and the padding factor are grounded in
reality, and so future sessions don't have to re-ask. Update this if anything
changes.*

## Who / role

- Senior in high school at **American Heritage Schools** (FL), heavy **AP course
  load** (BC Calc, Multivariable Calc HH, Physics C E&M AP, English Lit AP,
  Spanish Lang AP, US Gov AP, App Innovation HON, CS Internship HON, College
  Advising, Speech & Debate).
- Runs a real **education nonprofit** (relevant background, not a time sink for
  this project).
- Solo developer on this project.

## Coding / dev capability

- **Self-rated: beginner.** Comfortable following along and reviewing code, still
  learning fundamentals. **AI (Claude Code) does most of the authoring and
  debugging; the developer reviews, tests, and learns.**
- New to most of the stack specifically: on-device mobile builds for iOS and
  Android, server work for sync, secure token storage, and release builds. This is where variance (and the padding factor) comes from —
  not typing code, but integration surprises.
- **Implication for the plan:** favor tasks that AI can drive to a verifiable
  result with minimal human back-and-forth (schemas, parsers, API contracts,
  test suites).

## Working style & realistic capacity

- **~5 focused hours/week** is the honest number this semester (see
  [`01-availability.md`](01-availability.md) for the week-by-week breakdown).
  Usually ~1 hr on a weeknight or two, plus a weekend block when tournaments and
  essays allow.
- Competing demands: AP homework, **Speech & Debate tournaments** (NSDA — some
  travel weekends), and **college applications** (early deadlines ~Nov 1 / Nov 15).
- Prefers a **Markdown-based plan** over a live SaaS tracker for this course.

## Machine / toolchain (as of 2026-09-21)

- **Windows 11** dev machine. Flutter installed at `C:\Users\thkim\flutter` but
  **not on PATH** (each shell needs `export PATH="/c/Users/thkim/flutter/bin:$PATH"`).
  Flutter 3.47.2 / Dart 3.13.2.
- **Target platforms: iOS and Android.** Every MVP feature must work on both.
  Tool installs and technical decisions are handled inside the tasks that need
  them, not scheduled as separate timeline items.

## What this means for estimating

- Base estimates assume **AI-assisted, optimistic** effort.
- A **×1.5 padding factor** converts base → planned hours, covering the beginner
  learning curve and the extra work of shipping on both iOS and Android. The plan
  treats every feature as built from scratch.
