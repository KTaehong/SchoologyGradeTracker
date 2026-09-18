# Schoology Grade Tracker — Documentation

Project documentation and metadata for **Schoology Grade Tracker** (internal
codename `BessyV2`), a privacy-first Flutter grades app backed by an opt-in cloud
sync service.

## Contents

### Product docs
Start here to understand what is being built and for whom.

| File | What it is |
|---|---|
| [`mvp.md`](mvp.md) | The MVP definition — feature list with IDs, and what is explicitly excluded. |
| [`features.md`](features.md) | Per-feature specifications (goal, behavior, edge cases). |
| [`user-flows.md`](user-flows.md) | Screen-by-screen student journeys, cross-referencing feature IDs. |

### [`system_architecture/`](system_architecture/)
System design deliverables — the major system components and how they fit together.

| File | What it is |
|---|---|
| [`SYSTEM_COMPONENTS.md`](system_architecture/SYSTEM_COMPONENTS.md) | Written breakdown of the major system components (client tier, API/logic tier, data tier). |
| [`architecture-diagram.html`](system_architecture/architecture-diagram.html) | Interactive visual architecture diagram. |
| `BessyV2 - System Components & Architecture.docx` | Formatted document version of the architecture writeup. |

### [`pitch/`](pitch/)
Prior assignment submissions — the product pitch and competitive analysis.

| File | What it is |
|---|---|
| `Bessy_App_Idea_Competitive_Analysis.pdf` | Competitive analysis of the app idea (PDF). |
| `Bessy_App_Idea_Competitive_Analysis.pptx` | Competitive analysis slide deck. |
| `Schoology_Free_Mobile_Client.pptx` | Original pitch deck — free Schoology mobile client concept. |

## Project overview

BessyV2 is a three-tier application:

1. **Client tier** — a cross-platform Flutter app (Android/iOS), a caregiver/parent
   mode, and an internal admin console.
2. **Application / API tier** — a hosted Dart service (`server/`) that is the single
   access path to the backend: auth/identity, gradebook sync with change detection,
   notification fan-out, and audited admin tooling.
3. **Data tier** — PostgreSQL as the system of record, plus object storage and a cache.

Grade data is captured **keyless** on the device (screenshots + OCR, saved HTML
report, iCal feed — nothing scraped or automated), then synced to the API. Privacy is
the core differentiator: raw credentials never touch the servers.

See [`../PLAN.md`](../PLAN.md) for the full product plan and [`../README.md`](../README.md)
for build/getting-started instructions.
