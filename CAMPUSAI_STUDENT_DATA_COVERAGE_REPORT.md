# CampusAI Student data coverage report

Date: 2026-10-30. Sources were inspected from backend code and Knowledge Pack metadata. No production Firestore documents were written. No student passwords or private profile fields are recorded here.

## Question domains

| Domain | Authoritative source | Chatbot behaviour | Completeness |
| --- | --- | --- | --- |
| Own class timetable, next class, rooms on that grid | Firestore `text_pdf_timetables` via verified student dept+semester | Deterministic | Published classes only |
| Unique subjects in my class | Same timetable, unique subject strings | Count + list | Not university-wide |
| Class groups / meetings in the loaded timetable | Same | Distinct metrics | Published snapshot |
| University-wide “all courses” | **Missing** | Qualified timetable count + limitation | Blocked as a true total |
| Teacher of a named subject | Timetable teacher field | Assignment, not HR load | Partial |
| Faculty directory snapshot | Knowledge Pack faculty_directory | Website snapshot, flagged | Stale vs live teaching |
| Events | Firestore `events` | Date-aware; archives not upcoming | Collection as published |
| Announcements | `emergency_announcements` | Student natural + public | Published titles |
| Notifications | class-scoped posts | Student only for own class | Requires profile class key |
| Lost and found | `lostfound` | Public records | Published items |
| Campus/policies/admissions/facilities | Knowledge Pack 34 usable docs | Groq over retrieved records | Seed 2026-10-24; homepage 403 |
| Credit hours, prereqs, degree plan, fees | **Missing** | Do not invent | Blocked |
| Room reservation | **Missing** (only timetable occupancy) | Occupied slots only | Blocked as availability |
| Exam office seating | exam manifest if published | Exam mode timetable | Not a full exam catalogue |

## Pack snapshot (metadata only)

- Path: `backend/knowledge_pack/attock_campus_knowledge_pack.json`
- dataset_id: `comsats_attock_official_seed_2026_10_24`
- compiled_date: 2026-10-24
- stored documents: 35; usable in tests: 34 (limitation note skipped)
- Scope mix: mostly Attock Campus; some CUI-wide with Attock-confirmation caveats

## Rule

Never present a subset timetable as “all university courses.” Never present pack archives as upcoming events. Never present faculty snapshots as live Firestore teaching loads.
