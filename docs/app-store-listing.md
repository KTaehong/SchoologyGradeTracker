# App Store and Google Play listing

Copy for App Store Connect and the Google Play Console. Character limits are in
brackets. Keep "Schoology" out of the app **name** and **subtitle**: it is
another company's trademark, and App Review rejects names that suggest a
connection (Guideline 5.2.1). Saying the app *works with* Schoology in the
description is fine, with the disclaimer at the end.

## Name and subtitle

| Field | Text |
|---|---|
| App name [30] | Grade Tracker – What-If Grades |
| Subtitle [30] | Forecast every class grade |
| Bundle ID | `com.ktaehong.gradetracker` |
| SKU | `gradetracker-ios-1` |
| Primary category | Education |
| Secondary category | Productivity |
| Age rating | 4+ (no objectionable content; answer "No" to every questionnaire item) |
| Price | Free, no in-app purchases |

## Promotional text [170]

Know your grade in every class, and exactly what you need on the next test.
Works offline. No Schoology password needed.

## Description [4000]

Grade Tracker shows your grade in every class and tells you what you need on
the next test to reach the grade you want.

• Every grade at a glance — your classes, letter grades and percents, computed
  on your phone with weighted categories, points grading, dropped scores, extra
  credit and excused work.
• What-If forecasts — add an upcoming test or change a score and watch your
  projected grade move.
• Final-exam calculator — see the score you need on the final for an A, B or C.
• Semester grades — quarters and exams combined the way your school does it.
• Bring your grades in your way — type them in, scan a screenshot (read on your
  phone, never uploaded), or open a saved grades page.
• Upcoming work — connect your Schoology calendar link to see what is due.
• Works offline — everything is saved on your phone.
• Optional account — sign in with Apple, Google or email to sync between your
  devices. You can use the app without one.

Private by design: we never ask for your Schoology password. No ads, no
tracking, no analytics. Delete your account and data at any time in Settings.

Grade Tracker is an independent app. It is not made by, endorsed by, or
affiliated with Schoology or PowerSchool. Schoology is a trademark of its owner.

## Keywords [100, comma-separated, no spaces needed]

grades,gpa,grade calculator,what if,final exam,forecast,school,student,report card,planner

## URLs

| Field | URL |
|---|---|
| Privacy Policy URL | `https://ktaehong.github.io/SchoologyGradeTracker/privacy-policy` |
| Support URL | `https://ktaehong.github.io/SchoologyGradeTracker/support` |
| Marketing URL | (optional, leave empty) |

These work once GitHub Pages is on for this repository (Settings → Pages →
Deploy from a branch → `main`, folder `/docs`). See
[release-checklist.md](release-checklist.md#5-host-the-privacy-policy-and-support-page).

## App Review information

**Sign-in required for review:** Apple needs a working demo account for any app
with sign-in, even when sign-in is optional (Guideline 2.1).

1. In the app, create an account with an email you own, for example
   `gradetracker.review@<your-domain>` and a strong password. Confirm the email.
2. Load sample grades (Settings → Data → Add sample grades) so the reviewer sees
   classes, forecasts and sync.
3. Put the email and password in App Store Connect → App Review Information →
   Sign-in required. Do not commit them.

**Notes for the reviewer** (paste):

> Grade Tracker works fully without an account: tap "Use without an account"
> on the first screen, then Settings → Data → Add sample grades.
> The optional account (Sign in with Apple, Google, or email) syncs grades
> between devices. Use the demo account above to test sign-in and sync.
> Account deletion: Settings → Account & sync → Delete account.
> The app does not log in to Schoology and never asks for a Schoology password.
> Students bring their grades in by typing them, scanning a screenshot (read on
> the device with Apple's Vision framework), or opening a saved grades page.
> The app is not affiliated with Schoology.

## App Privacy ("nutrition label")

App Store Connect → App Privacy → Get started → **Yes, we collect data**:

| Data type | Linked to user | Tracking | Purpose |
|---|---|---|---|
| Contact Info → Name | Yes | No | App Functionality |
| Contact Info → Email Address | Yes | No | App Functionality |
| Identifiers → User ID | Yes | No | App Functionality |
| User Content → Other User Content (grades) | Yes | No | App Functionality |

Everything else: not collected. No tracking. This matches the privacy manifest
in `mobile/app.json` (`ios.privacyManifests`).

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `app.json`: the app only uses
HTTPS and the operating system's own encryption, which is exempt. App Store
Connect will not ask on each upload.

## Screenshots

Required: **6.9" iPhone** (1320 × 2868 or 1290 × 2796). App Store Connect scales
these for smaller iPhones. iPad screenshots are **not** needed: the app is
iPhone-only (`supportsTablet: false`).

Suggested five, from a real build with sample grades loaded:

1. Home — all classes with letter grades.
2. A class — categories and assignments.
3. Forecast — adding an upcoming test, projected grade.
4. Final-exam calculator / semester card.
5. Upcoming — calendar items.

Google Play: at least 2 phone screenshots (1080 × 1920 or larger), a 512 × 512
icon and a 1024 × 500 feature graphic.

## Google Play extras

- **Data safety form:** same four data types as above, "collected", "not
  shared", encrypted in transit, users can request deletion (in-app).
- **Account deletion URL** (required by Play when an app has accounts): the
  Support page, which explains Settings → Delete account and the email
  fallback.
- **Target audience:** 13+ (students). Do not choose "under 13"; that brings
  the Families policy and COPPA requirements.
- **Content rating:** complete the IARC questionnaire (all "No") → Everyone.
