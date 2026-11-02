# End-to-end workflow

1. Client sends the raw question. The API does not trust a role in the JSON body.
2. Mixed university + off-topic text is split; only the university clause is answered, with a note.
3. Social / thanks / bot identity return fixed English text.
4. Signed-in “who am I” / “my timetable” use the verified profile.
5. Students can ask overlap, notices, next class in natural language.
6. Catalog operations answer allowlisted count/list questions from the loaded timetable.
7. Remaining questions go through `route()` keyword/entity routing.
8. Follow-ups use session last class/teacher/day/catalog items.
