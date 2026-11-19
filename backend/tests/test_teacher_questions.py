"""Real chats about teachers: last names, typos, "he", and "how many subjects is he teaching"."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chatbot.answer_pipeline import answer_question, get_session
from data_sources import firebase_reader as university_data
from timetable import timetable_lookup as tt

STUDENT = {"type": "student", "dept": "cs", "semester": 2, "fullName": "Ali Khan", "email": "ali@cuiatk.edu.pk"}


def _meeting(subject, teacher, room, time, day):
    return [{"subject": subject, "teacher": teacher, "room": room, "time": time, "day": day}]


TIMETABLE = {
    "BS(SE)-III": {"Friday": {"11:30-13:15": _meeting("Computer Networks", "Shahzad Rizwan", "LT4", "11:30-13:15", "Friday")}},
    "BS(CS)-IV": {
        "Monday": {"8:30-10:00": _meeting("Computer Networks", "Shahzad Rizwan", "LT2", "8:30-10:00", "Monday")},
        "Tuesday": {"13:35-15:00": _meeting("Computer Networks (Lab)", "Shahzad Rizwan", "Lab3", "13:35-15:00", "Tuesday")},
    },
    "BS(CS)-II": {
        "Monday": {"10:00-11:30": _meeting("Discrete Structures", "Umar Zia", "LT8", "10:00-11:30", "Monday")},
        "Wednesday": {"10:00-11:30": _meeting("Applied Physics", "Muhammad Rizwan Khan", "LT1", "10:00-11:30", "Wednesday")},
    },
}


@pytest.fixture(autouse=True)
def rizwan_timetable(monkeypatch):
    monkeypatch.setattr(university_data, "load_timetable", lambda: TIMETABLE)
    tt._rebuild_indexes(TIMETABLE)


def ask(question, session, identity=None):
    return answer_question(question, session_id=session, identity=identity)["answer"]


def test_a_last_name_shared_by_two_teachers_asks_which_one():
    get_session("rz-1").__init__()
    answer = ask("i am talking about sir rizwan", "rz-1")
    assert answer["type"] == "teacher_ambiguous"
    assert set(answer["matches"]) == {"Shahzad Rizwan", "Muhammad Rizwan Khan"}


def test_a_unique_last_name_finds_the_teacher():
    get_session("rz-2").__init__()
    answer = ask("do you know shahzad", "rz-2")
    assert answer["type"] == "teacher_profile"
    assert answer["teacher"] == "Shahzad Rizwan"


def test_a_typo_in_the_name_still_gives_the_profile():
    get_session("rz-3").__init__()
    answer = ask("sir shazad rizwan", "rz-3")
    assert answer["type"] == "teacher_profile"
    assert answer["teacher"] == "Shahzad Rizwan"
    courses = {s["subject"]: s for s in answer["subjects"]}
    assert list(courses) == ["Computer Networks"]  # theory and lab are one course
    assert courses["Computer Networks"]["part"] == "theory and lab"
    assert set(courses["Computer Networks"]["classes"]) == {"BS(SE)-III", "BS(CS)-IV"}


@pytest.mark.parametrize("identity", [None, STUDENT])
def test_he_after_a_teacher_answer_is_that_teacher_not_my_class(identity):
    session = f"rz-4-{bool(identity)}"
    get_session(session).__init__()
    ask("sir shazad rizwan", session, identity)
    for question in (
        "i want to know about this teacher like how many subjects he is teaching right now and which subjects to which batch",
        "which courses he is teaching",
    ):
        answer = ask(question, session, identity)
        assert answer["type"] == "teacher_profile", question
        assert answer["teacher"] == "Shahzad Rizwan"
    monday = ask("when is he free on monday?", session, identity)
    assert monday["type"] == "teacher_availability" and monday["teacher"] == "Shahzad Rizwan"


def test_my_subject_teacher_for_a_student():
    student = {"type": "student", "dept": "cs", "semester": 2, "email": "s2@cuiatk.edu.pk"}
    get_session("rz-5").__init__()
    assert ask("who is my discrete structures teacher?", "rz-5", student) == "Your Discrete Structures teacher is Umar Zia."
    free = ask("is my discrete structures teacher free now?", "rz-5", student)
    assert "Umar Zia" in str(free) and "no classes in that time" not in str(free)


def test_records_are_not_taken_by_library_or_website_routes():
    from chatbot.answer_pipeline import SessionMemory, route

    assert route("any found items in the library?", SessionMemory()).intent == "lostfound"
    assert route("what is happening on campus this weekend?", SessionMemory()).intent == "events"


def test_a_follow_up_about_he_does_not_ask_do_you_mean_again():
    get_session("rz-6").__init__()
    first = ask("sir shazad rizwan", "rz-6")
    assert first["confirm_name"] is True
    again = ask("which courses he is teaching", "rz-6")
    assert again["type"] == "teacher_profile" and again["confirm_name"] is False
