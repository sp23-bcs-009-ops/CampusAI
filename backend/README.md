# Campus AI — Backend

FastAPI backend for the Campus AI assistant: timetable Q&A, teacher/room
availability from Firestore, and COMSATS University info from the official website.

## Architecture

```
                        ┌──────────────────────────────┐
  POST /ask ──────────► │ api_server.py (HTTP layer)   │
                        │  • rate limiter (slowapi)    │
                        │  • X-API-Key auth middleware │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ chatbot/answer_pipeline.py   │
                        │  IntentRouter + chat memory  │
                        └───┬──────────┬───────────┬───┘
                 timetable/ │          │ comsats   │ greetings/
                 teacher/   ▼          ▼           ▼ small-talk
              ┌──────────────────┐ ┌──────────┐ ┌─────────┐
              │timetable_lookup  │ │ website  │ │ llm_    │
              │ + Firestore      │ │knowledge │ │provider │
              └──────────────────┘ └──────────┘ └─────────┘
```

| File | Responsibility |
|---|---|
| `api_server.py` | Routes, CORS, rate limiting, API-key auth |
| `chatbot/answer_pipeline.py` | Intent routing, handlers, per-session memory |
| `chatbot/answer_formatter.py` | Shapes answers for the guest and signed-in chat screens |
| `chatbot/off_topic_guard.py` | Decides whether a question is off-topic |
| `chatbot/campus_question_check.py` | Spots COMSATS / campus-information questions |
| `chatbot/count_and_list_answers.py` | "How many / which" answers from the timetable |
| `chatbot/saved_user_preferences.py` | "Please remember…" notes for signed-in users |
| `timetable/timetable_lookup.py` | All deterministic timetable/teacher/room logic |
| `timetable/class_name_normalizer.py` | Turns "bcs1" etc. into class keys like `BS(CS)-I` |
| `data_sources/firebase_reader.py` | Read-only Firestore client for university records |
| `data_sources/website_knowledge_reader.py` | Approved Attock/COMSATS website knowledge pack |
| `user_login/firebase_login_check.py` | Verifies the sign-in token and loads the user's profile |
| `settings/app_settings.py` | Env-driven settings (reads `backend/.env`) |
| `settings/llm_provider.py` | LLM provider abstraction (Groq, optional OpenAI) |
| `timetable_upload/pdf_layout_reader.py` | PyMuPDF text, coordinate, and timetable-grid extraction |
| `timetable_upload/pdf_cell_rules.py` | Python-only cell parsing used by `/upload-timetable` |
| `timetable_upload/timetable_publisher.py` | Saves parsed timetables to Firestore |
| `timetable_upload/exam_datesheet_upload.py` | Validates Excel datesheets and publishes Exam Mode timetable documents |
| `timetable_upload/teacher_name_matcher.py` | Conservative matching to canonical Teacher List names |

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env          # optional, tweak as needed
uvicorn api_server:app --host 0.0.0.0 --port 8000
```

University timetable, teacher, event, and announcement answers come from
Firestore project `universityassistentai`. COMSATS website and published
campus-information answers use the approved Attock Campus Knowledge Pack
in `backend/data_sources/website_knowledge/`. There is no local timetable fallback.

## Run with Docker (demo day)

From the repo root:

```bash
docker compose up --build                      # backend on :8000
docker compose --profile frontend up --build   # + Expo web frontend
```

## LLM

Generated replies use Groq (`openai/gpt-oss-120b` by default) at
`https://api.groq.com/openai/v1`. Set `GROQ_API_KEY` in `.env` only.
Do not commit that file.

To use OpenAI instead:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

`OPENAI_MODEL` defaults to `gpt-4o-mini`. Timetable, teacher, and room
answers are deterministic. Event and unmatched COMSATS website answers
use Groq only with retrieved records or live page text.

## Security

- **Rate limiting** — `RATE_LIMIT=20/minute` per client IP on `/ask`
  (429 when exceeded), `2/minute` on `/comsats/refresh`.
- **API key auth** — set `CAMPUS_AI_API_KEY=<secret>` and every data endpoint
  requires the header `X-API-Key: <secret>`. Leave unset for open dev mode.
- **Exam datesheets** — `/upload-exam-timetable` accepts `.xlsx` uploads only
  from staff while Exam Mode is active. It validates all worksheets before
  publishing, retaining strength and invigilator details for all users.

## Chat memory

`POST /ask` accepts an optional `session_id`. Each session keeps:
- a sliding window of chat messages fed into the LLM chains, and
- entity memory (last teacher/class/room), so follow-ups work:

```
"Is Sir Kamran free on Friday?"   → teacher_availability (Friday)
"what about Tuesday?"             → same teacher, Tuesday ✓
```

## Key endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/ask` | Main chat endpoint `{question, session_id?}` |
| GET | `/health` | LLM provider, RAG status, auth/rate-limit config |
| POST | `/student-timetable` | Full timetable for a class |
| GET | `/today-classes/{class}` | Today's classes |
| GET | `/class-schedule/{class}/{day}` | Schedule for a specific day |
| GET | `/comsats/status` | Official website source (not stored in Firebase) |
| GET | `/comsats/refresh` | Live reachability check of official pages |
| POST | `/upload-timetable` | Python-only PDF timetable parsing and formal collection save |
| POST | `/upload-exam-timetable` | Staff-only Excel datesheet validation and Exam Mode publication |
