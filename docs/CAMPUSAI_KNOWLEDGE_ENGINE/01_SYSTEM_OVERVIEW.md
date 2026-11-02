# System overview

CampusAI is a university-only assistant for COMSATS Attock. Users are Guest, Student, Teacher, or Staff. The Expo app talks to FastAPI `POST /ask`, which returns `{answer, intent}`.

Capabilities that exist in code:

- Social greetings and bot identity without Groq or Firestore
- Verified-profile answers for “who am I” and personal timetable
- Deterministic timetable, teacher, and room answers from Firestore `text_pdf_timetables`
- Allowlisted catalog counts from that same published timetable (unique subjects, class groups, meetings, teacher/department lists)
- Events, announcements, notifications, lost-and-found from Firestore
- Attock website questions from the Knowledge Pack plus Groq
- Polite refusal for unrelated questions; mixed messages keep the university part
- In-process session memory plus optional signed-in preferences on a gitignored local JSON file

The published timetable is not a university-wide course catalogue. Counts always say so.
