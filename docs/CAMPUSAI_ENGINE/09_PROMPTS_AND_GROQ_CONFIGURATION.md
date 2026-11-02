# Prompts and Groq

Active prompts in `pipeline.py`:

- `SYSTEM_PROMPT` — used if a chain is built with it (leftover general LLM path is not used for greetings).
- `COMSATS_PROMPT` — website answers from pack evidence.
- `RECORD_PROMPT` — optional wording over Firestore dumps when Groq is called for records.

Groq: env `GROQ_API_KEY` (value never recorded), `GROQ_MODEL` default `openai/gpt-oss-120b`, `LLM_PROVIDER` default groq, temperature 0.2, max_tokens 300, timeout 30, `get_fallback_chat_model` → None.

Do not switch providers silently.
