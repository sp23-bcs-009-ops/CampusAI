# Backend request lifecycle

Entry: `API.ask` (`POST /ask`).

1. SlowAPI rate limit (`RATE_LIMIT`, default 20/minute).
2. Optional `X-API-Key` if `CAMPUS_AI_API_KEY` is set.
3. Strip question; reject empty or >2000 characters.
4. Read `Authorization: Bearer`; `identity.resolve_identity` or Guest `None`.
5. Session key `user:{email}:{session_id}` or `guest:{session_id}`.
6. `pipeline.answer_question`.
7. Return `{answer, intent}` only. Frontend contract unchanged.

Timeouts: Groq 30s; Firestore HTTPS via shared connection. Invalid tokens fail closed (`identity` returns `None` → Guest). Provider errors in pack path fall back to listing pack text, not invented facts.

Exceptions: `UniversityDataUnavailable` surfaces a clear Firestore failure; COMSATS website questions still try the pack.
