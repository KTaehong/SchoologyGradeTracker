# Schoology Grade Tracker

A privacy-first grades app for students on **iOS and Android**. Import your
Schoology grades without handing over a password, see accurate course grades,
and plan ahead with What-If, final-grade, and semester tools.

## Repository layout

| Path | What it is |
|---|---|
| [`mobile/`](mobile/) | The app — React Native + Expo (TypeScript). See [`mobile/README.md`](mobile/README.md) to run it on your phone. |
| [`supabase/`](supabase/) | The cloud database: SQL migrations and tests. Design notes in [`docs/database/`](docs/database/). |
| [`docs/`](docs/) | Product specs (MVP, features, user flows), the project plan, and pitch materials. |

## What it does

- **Accounts:** create an account with email and password (with email
  confirmation), or sign in with Apple or Google. Forgot / change password,
  sign out, and delete account are all in the app.
- **Grades:** classes, grading periods, weighted categories and assignments,
  with the same grade rules Schoology uses. Add them by hand, from a screenshot
  (on-device text reading), or from a saved Schoology grade report.
- **Planning:** What-If forecasts, "what do I need on the final", semester
  grades, and upcoming work from the Schoology calendar feed.
- **Sync:** works offline; a signed-in student's grades sync between their
  devices in real time.

## Backend

The backend is hosted on [Supabase](https://supabase.com) (Postgres, Auth,
Realtime), not on anyone's computer. The app talks to it over HTTPS only; every
call carries the student's session token, and row-level security in the
database lets an account read and write only its own rows. The session is kept
in the phone's Keychain / Keystore.

[`mobile/.env`](mobile/.env) holds the backend's address and its publishable
key, so **a fresh clone connects to the live backend with no setup**. Both
values are public by design (they ship inside the app). No secret key is in
this repository.

## Build it for iPhone (Mac)

Needs Xcode, Node.js 20+, and CocoaPods.

```bash
cd mobile
npm ci
npx expo run:ios
```

This builds the app and opens it in the iOS simulator. More detail, including
running on a real iPhone, is in [`CLAUDE.md`](CLAUDE.md) (written so that
Claude Code can do the build for you: open this folder in Claude Code and ask
it to build and run the iOS app).

Android: `npx expo run:android` (needs Android Studio).

## Checks

```bash
cd mobile
npm run typecheck
npm run lint
npm test
```

## Status

Release candidate. What is done and what still needs the developer's Apple and
Google accounts: [`docs/store-release-checklist.md`](docs/store-release-checklist.md).
