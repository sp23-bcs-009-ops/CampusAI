# Structured queries

Allowlisted ops in `detect_catalog_op` / `answer_catalog`:

- `unique_subjects` — set of subject strings, optional department/semester filter
- `sections` — distinct class keys
- `meetings` — meeting row count
- `teachers` — distinct teacher names
- `teacher_subjects` / `department_subjects`
- `clarify_class_count` — “how many classes”
- `repeat_last` — “list them” / “those courses”

The LLM cannot emit Firestore queries. Overlap detection remains `_student_timetable_overlaps` in `pipeline.py`. Room occupancy remains `timetable_service`.
