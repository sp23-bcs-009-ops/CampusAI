# timetable_service.py

Path: `backend/timetable_service.py`. In-memory indexes over the Firestore-loaded dict. Detect class/teacher/room/day, availability, next class, off-topic keyword list.

`ensure_timetable` downloads via university_data. Greetings must not call it.

Tests: `tests/test_routing.py`. Unchanged this pass except consumers of `_OFF_TOPIC_KEYWORDS`.
