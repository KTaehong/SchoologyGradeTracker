# User-style tests

These tests use the app the way a student does. A real browser (Chromium, at
phone size) opens the web build, taps buttons by their visible labels, types
into the boxes and reads what the screen says. They run on Windows, Mac and
Linux with no simulator.

| Command | What it does | Time |
| --- | --- | --- |
| `npm run test:e2e` | The scripted journeys: opening the app, creating an account, signing in and out, typing in a class, linking the Schoology calendar, going offline. | about 3 min |
| `npm run test:monkey` | The "stupid user" test: random taps, junk typed into every box, Enter and Back at odd moments. | 1–4 min |

Both start the web app themselves (`expo start --web`) or use one that is
already running on port 8081.

## One-time setup

```bash
npm ci
npx playwright install chromium
```

Add a test account to `mobile/.env.local` (git-ignored, never commit it):

```
E2E_EMAIL=ben.ortiz@example.com
E2E_PASSWORD=<the password set when supabase/demo_accounts.sql was run>
```

Any seed or demo account from `supabase/seed.sql` / `supabase/demo_accounts.sql`
works; a demo account's `E2E_EMAIL` can be its username. Without these two
lines, the tests that need a sign-in are skipped and only the signed-out ones
run.

## What is checked on every test

Besides its own steps, every test fails if the app throws an error or writes
to `console.error`. So a journey that "looked fine" still fails when something
broke underneath.

## The journeys

- `sign-in.e2e.ts` — the app starts signed out; bad emails are refused before
  anything is sent; an existing email is named as such; the test account signs
  in with its password; a double tap signs in once; reopening the app asks for
  a sign-in again; Sign out cannot be undone with Back.
- `gradebook.e2e.ts` — add a class, category, assignment and forecast by hand,
  with the slips people make (empty names, "forty", 2/31, 9000 out of 100,
  double taps); then delete the class. Also: sample grades cannot be added
  twice, and the app syncs by itself once the connection is back.
- `calendar.e2e.ts` — link the Schoology calendar, see the items in Upcoming
  and Home, update, sign in again (the link is remembered per account) and
  disconnect. Schoology is not contacted: the test answers the link with a
  small calendar file.
- `monkey.e2e.ts` — see below.

Each journey cleans up after itself, so the test account stays as it was.

## The monkey test

It picks something visible at random and taps it (sometimes twice), fills text
boxes with junk (emoji, 400 letters, `Feb 30`, script tags…), presses Enter,
scrolls, and goes Back. After every step it checks that the app is still
there: no error, no blank screen, still signed in, something left to tap.

It cannot harm the test account: uploads to the cloud are blocked and every
"are you sure?" is answered No.

```bash
npm run test:monkey                       # a new random run each time
MONKEY_SEED=1234 npm run test:monkey      # replay one run exactly
MONKEY_STEPS=500 npm run test:monkey      # a longer run
```

When it fails, the message names the seed and the last twelve steps. Replay
that seed, fix the bug, replay again.

## When a test fails

- `e2e/.results/<test>/test-failed-1.png` — what the screen showed.
- `npx playwright show-report e2e/.report` — every step, with screenshots.
- `npx playwright show-trace e2e/.results/<test>/trace.zip` — replay it.
- `npx playwright test --headed` or `--ui` — watch it run.

## Writing a new journey

- Find things the way a person does: `button(page, 'Sign in')`,
  `field(page, 'Email')`, `text(page, 'Your classes')` from `support/app.ts`.
  Never use CSS classes. If a control cannot be found by its label, give it an
  `accessibilityLabel` in the app: that fixes it for screen readers too.
- Start with `signIn(page)`. It waits until the account's grades are on screen.
- Earlier screens stay mounted underneath the one in front; the helpers
  already pick the visible one.
- Leave the account as you found it (delete what you add).

## What these tests cannot see

They run the web build. Anything that only exists in the phone build needs a
phone or simulator: the on-screen keyboard covering a button, Sign in with
Apple, reading a screenshot, secure storage, and signing out after five
minutes in the background. Keyboard handling is unit-tested
(`src/lib/__tests__/keyboard-reveal.test.ts`); the rest is on the checklist in
`docs/device-testing.md`.
