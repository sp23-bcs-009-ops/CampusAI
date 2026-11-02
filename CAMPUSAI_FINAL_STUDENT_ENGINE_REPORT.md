# CampusAI Final Student Engine Report

Date: 2026-10-30. Branch: `setup/chatbot-test-env` at `7346f64` plus preserved uncommitted work. This describes implemented code. It is **not** a production-ready or complete-university-catalogue claim.

## 1. Executive summary and overall completion status

The Student chatbot on FastAPI `POST /ask` remains `{answer, intent}`. This pass finished Student-focused analytics and conversation gaps that the published timetable can honestly support: unique subject counts for the student’s class, Monday/Tuesday comparison, department subject counts, named-subject teacher lookup from timetable assignments, “second class” follow-ups, atomic local preference storage, and passage-focused website retrieval.

**Overall status:** safe for **local unit-tested Student chatbot work**. Live catalog behaviour requires a **backend Docker rebuild** (the process answering `/health` now is an older image). Missing official datasets still block university-wide totals, credit hours, room booking, and complete teaching loads.

## 2. What the Student chatbot can now do

- Social: “How are you, my friend?” → short thanks, no Groq (unit + live `/ask`).
- “Who are you?” vs “Who am I?” (verified profile).
- Unique subjects / class groups / meetings, with coverage text; “how many classes?” asks which metric.
- “How many courses does the university offer?” → timetable unique subjects plus “not a complete university list”.
- “How many unique subjects are in my published semester timetable?” → that class group only.
- “Compare my Monday and Tuesday schedules.”
- “Who teaches Test Subject?” → timetable names, not a full load.
- “What time is the second class?” after a one-day schedule.
- Overlaps explained; cannot change the timetable.
- Unrelated refusals; mixed questions keep the campus part.
- Signed-in preferences save/list/replace/forget on a gitignored file.

## 3. Before vs after

Catalog already counted unique subjects/sections/meetings. This pass added department breakdowns, named-subject teachers (without stealing “that subject” follow-ups), student class unique-subject counts, day compare, ordinal meetings, atomic LTM, pack passages, and Student-engine docs.

## 4. University data sources inspected

Firestore via existing read-only client: `text_pdf_timetables` (`displayRows`), `settings/schedule_mode`, `events`, `emergency_announcements`, `notifications/.../posts`, `lostfound`, `teachers`. Knowledge Pack dataset `comsats_attock_official_seed_2026_10_24`, 34 usable documents. Homepage 403 recorded in pack notes. Chroma unused (`/health`).

## 5. Exact missing data

University-wide catalogue, credit hours, prerequisites, fees live tables, room booking, complete teaching assignments, unblocked Attock homepage. See `docs/CAMPUSAI_FINAL_STUDENT_ENGINE/19_MISSING_DATA_REGISTER.md`.

## 6. Conversation, routing, university-only

`_is_social`, `_is_bot_identity`, `_clearly_unrelated` (whole-word + pack anchors so `cat` ≠ notifications), `_university_portion`. Catalog allowlist is deterministic. Greetings skip timetable/Groq.

## 7. Catalog metrics

Unique subjects = set of subject strings. Sections = class keys. Meetings = rows. Department counts = unique subjects per parsed department. Teacher-subject lists = timetable rows for that name. Coverage sentence always appended.

## 8. RAG

Live path Knowledge Pack `search_pack`. Chroma **not** connected. Passages clipped to matching sentences when documents are long. User-facing Groq context labeled “Approved campus website records”.

## 9. Memory

Short-term: namespaced `SessionMemory`, summary, `last_day_meetings`. Long-term: `user_memory.py` atomic JSON, `CAMPUSAI_MEMORY_PATH`. Durable only if that file is on a persistent volume. Guests cannot save. Profile outranks notes.

## 10. Normalization

File **`backend/normalizer.py` retained, not modified in this pass.** Callers: `pipeline._class_key_from_text`, `timetable_service`. Examples: `BCS-1` → `BS(CS)-I`; `CS 2` → `BS(CS)-II`; `cs+2` → None. Raw question preserved.

## 11. Auth, privacy, security

JWT + trusted profile. Body role ignored. Session prefix user vs guest. Notifications class-scoped. No Firestore writes. Secrets not printed. Running `/health` shows `auth_enabled: false` when API key is empty (LAN risk, pre-existing).

## 12. Problem-solving examples

Clash: published overlapping slots, no edit claim. Course count: defines unique subjects and coverage. Teacher: timetable assignment only. Missing policy: pack miss says website records do not include it (not a France-style refusal).

## 13. Phases

| Phase | Status |
| --- | --- |
| 0 Audit | Completed (git `7346f64`, uncommitted preserved) |
| 1 Data inventory | Completed from code + pack metadata |
| 2 Canonical model | Improved `catalog.py` |
| 3 Routing | Improved; phrase tests in pytest |
| 4 Identity | Existing + regression; live student token this pass NOT RUN |
| 5 Retrieval | Pack improved; Chroma not enabled |
| 6 Analytics | Expanded allowlist |
| 7 Short-term memory | Ordinal + compare |
| 8 LTM | Atomic + replace; Docker durability documented |
| 9 Answers | Coverage language, no pack name in refusals |
| 10 Guardrails | Existing tests still pass |
| 11 Performance | Suite timing; no cold Firestore sweep |
| 12 Tests | 151 + 6 |
| 13 Docs | This package |
| 14 Final | Partial: health+social live; image rebuild NOT RUN |

## 14. Files

Created: `docs/CAMPUSAI_FINAL_STUDENT_ENGINE/**`, this report, `CAMPUSAI_STUDENT_DATA_COVERAGE_REPORT.md`, catalog/user_memory tests from prior pass plus extensions.

Modified this pass: `backend/catalog.py`, `backend/pipeline.py`, `backend/user_memory.py`, `backend/knowledge_pack.py`, `backend/tests/test_catalog.py`, `test_engine_policy.py`, `test_user_memory.py`.

Deleted: none.

Not touched: Firestore, pack JSON documents, `CAMPUSAI_COMPLETE_SYSTEM_REPORT.md`, Frontend `"type":"module"`.

## 15. Test table

| Check | Command / method | Result |
| --- | --- | --- |
| Backend | `docker run --rm -v E:\Project\Campus_AI-main:/workspace campusai-backend-test` | **PASS** 151 passed, 2 warnings, 7.18s |
| Frontend history | `node --test Frontend/src/utils/chatHistoryCore.test.mjs` | **PASS** 6 |
| Lint/typecheck | No project gate used | **NOT RUN** |
| Live `/health` | GET `http://127.0.0.1:8000/health` | **PASS** Groq model name as configured; chroma unused |
| Live `/ask` social | POST How are you, my friend? | **PASS** `{intent: general}` |
| Live catalog / student Firestore `/ask` on rebuilt image | — | **NOT RUN** |
| Live Groq document question | — | **NOT RUN** (avoided extra provider spend) |
| Expo Go / Teacher / Staff live | — | **NOT RUN** |
| Docker backend rebuild | — | **NOT RUN** |
| Git push / deploy / Firestore write | Forbidden | **NOT RUN** |

## 16. Real API vs unit tests

Unit tests use `TEST_TIMETABLE` fixtures. Live `/health` and one social `/ask` hit the **already running** container, which may not include this pass’s Python until rebuild.

## 17. Performance

Social live `/ask` ~0.5s. Pytest 7.18s. Cold Firestore timetable **NOT RUN** this pass.

## 18. Docker / persistence

`Dockerfile` COPY includes `catalog.py` `user_memory.py`. Rebuild backend image after source changes. LTM file is `/app/data` in the image unless `CAMPUSAI_MEMORY_PATH` is mounted. Chroma volume `/data` is unrelated to LTM.

## 19. Risks and needed user action

- Rebuild and restart `campusai-backend` to serve new catalog/student compare code to Expo Go.
- Mount a persistent path for LTM if preferences must survive container replace.
- Official catalogue export if true university-wide course totals are required.
- Do not treat empty `CAMPUS_AI_API_KEY` as production security.

## 20. Rollback

Keep uncommitted files. Revert only the files listed in section 14. Do not `git reset --hard`. Do not push.

## 21. Final verdict

**Verified:** unit/regression suite 151+6; social live `/ask`; `/health` Groq+pack; catalog and student language in tests.

**Not verified:** rebuilt-container catalog, live student token this pass, mobile, production.

**Safe for local testing** of the Student chatbot after a backend image rebuild. **Not** authorized or verified for production deployment.
