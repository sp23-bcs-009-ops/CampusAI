# Firestore and structured data

Project id from env `FIREBASE_PROJECT_ID` (default `universityassistentai`).

Timetable: collection `text_pdf_timetables`, manifests `current` / `exam_current`, class docs `{dept}_sem{n}`. Verified in `university_data.load_firebase_timetable`. Cache 300s.

Other kinds via `firebase_records`: events, announcements, notifications (dept/semester paths), lost-and-found, teachers directory.

Role filter: student notifications scoped by class key. Guests get public dumps for events/announcements as implemented.

No production records are copied here.
