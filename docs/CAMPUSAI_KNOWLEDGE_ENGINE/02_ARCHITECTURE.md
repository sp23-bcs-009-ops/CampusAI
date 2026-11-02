# Architecture

```
Expo / browser
  -> POST /ask {question, session_id} + optional Bearer Firebase JWT
      -> identity.resolve_identity (RS256, trusted profile)
      -> pipeline.answer_question
           early: mixed split, LTM verbs, personal, student natural, catalog
           else: route -> handler (general / comsats_info / teacher / room / timetable / off_topic)
      -> {answer, intent}
```

Layers:

- Identity: `identity.py` + Firestore user profile
- Structured academic data: `university_data.py` -> `timetable_service.py` + `catalog.py`
- Documents: `knowledge_pack.py` (`retrieve_campus_documents` = `search_pack`)
- LLM: `llm.py` Groq `openai/gpt-oss-120b` for prose over retrieved records
- Memory: `SessionMemory` in process; `user_memory.py` JSON file per email
- Unused on `/ask`: `rag_store.py` / Chroma
