# Project Plan — Schoology Grades App (StudyBuddy-style)

> A clean, fast, privacy-first Flutter app that shows students their Schoology
> grades, with a live What-If calculator, trend charts, and grade-change
> notifications. Modeled on the mechanism proven by **StudyBuddy** (VaultIQ Inc.).
>
> Status: **Planning** · Last updated 2026-08-29 · Platform: **Flutter** (iOS + Android, web later)

---

## 1. What we're building

A third-party companion app for Schoology (owned by PowerSchool) that:

- Connects to a student's **own** Schoology account via **three-legged OAuth 1.0a** — the student logs in on Schoology's own page, so we never see their password and Google/Microsoft SSO works.
- Fetches grades **directly to the device**; raw grades never touch our servers (privacy = the core selling point and the trust differentiator).
- Presents grades far more clearly than Schoology, and adds the tools students actually want: **What-If**, trends, a final-grade calculator, and **grade-change notifications**.

**Why this is viable (the key insight):** we register **one** developer app → get **one** consumer key/secret. Every student then self-authorizes read access to their own data. No per-user API keys, no per-district admin approval, SSO-compatible. This is exactly how StudyBuddy operates today, post-crackdown.

---

## 2. Feature set

### MVP (v0.1 — "it works")
- Sign in with Schoology (three-legged OAuth, pick-your-school + WebView login)
- Course list with current grade per course, color-coded
- Course detail: assignments grouped by weighted category, with per-category averages
- **What-If calculator**: edit/add hypothetical scores → grade updates live
- Dark mode
- On-device secure storage of the OAuth access token (Keychain / Keystore)
- Pull-to-refresh sync

### v1.0 (feature parity with StudyBuddy/Bessy)
- **Final-grade calculator**: "what do I need on the final to get an A?"
- **Grade trend charts**: grade-over-time per course
- **Assignment calendar**: consolidated due dates
- **GPA / multi-term rollup** across all courses
- To-do / upcoming assignments view
- Offline caching (last sync viewable with no connection)

### v1.x (differentiators — "better than")
- **Grade-change notifications** (grade posted / grade dropped) — the #1 requested feature; needs background sync
- **Home-screen widget** (grades / what's due today)
- **Goal tracking**: set a target grade per class, see exactly what's required
- **Weighted-category visualizer** (weight bars, impact-of-this-assignment)
- **Privacy-first framing** as an explicit feature: "your grades never leave your device"

### Later / optional
- Infinite Campus support (separate connector behind the same interface)
- Pro tier (StudyBuddy monetizes notifications + widget as Pro)

---

## 3. Architecture

Clean separation so the **data source is one swappable module**. Everything above the data layer is testable against mock data with zero Schoology dependency.

```
┌─────────────────────────────────────────────┐
│  UI (Flutter widgets, screens, charts)        │
├─────────────────────────────────────────────┤
│  State management (Riverpod)                  │
├─────────────────────────────────────────────┤
│  Domain layer                                 │
│   • models: Course, Category, Assignment...   │
│   • GradeEngine (What-If + final-grade math)  │  ← core IP, pure Dart, 100% unit-tested
├─────────────────────────────────────────────┤
│  Data layer — GradeRepository (interface)     │
│   ├── SchoologyRepository (real, OAuth 1.0a)  │
│   ├── MockRepository (sample data)            │  ← build the whole app on this first
│   └── local cache (Isar/SQLite) for offline   │
├─────────────────────────────────────────────┤
│  Platform: secure storage, notifications,     │
│  background fetch, WebView                     │
└─────────────────────────────────────────────┘
```

**Key principle:** build the entire app against `MockRepository` first. `SchoologyRepository` gets wired in the moment the developer consumer key is in hand. Nothing above the data layer changes.

---

## 4. Tech stack (Flutter packages)

| Concern | Package | Notes |
|---|---|---|
| State mgmt | `flutter_riverpod` | Testable, no BuildContext coupling |
| OAuth 1.0a signing | `oauth1` (or hand-rolled HMAC-SHA1 with `crypto`) | Schoology is OAuth **1.0a**, not 2.0 — most libs are 2.0, so signing is custom |
| WebView login | `webview_flutter` | Hosts Schoology's real login/authorize page |
| Secure token storage | `flutter_secure_storage` | Keychain (iOS) / Keystore (Android) |
| Local cache / offline | `isar` or `drift` | Also powers trend history |
| HTTP | `dio` | Interceptors for OAuth header injection + retry |
| Charts | `fl_chart` | Trend lines, category bars |
| Notifications | `flutter_local_notifications` + `workmanager` | Background grade-change checks |
| Home widget | `home_widget` | iOS/Android widget bridge |
| JSON models | `freezed` + `json_serializable` | Immutable models, less boilerplate |

---

## 5. Schoology API integration (concrete)

### OAuth 1.0a — three-legged flow
Base: `https://api.schoology.com/v1`, signature method **HMAC-SHA1**.

1. `POST /oauth/request_token` — signed with consumer key/secret → returns request token + secret
2. Open **`/oauth/authorize?oauth_token=...`** in a WebView → student logs in (SSO works here) and approves
3. On callback (custom URL scheme, e.g. `bessy://oauth-callback`) → `POST /oauth/access_token` → returns **access token + secret** (store in Keychain/Keystore)
4. Every API request: `Authorization: OAuth ...` header, fresh `oauth_nonce` + `oauth_timestamp` per call, HMAC-SHA1 signed with consumer secret **&** token secret.

> Token lifetime is capped at **90 days** (2025 policy) — handle 401 by re-running the authorize step.

### Core endpoints
| Purpose | Endpoint |
|---|---|
| Current user id | `GET /users/me` (or `/app-user-info`) |
| User's course sections | `GET /users/{uid}/sections` |
| **Grades for a section** | `GET /users/{uid}/grades?section_id={sid}` |
| Incremental sync | `GET /users/{uid}/grades?section_id={sid}&timestamp={unix}` (only changes since) |
| Assignments (titles/due) | `GET /sections/{sid}/assignments` |
| Grading categories/weights | `GET /sections/{sid}/grading_categories` |

### Grades response shape (from the docs)
```
section[]                       ← one per course section
  ├─ section_id
  ├─ period[]                   ← grading periods (quarters/semesters)
  │    ├─ period_id, period_title, weight
  │    └─ assignment[]          ← the grade objects
  │         ├─ assignment_id
  │         ├─ grade            ← points earned
  │         ├─ max_points
  │         ├─ exception        ← e.g. excused/incomplete (skip in calc)
  │         ├─ is_final
  │         ├─ comment, type, timestamp
  ├─ final_grade[]              ← Schoology's OWN computed grade per period (use to VALIDATE our math)
  └─ grading_category[]         ← category id + title (+ weight, from categories endpoint)
```

---

## 6. Domain data model (Dart, simplified)

```dart
class Course   { String sectionId; String title; String? teacher; Color color;
                 List<GradingPeriod> periods; }
class GradingPeriod { String id; String title; double weight;
                      List<Category> categories; double? schoologyFinalGrade; }
class Category { String id; String title; double weight;   // e.g. 0.40 = 40%
                 bool isWeighted; int? dropLowest;
                 List<Assignment> assignments; }
class Assignment { String id; String title; double? earned; double maxPoints;
                   bool excused; bool isHypothetical;  // ← What-If flag
                   DateTime? due; String? categoryId; }
```

---

## 7. The GradeEngine (core IP — must be exact)

This is the heart of the app and the thing that must be **provably correct**. Pure Dart, no I/O, exhaustively unit-tested.

Responsibilities:
- Compute a course grade from assignments + category weights (weighted or points-based).
- Handle edge cases: **excused/exception** assignments (excluded), **extra credit** (earned > max or 0-max-point items), **drop-lowest** rules, ungraded assignments (excluded until scored), unweighted vs weighted categories.
- **What-If mode**: recompute instantly when a score is edited, added, or removed.
- **Final-grade solver**: given current state + remaining weight, solve for the score needed to hit a target overall grade.

**Validation strategy:** Schoology returns its *own* `final_grade`. On every real sync we compare our computed grade to Schoology's and flag mismatches — this is how we guarantee the calculator matches what students see in Schoology. Ship only when they agree across many real course types.

---

## 8. Screens / UX

1. **Onboarding** — value prop + privacy promise ("grades never leave your device")
2. **School picker** — search school → resolves Schoology domain for OAuth
3. **Schoology login** — WebView (their page, their SSO)
4. **Home / course list** — cards: course, current grade, trend sparkline
5. **Course detail** — categories (weight bars) → assignments; edit any score inline (What-If)
6. **What-If bar** — live "current → projected" grade with reset
7. **Final-grade calculator** — target grade → required score
8. **Calendar** — upcoming assignments/due dates
9. **Trends** — grade-over-time chart per course + GPA rollup
10. **Settings** — dark mode, notifications, sign out (wipes token), privacy info

---

## 9. Phased roadmap

| Phase | Goal | Depends on dev key? |
|---|---|---|
| **P0** | Flutter project scaffold, models, `GradeEngine` + full unit tests, `MockRepository`, all screens against mock data | ❌ No — can start immediately |
| **P1** | OAuth 1.0a client + WebView login + `SchoologyRepository`; wire real data | ✅ Yes — needs consumer key |
| **P2** | Offline cache, trend history persistence, calendar, GPA rollup | Partial |
| **P3** | Background sync + grade-change notifications + home widget | ✅ |
| **P4** | Polish, beta via direct App Profile install, then pursue App Center approval | ✅ |

> **We can build all of P0 now** — a complete, clickable, correct app — with zero dependency on the developer account. The account only unlocks P1's live data.

---

## 10. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Can't obtain a developer consumer key | Medium | Register a separate Schoology **developer account** (your action item). If blocked, StudyBuddy proves a path exists — investigate their exact route. |
| Cross-school scale eventually needs App Center approval | Unknown | Serve your own school first; pursue approval in parallel (P4). StudyBuddy works cross-school today, so a path exists. |
| Schoology ToS / policy shift kills third-party access | Low-Med | Keep connector isolated & swappable; privacy-first design keeps us clearly in "user-consented own-data" territory (the sanctioned path). |
| GradeEngine mismatches Schoology's displayed grade | Medium | Validate against Schoology's returned `final_grade` on every sync; don't ship until they match across course types. |
| OAuth 1.0a signing bugs | Medium | Use a battle-tested signing lib; test against real endpoints early with a throwaway script. |
| 90-day token expiry surprises users | Low | Detect 401 → silent re-auth prompt. |

---

## 11. Open questions / decisions

- **App name** (not "Bessy" anymore) — TBD.
- **Monetization**: free with Pro tier (notifications + widget), like StudyBuddy? Or fully free?
- **Which school(s) to target first** for beta.
- **Infinite Campus**: in scope for v1, or Schoology-only first? (Recommend Schoology-only first.)

## 12. Your action items
1. **Register a Schoology developer account** and try to generate a **consumer key + secret**. This is the one gate for live data.
2. Decide app name + monetization (can defer).

## 13. My next step (on your go)
Scaffold **P0**: create the Flutter project, implement the models + `GradeEngine` with a full unit-test suite, build `MockRepository` with realistic sample data, and stand up the core screens — a complete working app driven by mock data, ready for the real connector to drop in.
