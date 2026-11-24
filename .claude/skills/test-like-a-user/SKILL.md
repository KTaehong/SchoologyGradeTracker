---
name: test-like-a-user
description: Test the Grade Tracker app the way a student would - run the scripted journeys, the random "monkey" test, or explore by hand in a browser. Use after changing any screen, form, sign-in or sync code, when asked to find bugs, to "test the app", to "stupid test" it, or to confirm a change works in the real app (not only in unit tests).
---

# Test the app like a user

The app's web build runs in a browser at phone size against the real hosted
backend, signed in to a test account. All commands run in `mobile/`.

## 1. Run what already exists (always do this first)

```bash
npm run test:e2e        # scripted journeys, about 3 min
npm run test:monkey     # random taps and junk typing, 1-4 min
```

Needs, once: `npm ci`, `npx playwright install chromium`, and `E2E_EMAIL` /
`E2E_PASSWORD` in `mobile/.env.local`. If they are missing, the signed-in tests
are skipped: say so, and ask the owner for the test account password (never
guess it, never commit it).

A failure prints the step, a screenshot path under `e2e/.results/`, and for
the monkey the seed. Look at the screenshot with Read before guessing.
Replay a monkey failure with `MONKEY_SEED=<seed> npm run test:monkey`.

## 2. Explore by hand, when hunting for bugs or checking a new screen

Start the app with the Browser pane (`preview_start` name `expo-web`) or
`npx expo start --web --port 8081`, then drive it. Prefer a short throwaway
Playwright script (see `e2e/support/app.ts` for helpers) over clicking by
coordinates: it is faster and the steps can become a test.

Act like a student who is in a hurry and not careful:

- Tap the main button twice. Press Enter in every field. Go Back mid-save.
- Leave required boxes empty. Type words where numbers go, 9000 where 90
  goes, `2/31` as a date, an emoji, 400 letters, leading spaces.
- Go offline (`context.setOffline(true)`), change something, come back.
- Reload the page (that is "closing and reopening the app": it must
  open straight to the grades, also with the server out of reach).
- Open a link that does not exist. Open an inner screen while signed out.
- Try both themes and a narrow screen (320 px wide).

After every step read the screen. A bug is any of: an error in the console, a
blank or stuck screen, a button that stays disabled, a message a student would
not understand, the same thing saved twice, words that contradict another
screen ("stays on this phone" on one, "syncs" on another).

## 3. Rules while testing

- Use only a test account (`@example.com` / `@demo.example.com`). Delete
  whatever you add. Never tap "Erase all data" or "Delete account" for real:
  those accounts are shared.
- Never link a real Schoology calendar. Answer the link yourself with
  `page.route(...)`, as `e2e/calendar.e2e.ts` does.
- Creating a new account sends a real email and is rate-limited. Test the
  form's checks (they run before anything is sent), not the sending.

## 4. Every bug found becomes a test

Fix the bug, then add the step that found it to the matching journey in
`mobile/e2e/` (or a unit test when the rule is a plain function in
`src/lib/`). Find controls by role and visible label; if that is not possible,
add an `accessibilityLabel` in the app instead of a CSS selector.

## 5. What the browser cannot show

Phone-only behaviour needs a simulator or phone: the keyboard covering a
button, Sign in with Apple, reading a screenshot, secure storage, staying
signed in after the app is closed. Say plainly that these were not checked.
On a Mac with a simulator, `npx expo run:ios` and check them by hand against
`docs/device-testing.md`.

More detail: `mobile/e2e/README.md`.
