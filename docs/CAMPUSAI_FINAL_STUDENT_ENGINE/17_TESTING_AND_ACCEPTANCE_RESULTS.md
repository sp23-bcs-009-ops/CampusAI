# Tests

Backend Docker: **151 passed**, 2 FastAPI on_event warnings, 7.18s (2026-10-30).

Frontend: `node --test Frontend/src/utils/chatHistoryCore.test.mjs` **6 passed**.

Live `/health` **PASS** on already-running container. Live `/ask` social **PASS**. Live catalog/Firestore student session on rebuilt image **NOT RUN**. Expo Go this pass **NOT RUN**. Rebuild of `campusai-backend` **NOT RUN**.
