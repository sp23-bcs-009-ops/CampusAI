# End-to-end workflow

```mermaid
sequenceDiagram
  participant U as User
  participant F as Frontend
  participant A as API.ask
  participant P as pipeline.answer_question
  participant D as Firestore or pack
  U->>F: message
  F->>A: {question, session_id} plus optional Bearer
  A->>P: namespaced session + identity
  alt social or identity
    P-->>A: fixed sentence
  else unrelated
    P-->>A: REFUSAL
  else university structured
    P->>D: timetable or records
    D-->>P: facts
    P-->>A: sentence or schedule object
  else website
    P->>D: retrieve_campus_documents
    P->>P: Groq with pack evidence
    P-->>A: prose
  end
  A-->>F: {answer, intent}
```

| Kind | Path |
| --- | --- |
| Social | `_is_social` → `handle_general` |
| Identity (bot) | `_is_bot_identity` → `INTRO` |
| Identity (user) | `personal_reply` / `_asks_role` |
| Unrelated | `_clearly_unrelated` → `off_topic` |
| Mixed | `_university_portion` then note |
| Follow-up Tuesday | entity memory `last_class` |
| Website | `comsats_info` → pack → Groq |
