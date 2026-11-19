"""Phase 7: the AI says what is asked; code checks every name and answers with the tested code."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chatbot import answer_pipeline as pipeline
from chatbot.answer_pipeline import answer_question, get_session
from chatbot.fixed_replies import REFUSAL
from chatbot.question_understanding import parse_understanding, standard_question

STUDENT = {"type": "student", "dept": "cs", "semester": 1, "fullName": "Ali Khan", "email": "ali1@cuiatk.edu.pk"}


def ai_understands(monkeypatch, **fields):
    seen = []

    def run(message):
        seen.append(message)
        return "Sure:\n" + json.dumps({"intent": "", **fields})
    monkeypatch.setattr(pipeline, "_run_understanding_chain", run)
    return seen


def test_parse_reads_the_json_and_ignores_extra_text():
    assert parse_understanding('ok {"intent": "teacher_day", "teacher": "kamran", "day": "monday"} done')["day"] == "monday"
    assert parse_understanding("no json here") is None
    assert parse_understanding('{"teacher": "x"}') is None  # no intent


def test_standard_question_checks_names_against_the_timetable():
    assert standard_question({"intent": "teacher_day", "teacher": "kamran", "day": "monday"}) == \
        "is Mr. Kamran Ali free on Monday?"
    assert standard_question({"intent": "class_day", "class": "bcs 1", "day": "tuesday"}) == \
        "BS(CS)-I timetable on Tuesday"
    assert standard_question({"intent": "room_now", "room": "lt 4"}) == "is LT 4 free right now?"
    # Names that aren't in the timetable are never used.
    assert standard_question({"intent": "teacher_day", "teacher": "Professor Snape", "day": "monday"}) is None
    assert standard_question({"intent": "class_day", "class": "BS(XX)-IX"}) is None


def test_a_new_phrasing_is_answered_from_the_timetable(monkeypatch):
    seen = ai_understands(monkeypatch, intent="teacher_day", teacher="Kamran", day="monday")
    result = answer_question("could you check kamran's monday for me", session_id="u-1")
    assert seen and "Message: could you check kamran's monday for me" in seen[0]
    assert result["answer"]["type"] == "teacher_availability"
    assert result["answer"]["teacher"] == "Mr. Kamran Ali"
    # Memory keeps what the student typed, not the standard question.
    assert get_session("u-1").messages[-2].content == "could you check kamran's monday for me"


def test_he_uses_the_previous_teacher_given_to_the_ai(monkeypatch):
    session = "u-2"
    get_session(session).__init__()
    answer_question("who is kamran", session_id=session)
    seen = ai_understands(monkeypatch, intent="teacher_next", teacher="Mr. Kamran Ali")
    result = answer_question("and when does he teach next", session_id=session)
    assert "Previous: teacher=Mr. Kamran Ali" in seen[0]
    assert result["answer"]["type"] == "teacher_next_class"


def test_a_student_asking_about_their_own_day(monkeypatch):
    ai_understands(monkeypatch, intent="my_day", day="monday")
    result = answer_question("what's on for me monday", session_id="u-3", identity=STUDENT)
    assert result["answer"]["type"] == "schedule" and result["answer"]["class"].startswith("BS(CS)-I")


def test_unknown_names_fall_back_to_the_rules(monkeypatch):
    ai_understands(monkeypatch, intent="teacher_profile", teacher="Professor Snape")
    result = answer_question("who is professor snape", session_id="u-4")
    assert result["intent"] != "off_topic"  # the rules answered; no made-up teacher


def test_ai_off_topic_is_refused_but_not_when_the_campus_is_mentioned(monkeypatch):
    ai_understands(monkeypatch, intent="off_topic")
    assert answer_question("suggest a good phone", session_id="u-5")["answer"] == REFUSAL
    result = answer_question("is the campus library open?", session_id="u-6")
    assert result["answer"] != REFUSAL


def test_no_ai_call_for_greetings_exams_and_obvious_off_topic(monkeypatch):
    seen = ai_understands(monkeypatch, intent="chat")
    answer_question("hi", session_id="u-7")
    answer_question("when are the exams?", session_id="u-8")
    answer_question("tell me a joke", session_id="u-9")
    assert seen == []


def test_ai_limit_reached_uses_the_rules(monkeypatch):
    seen = ai_understands(monkeypatch, intent="teacher_profile", teacher="kamran")
    monkeypatch.setattr(pipeline.settings, "ai_calls_per_minute", 5)
    for _ in range(5):
        pipeline._AI_CALLS.append(pipeline.time.monotonic())
    result = answer_question("who is kamran", session_id="u-10")
    assert seen == []
    assert result["answer"]["type"] == "teacher_profile"  # the rules still answer correctly


def test_prompts_with_json_braces_build_a_working_chain():
    """The real chain must accept the UNDERSTAND_PROMPT's literal {"intent": ...} example."""
    from langchain_core.messages import AIMessage
    from langchain_core.language_models.fake_chat_models import FakeListChatModel
    from langchain_core.output_parsers import StrOutputParser

    from chatbot.ai_prompts import UNDERSTAND_PROMPT

    pipeline._build_chain.cache_clear()
    chain = pipeline._build_chain(UNDERSTAND_PROMPT)
    prompt = chain.first
    fake = prompt | FakeListChatModel(responses=['{"intent": "chat"}']) | StrOutputParser()
    assert fake.invoke({"input": "hi", "history": [AIMessage(content="hello")]}) == '{"intent": "chat"}'
    pipeline._build_chain.cache_clear()
