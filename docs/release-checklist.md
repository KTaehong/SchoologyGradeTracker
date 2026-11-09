# Release checklist (App Store and Google Play)

Everything needed to ship version 1.0, in order. Items marked **[code]** are
done in this repository; the rest need a person with the Apple Developer
account, the Supabase dashboard, or the Expo account. Earlier QA notes:
[ios-release-checklist.md](ios-release-checklist.md).

## Why the iPhone build said "sync isn't available in this version"

The app reads the Supabase URL and publishable key from `EXPO_PUBLIC_*` values
that are **baked in when the app is built**. They live in `mobile/.env.local`,
which is never uploaded to EAS, and they had only been added to EAS for the
`development` environment. So the TestFlight / App Store build (the
`production` environment) had no server settings: no sign-in, no sync, and
"Cloud sync is not set up in this version of the app".

Fixed in two parts:

- **[code]** `mobile/app.config.js` now **stops any EAS build that has no
  Supabase settings**, with a message saying what to run. A build without
  sign-in can no longer reach TestFlight by accident. It also refuses a
  *secret* key, so the service-role key can never be shipped in the app.
- **You, once:** `npm run eas:env` (step 2 below) copies the two values to
  every EAS environment.

## 1. Supabase (dashboard, project `mjbujhsixgfaluhuvxnn`)

- [ ] **Apply migration 8** `supabase/migrations/20261109000800_lock_down_api.sql`
      (SQL Editor → paste → Run, or `supabase db push`). Then paste and run
      `supabase/tests/api_security_test.sql`; every line should say `ok` and it
      rolls itself back.
- [ ] **Advisors → Security Advisor:** run it; there should be no errors.
- [ ] **Authentication → URL Configuration**
  - Site URL: `gradetracker://auth/callback`
  - Redirect URLs: `gradetracker://auth/callback` (and `exp://**` only while
    testing in Expo Go; remove it for release).
- [ ] **Authentication → Sign In / Providers → Email**
  - Confirm email: **on**.
  - Secure email change: **on**.
  - Minimum password length: **8**; Password requirements: **letters and
    digits** (the app asks for the same).
  - Leaked password protection: **on** (needs the Pro plan; skip if on Free).
- [ ] **Authentication → Emails → SMTP Settings: set up custom SMTP.**
      **Release blocker.** Supabase's built-in email only sends to members of
      your Supabase team and only a few per hour, so real students would never
      get their confirmation or password-reset email. Any SMTP service works
      (Resend, Postmark, SendGrid, Amazon SES, or a Gmail/Workspace app password
      for low volume). Then raise **Rate Limits → emails per hour** (30 is fine).
- [ ] **Authentication → Emails → Templates:** "Confirm signup" and "Reset
      password" — put "Grade Tracker" in the subject and text. Keep the
      `{{ .ConfirmationURL }}` link as is.
- [ ] **Authentication → Rate Limits:** keep the defaults (they stop password
      guessing and sign-up spam). Optional: Attack Protection → CAPTCHA.
- [ ] **Project Settings → API Keys:** the app uses the **publishable** key
      (`sb_publishable_…`) or the legacy `anon` key. Make sure the **secret /
      service_role** key is not in `.env.local`, EAS, or anywhere in git. If it
      ever was, rotate it.
- [ ] Apple and Google providers stay on (done Nov 7). Apple Client IDs:
      `com.ktaehong.gradetracker` (remove `host.exp.Exponent` after release).

## 2. EAS (Expo) — give the builds their server settings

In `mobile/`, on the computer that has `.env.local`:

```bash
npx eas-cli login
npm run eas:env
```

This saves `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for
the `development`, `preview` and `production` environments. Check with
`npx eas-cli env:list --environment production`.

## 3. Apple Developer and App Store Connect

- [ ] Apple Developer Program membership active ($99/year).
- [ ] App ID `com.ktaehong.gradetracker` with **Sign In with Apple**
      ([device-testing.md § 1](device-testing.md)). EAS can create it on the
      first build.
- [ ] App Store Connect → My Apps → **+ New App**: iOS, name from
      [app-store-listing.md](app-store-listing.md), bundle ID above, SKU
      `gradetracker-ios-1`.
- [ ] Agreements, Tax, and Banking: accept the Free Apps agreement.

## 4. Build and upload

```bash
cd mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

The build number goes up by itself (`autoIncrement`, `appVersionSource:
remote`). Raise `expo.version` in `app.json` for each new store version.

- [ ] Install from **TestFlight** and run the device tests in section 7.

## 5. Host the privacy policy and support page

- [ ] GitHub → this repository → Settings → **Pages** → Source: Deploy from a
      branch → `main` / `/docs` → Save. After a minute these work:
  - `https://ktaehong.github.io/SchoologyGradeTracker/privacy-policy`
  - `https://ktaehong.github.io/SchoologyGradeTracker/support`
      (The repository must be public for free GitHub Pages; otherwise host the
      two files anywhere public, e.g. Google Sites or Notion.)

## 6. Store listing (App Store Connect)

All text is ready in [app-store-listing.md](app-store-listing.md).

- [ ] Name, subtitle, description, keywords, promotional text, category, age rating.
- [ ] Privacy Policy URL and Support URL (step 5).
- [ ] **App Privacy** answers (table in app-store-listing.md).
- [ ] **Demo account** for App Review (Apple requires one because the app has
      sign-in). Create it in the app, confirm it, add sample grades, enter it
      under App Review Information. Don't commit the password.
- [ ] Review notes (in app-store-listing.md).
- [ ] Screenshots: 6.9" iPhone, 3–5 of them, from the TestFlight build.
- [ ] Submit for review.

## 7. Test on a real iPhone (TestFlight build)

- [ ] First launch → Welcome shows Apple, Google and email sign-in (not "not
      set up").
- [ ] Create an account with email → confirmation email arrives (custom SMTP)
      → tapping the link opens the app signed in.
- [ ] Sign out → Forgot password? → email → link opens the app → choose new
      password → sign in with it.
- [ ] Sign in with Apple; Sign in with Google.
- [ ] Settings → Change password / Set a password.
- [ ] Two devices: an edit on one shows up on the other; an offline edit
      syncs when back online.
- [ ] Screenshot import, saved report import, calendar feed.
- [ ] Delete account → signing in again is refused.

## 8. Google Play (when ready)

- [ ] Google Play developer account ($25 once); new app; package
      `com.ktaehong.gradetracker`.
- [ ] `npx eas-cli build --platform android --profile production` (makes an
      `.aab`) → `npx eas-cli submit --platform android --latest` (first upload
      may need to be done by hand in the Play Console).
- [ ] Data safety form, account deletion URL, target audience 13+, content
      rating (see app-store-listing.md).
- [ ] New personal developer accounts must run a **closed test with at least
      12 testers for 14 days** before production access.
- [ ] Sign in with Apple is iPhone-only in this app; Google and email work on Android.

## Done in code for this release

| Area | What | Where |
|---|---|---|
| Build | EAS builds stop if the Supabase settings are missing; a secret key is refused at build time and at run time | `mobile/app.config.js`, `mobile/scripts/supabase-key-check.js`, `mobile/src/api/config.ts` |
| Build | `npm run eas:env` copies the settings to every EAS environment | `mobile/scripts/push-eas-env.js` |
| Security | Signed-out callers can no longer reach any table, view or function (REST, GraphQL, Realtime); students cannot truncate tables or edit server-maintained tables (sync revision, tombstones, score history, login methods) | `supabase/migrations/20261109000800_lock_down_api.sql`, `supabase/tests/api_security_test.sql` |
| Accounts | Forgot password (email link → new password), email confirmation link opens the app signed in, Change / Set password in Settings, 8+ character passwords with a letter and a number, email format check | `mobile/src/app/sign-in.tsx`, `mobile/src/app/password.tsx`, `mobile/src/app/auth/callback.tsx`, `mobile/src/api/auth.ts`, `mobile/src/lib/password-rules.ts` |
| Apple | Privacy manifest (required since May 2024): no tracking, data collected, required-reason APIs | `mobile/app.json` → `ios.privacyManifests` |
| Apple | iPhone-only (`supportsTablet: false`), so no iPad screenshots are needed | `mobile/app.json` |
| Apple | No "Schoology" in the app's title; non-affiliation notice on Welcome, Privacy page and policy (Guideline 5.2.1) | `welcome.tsx`, `privacy.tsx`, `docs/privacy-policy.md` |
| Store | Listing text, review notes, privacy answers, support page | `docs/app-store-listing.md`, `docs/support.md` |
| Earlier | Account deletion, privacy page, encryption flag, HTTPS-only, Sign in with Apple, icons | [ios-release-checklist.md](ios-release-checklist.md) |
