"""Facts from code, words from the AI: teacher profiles, friendly wording, and the hallucination check."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chatbot import answer_pipeline as pipeline
from chatbot.answer_pipeline import answer_question, get_session
from chatbot.fact_check import unsupported_details

FACTS = (
    "Do you mean Mr. Kamran Ali?\n"
    "👨‍🏫 Mr. Kamran Ali teaches:\n"
    "• Mobile Application Development — BS(CS)-V\n"
    "Teaching days: Monday, Thursday, Friday\n"
    "Next class: Monday 13:35–15:00, Mobile Application Development (Lab) for BS(CS)-V in CS C.Lab 1."
)


def fake_ai(reply, calls=None):
    def run(question, facts, memory):
        if calls is not None:
            calls.append(facts)
        return reply
    return run


def test_fact_check_accepts_a_faithful_reply():
    reply = ("Do you mean Mr. Kamran Ali? He teaches Mobile Application Development to BS(CS)-V "
             "on Monday, Thursday and Friday. His next class is Monday 13:35–15:00 in CS C.Lab 1.")
    assert unsupported_details(reply, FACTS, "who is kamran") == []


def test_fact_check_rejects_made_up_details():
    assert unsupported_details("He teaches at 9:00 on Monday.", FACTS)  # time not in facts
    assert unsupported_details("He teaches BS(CS)-II.", FACTS)  # class not in facts
    assert unsupported_details("He is in LT 4 today.", FACTS)  # room not in facts
    assert unsupported_details("He also teaches on Saturday.", FACTS)  # day not in facts
    assert unsupported_details("Dr. Sameen Khalid teaches it too.", FACTS)  # another teacher
    assert unsupported_details("Call him at 0315-1234567.", FACTS)  # number not in facts


def test_fact_check_rejects_a_busy_slot_called_free():
    facts = "👨‍🏫 Kamran Ali\nMonday\nFree: 08:30–10:00, 11:30–13:15\nBusy: 15:00–16:30 (BS(CS)-VIII, Lab3)"
    assert unsupported_details("He's free on Monday 08:30–10:00 and 15:00–16:30.", facts)
    assert unsupported_details("He's free 08:30–10:00 and teaching 15:00–16:30.", facts) == []


def test_who_is_a_teacher_gives_a_profile_not_one_day_of_slots():
    result = answer_question("who is kamran", session_id="ai-profile")
    assert result["intent"] == "teacher"
    assert result["answer"]["type"] == "teacher_profile"
    assert result["answer"]["teacher"] == "Mr. Kamran Ali"
    assert result["answer"]["confirm_name"] is True
    subjects = {s["subject"] for s in result["answer"]["subjects"]}
    assert "Mobile Application Development" in subjects
    # Availability questions still get availability.
    free = answer_question("Is Kamran Ali free on Monday?", session_id="ai-free")
    assert free["answer"]["type"] == "teacher_availability"


def test_faithful_ai_wording_is_used(monkeypatch):
    reply = "Do you mean Mr. Kamran Ali? He teaches Mobile Application Development to BS(CS)-V."
    monkeypatch.setattr(pipeline, "_run_facts_chain", fake_ai(reply))
    result = answer_question("who is kamran", session_id="ai-faithful")
    assert result["answer"] == reply


def test_made_up_ai_wording_falls_back_to_the_facts(monkeypatch):
    monkeypatch.setattr(pipeline, "_run_facts_chain", fake_ai("Kamran Ali teaches at 9:00 in LT 4."))
    result = answer_question("who is kamran", session_id="ai-invented")
    assert isinstance(result["answer"], dict) and result["answer"]["type"] == "teacher_profile"


def test_no_rewording_when_the_ai_limit_is_used_up(monkeypatch):
    calls = []
    monkeypatch.setattr(pipeline, "_run_facts_chain", fake_ai("Do you mean Mr. Kamran Ali?", calls))
    monkeypatch.setattr(pipeline.settings, "ai_calls_per_minute", 5)
    for _ in range(3):
        pipeline._AI_CALLS.append(pipeline.time.monotonic())
    result = answer_question("who is kamran", session_id="ai-budget")
    assert calls == []  # 3 used + 2 kept for chat = 5: no spare call for rewording
    assert result["answer"]["type"] == "teacher_profile"


def test_exams_and_refusals_are_never_reworded(monkeypatch):
    calls = []
    monkeypatch.setattr(pipeline, "_run_facts_chain", fake_ai("anything", calls))
    answer_question("when are the exams?", session_id="ai-exam")
    answer_question("tell me a joke", session_id="ai-joke")
    assert calls == []


def test_he_means_the_last_teacher():
    session = "ai-pronoun"
    get_session(session).__init__()
    answer_question("who is kamran", session_id=session)
    result = answer_question("when is he free on Monday?", session_id=session)
    assert result["answer"]["type"] == "teacher_availability"
    assert result["answer"]["teacher"] == "Mr. Kamran Ali"


def test_which_of_those_is_answered_from_the_last_answer(monkeypatch):
    session = "ai-those"
    get_session(session).__init__()
    answer_question("Show me the timetable for BCS-1 on Monday", session_id=session)
    calls = []
    monkeypatch.setattr(pipeline, "_run_facts_chain", fake_ai("Only Test Subject is on Monday.", calls))
    result = answer_question("which of those classes are labs?", session_id=session)
    assert result["intent"] == "followup"
    assert "Test Subject" in calls[0]


def test_free_busy_answers_read_as_sentences_with_free_time_first():
    from chatbot.answer_formatter import card_to_text

    card = {"type": "teacher_availability", "teacher": "Shahzad Rizwan", "days": [{
        "day": "Monday",
        "free": ["11:30-13:15", "13:35-15:00", "15:00-16:30"],
        "busy": [{"slot": "08:30-10:00", "classes": ["BS(AI)-III"], "rooms": ["LT2"], "subjects": ["Database Systems"]}],
    }]}
    assert card_to_text(card) == (
        "👨‍🏫 Shahzad Rizwan is free on Monday 11:30–16:30.\n"
        "Teaching on Monday:\n"
        "• 08:30–10:00 Database Systems (BS(AI)-III, LT2)"
    )


def test_relaxed_check_allows_any_wording_but_never_busy_called_free():
    facts = ("👨‍🏫 Shahzad Rizwan is free on Monday 11:30–15:00.\nTeaching on Monday:\n"
             "• 08:30–10:00 Database Systems (BS(AI)-III, LT2)\n• 15:00–16:30 Networks (BS(SE)-III, LT4)")
    # Busy times described without the word "busy" are fine now.
    assert unsupported_details("He's free 11:30–15:00. Mornings he has Database Systems 08:30–10:00.", facts) == []
    # A free stretch may end exactly when a class starts.
    assert unsupported_details("You can meet him between 11:30 and 15:00; he is free 11:30–15:00.", facts) == []
    # Calling a busy slot free is still rejected.
    assert unsupported_details("He is free 08:30–10:00 and 11:30–15:00.", facts)


def test_invented_job_titles_are_rejected():
    assert unsupported_details("Shahzad Rizwan is a lecturer who teaches Networks.", "Shahzad Rizwan teaches Networks.")
    assert unsupported_details("He is the HOD.", "He teaches Networks.")
    assert unsupported_details("Dr. Muazzam Maqsood is the HOD.", "Dr. Muazzam Maqsood (HOD)") == []
