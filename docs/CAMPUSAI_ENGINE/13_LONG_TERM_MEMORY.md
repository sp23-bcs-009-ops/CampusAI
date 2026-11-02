# Long-term memory

**Status:** Partially implemented.

Exists as `_LONG_TERM` in `pipeline.py`, keyed by verified email. Phrases:

- “Please remember that …”
- “What do you remember about me?”
- “Forget my saved preferences.”

Guest cannot save. Secrets/password-like text refused. Max 10 notes. Does not override profile, timetable, or pack. **Not written to Firestore. Lost on process restart.** No dedicated UX beyond chat phrases. Isolation tested in `test_long_term_memory_is_isolated_and_can_be_deleted`.
