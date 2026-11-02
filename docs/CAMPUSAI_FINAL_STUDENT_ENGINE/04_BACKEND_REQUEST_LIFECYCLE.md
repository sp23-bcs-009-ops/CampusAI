# `/ask` lifecycle

Validate question (required, max 2000). Optional Bearer -> `resolve_identity`. Session `user:{email}:{id}` or `guest:{id}`. `answer_question` as above. Return `{answer, intent}`. Firestore errors become unavailable messages, not local JSON.
