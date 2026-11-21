"""The AI understands the question; code checks it and turns it into a standard question.

    message ─► AI (UNDERSTAND_PROMPT) ─► {"intent": "teacher_day", "teacher": "rizwan", "day": "monday", ...}
            ─► standard_question()   ─► "is Shahzad Rizwan free on Monday?"
            ─► the tested answer code (timetable_answers, record_answers, ...) answers that

The AI only says WHAT is asked. Every teacher, class, room and day it returns is checked
against the Firestore timetable here; anything unknown makes standard_question() return
None, and the bot falls back to its rules with the original message. The AI never
supplies a fact that reaches the student.
"""
from __future__ import annotations

import json
import re

from timetable import timetable_lookup as tt
from timetable.class_name_normalizer import extract_class_from_sentence

DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def parse_understanding(reply: str) -> dict | None:
    """The first JSON object in the AI's reply, or None."""
    match = re.search(r"\{.*\}", reply or "", re.S)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("intent"), str):
        return None
    return {key: str(value or "").strip() for key, value in data.items()}


def _day(value: str) -> str | None:
    """'monday' → 'Monday'; 'today', 'tomorrow' and 'week' stay as words the answer code knows."""
    value = (value or "").strip().lower()
    if value in DAYS:
        return value.capitalize()
    if value in {"today", "tomorrow"}:
        return value
    if value in {"week", "whole week", "this week", "all week"}:
        return "week"
    return None


def _teacher(name: str) -> str | None:
    """The real timetable name for what the user typed. Several matches keep the typed name,
    so the answer code can ask "which one?". Unknown names return None."""
    if not name:
        return None
    matches = tt.teacher_word_matches(name)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return name
    return tt.detect_teacher(name)


def _class(name: str) -> str | None:
    return extract_class_from_sentence(name, list(tt.TIMETABLE)) if name else None


def _room(name: str) -> str | None:
    return tt.detect_room(name) if name else None


def _time(value: str) -> str:
    match = re.match(r"^(\d{1,2})(?::(\d{2}))?", (value or "").strip())
    if not match:
        return ""
    return f" at {int(match.group(1))}:{match.group(2) or '00'}"


def _on(day: str) -> str:
    if day == "week":
        return " for the whole week"
    if day in {"today", "tomorrow"}:
        return f" {day}"
    return f" on {day}"


def standard_question(u: dict) -> str | None:
    """A plain question the tested answer code understands, or None when anything doesn't check out."""
    intent = u.get("intent", "")
    day = _day(u.get("day", ""))

    if intent.startswith("teacher_"):
        teacher = _teacher(u.get("teacher", ""))
        if not teacher:
            return None
        if intent == "teacher_profile":
            return f"who is {teacher}"
        if intent == "teacher_now":
            return f"is {teacher} free now?"
        if intent == "teacher_next":
            return f"when is {teacher}'s next class?"
        if intent == "teacher_day":
            return f"is {teacher} free{_on(day or 'today')}?"
        return None

    if intent == "class_day":
        cls = _class(u.get("class", ""))
        return f"{cls} timetable{_on(day or 'today')}" if cls else None

    if intent in {"room_day", "room_now"}:
        room = _room(u.get("room", ""))
        if not room:
            return None
        return f"is {room} free right now?" if intent == "room_now" else f"is {room} free{_on(day or 'today')}?"

    if intent == "free_rooms":
        return f"which rooms are free{_time(u.get('time', ''))}{_on(day or 'today')}?"

    if intent == "my_day":
        return f"my classes{_on(day or 'today')}"
    if intent == "my_now":
        return "which class do I have right now?"
    if intent == "my_next":
        return "what is my next class?"
    if intent == "my_free_time":
        return f"when am I free{_on(day or 'today')}?"
    if intent == "my_teachers":
        return "who are my teachers?"
    if intent == "my_subjects":
        return "what subjects do I have?"
    if intent == "my_subject_teacher":
        subject = re.sub(r"[^A-Za-z0-9 &/().,-]", "", u.get("subject", "")).strip()
        return f"who is my {subject} teacher?" if subject else None

    if intent == "subject_teachers":
        subject = re.sub(r"[^A-Za-z0-9 &/().,-]", "", u.get("subject", "")).strip()
        if not subject:
            return None
        cls = _class(u.get("class", ""))
        return f"who teaches {subject} in {cls}?" if cls else f"who teaches {subject}?"

    if intent == "events":
        when = (u.get("when") or "").lower()
        when = when if when in {"today", "tomorrow", "this week", "this weekend", "next week"} else ""
        return f"any events {when}".strip() + "?"
    if intent == "lost_found":
        item = re.sub(r"[^A-Za-z0-9 -]", "", u.get("item", "")).strip()
        return f"has anyone found a {item}?" if item else "show lost and found items"
    if intent == "announcements":
        return "are there any emergency announcements?"
    if intent == "notifications":
        cls = _class(u.get("class", ""))
        return f"show notifications for {cls}" if cls else "any notifications for my class?"
    return None
