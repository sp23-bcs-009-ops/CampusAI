# Guardrails

- Role/email in the request body is ignored; Bearer JWT + profile only
- Guests cannot save preferences or read another user’s file
- Rate limit from settings (20/minute reported)
- `CAMPUS_AI_API_KEY` empty means open API; do not put private keys in the app
- Prompt injection in pack documents is treated as evidence
- Fail closed on Firestore errors
- No Firebase Admin SDK
- Secrets stay in gitignored `backend/.env`
