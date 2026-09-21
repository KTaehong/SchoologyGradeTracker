# Project Plan — Schoology Grade Tracker MVP

This folder is the **planning deliverable** for finishing the Schoology Grade
Tracker MVP during Fall 2026. It exists so that any future session (human or AI)
can pick up the plan, see how much time is really available, and track progress
against it — without re-capturing everything from scratch.

## What's here

| File | Purpose |
|------|---------|
| [`00-about-me.md`](00-about-me.md) | Context about the developer — capability, tools, working style. Feeds effort estimates and the padding factor. |
| [`01-availability.md`](01-availability.md) | **The captured calendar.** Start date, holidays, personal days, competitions, college-app crunch, sick buffer → an effective-hours-per-week table and total capacity. Re-read this before rescheduling. |
| [`02-project-plan.md`](02-project-plan.md) | The task/subtask breakdown: effort, dependencies, target dates, related MVP features, and a "definition of done" for each — grouped under 4 milestones. |
| [`03-velocity-tracking.md`](03-velocity-tracking.md) | The tracking system: log estimated vs. actual per task, compute weekly velocity, and re-baseline. This is the "project tracking system" for this plan. |

## The one-paragraph version

The app is **already largely built** (Flutter client, grade engine, keyless
import, and a Dart backend all exist — see [`../system_architecture/SYSTEM_COMPONENTS.md`](../system_architecture/SYSTEM_COMPONENTS.md)).
So the remaining MVP work is **not greenfield building** — it's environment
setup, on-device verification, hardening, deployment, QA, and a release build.
That is the only reason a 14-feature MVP is realistic in **~35 focused hours**
across a busy senior-fall semester.

## Ground rules baked into this plan

- **Start:** Monday **2026-09-28**. **Dev cutoff:** Friday **2026-12-04**.
- **Last ~2 weeks (Dec 7–18) are reserved for live-demo setup**, not development
  (per the assignment).
- Estimates are **AI-assisted** (Claude authors/debugs; the developer reviews and
  learns) and then **padded ×1.5** for beginner + first-time-setup variance.
- The plan is loaded to ~90% of capacity with a thin buffer and a **named cut
  list** (see [`02-project-plan.md`](02-project-plan.md) §Risk) so the date holds
  even when estimates slip. It *will* slip somewhere — that's expected, and
  [`03-velocity-tracking.md`](03-velocity-tracking.md) is how we correct.

*Plans are wrong the moment they're written. The point is having a target to
steer against — "If you fail to plan, you plan to fail."*
