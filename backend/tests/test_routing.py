"""
Intent-routing regression tests — run with:  pytest backend/tests -q

These test the deterministic layer only (no LLM calls), which is where
historically all the bugs came from (fuzzy matching, entity detection).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

import timetable_service as tt
from pipeline import route, get_session, answer_question, SessionMemory


def fresh_memory():
    return SessionMemory()


# ── Intent routing ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("question,expected_intent", [
    # timetable
    ("What are BCS-1 classes on Monday?", "timetable"),
    ("show me BSSE-3 timetable for the whole week", "timetable"),
    ("BS(CS)-I schedule today", "timetable"),
    ("next class of cs 1", "timetable"),
    # teacher
    ("Is Sir Kamran free on Friday?", "teacher"),
    ("who teaches Data Structures?", "teacher"),
    ("show schedule of Mr. Usman Anwar", "teacher"),
    ("is dr sardaraz busy on monday", "teacher"),
    # room
    ("Is LT 4 free on Monday?", "room"),
    ("when is CR 2 free this week", "room"),
    # rooms overview
    ("which rooms are free on friday morning?", "rooms_all"),
    ("show all rooms availability", "rooms_all"),
    # comsats info
    ("tell me about COMSATS campuses", "comsats_info"),
    ("how do I apply for admission at COMSATS?", "comsats_info"),
    # off topic
    ("tell me a joke about cats", "off_topic"),
    ("write a poem about love", "off_topic"),
])
def test_intent_routing(question, expected_intent):
    assert route(question, fresh_memory()).intent == expected_intent


# ── Entity detection ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("CS-I", "BS(CS)-I"),
    ("BCS-1", "BS(CS)-I"),
    ("BSSE-3", "BS(SE)-III"),
    ("cs 1", "BS(CS)-I"),
])
def test_class_detection(text, expected):
    assert tt.detect_class(text) == expected


def test_teacher_detection_with_typos():
    assert tt.detect_teacher("is sir kamran free") == "Mr. Kamran Ali"


def test_room_normalization():
    assert tt.detect_room("is lt4 free") is not None
    assert tt.detect_room("lecture theater 4 schedule") is not None


# ── Regression: bugs fixed during refactor ───────────────────────────────────

def test_class_query_not_hijacked_by_fuzzy_teacher():
    """'What are BCS-1 classes on Monday?' must be a timetable query,
    not a teacher query (fuzzy matcher used to grab 'Ms. Areeba')."""
    rq = route("What are BCS-1 classes on Monday?", fresh_memory())
    assert rq.intent == "timetable"
    assert rq.cls == "BS(CS)-I"


def test_explicit_teacher_with_class_still_teacher():
    """When user names a teacher explicitly, teacher intent wins even
    if a class is also mentioned."""
    rq = route("does sir kamran teach BCS-1?", fresh_memory())
    assert rq.intent == "teacher"


# ── Memory follow-ups ────────────────────────────────────────────────────────

def test_followup_reuses_last_teacher():
    session = "test-followup-1"
    get_session(session).__init__()  # reset
    r1 = answer_question("Is Sir Kamran free on Friday?", session_id=session)
    assert r1["intent"] == "teacher"
    r2 = answer_question("what about Tuesday?", session_id=session)
    assert r2["intent"] == "teacher"
    assert r2["answer"]["teacher"] == r1["answer"]["teacher"]
    assert r2["answer"]["days"][0]["day"] == "Tuesday"


def test_which_teacher_uses_the_class_just_shown():
    session = "which-teacher"
    get_session(session).__init__()
    first = answer_question("show BCS-1 classes on monday", session_id=session)
    assert first["intent"] == "timetable"
    second = answer_question("Which teacher takes that class?", session_id=session)
    text = str(second["answer"])
    assert "Dr. Test" in text
    assert "Test Subject" in text
    assert "Tuesday Subject" not in text


def test_day_followup_keeps_the_class_after_the_teacher_question():
    session = "teacher-then-day"
    get_session(session).__init__()
    answer_question("show BCS-1 classes on monday", session_id=session)
    answer_question("Which teacher takes that class?", session_id=session)
    third = answer_question("What about Tuesday?", session_id=session)
    assert third["intent"] == "timetable"
    assert third["answer"]["day"] == "Tuesday"
    assert "Tuesday Subject" in str(third["answer"])


def test_which_teacher_without_a_class_asks():
    answer = answer_question("Which teacher takes that class?", session_id="no-class-yet")
    assert "which class" in answer["answer"].lower()
    assert "Dr. Test" not in answer["answer"]


def test_one_room_followup_uses_that_room_and_day():
    session = "one-room"
    get_session(session).__init__()
    answer_question("show BCS-1 classes on monday", session_id=session)
    second = answer_question("Is the room free then?", session_id=session)
    assert second["intent"] == "room"
    assert second["answer"]["room"] == "CR 1"
    assert second["answer"]["days"][0]["day"] == "Monday"


def test_several_rooms_ask_instead_of_guessing():
    session = "many-rooms"
    memory = get_session(session)
    memory.__init__()
    memory.last_rooms = ["CR 1", "LT 4"]
    memory.last_day = "Monday"
    memory.last_intent = "timetable"
    answer = answer_question("Is the room free then?", session_id=session)
    assert isinstance(answer["answer"], str)
    assert "which room" in answer["answer"].lower()
    assert "CR 1" in answer["answer"]
    assert "LT 4" in answer["answer"]
    assert "room_availability" not in answer["answer"]


def test_room_followup_without_context_asks():
    answer = answer_question("Is the room free then?", session_id="no-room-yet")
    assert "which room" in answer["answer"].lower()
    assert answer["intent"] != "room"


def test_named_room_is_not_replaced_by_the_previous_room():
    session = "named-room"
    get_session(session).__init__()
    answer_question("show BCS-1 classes on monday", session_id=session)
    second = answer_question("Is LT 4 free then?", session_id=session)
    assert second["answer"]["room"].startswith("LT")
    assert second["answer"]["days"][0]["day"] == "Monday"


def test_ambiguous_subject_asks_which_one():
    session = "ambiguous-subject"
    get_session(session).__init__()
    answer_question("show BCS-1 timetable", session_id=session)
    second = answer_question("which teacher teaches that subject?", session_id=session)
    assert "which subject" in second["answer"].lower()
    assert "Test Subject" in second["answer"]
    assert "Tuesday Subject" in second["answer"]


def test_off_topic_does_not_inherit_the_class():
    session = "off-topic-after-class"
    get_session(session).__init__()
    answer_question("show BCS-1 classes on monday", session_id=session)
    second = answer_question("what is the capital of France?", session_id=session)
    assert second["intent"] == "off_topic"


def test_followup_reuses_last_class():
    session = "test-followup-2"
    get_session(session).__init__()
    r1 = answer_question("show BCS-1 classes on monday", session_id=session)
    assert r1["intent"] == "timetable"
    r2 = answer_question("and tuesday?", session_id=session)
    assert r2["intent"] == "timetable"


# ── Deterministic handlers return the shapes the frontend expects ────────────

def test_schedule_shape():
    r = answer_question("BCS-1 monday classes", session_id="shape-1")
    a = r["answer"]
    assert a["type"] == "schedule"
    assert {"subject", "teacher", "room", "time", "day"} <= set(a["classes"][0].keys())


def test_teacher_availability_shape():
    r = answer_question("is sir kamran free on friday", session_id="shape-2")
    a = r["answer"]
    assert a["type"] == "teacher_availability"
    assert {"day", "free", "busy"} <= set(a["days"][0].keys())


def test_room_availability_shape():
    r = answer_question("is LT 4 free on monday", session_id="shape-3")
    a = r["answer"]
    assert a["type"] == "room_availability"
    assert a["room"].startswith("LT")


def test_no_class_mentioned_asks_for_class():
    r = answer_question("what classes are on monday", session_id="shape-4")
    assert isinstance(r["answer"], str)
    assert "class name" in r["answer"].lower()


def test_unknown_class_code_is_not_fuzzy_matched():
    assert tt.detect_class("What are BS(XX)-IX classes on Monday?") is None
    r = answer_question("What are BS(XX)-IX classes on Monday?", session_id="unknown-class")
    assert r["intent"] == "timetable"
    assert isinstance(r["answer"], str)
    assert "BS(AI)" not in r["answer"]
    assert "BS(CS)" not in r["answer"]


def test_unknown_name_does_not_reuse_previous_teacher():
    session = "unknown-teacher"
    get_session(session).__init__()
    first = answer_question("Is Sir Kamran free on Friday?", session_id=session)
    assert first["intent"] == "teacher"
    second = answer_question("is Sir Zzzzzz free on Friday?", session_id=session)
    assert second["intent"] == "teacher"
    assert "couldn't find" in str(second["answer"]).lower()
    assert "teacher_availability" not in str(second["answer"])


def test_unknown_room_does_not_reuse_previous_room():
    session = "unknown-room"
    get_session(session).__init__()
    first = answer_question("is LT 4 free on Monday?", session_id=session)
    assert first["intent"] == "room"
    second = answer_question("is room ZZZ-999 free on Monday?", session_id=session)
    assert second["intent"] == "room_unknown"
    assert "couldn't identify" in str(second["answer"]).lower()
    assert "room_availability" not in str(second["answer"])


def test_capital_of_france_is_off_topic():
    assert route("what is the capital of France?", fresh_memory()).intent == "off_topic"


def test_lab_question_detects_the_class_before_the_room_name():
    assert tt.detect_class("is there a lab on Monday for BCS-1?") == "BS(CS)-I"


def test_pack_news_is_not_treated_as_off_topic():
    assert route("what is the CWUR 2026 ranking news?", fresh_memory()).intent == "comsats_info"


def test_subject_followup_uses_the_previous_class():
    session = "subject-followup"
    get_session(session).__init__()
    first = answer_question("What are BCS-1 classes on Monday?", session_id=session)
    assert first["intent"] == "timetable"
    second = answer_question("which teacher teaches that subject?", session_id=session)
    assert second["intent"] == "teacher"
    assert "Test Subject" in str(second["answer"])


def test_unknown_semester_asks_for_a_class():
    answer = answer_question("I do not know my semester. Can you help?", session_id="semester-help")
    assert "BCS-1" in str(answer["answer"])


def test_poem_is_declined():
    assert route("Tell me a poem", fresh_memory()).intent == "off_topic"


def test_teacher_availability_matches_the_class_meetings():
    tt.ensure_timetable()
    teacher = "Mr. Kamran Ali"
    busy = {}
    for cls, class_data in tt.TIMETABLE.items():
        for slot, entries in class_data.get("Monday", {}).items():
            for entry in entries:
                if entry.get("teacher") == teacher:
                    busy.setdefault(slot, []).append({
                        "class": cls,
                        "room": entry.get("room", "N/A"),
                        "subject": entry.get("subject", ""),
                    })
    found = tt.get_teacher_availability(teacher, ["Monday"])["Monday"]["busy"]
    assert found == busy
    assert found


def test_greeting_and_thanks_do_not_load_timetable_or_call_groq(monkeypatch):
    def fail_load():
        raise AssertionError("timetable should not load")

    def fail_groq(*_args, **_kwargs):
        raise AssertionError("Groq should not be called")

    monkeypatch.setattr(tt, "ensure_timetable", fail_load)
    monkeypatch.setattr("pipeline._run_chain", fail_groq)
    greeting = answer_question("Hello", session_id="speed-hello")
    thanks = answer_question("thank you", session_id="speed-thanks")
    assert greeting["intent"] == "general"
    assert "class schedules" in greeting["answer"]
    assert thanks["intent"] == "general"
    assert "welcome" in thanks["answer"].lower()


def test_isolated_day_followup_does_not_load_timetable(monkeypatch):
    monkeypatch.setattr(tt, "ensure_timetable", lambda: (_ for _ in ()).throw(AssertionError("timetable should not load")))
    result = answer_question("What about Tuesday?", session_id="speed-followup-empty")
    assert result["intent"] == "timetable"
    assert "class name" in result["answer"].lower()


def test_notification_class_is_known_without_loading_timetable(monkeypatch):
    monkeypatch.setattr(tt, "ensure_timetable", lambda: (_ for _ in ()).throw(AssertionError("timetable should not load")))
    routed = route("any class notifications for BCS-1?", fresh_memory())
    assert routed.intent == "notifications"
    assert routed.cls == "BS(CS)-I"


def test_lab_meeting_question_is_not_the_room_named_lab(monkeypatch):
    monkeypatch.setattr(tt, "detect_room", lambda question: "Lab" if "lab" in question.lower() else None)
    routed = route("is there a lab on Monday for BCS-1?", fresh_memory())
    assert routed.intent == "timetable"
    assert routed.cls == "BS(CS)-I"
    assert routed.room is None
