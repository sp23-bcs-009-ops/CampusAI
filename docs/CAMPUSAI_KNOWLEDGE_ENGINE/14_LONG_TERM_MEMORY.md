# Long-term memory

`user_memory.py` stores up to 10 preference notes per signed-in email in `backend/data/long_term_memory.json` (gitignored). Not Firestore. Not the verified profile.

Verbs: please remember / what do you remember about me / forget my saved preferences.

Rejected: guests, passwords/tokens/DOB. Delete is per email. Tests write a temp path, not the real file.
