# Schoology Grade Tracker — notes for Claude

A student grades app. The app is `mobile/` (React Native + Expo SDK 57,
TypeScript, expo-router). The backend is a hosted Supabase project (Postgres,
Auth, Realtime); its SQL is in `supabase/`. There is no server to start: the
backend is already running in the cloud and `mobile/.env` points the app at it.

## Build and run on a Mac (iOS)

Needs: Xcode (with an iOS simulator and the command line tools), Node.js 20 or
newer, and CocoaPods (`brew install cocoapods`). Run everything in `mobile/`.

```bash
cd mobile
npm ci
npx expo run:ios
```

`expo run:ios` generates the native `ios/` project, installs pods, builds and
opens the app in the simulator. The first build takes several minutes. For an
optimized build without the dev menu: `npx expo run:ios --configuration Release`.

Do not use Expo Go for a demo: screenshot import and Sign in with Apple need
this app's own build.

**Expected result:** the Welcome screen opens. "Use without an account" goes
straight to sample grades. "Sign in" → "Create an account" makes a real account
on the hosted backend (a confirmation email is sent); after signing in,
Settings shows the account and "Synced".

If the sign-in screen says "Cloud sync is not set up", `mobile/.env` is missing
or Metro has a stale cache: check the file, then `npx expo start --clear`.

### On a real iPhone

`npx expo run:ios --device` needs a signing team in Xcode
(`mobile/ios/*.xcworkspace` → Signing & Capabilities). The bundle ID
`com.ktaehong.gradetracker` and its Sign in with Apple capability belong to the
owner's Apple Developer team. With a different team, change
`ios.bundleIdentifier` in `mobile/app.json`; email and Google sign-in still
work, but Sign in with Apple will be refused ("Unacceptable audience") until
the new bundle ID is added to the Apple provider in Supabase. A free Apple ID
cannot sign the Sign in with Apple capability: set `ios.usesAppleSignIn` to
`false` and remove `expo-apple-authentication` from `plugins` for that case.

Store builds go through EAS: see `docs/store-release-checklist.md`.

## Checks (run in `mobile/` before committing)

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` runs the app tests and then the sync code against every migration in
`supabase/migrations/` in an in-memory Postgres (PGlite), so no database setup
is needed. `npx expo-doctor` checks the Expo project.

## Rules

- Only the Supabase URL and the **publishable** key belong in the repository
  (`mobile/.env`). Never add the secret / service_role key or the database
  password anywhere.
- Every table has row-level security; every API function is closed to signed-out
  callers. A new table or function needs both, plus a test in `supabase/tests/`.
- Database changes are new files in `supabase/migrations/` (never edit an
  applied one), and must also be applied to the live project.
- The grade rules exist twice and must agree: `mobile/src/engine/` (on the
  phone) and `supabase/migrations/*grade_engine.sql` (on the server).
- `ios/` and `android/` are generated (git-ignored). Change `app.json`, not them.
- Changes reach `main` through a new branch and a pull request.

## Where things are

- `mobile/README.md` — code layout, screen by screen.
- `docs/sync.md` — how offline-first sync works.
- `docs/database/README.md` — tables, security rules, grade API.
- `docs/store-release-checklist.md` — what is left for the App Store and Play.
