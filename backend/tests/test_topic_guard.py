"""The off-topic guard blocks unrelated requests and lets campus questions through."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chatbot import answer_pipeline as pipeline
from data_sources import firebase_reader as university_data
from chatbot.answer_pipeline import REFUSAL, answer_question
from chatbot.fixed_replies import _UNRELATED_NOTE

CAMPUS_QUESTIONS = [
    "Where is the location of CR 2?",
    "Is there any cricket match on campus this week?",
    "Explain the admission process",
    "Tell me about the computer science department",
    "Who teaches Physics to BCS-1?",
    "Is the programming lab free on Monday?",
    "When is Programming Fundamentals on Monday?",
    "What is the fee structure?",
    "Which teacher has a PhD in the CS department?",
    "Can my family attend the convocation?",
    "Is there a music society on campus?",
    "Show me the timetable for BCS-1",
    "Is Dr. Test free on Monday?",
    "Where is the library?",
    "What is the history of COMSATS Attock?",
    "Who is the HOD of computer science?",
    "I lost my calculator in LT 4",
    "Any news from the university?",
    "Explain my schedule for Monday",
    "What is a credit hour in my semester?",
    "good morning",
    "what can you do?",
]

# Obvious unrelated requests: code blocks them instantly, without the model.
UNRELATED_QUESTIONS = [
    "tell me a movie name",
    "suggest a good movie to watch",
    "recommend some songs",
    "who won the cricket world cup?",
    "what's the weather today?",
    "tell me a joke",
    "write a poem about love",
    "what is the capital of France?",
    "who is the prime minister of Pakistan?",
    "let's play a game",
    "latest netflix series",
    "tell me a story",
]

# Less obvious unrelated requests: the model reads them and declines (hybrid guard).
MODEL_DECIDES_QUESTIONS = [
    "give me a recipe for biryani",
    "what is the difference between a dog and a cat?",
    "explain quantum physics",
    "write python code to reverse a string",
    "write a program in java to add two numbers",
    "what is the bitcoin price?",
    "translate hello into French",
    "how can I lose weight?",
    "best phone under 50000",
]


@pytest.fixture
def model_calls(monkeypatch):
    calls = []

    def fake_chain(system_prompt, user_input, memory):
        calls.append(user_input)
        return "campus answer from records"

    monkeypatch.setattr(pipeline, "_run_chain", fake_chain)
    monkeypatch.setattr(university_data, "firebase_records", lambda *a, **k: [])
    return calls


@pytest.mark.parametrize("question", CAMPUS_QUESTIONS)
def test_campus_questions_are_not_blocked(question, model_calls):
    result = answer_question(question, session_id=f"guard-ok-{question[:20]}")
    assert result["intent"] != "off_topic", question
    assert result["answer"] != REFUSAL, question


@pytest.mark.parametrize("question", UNRELATED_QUESTIONS)
def test_unrelated_questions_are_blocked_without_the_model(question, model_calls):
    result = answer_question(question, session_id=f"guard-no-{question[:20]}")
    assert result["intent"] == "off_topic", question
    assert result["answer"] == REFUSAL
    assert model_calls == []


@pytest.mark.parametrize("question", MODEL_DECIDES_QUESTIONS)
def test_less_obvious_unrelated_questions_go_to_the_model(question, model_calls, monkeypatch):
    monkeypatch.setattr(
        pipeline, "_run_general_chain",
        lambda q, memory: model_calls.append(q) or "I only help with campus matters.",
    )
    result = answer_question(question, session_id=f"guard-model-{question[:20]}")
    assert result["intent"] != "off_topic", question
    assert model_calls, question


def test_mixed_question_answers_only_the_campus_part(model_calls):
    result = answer_question(
        "Show me the timetable for BCS-1 and tell me a movie name",
        session_id="guard-mixed",
    )
    assert result["intent"] != "off_topic"
    assert _UNRELATED_NOTE in str(result["answer"]) or result["answer"].get("note") == _UNRELATED_NOTE


def test_unclear_question_gets_help_not_a_refusal(model_calls):
    result = answer_question("hmm can you help me with something", session_id="guard-unclear")
    assert result["answer"] != REFUSAL
