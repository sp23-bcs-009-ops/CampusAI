# Testing

Commands:

```
docker run --rm -v E:\Project\Campus_AI-main:/workspace campusai-backend-test
cd Frontend && node --test src/utils/chatHistoryCore.test.mjs
```

Final: **136 passed** backend, **6 passed** history. Warnings: FastAPI `on_event` deprecation.

New: `backend/tests/test_engine_policy.py`.

No project-wide lint/mypy config: **Not tested**.

Live Guest/Student/Teacher/Staff browser: Student was verified in Stage 11 earlier; this pass **Not tested** in the browser.
