# pipeline.py

Path: `backend/pipeline.py`. Core `/ask` engine. Imported by `API.ask`.

Functions: `answer_question`, `route`, `handle_*`, `personal_reply`, `_student_natural`, `_long_term_reply`, `_university_portion`, `_is_social`, `_is_bot_identity`.

Lifecycle: mixed split → LTM phrases → profile identity → student natural → route → handler → memory update.

Does not import rag_store or local timetable JSON.

Tests: routing, identity, chat_behavior, engine_policy.

Changed this pass: social/identity helpers, polite REFUSAL, pack anchors, session summary, LTM, overlap helper, pack retrieve alias.
