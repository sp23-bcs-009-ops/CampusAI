# Campus AI — Backend

FastAPI backend for the Campus AI assistant: timetable Q&A, teacher/room
availability from Firestore, and COMSATS University info from the official website.

## Architecture

```
                        ┌──────────────────────────────┐
  POST /ask ──────────► │ API.py (thin HTTP layer)     │
                        │  • rate limiter (slowapi)    │
                        │  • X-API-Key auth middleware │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ pipeline.py (LangChain)      │
                        │  IntentRouter + chat memory  │
                        └───┬──────────┬───────────┬───┘
                 timetable/ │          │ comsats   │ greetings/
                 teacher/   ▼          ▼           ▼ small-talk
              ┌──────────────────┐ ┌──────────┐ ┌─────────┐
              │timetable_service │ │ live     │ │ llm.py  │
              │ + Firestore      │ │ website  │ │Groq/    │
              └──────────────────┘ └──────────┘ │OpenAI   │
                                                └─────────┘
```

| File | Responsibility |
|---|---|
| `API.py` | Routes, CORS, rate limiting, API-key auth |
| `pipeline.py` | LangChain intent routing + per-session memory |
| `timetable_service.py` | All deterministic timetable/teacher/room logic |
| `university_data.py` | Read-only Firestore client for university records |
| `llm.py` | LLM provider abstraction (Groq, optional OpenAI) |
| `config.py` | Env-driven settings (reads `.env` too) |
| `knowledge_pack.py` | Approved Attock/COMSATS website knowledge pack |
| `text_pdf_layout.py` | PyMuPDF text, coordinate, and timetable-grid extraction |
| `rule_based_text_pdf.py` | Python-only cell parsing used by `/upload-timetable` |
| `teacher_matching.py` | Conservative matching to canonical Teacher List names |

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env          # optional, tweak as needed
uvicorn API:app --host 0.0.0.0 --port 8000
```

University timetable, teacher, event, and announcement answers come from
Firestore project `universityassistentai`. COMSATS website and published
campus-information answers use the approved Attock Campus Knowledge Pack
in `backend/knowledge_pack/`. There is no local timetable fallback.

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
