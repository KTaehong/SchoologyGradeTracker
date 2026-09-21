# Project Plan — Schoology Grade Tracker MVP

*Start Mon 2026-09-28 · Dev cutoff Fri 2026-12-04 · ~35 planned hrs (see
[`01-availability.md`](01-availability.md)). Feature IDs (F01–F14) reference
[`../mvp.md`](../mvp.md). Effort is **base** AI-assisted hours; **Planned** =
base × 1.5.*

## Scope framing — why this fits in 35 hours

The client app, grade engine, keyless import, and the Dart backend are **already
built** ([`../system_architecture/SYSTEM_COMPONENTS.md`](../system_architecture/SYSTEM_COMPONENTS.md)).
Remaining MVP work is therefore **setup, on-device verification, hardening,
deployment, QA, and a release build** — not building features from zero. Tasks
are chosen to be **AI-verifiable with little human back-and-forth** (parsers,
schemas, API contracts, and test suites that Claude can drive to a green,
checkable result).

**iOS is out of scope** (no Mac). **Android is the demo target.**

---

## Milestones

| # | Milestone | Target | Proves |
|---|-----------|:------:|--------|
| **M1** | Dev environment & on-device build | **Fri Oct 9** (end W2) | The app runs on a real Android device/emulator; tests + analyze green. |
| **M2** | Import & grade engine verified on-device | **Fri Nov 6** (end W6) | The core promise — real screenshot + real report import correctly; grades match Schoology. |
| **M3** | Cloud sync + secure storage | **Fri Nov 20** (end W8) | Opt-in sync (F14) works against a running server; session tokens secured. |
| **M4** | MVP feature-complete, QA'd, release build | **Fri Dec 4** (end W10) | Every MVP feature works on a device build; a shareable APK installs on a clean device. |

*Then Dec 7–18: live-demo setup (reserved, not scheduled here).*

---

## M1 — Dev environment & on-device build
**Target: Fri Oct 9 · Weeks 1–2 · 6.0 base / 9.0 planned hrs**
Covers the assignment's *system-admin / dev-tool-setup* requirement.

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T1.1** Put Flutter/Dart on PATH permanently; `flutter doctor` clean | 1.0 → 1.5 | — | Sep 29 | infra | `flutter doctor` shows no blocking issues in a fresh shell without manual PATH export. |
| **T1.2** Install **Android Studio** + SDK + accept licenses; create a Pixel emulator **or** enable USB debugging on a personal Android phone | 2.0 → 3.0 | — | Oct 1 | infra | An emulator boots (or a physical device is recognized by `flutter devices`). |
| **T1.3** First on-device `flutter run`; fix ML Kit / Developer-Mode / symlink build blockers | 1.5 → 2.25 | T1.1, T1.2 | Oct 6 | F01–F13 | The app installs and opens to onboarding on the device/emulator. |
| **T1.4** Decide developer-account path: **sideload APK for the demo** (no cost) vs. Google Play registration ($25); record the decision | 0.5 → 0.75 | — | Oct 7 | infra | A one-line decision + rationale committed to this folder. |
| **T1.5** Regenerate the 3 golden images; get `flutter test` + `flutter analyze` green in the device toolchain | 1.0 → 1.5 | T1.3 | Oct 9 | F07 | Full suite passes (0 skipped goldens); analyze clean. |

**M1 done when:** the app launches on a real Android device/emulator, all tests
and analyze are green, goldens are regenerated, and the dev-account decision is
recorded.

---

## M2 — Import & grade engine verified on-device
**Target: Fri Nov 6 · Weeks 3–6 (W4–5 at 50% for college apps) · 7.0 base / 10.5 planned hrs**
The single most important milestone — the app's core value, tested with *real*
data on *real* hardware for the first time.

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T2.1** Device **OCR** import: run real Schoology screenshots through ML Kit + the class→category→rows cascade; fix extraction bugs | 3.0 → 4.5 | T1.3 | Oct 23 | **F04** | A photo of a real grades screen imports on-device; class/category auto-detect or fall back to manual pick; rows land with correct scores. |
| **T2.2** Harden the **HTML report** parser against a real saved AH *Grades* page (save-as-HTML on desktop → import) | 2.0 → 3.0 | T1.3 | Oct 30 | **F05** | A real saved report imports with course→period→category→assignment structure and correct weights/scores. |
| **T2.3** Verify **manual entry, engine, what-if, final-calc, semester grades** on-device; fix UI bugs found | 1.5 → 2.25 | T1.3 | Nov 4 | F06–F10 | Each feature works on-device and the computed grade **matches Schoology** for a real course. |
| **T2.4** Verify **iCal upcoming** on native (no CORS) with the real feed | 0.5 → 0.75 | T1.3 | Nov 6 | **F11** | The agenda loads on-device from the real feed and matches assignments to classes where possible. |

**M2 done when:** a real screenshot **and** a real saved report both import
correctly on a physical device, all projection tools compute Schoology-matching
grades, and the upcoming feed loads natively.

---

## M3 — Cloud sync + secure storage
**Target: Fri Nov 20 · Weeks 7–8 · 3.0 base / 4.5 planned hrs core (+ stretch)**
F14 is **opt-in, off by default, beta** — so the *core* here is proving it works
against a running server; public hosting is a stretch.

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T3.1** Verify **F14 sync** against a **locally-run** Dart server (emulator ⇄ device / reinstall); confirm push/pull and opt-in default-off | 1.5 → 2.25 | T1.3 | Nov 13 | **F14** | Signing in on a second instance pulls the gradebook synced from the first; sync stays off unless enabled. |
| **T3.2** Move session tokens `shared_preferences` → **secure storage** (`flutter_secure_storage`, Keychain/Keystore) | 1.5 → 2.25 | T3.1 | Nov 18 | F14 | Tokens are stored in the platform secure store; sync still works; nothing sensitive left in plain prefs. |
| **T3.3** *(STRETCH)* Deploy the Dart server to a free host (Render/Fly, **Docker**) + managed Postgres; remote two-device sync | 2.5 → 3.75 | T3.1 | Nov 20 | F14 | The server answers at a public URL on a persistent store; two real devices sync over the internet. |

**M3 done when:** opt-in sync demonstrably works across two app instances and
session tokens are in secure storage. *(T3.3 hosting is the first thing to drop
if time is short — see Risk below.)*

---

## M4 — MVP feature-complete, QA'd, release build
**Target: Fri Dec 4 · Weeks 9–10 (W9 Thanksgiving) · 5.5 base / 8.25 planned hrs**

| Task | Effort (base→planned) | Depends on | Target | Features | Definition of Done |
|------|:--:|:--:|:--:|:--:|------|
| **T4.1** Full **QA pass** across F01–F14 on-device; log every bug | 2.0 → 3.0 | M2, M3 | Nov 30 | F01–F14 | A written checklist of all 14 features marked pass/fail with logged issues. |
| **T4.2** **Bug-fix + polish**: empty/error states, light **and** dark theme, rough edges from QA | 2.0 → 3.0 | T4.1 | Dec 2 | F01–F14 | No P0/P1 bugs open; both themes verified; empty/error states present. |
| **T4.3** Build a **signed release APK**; install-test on a clean device | 1.0 → 1.5 | T4.2 | Dec 3 | infra | A release APK installs and runs on a device that never had the dev build. |
| **T4.4** Update `README`/docs with known limits; **tag a release** in git | 0.5 → 0.75 | T4.3 | Dec 4 | infra | Docs list what's in/out; a git tag (e.g. `v0.1.0-mvp`) marks the demo build. |

**M4 done when:** every MVP feature works on the release build, no P0/P1 bugs are
open, and a shareable APK installs cleanly — ready for demo prep.

---

## Effort roll-up

| Milestone | Base hrs | Planned hrs (×1.5) |
|-----------|:--:|:--:|
| M1 — Environment & device build | 6.0 | 9.0 |
| M2 — Import verified on-device | 7.0 | 10.5 |
| M3 — Cloud sync + secure storage (core) | 3.0 | 4.5 |
| M4 — QA & release build | 5.5 | 8.25 |
| **Core total** | **21.5** | **≈ 32.25** |
| M3 stretch (T3.3 hosting) | 2.5 | 3.75 |
| **With stretch** | **24.0** | **≈ 36.0** |

**Net planned capacity ≈ 35 hrs.** Core work (~32 hrs) fits with a ~3 hr buffer.
The stretch (~36 hrs total) only fits if velocity beats plan.

---

## Risk & the cut list (protects the Dec 4 date)

The budget is ~90% loaded, so slippage is expected. Cut in this order — top first:

1. **T3.3 hosting deploy (stretch)** — demo sync against a locally-run server
   instead. F14 is beta/opt-in, so this is a clean drop.
2. **Depth of T4.2 polish** — fix P0/P1 only; defer cosmetic issues.
3. **T2.2 HTML-report hardening** — screenshots (F04) remain the primary mobile
   path, so a rough report parser is tolerable for the demo.

**Do not cut:** T1.3 (device build), T2.1 (device OCR), T4.1/T4.3 (QA + release
build) — without these there is nothing to demo.

**Re-baseline trigger:** after W2, if logged actuals exceed planned by >25%
([`03-velocity-tracking.md`](03-velocity-tracking.md)), raise the padding factor
and pull the cut list forward rather than pushing the date.
