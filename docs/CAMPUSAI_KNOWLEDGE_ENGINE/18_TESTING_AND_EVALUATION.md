# Testing

Backend: `docker run --rm -v E:\Project\Campus_AI-main:/workspace campusai-backend-test`

Frontend history: `node --test Frontend/src/utils/chatHistoryCore.test.mjs`

New tests: `test_catalog.py`, `test_user_memory.py`, `test_normalizer_regression.py`. Evaluation dataset is those tests plus `test_engine_policy.py` (social, identity, mixed, injection, overlap, LTM).

Docker backend suite: **146 passed**, 2 FastAPI `on_event` warnings, 8.27s (2026-10-30). History tests: **6 passed**.

Live Teacher/Staff browser and production deploy: NOT RUN.
