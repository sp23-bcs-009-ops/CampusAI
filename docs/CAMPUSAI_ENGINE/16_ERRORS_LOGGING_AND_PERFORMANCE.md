# Errors, logging, performance

User-facing: polite refusal; Firestore unavailable string; pack missing `KnowledgePackUnavailable` message; 429 wait a minute.

Logs: startup LLM/pack/auth; prefetch; upload errors by exception type. Do not log tokens.

Performance (previously measured, not re-invented): greetings <10ms; unrelated <10ms; cold identity ~3s; warm timetable sub-second after prefetch.

No request correlation ID in the HTTP contract (`Not implemented`).
