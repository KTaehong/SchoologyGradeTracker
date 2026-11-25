# Schoology Grade Tracker — notes for Claude

A student grades app. The app is `mobile/` (React Native + Expo SDK 58,
TypeScript, expo-router). The backend is a hosted Supabase project (Postgres,
Auth, Realtime); its SQL is in `supabase/`. There is no server to start: the
backend is already running in the cloud and `mobile/.env` points the app at it.

## Build and run on a Mac (iOS)

Needs: Xcode (with an iOS simulator and the command line tools), Node.js 22.13 or
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

**Expected result:** on a new install the sign-in screen opens: the app cannot
be used without an account. After that the student stays signed in until they
sign out, so the app opens straight to their grades, also with no internet.
Sign in with a demo username (`maya_torres`, `jordan_brooks` or `sam_nguyen`,
made by `supabase/demo_accounts.sql`) or an email (the same script lets
`ben.ortiz@example.com` and the other seed students sign in); "Create an account" makes a
real account on the hosted backend (a confirmation email is sent). After
signing in, Home shows that account's classes and Settings shows the account
and "Synced".

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

Screens can be unit-tested with React Native Testing Library (`render`,
`fireEvent` and `renderHook` are async in v14: `await` them). Mock the
gradebook and session hooks as `src/screens/__tests__/settings.test.tsx`
does. Keep screen tests out of `src/app/`: every file there becomes a route.

After changing a screen, a form, sign-in or sync, also test it like a user
(the `test-like-a-user` skill in `.claude/skills/` says how):

```bash
npm run test:e2e      # a browser taps through the real app: sign-in, classes, calendar
npm run test:monkey   # random taps and junk typing; must not break anything
```

These need `npx playwright install chromium` once, and a test account in the
git-ignored `mobile/.env.local` (`E2E_EMAIL`, `E2E_PASSWORD`); without it the
signed-in tests are skipped. See `mobile/e2e/README.md`.

`npm run test:live` (optional) checks the hosted backend itself over the
network; it needs a throwaway confirmed account in `LIVE_TEST_EMAIL` /
`LIVE_TEST_PASSWORD` and deletes that account at the end.

`npm test` runs the app tests, then the sync code and the SQL tests in
`supabase/tests/` against every migration in an in-memory Postgres (PGlite), so
no database setup is needed. GitHub runs the same checks on every pull request
(`.github/workflows/checks.yml`). `npx expo-doctor` checks the Expo project.

## Rules

- Only the Supabase URL and the **publishable** key belong in the repository
  (`mobile/.env`). Never add the secret / service_role key or the database
  password anywhere.
- Every table has row-level security, and signed-out callers (`anon`) have no
  access to any table, view or function. A migration that adds a function must
  revoke execute from `public, anon`; `supabase/tests/api_security_test.sql`
  fails if one is missed. A new table or function also needs its own test.
- Database changes are new files in `supabase/migrations/` (never edit an
  applied one), and must also be applied to the live project.
- The grade rules exist twice and must agree: `mobile/src/engine/` (on the
  phone, what the app shows) and `supabase/migrations/*grade_engine.sql` (on the
  server, not used by any screen). `npm run test:cloud` compares them on random
  gradebooks.
- `ios/` and `android/` are generated (git-ignored). Change `app.json`, not them.
- Changes reach `main` through a new branch and a pull request.

## Where things are

- `mobile/README.md` — code layout, screen by screen.
- `mobile/e2e/README.md` — the user-style tests (journeys and the monkey test).
- `docs/sync.md` — how offline-first sync works.
- `docs/database/README.md` — tables, security rules, grade API.
- `docs/store-release-checklist.md` — what is left for the App Store and Play.
