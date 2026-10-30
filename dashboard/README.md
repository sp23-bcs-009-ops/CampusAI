# Campus AI — Admin Dashboard

React (Vite) web dashboard that displays the **timetable**, **teachers**, and
**events** straight from Firebase.

## Data flow

```
backend/timetable_data.json
        │  node scripts/migrate_to_firestore.mjs
        ▼
Firestore ── timetable_classes/{class}   one doc per class
          ── teachers/{teacher}          derived weekly schedule per teacher
          ── meta/timetable              counts + updatedAt
          ── events/*                    (already posted by the mobile app)
        │
        ▼
dashboard (this app) — reads via Firestore REST, no SDK needed
```

If Firestore is unreachable (offline, or migration not run yet) the dashboard
automatically falls back to a **bundled local snapshot** of the same data, and
shows a "Local snapshot" badge instead of "Live · Firebase".

## Run

```bash
# 1. one-time: migrate the timetable JSON into Firestore
node scripts/migrate_to_firestore.mjs         # from the repo root

# 2. start the dashboard
cd dashboard
npm install
npm run dev            # → http://localhost:5173
```

Production build: `npm run build` → static files in `dist/` (or use the
Dockerfile / `docker compose --profile dashboard up`).

## Features

- 📅 **Timetable** — pick any of the 56 classes, full week grid (labs highlighted)
- 👨‍🏫 **Teachers** — searchable cards for all 109 teachers; click to expand the
  full weekly schedule (derived automatically during migration)
- 🎉 **Events** — live feed of events posted from the mobile app, filterable by category
- Live/offline source badge + stats row (classes / teachers / rooms / events)

## Config

Environment variables (optional, defaults to the project's Firebase):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
```
