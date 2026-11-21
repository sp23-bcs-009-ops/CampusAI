"""Guests (no verified university sign-in) only get university information; everything else asks them to sign in."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chatbot import answer_pipeline as pipeline
from chatbot.answer_pipeline import answer_question, get_session
from chatbot.fixed_replies import GUEST_SIGN_IN, REFUSAL
from data_sources import firebase_reader as university_data

STUDENT = {"type": "student", "dept": "cs", "semester": 1, "fullName": "Ali Khan", "email": "g1@cuiatk.edu.pk"}
STAFF = {"type": "staff", "email": "staff@cuiatk.edu.pk"}

GUEST_BLOCKED = [
    "Show me the timetable for BCS-1 on Monday",
    "who is kamran",
    "Is Mr. Kamran Ali free on Monday?",
    "is CR 1 free now?",
    "which rooms are free on friday morning?",
    "any events this week?",
    "I lost my calculator, has anyone found one?",
    "are there any emergency announcements?",
    "show notifications for BCS-1",
    "when are the exams?",
    "what are my classes today?",
    "who teaches Test Subject?",
]


@pytest.fixture(autouse=True)
def gate_on(monkeypatch):
    monkeypatch.setattr(pipeline.settings, "guest_university_info_only", True)
    monkeypatch.setattr(university_data, "firebase_records", lambda *a, **k: [{"title": "Fair", "date": "2099-01-01"}])
    monkeypatch.setattr(pipeline, "_run_chain", lambda system, user, memory: "From the campus records: apply online.")


@pytest.mark.parametrize("question", GUEST_BLOCKED)
def test_guests_are_asked_to_sign_in_for_campus_data(question):
    session = f"guest-{question[:20]}"
    get_session(session).__init__()
    result = answer_question(question, session_id=session)
    assert result["answer"] == GUEST_SIGN_IN, question
    assert result["intent"] == "sign_in_required"
    # Nothing from the data stays in the guest's chat memory (the bot's replies).
    memory = get_session(session)
    assert all("Dr. Test" not in str(m.content) for m in memory.messages if m.type == "ai")
    assert memory.last_facts == ""


def test_guests_get_university_information():
    result = answer_question("How do I apply for admission?", session_id="guest-admission")
    assert result["intent"] == "comsats_info"
    assert result["answer"] != GUEST_SIGN_IN


def test_guests_get_greetings_help_and_off_topic_refusal():
    assert answer_question("hi", session_id="guest-hi")["intent"] == "general"
    help_text = answer_question("what can you do?", session_id="guest-help")["answer"]
    assert "University information" in help_text and "Sign in" in help_text
    assert "BCS-1" not in help_text  # no timetable examples for guests
    assert answer_question("tell me a joke", session_id="guest-joke")["answer"] == REFUSAL


@pytest.mark.parametrize("identity", [STUDENT, STAFF])
def test_signed_in_users_still_get_campus_data(identity):
    result = answer_question("Show me the timetable for BCS-1 on Monday", session_id=f"in-{identity['type']}",
                             identity=identity)
    assert result["answer"] != GUEST_SIGN_IN
    assert result["answer"]["type"] == "schedule"


def test_ai_reading_a_data_question_refuses_before_any_lookup(monkeypatch):
    monkeypatch.setattr(pipeline, "_run_understanding_chain",
                        lambda message: json.dumps({"intent": "teacher_day", "teacher": "kamran", "day": "monday"}))
    monkeypatch.setattr(pipeline, "_answer_from_code",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("no lookup for a guest")))
    result = answer_question("could you check kamran's monday", session_id="guest-ai")
    assert result["answer"] == GUEST_SIGN_IN


def test_the_gate_can_be_turned_off(monkeypatch):
    monkeypatch.setattr(pipeline.settings, "guest_university_info_only", False)
    result = answer_question("Show me the timetable for BCS-1 on Monday", session_id="guest-gate-off")
    assert result["answer"]["type"] == "schedule"
