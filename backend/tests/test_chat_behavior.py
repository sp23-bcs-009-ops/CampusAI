"""Chatbot behavior that does not call an LLM or any remote service."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline import SessionMemory, answer_question, get_session, route


def test_timetable_question_returns_structured_schedule():
    result = answer_question(
        "What are BCS-1 classes on Monday?",
        session_id="pytest-timetable",
    )
    assert result["intent"] == "timetable"
    assert result["answer"]["type"] == "schedule"
    assert result["answer"]["class"] == "BS(CS)-I"
    assert result["answer"]["day"] == "Monday"


def test_followup_reuses_class_in_the_same_session():
    first = answer_question(
        "What are BCS-1 classes on Monday?",
        session_id="pytest-followup",
    )
    second = answer_question("what about tuesday?", session_id="pytest-followup")

    assert first["intent"] == "timetable"
    assert second["intent"] == "timetable"
    assert second["answer"]["class"] == "BS(CS)-I"
    assert second["answer"]["day"] == "Tuesday"
    assert get_session("pytest-followup").last_class == "BS(CS)-I"


def test_followup_does_not_leak_into_another_session():
    answer_question(
        "What are BCS-1 classes on Monday?",
        session_id="pytest-session-a",
    )
    answer_question("what about tuesday?", session_id="pytest-session-b")
    assert get_session("pytest-session-b").last_class is None


def test_teacher_lookup_is_deterministic():
    result = answer_question(
        "Is Sir Kamran free on Friday?",
        session_id="pytest-teacher",
    )
    assert result["intent"] == "teacher"
    assert result["answer"]["type"] == "teacher_availability"
    assert "Kamran" in result["answer"]["teacher"]


def test_room_lookup_is_deterministic():
    result = answer_question(
        "Is LT 4 free on Monday?",
        session_id="pytest-room",
    )
    assert result["intent"] == "room"
    assert result["answer"]["type"] == "room_availability"


def test_punctuation_still_routes_to_timetable():
    routed = route("What are BCS-1 classes on Monday?!", SessionMemory())
    assert routed.intent == "timetable"
    assert routed.cls == "BS(CS)-I"


def test_long_question_still_detects_the_class():
    question = ("Please check this carefully. " * 40) + "What are BCS-1 classes on Monday?"
    routed = route(question, SessionMemory())
    assert routed.intent == "timetable"
    assert routed.cls == "BS(CS)-I"


def test_blank_question_does_not_crash():
    routed = route("   ", SessionMemory())
    assert routed.intent


def test_off_topic_is_refused_without_a_model():
    result = answer_question("tell me a joke about cats", session_id="pytest-joke")
    assert result["intent"] == "off_topic"
    assert isinstance(result["answer"], str)
    assert result["answer"]
