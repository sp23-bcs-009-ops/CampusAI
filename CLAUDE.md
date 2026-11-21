# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Campus AI — campus assistant for COMSATS University (Attock campus). Three apps share one Firebase project (`universityassistentai`):

- `backend/` — FastAPI + LangChain chatbot API (Python 3.11, port 8000)
- `Frontend/` — Expo SDK 58 / React Native app (web + Android/iOS via Expo Go, Metro on 8081)
- `dashboard/` — React + Vite admin dashboard (port 5173)

## Commands

Backend (run from `backend/`):

```bash
pip install -r requirements.txt
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
python -m pytest tests -q
python -m pytest tests/test_routing.py -q                 # one file
python -m pytest tests/test_routing.py::<test_name> -q    # one test
```

Docker (run from repo root):

```bash
docker compose up --build                        # backend only, :8000
docker compose --profile dashboard up --build    # + dashboard :5173
docker compose --profile frontend up --build     # + Expo web

# Tests in the Dockerfile's `test` stage (mounts the whole repo at /workspace)
docker build --target test -t campusai-test backend
docker run --rm -v "$PWD:/workspace" campusai-test
docker run --rm -v "$PWD:/workspace" campusai-test python -m pytest -q /workspace/backend/tests -k <expr>
```

Frontend (run from `Frontend/`; `.npmrc` sets `legacy-peer-deps=true`, keep it):

```bash
npm ci
npx expo start --lan     # press w for web; phone needs same Wi-Fi as the PC
```

Dashboard: `cd dashboard && npm install && npm run dev`. Timetable JSON → Firestore migration: `node scripts/migrate_to_firestore.mjs`.

One-click launchers `START_CAMPUS_AI.bat` / `.sh` start the backend in Docker and Expo on the host.

## Configuration gotchas

- `backend/.env` (copy from `backend/.env.example`) needs `GROQ_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (base64 of the Firebase service-account JSON). Chat answers read Firestore; there is **no local timetable fallback**.
- `docker-compose.yml` sets `LLM_PROVIDER: ${LLM_PROVIDER:-ollama}` in `environment:`, which overrides `backend/.env`. To use Groq in Docker, set `LLM_PROVIDER=groq` in a repo-root `.env` (or the shell).
- `backend/requirements.txt` pins the full dependency set (direct deps at the top, transitive below). Unpinned installs fail with pip `ResolutionImpossible`; when upgrading, re-resolve the whole set (e.g. `uv pip compile`) and rerun the tests.
- The default Groq model `openai/gpt-oss-120b` is a reasoning model: `max_tokens` in `settings/llm_provider.py` `get_chat_model()` covers hidden reasoning plus the reply. Too low a limit returns empty or cut-off answers on context-heavy prompts (campus knowledge-pack questions).
- `CAMPUS_AI_API_KEY` empty = open API (dev). When set, data endpoints require `X-API-Key`.

## Backend architecture

Backend modules live in folders and are imported from `backend/` as the root (no `backend.` prefix), usually with their old short name as an alias (e.g. `from timetable import timetable_lookup as tt`):

- `api_server.py` — FastAPI app
- `chatbot/` — `answer_pipeline.py` (entry + AI chains), `ai_prompts.py`, `question_router.py`, `question_checks.py`, `chat_memory.py`, `fixed_replies.py`, `timetable_answers.py`, `record_answers.py`, `exam_answers.py`, `student_answers.py`, `teacher_answers.py`, `greetings_and_help.py`, `answer_formatter.py` (everything leaves as plain text), `question_understanding.py` (AI says what is asked as JSON; code checks every name and builds a standard question), `fact_check.py` (rejects AI wording that adds details not in the facts), `off_topic_guard.py`, `campus_question_check.py`, `count_and_list_answers.py`
- `timetable/` — `timetable_lookup.py`, `class_name_normalizer.py`
- `data_sources/` — `firebase_reader.py`, `website_knowledge_reader.py`, `website_knowledge/` (the knowledge pack JSON)
- `user_login/firebase_login_check.py`
- `settings/` — `app_settings.py` (reads `backend/.env`), `llm_provider.py`
- `timetable_upload/` — PDF/Excel upload: `pdf_layout_reader.py`, `pdf_cell_rules.py`, `teacher_name_matcher.py`, `timetable_publisher.py`, `exam_datesheet_upload.py`

`api_server.py` is a thin HTTP layer (CORS, slowapi rate limits, API-key dependency, uploads). Everything conversational goes through `POST /ask` → `chatbot/answer_pipeline.answer_question()`, and the reply passes through `chatbot/answer_formatter.present()` so each chat screen can display it.

`answer_question` tries, in order, before falling back to intent routing: long-term user memory (`saved_user_preferences.py`), personal replies, student-specific natural-language answers (only when the caller is an identified student), ordinal follow-ups ("the second one"), and the catalog (`count_and_list_answers.py`). Then `route()` picks an intent and `HANDLERS[intent]` answers it:

- timetable / teacher / room(s) → deterministic logic in `timetable/timetable_lookup.py` over Firestore data from `data_sources/firebase_reader.py`. **No LLM involved.**
- `comsats_info` → retrieves documents from the approved knowledge pack (`data_sources/website_knowledge_reader.py`, data in `data_sources/website_knowledge/`) and asks the LLM to answer only from those records.
- greetings / small talk → LLM chain with the session's message history.

`SessionMemory` (per `session_id`) holds both a message window for LLM chains and entity memory (last teacher/class/room/subjects) so follow-ups like "what about Tuesday?" resolve. `api_server.py` namespaces session ids as `guest:` or `user:<email>:` so guests can't continue a verified user's memory.

Identity: the app sends a Firebase ID token as `Authorization: Bearer`. `user_login/firebase_login_check.resolve_identity()` only accepts tokens with a **verified email** for this Firebase project, then loads the user's own profile. Anonymous sign-ins (including the app's dev "test account" buttons) are treated as guests, so personal questions like "my schedule today" intentionally get the guest reply.

Answers are either plain strings or structured dicts with a `type` field (e.g. `schedule`, `teacher_availability`, `subject_teachers`). The app renders these per type in `Frontend/src/screens/ChatScreen.js` and `GuestModeScreen.js`, so adding or renaming an answer type needs a matching change there.

Timetable ingestion: `/upload-timetable` parses text-based PDFs with PyMuPDF layout + Python cell rules (`timetable_upload/pdf_layout_reader.py`, `pdf_cell_rules.py`, `teacher_name_matcher.py`). Scanned or image-only PDFs aren't supported. `/upload-exam-timetable` validates every worksheet of an `.xlsx` datesheet before publishing Exam Mode data (`timetable_upload/exam_datesheet_upload.py`).

LLM provider is swapped only in `settings/llm_provider.py` / `settings/app_settings.py` (`LLM_PROVIDER=groq|openai`); `chatbot/answer_pipeline.py` never sees provider details.

## Tests

`backend/tests/conftest.py` injects a tiny in-memory timetable so tests never hit Firestore or the network. Some backend tests (`test_exam_mode_reflection.py`, `test_text_pdf_persistence.py`) assert on the literal source text of `Frontend/` files, so frontend refactors can break backend tests.

## Frontend notes

- The app derives the backend host from the Expo dev-server host (`Frontend/src/constants/network.js`); override with `EXPO_PUBLIC_AI_SERVER_URL` or `EXPO_PUBLIC_API_HOST`.
- Developer Mode (clock simulator on Home) is available to the role-switching test account and to allowlisted developer emails. That allowlist is client-side UI only, not server authorization.
- `firebase/firestore.rules` holds the locked-down rules that must be deployed in the Firebase console.
