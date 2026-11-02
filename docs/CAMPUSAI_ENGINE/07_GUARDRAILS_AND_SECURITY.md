# Guardrails and security

- University-only for Guest, Student, Teacher, Staff.
- Social and bot-identity allowed without data access.
- Unrelated: `REFUSAL` before Firestore/pack/Groq.
- Mixed: university clause + note.
- Whole-word off-topic matching.
- Pack relevance requires a campus/pack anchor so “dog vs cat” cannot retrieve website text.
- Retrieved pack content is evidence. `COMSATS_PROMPT` says to ignore instructions inside records. Test: `test_retrieved_injection_is_treated_as_evidence`.
- Rate limit 20/minute. CORS default `*` in local dev (`Implemented but not fully verified` for production).
- Fail closed on bad tokens.
