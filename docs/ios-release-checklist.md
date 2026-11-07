# iOS release checklist

What was checked on Windows (Nov 7, 2026), what was fixed, and what still needs
a person with the Apple Developer account and the Supabase dashboard.

## Checked and passing

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` (in `mobile/`) | clean |
| Lint | `npx expo lint` | clean |
| App tests | `npm run test:app` | 217 passed |
| Sync against the real database | `npm run test:cloud` | 12 passed |
| SQL migrations + tests | `supabase/tests/run_local.sh` (or PGlite) | all passed, incl. seed ×2 and demo |
| Expo project health | `npx expo-doctor` | 21/21 |
| Production iOS bundle | `npx expo export --platform ios` | builds (3.7 MB Hermes) |
| iOS config | `npx expo config --type introspect` | bundle ID, Apple sign-in entitlement, camera/photo texts, ATS, encryption key all set |
| App in a browser | `npx expo start --web` | welcome → home → class → add assignment → forecast → new class → Upcoming → Settings → Privacy, no console errors; grades match hand calculations |

`npm test` runs both test steps. `test:cloud` runs the app's sync code against
every Supabase migration in an in-memory Postgres (PGlite), so a row the server
would refuse fails a test instead of a student's phone.

## Fixed in this pass

1. **Sync could get stuck forever.** The server refuses a whole push if one row
   breaks a rule, and a saved-report import could create such rows (a row with a
   due date but no score, an impossible date like 2/31, very long names, huge
   scores). After that, none of the student's changes reached the cloud again.
   Fixed in the importers, and every row is now fitted to the server's limits as
   it is sent (`mobile/src/sync/server-limits.ts`), which also unsticks phones
   that already have such rows.
2. Forecast form had no upper limits (title length, score size): same failure.
3. Importing a report with two classes of the same name failed.
4. A calendar item fetched on two phones showed twice until the next sync.
5. Signing out with no internet left the account's grades on the phone.
   Errors from confirmed actions (sign out, erase) were silently dropped; they
   now show a message.
6. **Deleting a student failed on the server** (also from the Supabase
   dashboard) when they had imported grades or upcoming items. Fixed in migration
   `20261107000700_delete_account.sql`.
7. **In-app account deletion** added (Settings → Delete account). Apple requires
   it for any app with sign-up (App Review Guideline 5.1.1(v)).
8. **Privacy page** added (Settings → Privacy); `docs/privacy-policy.md` is the
   copy for the App Store listing.
9. **Screenshot import can now save** (class, grading period, category per row;
   re-scanning updates instead of duplicating). Before, the screen only showed
   what it read.
10. "Continue with Microsoft" removed: Microsoft sign-in is not turned on in
    Supabase, so the button always failed.
11. App icon, splash and Android icons were Expo's logo (the template). Replaced
    with an original placeholder (rising bars + check). Swap in final art at any
    time: `mobile/assets/images/`.
12. iOS: `ITSAppUsesNonExemptEncryption = false` (no export-compliance prompt on
    every TestFlight upload) and App Transport Security set to HTTPS-only.
13. Expo SDK patch updates (`npx expo install --fix`) and `npm audit fix`.
14. Buttons have VoiceOver labels.

## Must do before submitting (needs account access)

- [ ] **Apply migration 7** to Supabase project `mjbujhsixgfaluhuvxnn`: paste
      `supabase/migrations/20261107000700_delete_account.sql` into the SQL editor
      and run it, then run `supabase/tests/delete_account_test.sql` (it rolls back).
      Without it, Settings → Delete account shows an error.
- [ ] **Turn on Sign in with Apple in Supabase** — it is currently OFF (checked
      Nov 7 via the project's auth settings), so the Apple button on iPhone fails.
      Steps: [device-testing.md § 1](device-testing.md). Apple requires this
      option whenever Google sign-in is offered (Guideline 4.8).
- [ ] Add a contact email / support page to `docs/privacy-policy.md`, host it
      (for example GitHub Pages), and put both URLs in App Store Connect
      (Privacy Policy URL and Support URL are required).
- [ ] App Store Connect → App Privacy: declare **Name, Email Address, User ID**
      and **Other User Content** (grades), all "linked to the user", used for
      **App Functionality** only; no tracking.
- [ ] Final app icon (optional — the placeholder is original and acceptable).
- [ ] Store screenshots (6.9" and 6.5" iPhone) from a real build.

## Only testable on an iPhone build

These cannot run on Windows or the web; do them with the development or
TestFlight build (`eas build -p ios --profile preview`), following
[device-testing.md](device-testing.md):

- Sign in with Apple (after the Supabase switch above), Google sign-in redirect
  back into the app, email sign-up confirmation link.
- Screenshot reading (Apple Vision) on a real Schoology screenshot, then saving.
- Picking a saved report from Files.
- Calendar feed fetch (blocked by CORS on the web; works natively).
- Sync between two devices, including an edit made offline.
- Delete account (after migration 7), then signing in again is refused.
