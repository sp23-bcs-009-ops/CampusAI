# API contracts

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | /health | — | status, llm, rag, knowledge_pack, auth_enabled, rate_limit |
| POST | /ask | `{question, session_id?}` | `{answer, intent}` |
| POST | /student-timetable | `{class_name}` | schedule |
| GET | /today-classes/{class} | — | classes |
| GET | /class-schedule/{class}/{day} | — | day schedule |
| POST | /upload-timetable | multipart PDF | staff upload |
| GET | /comsats/refresh | — | scrape (not used by `/ask`) |

Frontend: `ChatScreen.js` sends Bearer when signed in. `GuestModeScreen.js` does not.

Errors: 400 empty/too long, 401/ignored token → guest, 429 JSON, 503 Firestore unavailable messages.
