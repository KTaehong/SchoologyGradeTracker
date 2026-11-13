# Store release checklist — iOS and Android

Where the app stands for the App Store and Google Play (Nov 12, 2026), and the
steps that need your accounts. The earlier iOS pass is in
[ios-release-checklist.md](ios-release-checklist.md); device steps are in
[device-testing.md](device-testing.md).

## How the app meets the release criteria

| Criterion | Where |
| --- | --- |
| Account creation and sign-in | Email + password (with email confirmation), Google, and Apple on iPhone: `mobile/src/app/sign-in.tsx`, `mobile/src/api/auth.ts` |
| Forgot / change password | Sign in → **Forgot password?**; Settings → **Change password**: `mobile/src/app/new-password.tsx` |
| Sign out, delete account | Settings → Account & sync |
| Secure API calls | HTTPS only. Every call carries the student's session token; the database's row-level security lets an account read and write only its own rows (`supabase/migrations/`, tested by `supabase/tests/` and `npm run test:cloud`). The session is kept in the phone's Keychain / Keystore. Only the publishable key ships in the app |
| Backend hosted externally | Supabase project `mjbujhsixgfaluhuvxnn` (Postgres, Auth, Realtime). Nothing runs on a laptop |
| Roles | One role: student. Caregiver and admin modes are out of scope ([mvp.md](mvp.md)), so there is no second UI to build |

## Checked on Windows (Nov 12)

| Check | Command (in `mobile/`) | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| App tests | `npm run test:app` | 230 passed |
| Sync against the real database schema | `npm run test:cloud` | 12 passed |
| Expo project health | `npx expo-doctor` | 21/21 |
| Production bundles | `npx expo export --platform ios --platform android` | both build (3.7 MB / 4.0 MB Hermes) |
| New screens in a browser | `npx expo start --web` | Forgot password, new-password and link screens open with no console errors |

## Changed in this pass

1. **Forgot password** and **Change password**. The emailed link opens the app,
   signs the student in and shows the new-password screen. The link only works
   on the phone that asked for it.
2. The **confirm-your-account** link now opens the app and signs the student in
   (before, it opened a web page and the student had to come back and sign in).
3. Android: the app no longer asks for storage or microphone permissions
   (`blockedPermissions` in `app.json`). It uses the camera only when the
   student takes a photo of their grades.
4. iPhone only (`supportsTablet: false`), so no iPad screenshots are needed.
5. `eas.json`: the production Android build is an app bundle (`.aab`), and
   `eas submit` sends it to Play's internal track as a draft.
6. Privacy policy: how to ask for account deletion without the app (Google Play
   requires this).
7. Expo SDK patch updates.

## Not tested yet (needs a real build)

- The password-reset and confirm-account **email links** end to end. The logic
  is unit-tested (`auth-link.test.ts`), but only a phone build can open
  `gradetracker://` links. Test: Sign in → Forgot password → open the email on
  the same phone → choose a password → sign in with it.
- Everything under "Only testable on an iPhone build" in the iOS checklist, and
  the same list on Android.

## Before you build

- [ ] `npm install -g eas-cli`, then in `mobile/`: `eas login` and `eas init`.
      Commit the `extra.eas.projectId` it adds to `app.json`.
- [x] Supabase settings for builds: `mobile/.env` is in the repository (URL
      and publishable key only), so local and EAS builds are connected with no
      extra step.
- [ ] **Supabase → Authentication → Emails → SMTP Settings:** set up your own
      mail sender (for example Resend's free plan). Supabase's built-in sender
      is for testing: it allows only a few emails an hour and may refuse
      addresses outside your team, so sign-up confirmation and password reset
      would fail for real students.
- [ ] **Supabase → Authentication → URL Configuration:** Redirect URLs must
      include `gradetracker://auth/callback` (already added for Google sign-in).
- [ ] **Google sign-in:** in Google Cloud (project `festive-ray-511303-e7`) →
      OAuth consent screen, press **Publish app**. In "Testing" mode only the
      test users you listed can sign in.
- [ ] Host `docs/privacy-policy.md` on a public page (GitHub Pages works). Both
      stores need the link.

## iOS — App Store

- [ ] Apple Developer Program membership ($99/year).
- [ ] App ID `com.ktaehong.gradetracker` with **Sign In with Apple**
      ([device-testing.md § 1](device-testing.md)).
- [ ] Build and upload:

      ```bash
      eas build --platform ios --profile production
      ```

      ```bash
      eas submit --platform ios --profile production
      ```

- [ ] App Store Connect: privacy policy URL, support URL, App Privacy answers
      (Name, Email Address, User ID, Other User Content; linked to the user; app
      functionality only; no tracking), age rating, 6.9" and 6.5" screenshots.
- [ ] App Review notes: give a test account (email + password), and say that
      account deletion is in Settings → Delete account.
- [ ] Test the TestFlight build with the list in the iOS checklist.

## Android — Google Play

- [ ] Google Play Console account ($25 once). A new personal account must run
      a **closed test with 12 testers for 14 days** before it can publish to
      production, so start this early.
- [ ] Build:

      ```bash
      eas build --platform android --profile production
      ```

      Let EAS create and keep the upload keystore when it asks.
- [ ] The **first** upload must be done by hand: Play Console → create the app →
      Testing → Internal testing → upload the `.aab`. After that,
      `eas submit --platform android --profile production` works once you add a
      Google service account key
      ([Expo guide](https://docs.expo.dev/submit/android/)).
- [ ] Play Console → App content: privacy policy URL; **Data safety** (collects
      name, email, user ID and app content = grades; encrypted in transit; users
      can ask for deletion; nothing shared); **account deletion** link (the
      privacy policy page, "Deleting your data"); content rating; target
      audience 13+; no ads.
- [ ] Store listing: 512×512 icon, 1024×500 feature graphic, at least two phone
      screenshots, short and full description.
- [ ] Test on an Android phone: Google sign-in returns to the app, screenshot
      reading (ML Kit), saved-report import, calendar feed, sync with the
      iPhone, delete account. Sign in with Apple is not offered on Android.

## Security pass (Nov 13)

- Supabase's security advisor flagged six trigger functions as callable through
  the API. They could not actually be run that way, but migration
  `20261113000800_lock_trigger_functions.sql` closes them anyway. It is applied
  to the live project (sign-up, score history, sync and delete account were
  checked there first in a transaction that was rolled back).
- All 16 tables have row-level security with policies; signed-out calls to the
  sync and grade functions are refused (checked against the live API).
- Still open, in the Supabase dashboard: Authentication → Attack Protection →
  **Leaked password protection** (needs a paid plan).

## Known and accepted

- `npm audit` still lists advisories in build tools (not in the app's own
  code); the remaining fixes need breaking upgrades of Expo's tooling.
- The icon is an original placeholder. Replace `mobile/assets/images/` when the
  final art is ready.
