# Short-term conversation memory

**Status:** Implemented and verified in unit tests.

- Key: `user:{email}:{client session}` or `guest:{client session}` in `API.ask`.
- Store: in-process `_SESSIONS` (max 500 keys, FIFO eviction).
- Window: `MEMORY_WINDOW` default 8 pairs.
- Summary: concatenated dropped human snippets, 400 chars.
- Entities: last class/teacher/room/day/subjects.
- New chat id → empty entity memory.
- Frontend AsyncStorage is not this store.
- Restart of the backend process drops all sessions.
- Volatile facts are re-read from Firestore when handlers query, not trusted from memory alone.
