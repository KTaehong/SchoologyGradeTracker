# Grade Tracker — mobile app

The iOS + Android app, built with React Native + Expo (TypeScript).

## Run it on your phone

1. Install [Node.js](https://nodejs.org) (LTS) on your computer.
2. Install the free **Expo Go** app on your iPhone (App Store) and Android phone
   (Google Play).
3. In this folder:

   ```bash
   npm install
   npx expo start
   ```

4. Scan the QR code in the terminal:
   - **iPhone:** open the Camera app and point it at the QR code.
   - **Android:** open Expo Go and tap *Scan QR code*.

Your phone and computer need to be on the same Wi-Fi. If they can't see each
other (for example on school Wi-Fi), run `npx expo start --tunnel` instead.

## Cloud API (optional)

The app works fully offline. To use the cloud API (sign-in, grades snapshot,
saved forecasts), copy `.env.example` to `.env.local` and fill in the Project
URL and anon key from Supabase (**Project Settings → API**), then restart
`npx expo start`. Without them the API reports `not_configured` and the rest of
the app is unaffected. See [`docs/database/README.md`](../docs/database/README.md#6-grade-engine-api).

## Checks

```bash
npm test            # unit tests (Jest)
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

## Layout

- `src/app/` — screens. `welcome.tsx` is shown on first run (sign in, or use
  the app without an account). `(tabs)/` holds the four tabs: `index.tsx`
  (Home, the landing page), `grades.tsx`, `upcoming.tsx`, `settings.tsx`.
  `course/[id].tsx` is a course's detail screen with its forecasts,
  `forecast.tsx` adds, changes, or removes a forecast, and `add.tsx` is the
  *Add grades* sheet. `sign-in.tsx` signs in or creates an account;
  `auth/callback.tsx` is where Google / Apple / Microsoft sign-in returns.
  `_layout.tsx` files wire up navigation, the theme, and the first-run check.
- `src/components/` — shared UI pieces.
- `src/lib/coming-soon.ts` — buttons for features that aren't built yet show a
  "Coming soon" message.
- `src/engine/` — the grade engine (same rules as the server's SQL engine).
- `src/db/` — the gradebook in SQLite on the phone.
- `src/sync/` — cloud sync: pull/push, Realtime, connectivity, accounts. How it
  works: [`docs/sync.md`](../docs/sync.md).
- `src/data/` — `gradebook-store.tsx` is what every screen reads (local data,
  computed grades, sync status); `sample-gradebook.ts` is the sample. On first
  launch the app starts with the sample; *Settings → Data* can add it again or
  erase everything.
- `src/test-support/` — test helpers: an in-memory SQLite and a fake sync server.
- `src/api/` — the cloud API. `client.ts` makes the one Supabase client, which
  keeps the sign-in session in secure storage and sends the token with every
  request; `auth.ts` signs in and out (email, Google, Apple, Microsoft);
  `grades.ts` is the grade engine API (grades snapshot, add/set/remove
  forecasts, load sample grades); `use-session.ts` is a hook for the sign-in
  state and `use-api-query.ts` loads API data when a screen opens.
- `src/lib/forecast-form.ts` checks the forecast form; `format-grade.ts`
  formats percents and points.
- `src/theme/` — colors and the light/dark/system theme setting.
