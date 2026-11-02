# System overview

CampusAI is the COMSATS Attock student-facing campus assistant. Shared backend also serves Guest, Teacher, and Staff without new role features in this pass.

Stack: Expo React Native, FastAPI `POST /ask` `{answer, intent}`, Firestore public REST, Groq `openai/gpt-oss-120b`, Knowledge Pack JSON, in-process session memory, gitignored local preference JSON.

**Implemented and verified (unit):** social/identity routing, university-only refusals, catalog metrics, student subject count/compare, ordinal follow-up, LTM isolation, history tests.

**Implemented but not fully verified:** live Firestore answers on a rebuilt image, Expo Go after catalog changes, Groq document answers on this pass.

**Blocked:** university-wide course catalogue, credit hours, room booking, production TLS/deploy.
