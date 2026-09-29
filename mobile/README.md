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

- `src/app/` — screens. `(tabs)/` holds the three tabs: `index.tsx` (Grades),
  `upcoming.tsx`, `settings.tsx`. `course/[id].tsx` is a course's detail screen
  and `add.tsx` is the *Add grades* sheet. `_layout.tsx` files wire up
  navigation and the theme.
- `src/components/` — shared UI pieces.
- `src/lib/coming-soon.ts` — buttons for features that aren't built yet show a
  "Coming soon" message.
- `src/data/` — the gradebook model, saving it on the phone, and the demo
  gradebook. On first launch the app fills itself with demo grades and
  assignments; *Settings → Data* can reload the demo or erase everything.
- `src/api/` — the cloud API. `client.ts` makes the one Supabase client, which
  keeps the sign-in session in secure storage and sends the token with every
  request; `auth.ts` signs in and out; `grades.ts` is the grade engine API
  (grades snapshot, add/set/remove forecasts); `use-session.ts` is a hook for
  the sign-in state.
- `src/theme/` — colors and the light/dark/system theme setting.
