# Device builds and on-phone testing

The steps that need your Apple account, your Supabase dashboard, or a real phone.
The code for each one is already in the app. Do them in this order. Each step
says what "done" looks like.

App IDs used below (set in [`mobile/app.json`](../mobile/app.json)):

| | Value |
|---|---|
| iOS bundle ID | `com.ktaehong.gradetracker` |
| Android package | `com.ktaehong.gradetracker` |
| URL scheme | `gradetracker` |

---

## 1. App ID with Sign in with Apple, and Apple sign-in in Supabase

**Apple Developer** ([developer.apple.com/account](https://developer.apple.com/account)):

1. Certificates, Identifiers & Profiles → **Identifiers** → **+** → **App IDs** → **App**.
2. Description: `Grade Tracker`. Bundle ID: **Explicit**, `com.ktaehong.gradetracker`.
3. Under Capabilities, tick **Sign In with Apple** (leave it as "Enable as a primary App ID").
4. Continue → Register.

(EAS can also create the App ID for you in step 2 because `usesAppleSignIn` is
on in `app.json`. Doing it by hand first means you can see that it is right.)

**Supabase** (project `mjbujhsixgfaluhuvxnn`) → Authentication → Sign In / Providers → **Apple**:

1. Turn on **Enable Sign in with Apple**.
2. **Client IDs:** `com.ktaehong.gradetracker,host.exp.Exponent`
   (the second one lets the button also work in Expo Go while testing).
3. Leave **Secret Key** empty. The app signs in with Apple's own sheet and sends
   Supabase the ID token, so no secret key is needed. You only need one if you
   later add Apple sign-in on Android or the web.
4. Save.

**Done when:** the App ID shows "Sign In with Apple" under its capabilities, and
the Apple provider shows "Enabled" in Supabase.

## 2. Register the iPhone, then make development builds

Run these in `mobile/`. Install the EAS command line once with `npm install -g eas-cli`.

```bash
eas login
```

```bash
eas init
```

`eas init` links the app to your Expo account and adds `extra.eas.projectId`
to `app.json`. Commit that change.

Give the builds the Supabase settings. `.env.local` is not uploaded to EAS, so
without this the build says "Cloud sync is not set up". Use the same two values
that are in `mobile/.env.local` (the URL and the publishable key, never the secret key):

```bash
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value "https://mjbujhsixgfaluhuvxnn.supabase.co" --visibility plaintext
```

```bash
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<publishable key from .env.local>" --visibility plaintext
```

Repeat both for `--environment preview` when you make the release APK later.

Register the iPhone (open the link it prints on the iPhone, install the profile
in Settings → General → VPN & Device Management):

```bash
eas device:create
```

Build both apps (each takes 10–20 minutes on EAS's computers):

```bash
eas build --profile development --platform ios
```

```bash
eas build --profile development --platform android
```

Install:

- **iPhone:** open the build link from the email or `expo.dev` on the iPhone →
  Install. Then turn on Settings → Privacy & Security → **Developer Mode** and restart.
- **Android:** open the build link on the phone → download the APK → install
  (allow "install unknown apps" for your browser once).

Run the app from the computer: `npx expo start --dev-client`, then scan the QR
code with each phone's camera.

**Done when:** "Grade Tracker" (not Expo Go) opens on both phones and loads the
app from your computer.

## 3. Sign in with Apple on the iPhone

The sign-in screen and Welcome now show Apple's official black "Sign in with
Apple" button (white in dark mode) above Google, as Apple requires.

1. Settings tab → Sign in → **Sign in with Apple** → Face ID.
2. First time only: Apple asks to share or hide your email. Either works.
3. Check in Supabase → Authentication → Users that a user with provider
   `apple` is there, and in Table Editor → `profiles` that `full_name` is your
   name (Apple shares the name only on the very first sign-in).
4. Sign out, sign in again: it should go straight through.

**Done when:** you are signed in with Apple and your grades sync.
If it fails with "Unacceptable audience", the Client IDs in step 1 are missing
`com.ktaehong.gradetracker`.

## 4. Screenshots on both phones

Take each on the iPhone and the Android phone and save them in
`docs/weekly-status/<this Friday's date>/`:

| File | What to show |
|---|---|
| `welcome-ios.png`, `welcome-android.png` | First-run Welcome screen (Settings → Erase this phone's data, or reinstall, to see it again) |
| `home-ios.png`, `home-android.png` | Home tab with your classes |
| `google-signin-ios.png`, `google-signin-android.png` | The Google account picker after "Continue with Google" |
| `apple-signin-ios.png` | The Apple sheet (iPhone only) |
| `offline-ios.png`, `offline-android.png` | Home in airplane mode, showing the offline label |

## 5. Sync on two real phones, including an offline edit

Sign in to the **same account** on both phones.

1. Phone A: add an assignment. Phone B: pull down on Home. It shows up within a few seconds.
2. Phone B: change that assignment's score. Phone A shows the new score.
3. Phone A: turn on **airplane mode**. Change a score and add a forecast. The
   label says you are offline and the changes are saved on the phone.
4. Phone B (online): change a **different** assignment.
5. Phone A: turn airplane mode off. Within a few seconds both phones show both changes.
6. Bonus: edit the **same** assignment on both while A is offline. The last one
   to reach the server wins (see [`sync.md`](sync.md)).

**Done when:** steps 1–5 pass. Write down anything that took more than ~10 seconds.

## 6. A real class by hand, checked against Schoology

1. Add grades → **Add a class**. Use the real name, teacher, and grading
   (weighted or points) from Schoology.
2. Add each category with its exact weight, then every graded assignment with
   the same score and points possible as Schoology.
3. Compare the app's percent for the class and for each category with Schoology's.

**Done when:** they match to one decimal place. If not, note the category, both
numbers, and whether the class drops the lowest score or has extra credit.

## 7. Screenshot import (T2.2): read one real screenshot

Text reader: **expo-text-extractor**. It uses Apple Vision on iPhone and Google
ML Kit on Android, runs offline, is free, and the picture never leaves the phone.
It needs the development build from step 2; in Expo Go the screen says "Not available here".

1. In the Schoology app or website, open a class → Grades. Take a screenshot.
2. Grade Tracker → Add grades → **Scan a screenshot** → Pick a screenshot.
3. Check the class it found, each row's score and category, and anything under
   "Did not line up".
4. Tap **Show the text the phone read** and copy it (long-press → Select All → Copy).
   Send it so it can become a test in
   [`screenshot-parser.test.ts`](../mobile/src/import/__tests__/screenshot-parser.test.ts).
   Remove names of other students or teachers first.

**Done when:** one real screenshot reads with the right scores on each phone, and
its text is a test case. Saving the rows into the class is the next part of T2.2.
