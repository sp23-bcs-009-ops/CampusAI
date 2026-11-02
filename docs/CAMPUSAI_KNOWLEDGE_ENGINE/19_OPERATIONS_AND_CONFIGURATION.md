# Operations

Env names only: `GROQ_API_KEY`, `GROQ_MODEL`, `FIREBASE_PROJECT_ID`, `CAMPUS_AI_API_KEY`, `EXPO_PUBLIC_AI_SERVER_URL`, `KNOWLEDGE_MAX_AGE_DAYS`, `CHROMA_DIR`.

Docker backend copies `catalog.py` and `user_memory.py`. Rebuild the backend image before expecting Expo to hit new Python. Do not push or deploy from this pass. Do not commit `.env` or `backend/data/`.
