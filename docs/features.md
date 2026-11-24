# Feature specifications — Schoology Grade Tracker

One section per MVP feature. IDs match [`mvp.md`](mvp.md) and are referenced from
[`user-flows.md`](user-flows.md). "Expected behavior" lists the steps the user
goes through; "Edge cases" lists conditions the app must handle.

---

## F01 — Onboarding

- **User goal:** Start using the app quickly, without handing over a Schoology
  password.
- **Expected behavior:**
  1. On a new install the app shows the sign-in screen: sign in, or create an
     account with email, Google or Apple (Apple on iPhone only).
  2. The student lands on Home. An empty account offers ways to add classes.
  3. The student can load sample grades to explore (Settings → Data), or import
     their own.
- **Edge cases:** The student stays signed in, so later launches open directly to
  Home, also with no network. Creating an account needs a network connection.

## F02 — Grades home

- **User goal:** See all my courses and my current grade in each at a glance.
- **Expected behavior:**
  1. The app opens to a list of the student's courses.
  2. Each course shows its current overall grade as a percent and a letter, using
     the grade engine (F07).
  3. Tapping a course opens Course detail (F03).
  4. An import action (FAB / global "import from a screenshot") and access to
     Settings are reachable from here.
- **Edge cases:** A course with nothing graded shows `N/A` rather than `0%`. When
  the gradebook is empty, an empty state offers "import" and "load sample."

## F03 — Course detail

- **User goal:** Understand how a course grade is built up and see individual
  assignments.
- **Expected behavior:**
  1. Show the overall course grade, then the course's grading periods (quarters),
     each with its weight.
  2. Within a period, show categories/sections (e.g. formative/summative) with
     their weights.
  3. Within a category, list assignments with name, due date, and score
     (`earned / max`, or `—` when ungraded).
  4. Offer per-section "add from photo" (F04) and What-If editing (F08); show the
     final-grade calculator (F09) and semester grades (F10).
- **Edge cases:** Messy Schoology course titles (extra colons, repeated names,
  section codes) are displayed tolerantly. Ungraded items are excluded from the
  computed grade but still listed.

## F04 — Import from screenshot (OCR)

- **User goal:** Get my grades into the app quickly by photographing a grades
  screen.
- **Expected behavior:**
  1. The user starts import globally (from Grades home) or scoped to a section
     (from Course detail).
  2. The user takes or picks a photo; on-device OCR extracts the text.
  3. A cascade runs: (a) auto-detect the **class**; if uncertain, the user picks
     it; (b) auto-detect the **category/section**; if uncertain, the user picks
     it. Each field shows status — green "auto-detected"/"set" vs amber "pick one."
  4. Extracted rows (name + `earned/max`) are shown for the user to confirm/edit.
  5. On commit, the assignments are added and grades recompute (F07) and persist
     (F13).
- **Edge cases:** OCR is mobile-only — on web/desktop the flow degrades to pasting
  text. Headings cut off in the photo fall through to the manual class/category
  pick. A date in a row (e.g. `8/26`) must not be misread as a score. Low-quality
  OCR still lets the user correct every field before committing.

## F05 — Import from saved grade report

- **User goal:** Import my full, exact gradebook — with real weights — in one go.
- **Expected behavior:**
  1. From Settings, the user provides a saved Schoology **Grades** page (HTML
     file) or pastes the page text.
  2. The parser recovers the course → grading period → category → assignment
     hierarchy, including per-level weights and exact scores.
  3. The imported courses appear on Grades home and persist (F13).
- **Edge cases:** This path is the most accurate source of category weights.
  Parsing is best-effort text-grammar recovery; the user can still edit results.
  On mobile there is no one-tap structured export from Schoology, so screenshots
  (F04) remain the primary mobile capture and this path is best on desktop
  (save/print the page as HTML).

## F06 — Manual entry

- **User goal:** Track a class the import paths don't cover, or build one by hand.
- **Expected behavior:**
  1. The user creates a new class (default sections such as Tests/Quizzes/
     Homework).
  2. The user adds sections/categories and assignments (name, earned, max).
  3. Grades compute (F07) and persist (F13) exactly as for imported classes.
- **Edge cases:** Photo/manual-built classes use default/points weighting; real
  weighted categories come from the HTML report path (F05). Per-section weight
  editing for manual classes is out of MVP.

## F07 — Grade engine

- **User goal:** Trust that the numbers match what Schoology shows.
- **Expected behavior:**
  1. Category grade = pooled points of graded items.
  2. Period grade = weight-normalized average of its categories that have grades.
  3. Course grade = weight-normalized average of its periods that have grades.
  4. Applies excused/ungraded exclusion, extra credit, drop-lowest, and a US +/-
     letter scale.
- **Edge cases:** Weights are normalized over only the present (graded) buckets,
  so an ungraded category/period does not drag the grade down. A course with no
  graded work returns `N/A`. Points-based and weighted classes are both supported.

## F08 — What-If grades

- **User goal:** See how a hypothetical score would change my grade.
- **Expected behavior:**
  1. In Course detail, the user edits an existing score or adds a hypothetical
     assignment.
  2. The course grade recomputes instantly using F07.
  3. What-If changes are local and reversible; they do not alter imported data.
- **Edge cases:** Leaving What-If discards the hypotheticals; the real grade is
  restored.

## F09 — Final-grade calculator

- **User goal:** Know the score I need on a remaining item to reach a target
  grade.
- **Expected behavior:**
  1. The user opens the calculator for a course and enters a target grade.
  2. The app solves for the score needed on the final (or remaining item),
     given current grades and weights (F07).
  3. The result updates as the target changes.
- **Edge cases:** If the target is already guaranteed or is mathematically
  impossible, the app says so rather than showing a nonsensical number.

## F10 — Semester (midterm/final) grades

- **User goal:** See my midterm and final semester grades, including exams.
- **Expected behavior:**
  1. For a course with semester structure, compute **midterm = Q1 + Q2 + midterm
     exam** and **final = Q3 + Q4 + final exam**.
  2. The two quarters count 50/50 against each other; the exam blends by weight
     (default 20%), present-weight normalized.
  3. The user can enter/edit each exam's score, max, and weight; grades recompute.
- **Edge cases:** An exam not yet taken drops out (quarters keep full weight). A
  semester with no graded quarters falls back to just the exam. Term membership is
  inferred from the quarter when not explicit.

## F11 — Upcoming assignments

- **User goal:** See what's coming due without opening Schoology.
- **Expected behavior:**
  1. In Settings, the user connects their Schoology **iCal feed** URL.
  2. The app fetches the feed, keeps assignment events due from today onward, and
     matches each to the owning class by title where possible.
  3. An agenda groups items by day; tapping one opens the assignment in Schoology.
- **Edge cases:** The feed does **not** name the owning class, so unmatched items
  show as "Unfiled." The feed URL contains a password-equivalent token and is
  stored securely, never shared. In a web browser the fetch is blocked by CORS;
  native Android/iOS (the real target) fetch normally. Some districts post no
  assignment due dates to Schoology, in which case the agenda is empty.

## F12 — Theme / dark mode

- **User goal:** Use the app comfortably in light or dark.
- **Expected behavior:** The user chooses light/dark (or system) in Settings; the
  choice persists.
- **Edge cases:** Defaults to the system theme on first run.

## F13 — On-device persistence

- **User goal:** Keep my grades between launches, and see them offline.
- **Expected behavior:** All imported/manual grades, exam data and the theme are
  saved on the phone (SQLite) and shown at launch. The sign-in session and the
  calendar link are in the Keychain / Keystore.
- **Edge cases:** Once signed in, the app is fully usable with no network, also
  after the access token has expired. The local data is what the screens show;
  the cloud is a copy (F14). The database file is protected by the phone's own
  app sandbox and is not encrypted separately.

## F14 — Cloud sync

- **User goal:** Keep my grades across a reinstall and on a second device.
- **Expected behavior:**
  1. Signing in joins the phone's gradebook to the student's account.
  2. Changes sync by themselves; Settings → Sync now does it on request.
  3. Signing out sends unsent changes first, then removes this phone's copy.
- **Edge cases:** When changes cannot be sent, signing out asks before losing
  them. Signing in as someone else asks before deleting the previous account's
  unsent changes. The service never receives a Schoology credential. How it
  works: [`sync.md`](sync.md).
