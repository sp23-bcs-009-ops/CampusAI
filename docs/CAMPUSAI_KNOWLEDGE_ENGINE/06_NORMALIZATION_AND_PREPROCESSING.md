# Normalization decision

**File:** `backend/normalizer.py` only. There is no `normalization.py`.

**Decision: retain.** Do not remove, rename, or bypass it.

Functions: `normalize_to_key`, `extract_class_from_sentence`. They map class aliases (BCS-1, CS 2, …) to timetable keys such as `BS(CS)-I`.

Call sites: `pipeline._class_key_from_text` (token spans from the raw question), `timetable_service.detect_class` / timetable questions.

The raw question is stored on `RoutedQuestion.question` and in session history. Normalization is not applied to the whole sentence, so greetings and proper nouns are not rewritten globally.

`cs+2` as a single token does not currently map; `CS 2` and `BCS-2` do. That is a documented limitation, not a reason to delete the module.

Tests: `tests/test_normalizer_regression.py` plus existing timetable class detection tests.
