"""The AI decides; code passes it the context (who is asking, the last day and time) and fetches facts."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chatbot import answer_pipeline as pipeline
from chatbot.answer_pipeline import _run_facts_chain, _user_label, answer_question, get_session
from chatbot.question_understanding import standard_question


def ai_understands(monkeypatch, **fields):
    seen = []

    def run(message):
        seen.append(message)
        return json.dumps({"intent": "", **fields})
    monkeypatch.setattr(pipeline, "_run_understanding_chain", run)
    return seen


def test_the_understood_time_reaches_the_timetable_code():
    assert standard_question({"intent": "teacher_day", "teacher": "kamran", "day": "monday", "time": "14:00"}) == \
        "is Mr. Kamran Ali free on Monday at 14:00?"
    assert standard_question({"intent": "room_day", "room": "lt 4", "day": "monday", "time": "9:30"}) == \
        "is LT 4 free on Monday at 9:30?"
    assert standard_question({"intent": "teacher_day", "teacher": "kamran", "day": "monday"}) == \
        "is Mr. Kamran Ali free on Monday?"


def test_the_last_day_and_time_are_given_to_the_ai(monkeypatch):
    session = "ctx-1"
    get_session(session).__init__()
    ai_understands(monkeypatch, intent="teacher_day", teacher="kamran", day="monday", time="14:00")
    answer_question("is kamran free on monday at 2pm", session_id=session)
    seen = ai_understands(monkeypatch, intent="room_day", room="lt 4", day="monday", time="14:00")
    answer_question("and is LT 4 free at that time", session_id=session)
    assert "day=Monday; time=14:00" in seen[0]


def test_a_booking_request_gets_a_polite_cant_do(monkeypatch):
    get_session("ctx-2").__init__()
    ai_understands(monkeypatch, intent="action_request")
    result = answer_question("please book LT 4 for me tomorrow", session_id="ctx-2")
    assert "can't do that" in result["answer"]


def test_events_and_announcements_shows_both(monkeypatch):
    get_session("ctx-3").__init__()
    ai_understands(monkeypatch, intent="events_and_announcements")
    monkeypatch.setattr(pipeline.university_data, "firebase_records", lambda kind, *a, **k: [])
    result = answer_question("any events or announcements?", session_id="ctx-3")
    assert "emergency announcements" in result["answer"]


def test_the_wording_ai_is_told_who_the_user_is(monkeypatch):
    assert _user_label({"type": "teacher", "fullName": "Shahzad Rizwan"}) == "teacher Shahzad Rizwan"
    assert _user_label(None) == "" and _user_label({"email": "x@y.z"}) == ""
    sent = []
    monkeypatch.setattr(pipeline, "_run_chain", lambda prompt, message, memory: sent.append(message) or "ok")
    memory = get_session("ctx-4")
    memory.user_label = "teacher Shahzad Rizwan"
    _run_facts_chain("am I free at 2pm?", "busy: 14:00-15:30", memory)
    assert sent[0].startswith("User: teacher Shahzad Rizwan\nQuestion: am I free at 2pm?")


def test_a_time_specific_answer_talks_about_that_time():
    from chatbot.answer_formatter import card_to_text
    busy = {"slot": "13:35-15:00", "classes": ["BS(AI)-III"], "subjects": ["Software Engineering"], "rooms": ["LT5"]}
    card = {"type": "teacher_availability", "teacher": "Usman Anwar", "when": "at 14:00",
            "days": [{"day": "Monday", "free": [], "busy": [busy]}]}
    assert "Usman Anwar is busy at 14:00 on Monday." in card_to_text(card)
    card["days"] = [{"day": "Monday", "free": ["13:15-14:30"], "busy": []}]
    assert "Usman Anwar is free at 14:00 on Monday." in card_to_text(card)
    assert "no free time" not in card_to_text(card)
