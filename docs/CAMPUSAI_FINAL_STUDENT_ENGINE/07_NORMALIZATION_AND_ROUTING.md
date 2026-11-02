# Normalization and routing

**Retain `backend/normalizer.py`.** No `normalization.py`. Functions `normalize_to_key` and `extract_class_from_sentence` map class tokens only. Raw `RoutedQuestion.question` is unchanged. Limitation: `cs+2` as one token does not map; `CS 2` does.

Routing categories: social, bot identity, student profile, catalog analytics, timetable/teacher/room, comsats_info, events/notices, off_topic, mixed, ambiguous class-count clarification.
