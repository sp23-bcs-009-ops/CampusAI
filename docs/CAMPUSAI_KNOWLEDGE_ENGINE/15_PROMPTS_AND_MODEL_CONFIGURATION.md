# Prompts and model

Provider: Groq `https://api.groq.com/openai/v1`, model `openai/gpt-oss-120b` (env `GROQ_MODEL`). Temperature 0.2, max tokens 300, timeout 30s. `get_fallback_chat_model` returns None.

SYSTEM_PROMPT / COMSATS_PROMPT / RECORD_PROMPT require English answers from supplied evidence only. Social and catalog answers do not call Groq.
