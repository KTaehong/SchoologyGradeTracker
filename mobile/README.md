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

## Checks

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

## Layout

- `src/app/` — screens. Each file is a tab: `index.tsx` (Grades),
  `upcoming.tsx`, `settings.tsx`. `_layout.tsx` wires up the tabs and theme.
- `src/components/` — shared UI pieces.
- `src/theme/` — colors and the light/dark/system theme setting.
