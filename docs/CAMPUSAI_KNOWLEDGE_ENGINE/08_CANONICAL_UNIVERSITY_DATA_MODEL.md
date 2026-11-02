# Canonical university data model

Implemented in `catalog.py` from the in-memory timetable (already mapped from Firestore `displayRows` in `university_data.timetable_from_documents`).

Entities actually supported:

- Meeting: class_key, department, semester, day, slot, subject, teacher, room, source_id=`text_pdf_timetables`
- Section/class group: unique `class_key` (e.g. BS(CS)-II)
- Subject: unique non-empty subject strings
- Teacher/room: distinct names as published, excluding `N/A`

Not invented: campus-wide course IDs, credit hours, programme catalogues, student enrolments.

Duplicate subject names across sections stay one unique subject. Unparsed class keys and empty subjects become warnings, not silent merges.
