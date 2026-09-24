# Availability & Calendar — Fall 2026

*The captured time budget for the MVP. Re-read this before rescheduling so the
calendar doesn't have to be reconstructed. Dates use the American Heritage /
FL private-school fall calendar; correct any that are wrong and the totals below
update.*

## Window

- **Project start:** Thursday **2026-09-24**.
- **Development cutoff:** Friday **2026-12-04**.
- **Reserved for live-demo setup (NOT development):** Mon **2026-12-07** → Fri
  **2026-12-18**. Per the assignment, development is *not* scheduled through the
  final deadline.
- **Development span:** a partial start week (W0, Thu–Sun) + 10 working weeks (W1–W10).

## Nominal capacity

- **~5 focused hours/week** (see [`00-about-me.md`](00-about-me.md)).

## Time off / reduced-efficiency events

| Event | When | Effect |
|-------|------|--------|
| Speech & Debate tournament weekend | W3 (Oct 12–18) | −50% that week (loses the weekend block) |
| **College-application crunch** (essays + early deadlines Nov 1 / Nov 15) | W4–W5 (Oct 19–Nov 1) | −50% each week |
| Speech & Debate tournament weekend | W7 (Nov 9–15) | −50% that week |
| **Thanksgiving break** (Wed–Fri off) | W9 (Nov 25–27) | ~−60% that week (family time) |
| **Sick-day buffer** | anytime | Reserve **2 days ≈ 2 hrs**, held back from the total |
| S&D travel Fridays | folded into the W3 / W7 tournament weeks above | already counted |

*Regular-decision (January) college deadlines fall after the dev window and are
ignored here.*

## Effective hours per week

Weeks run Monday–Sunday (W0 is the short start week, Thu–Sun).

| Week | Dates | Nominal | Modifier | **Effective hrs** | Cumulative |
|------|-------|:-------:|----------|:-----------------:|:----------:|
| W0 | Sep 24 – 27 (Thu–Sun) | 3 | partial start week | **3.0** | 3.0 |
| W1 | Sep 28 – Oct 4 | 5 | full | **5.0** | 8.0 |
| W2 | Oct 5 – 11 | 5 | full | **5.0** | 13.0 |
| W3 | Oct 12 – 18 | 5 | S&D tournament (−50%) | **2.5** | 15.5 |
| W4 | Oct 19 – 25 | 5 | college apps (−50%) | **2.5** | 18.0 |
| W5 | Oct 26 – Nov 1 | 5 | college apps (−50%) | **2.5** | 20.5 |
| W6 | Nov 2 – 8 | 5 | full | **5.0** | 25.5 |
| W7 | Nov 9 – 15 | 5 | S&D tournament (−50%) | **2.5** | 28.0 |
| W8 | Nov 16 – 22 | 5 | full | **5.0** | 33.0 |
| W9 | Nov 23 – 29 | 5 | Thanksgiving (Wed–Fri off) | **2.0** | 35.0 |
| W10 | Nov 30 – Dec 4 | 5 | full (dev cutoff Fri) | **5.0** | 40.0 |

- **Raw effective seat-time:** **40.0 hrs**
- **Less sick-day reserve (2 days ≈ 2 hrs):** **−2.0**
- **= Net planned capacity:** **≈ 38.0 hrs**

## Padding / velocity factor

The classic **planning fallacy**: people systematically underestimate their own
tasks. We counter it two ways:

1. **Estimate in base AI-assisted hours** — optimistic effort using AI-assisted
   development tools.
2. **Multiply base × 1.5 → planned hours.** The 1.5 covers the beginner
   learning curve and the extra work of making every feature run on **both iOS
   and Android**.

**Budget check:** planned work must fit inside **~38 hrs**. The plan in
[`02-project-plan.md`](02-project-plan.md) lands at **~34 planned hrs**, leaving
a **~4 hr (≈11%) buffer** plus the 2 sick days in reserve.

> ⚠️ This plan builds all 14 MVP features from scratch on two platforms, so the
> budget is tight. The estimates *will* be wrong somewhere. After W2, use real
> logged hours in [`03-velocity-tracking.md`](03-velocity-tracking.md) to
> re-baseline — that is how estimates converge to reality over time.
