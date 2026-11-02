# CampusAI Knowledge Engine audit report

Date: 2026-10-30. Checkout: `E:\Project\Campus_AI-main`. Branch: `setup/chatbot-test-env` at `7346f64`, plus preserved uncommitted work.

This report describes **implemented code**. It does not claim the chatbot is production-ready.

## 1. Executive summary

CampusAI `/ask` still returns `{answer, intent}`. Structured academic facts still come from Firestore. Website prose still comes from the Attock Knowledge Pack plus Groq. This pass added a **canonical timetable catalog** (`backend/catalog.py`) so unique subjects, class groups, and meetings are counted separately with an explicit coverage limitation, and **durable signed-in preferences** (`backend/user_memory.py`) on a gitignored local JSON file. `normalizer.py` is retained. Chroma remains unused on `/ask`.

**Overall status:** improvement implemented and unit-tested. Live Teacher/Staff sessions, production deploy, and a new cold-start latency sweep were **not** run in this pass.

## 2. Baseline versus final

| Area | Baseline in this checkout | After this pass |
| --- | --- | --- |
| `/ask` contract | `{answer, intent}` | Unchanged |
| LLM | Groq `openai/gpt-oss-120b` | Unchanged |
| Timetable | Firestore `text_pdf_timetables` | Unchanged source; catalog derived in process |
| Documents | Knowledge Pack `search_pack` | Unchanged live path |
| Chroma | Unused on `/ask` | Still unused |
| Short-term memory | In-process `SessionMemory` | Plus last catalog list |
| Long-term memory | In-process dict | Gitignored JSON per email |
| Counts | No canonical unique-subject vs section vs meeting layer | Allowlisted `catalog.py` |
| Tests | Historical 136 + 6 | **146 passed** + **6 passed** |

## 3. Stage-by-stage work

0. Inspected branch, inventory, `normalizer.py` vs missing `normalization.py`. Did not discard uncommitted files.
1. Normalization: retain `backend/normalizer.py`; raw question preserved; regression tests added.
2. Source inventory from code (`university_data.py`, pack JSON, tests). No Firestore writes.
3. Canonical `Meeting` / `Catalog` from published timetable meetings only.
4. Allowlisted analytics with qualified coverage text.
5. Confirmed Knowledge Pack on live `/ask`; Chroma not enabled.
6. Catalog ops for paraphrases; “how many classes” clarification; “list them” follow-up.
7. Durable LTM file store; guests cannot save; secrets rejected.
8. Existing overlap helper unchanged; catalog answers wired before `route()`.
9. Existing university-only and identity guardrails kept.
10. New tests; Docker pytest **146 passed**; history **6 passed**.
11. `docs/CAMPUSAI_KNOWLEDGE_ENGINE/` and this report.

## 4. Files

Created: `backend/catalog.py`, `backend/user_memory.py`, `backend/tests/test_catalog.py`, `backend/tests/test_user_memory.py`, `backend/tests/test_normalizer_regression.py`, `docs/CAMPUSAI_KNOWLEDGE_ENGINE/**`, this report.

Modified: `backend/pipeline.py`, `backend/Dockerfile`, `.gitignore` (`/backend/data/`).

Also still modified from earlier engine work (not discarded): `backend/API.py`, `backend/knowledge_pack.py`, plus untracked engine report/`test_engine_policy.py`.

Not modified: Firestore, Knowledge Pack JSON contents, `CAMPUSAI_COMPLETE_SYSTEM_REPORT.md`, frontend `package.json` `"type"` field.

Deleted: none.

## 5. Normalization decision

**Retain `backend/normalizer.py`.** There is no `normalization.py`.

It converts class-token spans to keys such as `BS(CS)-I`. Callers: `pipeline._class_key_from_text`, `timetable_service.extract_class_from_sentence` / `detect_class`. The full raw question is not rewritten. Greetings still route as social. Limitation: `cs+2` as one token does not map; `CS 2` does. Evidence: `test_normalizer_regression.py`.

## 6. Sources and coverage

Live structured: `text_pdf_timetables` (`displayRows`), `settings/schedule_mode`, `events`, `emergency_announcements`, `notifications/.../posts`, `lostfound`, `teachers` directory fields.

Live unstructured: `backend/knowledge_pack/attock_campus_knowledge_pack.json` (tests: 34 usable documents).

Not a university-wide catalogue. Unique subject counts are **published timetable subjects only**.

## 7. Canonical entities

Meeting, section (`class_key`), subject, teacher name, room name. Provenance: `text_pdf_timetables`. Empty subjects and unparsed keys become warnings.

## 8. Query catalog

`unique_subjects`, `sections`, `meetings`, `teachers`, `teacher_subjects`, `department_subjects`, `clarify_class_count`, `repeat_last`. Dedup: set of subject strings; set of class keys; raw meeting rows; teacher names excluding `N/A`.

## 9. RAG status

Knowledge Pack keyword retrieval is live (`retrieve_campus_documents`). Chroma/`rag_store.py` is **not** on `/ask`. Evidence: `test_document_retrieval_reaches_the_model_prompt`; pipeline does not import `rag_store`.

## 10. Routing, memory, guardrails

Catalog runs after personal/student natural handlers and before `route()`. Session namespacing `user:{email}:{id}` / `guest:{id}`. LTM is not the profile. JWT identity unchanged. Unrelated refusals unchanged.

## 11. Tests

| Check | Command | Result |
| --- | --- | --- |
| Backend | `docker run --rm -v E:\Project\Campus_AI-main:/workspace campusai-backend-test` | **PASS** 146 passed, 2 FastAPI `on_event` warnings, 8.27s |
| Frontend history | `node --test Frontend/src/utils/chatHistoryCore.test.mjs` | **PASS** 6 tests |
| Lint/typecheck | No project ruff/mypy gate used | **NOT RUN** |
| Live student/teacher/staff browser this pass | — | **NOT RUN** |
| Production deploy / git push | Forbidden | **NOT RUN** |

## 12. Browser/mobile this pass

**NOT RUN.** Earlier Expo Go / student verification is historical, not re-executed here. Docker **backend image** must be rebuilt before a phone client sees `catalog.py` / `user_memory.py` (image COPY, no source bind for the running API).

## 13. Performance

Suite 8.27s in `campusai-backend-test`. No new live `/ask` latency sample. Social/catalog/LTM paths do not call Groq.

## 14. Security

No secrets printed or committed. LTM file gitignored. Guest isolation tested. Body role still untrusted. Remaining risk: empty `CAMPUS_AI_API_KEY` leaves `/ask` open on the LAN; local JSON is not encrypted at rest.

## 15. Data gaps

No complete course catalogue, credit-hour table, or room-booking availability source. Faculty directory pack snapshots are not live teaching loads. Archived pack events are not upcoming events.

## 16. Rollback

Keep uncommitted files. To drop only this pass’s new modules, remove `catalog.py`, `user_memory.py`, their tests, catalog hook in `pipeline.py`, Dockerfile COPY lines, and `/backend/data/` gitignore entry. Do not `git reset --hard`. Do not push.

## 17. Unverified claims

Live Teacher/Staff chat, production TLS/firewall, Chroma usefulness, durable LTM on a rebuilt Docker volume unless `/app/data` is mounted, and any university-wide course total.

## Acceptance criteria

1. “How are you, my friend?” social, no retrieval — **PASS** (`test_engine_policy`)
2. Who are you vs who am I — **PASS**
3. Courses/subjects as unique subjects with coverage sentence — **PASS** (`test_catalog`)
4. Class sections vs meetings distinct — **PASS**
5. Department/teacher lists from timetable — **PASS** (semester filter exists in code; not a live Firestore catalogue)
6. Incomplete catalogue qualified — **PASS**
7. Paraphrases courses/subjects — **PASS**
8. Follow-up “list them” — **PASS**
9. Guest vs signed-in LTM and existing role tests — **PASS** unit; live roles **NOT RUN**
10. Unrelated/mixed — **PASS**
11. Normalization retains meaning — **PASS** with `cs+2` limitation documented
12. `/ask` contract / history tests — **PASS**
13. New behaviour tested; this report matches the checkout — **PASS** with NOT RUN items listed

Documentation index: `docs/CAMPUSAI_KNOWLEDGE_ENGINE/README.md`
