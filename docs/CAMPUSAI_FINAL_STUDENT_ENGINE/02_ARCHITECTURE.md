# Architecture

```
Client -> POST /ask + optional Bearer
  API.ask (rate limit, session namespace)
    identity.resolve_identity
    pipeline.answer_question
      mixed split -> LTM verbs -> personal -> student natural
      -> ordinal follow-up -> catalog allowlist -> route/handlers
        timetable_service / university_data / knowledge_pack+Groq
```

Boundaries: no request-body role; no local timetable JSON fallback; Chroma not on `/ask`; catalog is derived from the loaded timetable only.
