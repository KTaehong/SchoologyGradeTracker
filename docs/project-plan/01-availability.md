# Availability & Calendar — Fall 2026

*The captured time budget for the MVP. Re-read this before rescheduling so the
calendar doesn't have to be reconstructed. Dates use the American Heritage /
FL private-school fall calendar; correct any that are wrong and the totals below
update.*

## Window

- **Project start:** Monday **2026-09-28** (Monday of the week after capture).
- **Development cutoff:** Friday **2026-12-04**.
- **Reserved for live-demo setup (NOT development):** Mon **2026-12-07** → Fri
  **2026-12-18**. Per the assignment, development is *not* scheduled through the
  final deadline.
- **Development span:** 10 working weeks (W1–W10).

## Nominal capacity

- **~5 focused hours/week** (see [`00-about-me.md`](00-about-me.md)).

## Time off / reduced-efficiency events

| Event | When | Effect |
|-------|------|--------|
| Speech & Debate tournament weekend | W3 (Oct 12–16) | −50% that week (loses the weekend block) |
| **College-application crunch** (essays + early deadlines Nov 1 / Nov 15) | W4–W5 (Oct 19–30) | −50% each week |
| Speech & Debate tournament weekend | W7 (Nov 9–13) | −50% that week |
| **Thanksgiving break** (Wed–Fri off) | W9 (Nov 25–27) | ~−60% that week (family time) |
| **Sick-day buffer** | anytime | Reserve **2 days ≈ 2 hrs**, held back from the total |
| S&D travel Fridays | folded into the W3 / W7 tournament weeks above | already counted |

*Regular-decision (January) college deadlines fall after the dev window and are
ignored here.*

## Effective hours per week

| Week | Dates | Nominal | Modifier | **Effective hrs** | Cumulative |
|------|-------|:-------:|----------|:-----------------:|:----------:|
| W1 | Sep 28 – Oct 2 | 5 | full | **5.0** | 5.0 |
| W2 | Oct 5 – 9 | 5 | full | **5.0** | 10.0 |
| W3 | Oct 12 – 16 | 5 | S&D tournament (−50%) | **2.5** | 12.5 |
| W4 | Oct 19 – 23 | 5 | college apps (−50%) | **2.5** | 15.0 |
| W5 | Oct 26 – 30 | 5 | college apps (−50%) | **2.5** | 17.5 |
| W6 | Nov 2 – 6 | 5 | full | **5.0** | 22.5 |
| W7 | Nov 9 – 13 | 5 | S&D tournament (−50%) | **2.5** | 25.0 |
| W8 | Nov 16 – 20 | 5 | full | **5.0** | 30.0 |
| W9 | Nov 23 – 27 | 5 | Thanksgiving (Wed–Fri off) | **2.0** | 32.0 |
| W10 | Nov 30 – Dec 4 | 5 | full | **5.0** | 37.0 |

- **Raw effective seat-time:** **37.0 hrs**
- **Less sick-day reserve (2 days ≈ 2 hrs):** **−2.0**
- **= Net planned capacity:** **≈ 35.0 hrs**

## Padding / velocity factor

The classic **planning fallacy**: people systematically underestimate their own
tasks. We counter it two ways:

1. **Estimate in base AI-assisted hours** — optimistic effort with Claude Code
   authoring and debugging.
2. **Multiply base × 1.5 → planned hours.** The 1.5 covers the beginner learning
   curve and first-time setup/deploy variance. It is *not* higher because most
   remaining work is verifying and configuring **already-written** code, which AI
   accelerates well (the app, engine, import layer, and backend all exist today).

**Budget check:** planned work must fit inside **~35 hrs**. The plan in
[`02-project-plan.md`](02-project-plan.md) lands at **~32 planned hrs** of core
work, leaving a **~3 hr (≈9%) buffer** plus the 2 sick days in reserve.

> ⚠️ This is a **near-full budget with thin slack.** The estimates *will* be
> wrong somewhere. After ~2 weeks, use real logged hours in
> [`03-velocity-tracking.md`](03-velocity-tracking.md) to re-baseline — that is
> how estimates converge to reality over time.
