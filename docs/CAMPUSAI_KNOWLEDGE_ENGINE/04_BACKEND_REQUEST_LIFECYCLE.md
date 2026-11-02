# `/ask` request lifecycle

`API.ask` strips the question, rejects empty or >2000 characters, rate-limits, reads Bearer, resolves identity, namespaces the session as `user:{email}:{id}` or `guest:{id}`, calls `answer_question`, returns `{answer, intent}`.

`answer_question` order: mixed split, long-term preference verbs, personal_reply, student natural, catalog, then `route` + HANDLERS. Firestore failures raise `UniversityDataUnavailable` and are not replaced with local timetable JSON.
