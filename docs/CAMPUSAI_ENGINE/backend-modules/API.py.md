# API.py

Path: `backend/API.py`. FastAPI entry. Callers: uvicorn, TestClient.

Important: `ask`, `health`, `chat_session_id`, `_warm_university_cache`, `upload_timetable`.

`/ask` validates input, resolves identity, namespaces session, returns `{answer, intent}`.

Depends on pipeline, identity, llm_info, university_data warmup, SlowAPI.

Tests: `tests/test_ask_api.py`.

Changed: health `rag` object now labels Chroma unused and document retrieval as knowledge_pack.
