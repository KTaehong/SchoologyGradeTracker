# User flows — Schoology Grade Tracker

Textual walkthroughs of the essential student journeys. Each flow lists the
starting point, the user's actions, the app's responses, the outcome, and the
feature IDs involved (see [`features.md`](features.md)).

Format: `user —` is a user action, `app —` is the app's response.

---

## Flow 1 — First run and first import (screenshot)

- **Start:** App installed, opened for the first time.
- user — open app
- app — show keyless "get started" onboarding [F01]
- user — continue
- app — show Grades home, empty state with "import" and "load sample" [F02]
- user — choose "import from a screenshot"
- user — take or pick a photo of a grades page
- app — run on-device OCR and the cascade: auto-detect the class, then the
  category, showing green "auto-detected" or amber "pick one" per field [F04]
- user — pick the class and/or category where prompted; confirm/edit the rows
- user — commit
- app — add the assignments, recompute grades [F07], save locally [F13], and show
  the course on Grades home with its grade [F02]
- **Outcome:** The student sees a real course with a computed grade, entirely
  keyless and offline.

## Flow 2 — Exact import from a saved grade report

- **Start:** Grades home; the student has saved their Schoology Grades page.
- user — open Settings → "import grade report"
- user — pick the saved HTML file (or paste the page text)
- app — parse course → grading period → category → assignment, with real weights
  and scores [F05]
- app — add the courses, compute grades [F07], persist [F13]
- user — return to Grades home
- app — show the imported courses with accurate weighted grades [F02]
- **Outcome:** The student has a full, accurately weighted gradebook.

## Flow 3 — Explore a course and run a What-If

- **Start:** Grades home with at least one course.
- user — tap a course
- app — show Course detail: overall grade, periods → categories → assignments,
  each with its weight [F03]
- user — edit a score or add a hypothetical assignment (What-If)
- app — recompute and show the projected course grade instantly, without changing
  imported data [F08][F07]
- user — leave What-If
- app — restore the real grade [F08]
- **Outcome:** The student sees the impact of a hypothetical score and returns to
  their actual grade.

## Flow 4 — "What do I need on the final?"

- **Start:** Course detail for a course.
- user — open the final-grade calculator
- user — enter a target course grade
- app — solve for the score needed on the final/remaining item from current grades
  and weights, and display it [F09][F07]
- user — adjust the target
- app — update the required score live [F09]
- **Outcome:** The student knows exactly what they need to hit their target (or is
  told it's already locked in / not possible).

## Flow 5 — Semester (midterm/final) grades with an exam

- **Start:** Course detail for a course with semester structure.
- user — view the semester grades card
- app — show midterm (Q1+Q2+midterm exam) and final (Q3+Q4+final exam) grades
  [F10]
- user — open the exam editor and enter the exam score, max, and weight
- app — recompute the semester grade (quarters 50/50, exam by weight, present-
  weight normalized) and persist [F10][F07][F13]
- **Outcome:** The student sees an accurate semester grade including the exam.

## Flow 6 — Upcoming assignments via iCal

- **Start:** Settings.
- user — open the calendar section and paste the Schoology iCal feed URL
- app — save the feed URL securely [F11][F13]
- user — open "Upcoming" from Grades home
- app — fetch the feed, keep assignments due from today on, match each to its
  class where possible, and show an agenda grouped by day [F11]
- user — tap an item
- app — open that assignment in Schoology [F11]
- **Outcome:** The student sees what's due next; unmatched items appear as
  "Unfiled." (On web the fetch is CORS-blocked; native mobile fetches normally.)

## Flow 7 — Manual class and assignment entry

- **Start:** Grades home.
- user — choose "new class"
- app — create a class with default sections (e.g. Tests/Quizzes/Homework) [F06]
- user — add a section/category and an assignment (name, earned, max)
- app — save and compute the grade [F06][F07][F13]
- app — show the class on Grades home [F02]
- **Outcome:** The student tracks a class built entirely by hand.

## Flow 8 — Turn on cloud sync (opt-in)

- **Start:** Settings, with grades already stored locally.
- user — open "Cloud Sync (beta)"
- user — enter the server URL, then create or sign in to an account
- app — establish the session and store it locally [F14]
- user — tap "Sync now"
- app — push the local gradebook up and pull the latest down through the sync
  service, keeping the local cache as the offline source of truth [F14][F13]
- **Outcome:** The student's grades are backed up to their private account and can
  be restored on another device. With sync off, nothing leaves the device.
  (Beta: the service runs against an in-memory store, so treat as not-yet-durable.)

## Flow 9 — Switch to dark mode

- **Start:** Settings.
- user — choose the dark (or system) theme
- app — apply and persist the theme [F12][F13]
- **Outcome:** The app renders in the chosen theme on every launch.
