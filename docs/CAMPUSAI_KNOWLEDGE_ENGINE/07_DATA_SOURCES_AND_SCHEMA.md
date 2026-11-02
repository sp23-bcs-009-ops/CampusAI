# Data sources and schema

Inspected from code (no production writes). Project id env `FIREBASE_PROJECT_ID` default `universityassistentai`.

| Source | Location | Live `/ask` | Notes |
| --- | --- | --- | --- |
| Regular/exam timetable | `text_pdf_timetables/current` or `exam_current` + class docs `{dept}_sem{n}` | Yes | `displayRows` JSON -> meetings |
| Schedule mode | `settings/schedule_mode` | Yes | regular / holiday / exam |
| Events | `events` | Yes | title, date, venue, … |
| Announcements | `emergency_announcements` | Yes | |
| Notifications | `notifications/{dept}/semesters/{n}/posts` | Student | class-scoped |
| Lost and found | `lostfound` | Yes | |
| Teachers collection | `teachers` | Structured list | Directory fields; live teaching load uses timetable names |
| Knowledge Pack | `backend/knowledge_pack/attock_campus_knowledge_pack.json` | Yes | 34 usable docs in tests |
| Local `timetable_flat.json` | backend file | **Not** `/ask` fallback | Test/upload only |
| Chroma | `rag_store.py` | Unused | |

## Coverage matrix

| Question | Source | Caveat |
| --- | --- | --- |
| Unique courses/subjects | Timetable subjects | Not a university catalogue |
| Class sections | Distinct class keys | Published classes only |
| Timetable meetings | Meeting rows | |
| Teachers listed | Distinct teacher names on meetings | Not HR roster completeness |
| Courses a teacher teaches | Meetings for that name | Name match via timetable_service |
| Department/semester subjects | Class-key department + roman semester | |
| Room at a time | timetable_service rooms | Occupied slots, not a booking system |
| Policies/facilities | Knowledge Pack | Website snapshot, not Firestore |
