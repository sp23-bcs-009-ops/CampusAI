"""normalizer.py is retained for class-token spans only; raw questions stay intact."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from normalizer import extract_class_from_sentence, normalize_to_key
from pipeline import answer_question, route, SessionMemory


KNOWN = ["BS(CS)-I", "BS(CS)-II", "BS(SE)-III", "BA(BA)-VII"]


def test_class_aliases_map_to_timetable_keys():
    assert normalize_to_key("BCS-1") == "BS(CS)-I"
    assert normalize_to_key("CS 2") == "BS(CS)-II"
    assert extract_class_from_sentence("What are BCS-1 classes on Monday?", KNOWN) == "BS(CS)-I"


def test_raw_greeting_is_not_rewritten_by_class_normalization():
    question = "How are you, my friend?"
    assert normalize_to_key(question) is None
    assert extract_class_from_sentence(question, KNOWN) is None
    result = answer_question(question, session_id="norm-hello")
    assert result["intent"] == "general"
    assert "well" in result["answer"].lower() or "hello" in result["answer"].lower()


def test_router_keeps_the_raw_question_text():
    raw = "What are BCS-1 classes on Monday?"
    routed = route(raw, SessionMemory())
    assert routed.question == raw
    assert routed.intent == "timetable"
