"""Canonical timetable catalog counts and allowlisted operations."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from catalog import catalog_from_timetable, detect_catalog_op
from pipeline import answer_question, get_session


def test_unique_subjects_are_not_meetings_or_sections():
    data = {
        "BS(CS)-I": {
            "Monday": {
                "8:30-10:00": [{"subject": "PF", "teacher": "Ali", "room": "LT1", "day": "Monday", "time": "8:30-10:00"}],
                "10:00-11:30": [{"subject": "PF", "teacher": "Ali", "room": "LT1", "day": "Monday", "time": "10:00-11:30"}],
            }
        },
        "BS(CS)-II": {
            "Tuesday": {
                "8:30-10:00": [{"subject": "OOP", "teacher": "Sara", "room": "LT2", "day": "Tuesday", "time": "8:30-10:00"}],
            }
        },
        "BS(SE)-I": {
            "Monday": {
                "8:30-10:00": [{"subject": "PF", "teacher": "Ali", "room": "C1", "day": "Monday", "time": "8:30-10:00"}],
            }
        },
    }
    catalog = catalog_from_timetable(data)
    assert catalog.subjects == ["OOP", "PF"]
    assert catalog.sections == ["BS(CS)-I", "BS(CS)-II", "BS(SE)-I"]
    assert len(catalog.meetings) == 4
    assert catalog.teachers == ["Ali", "Sara"]


def test_empty_and_missing_subject_are_qualified():
    empty = catalog_from_timetable({})
    assert empty.meetings == []
    assert empty.warnings
    missing = catalog_from_timetable({
        "BS(CS)-I": {"Monday": {"8:30-10:00": [{"subject": "", "teacher": "Ali", "room": "LT1"}]}}
    })
    assert missing.meetings == []
    assert any("no subject" in note for note in missing.warnings)


def test_how_many_classes_asks_for_clarification():
    result = answer_question("How many classes are offered?", session_id="catalog-clarify")
    assert "unique subjects" in result["answer"].lower()
    assert "class groups" in result["answer"].lower()
    assert "meetings" in result["answer"].lower()
    assert result["intent"] == "catalog"


def test_course_and_subject_counts_use_published_timetable():
    courses = answer_question("How many courses are offered?", session_id="catalog-courses")
    subjects = answer_question("How many subjects are offered?", session_id="catalog-subjects")
    sections = answer_question("How many class sections?", session_id="catalog-sections")
    meetings = answer_question("How many timetable meetings?", session_id="catalog-meetings")
    assert courses["intent"] == "catalog"
    assert "unique subjects" in courses["answer"].lower()
    assert "not a complete university-wide course catalogue" in courses["answer"].lower()
    assert subjects["answer"] == courses["answer"]
    assert "class groups" in sections["answer"].lower()
    assert "scheduled timetable meetings" in meetings["answer"].lower()
    assert courses["answer"] != sections["answer"]
    assert sections["answer"] != meetings["answer"]


def test_department_and_teacher_lists_and_follow_up():
    dept = answer_question(
        "Which courses are offered by computer science?",
        session_id="catalog-dept",
    )
    teacher = answer_question(
        "Which courses does Dr. Test teach?",
        session_id="catalog-teacher",
    )
    follow = answer_question("List them.", session_id="catalog-teacher")
    assert "CS" in dept["answer"]
    assert "unique subjects" in dept["answer"]
    assert "Dr. Test teaches" in teacher["answer"]
    assert "Test Subject" in teacher["answer"]
    assert "Test Subject" in follow["answer"]
    assert get_session("catalog-teacher").last_catalog_metric == "subjects"


def test_catalog_ops_are_allowlisted():
    assert detect_catalog_op("How many unique courses are offered?") == "unique_subjects"
    assert detect_catalog_op("How many class sections?") == "sections"
    assert detect_catalog_op("How many timetable meetings?") == "meetings"
    assert detect_catalog_op("How many classes?") == "clarify_class_count"
    assert detect_catalog_op("How many subjects does each department offer?") == "department_counts"
    assert detect_catalog_op("Who teaches Test Subject?") == "subject_teachers"
    assert detect_catalog_op("How are you, my friend?") is None
    assert detect_catalog_op("What is the capital of France?") is None


def test_university_wide_course_count_is_qualified():
    result = answer_question(
        "How many courses does the university offer?",
        session_id="catalog-university",
    )
    text = result["answer"].lower()
    assert "unique subjects" in text
    assert "not a complete" in text
    assert "university" in text


def test_department_counts_and_subject_teachers():
    counts = answer_question(
        "How many subjects does each department offer?",
        session_id="catalog-dept-counts",
    )
    taught = answer_question(
        "Who teaches Test Subject?",
        session_id="catalog-who-teaches",
    )
    assert "CS:" in counts["answer"]
    assert "SE:" in counts["answer"]
    assert "Test Subject is listed with Dr. Test" in taught["answer"]
    assert "complete teaching-load" in taught["answer"].lower()
