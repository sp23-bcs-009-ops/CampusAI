"""Answers for a signed-in teacher about their own schedule.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

import re

from timetable import timetable_lookup as tt

from chatbot.chat_memory import SessionMemory
from chatbot.question_checks import _CLASS_WORDS, _FREE_TIME_PATTERN, _NOW_PATTERN
from chatbot.timetable_answers import _merge_slots


def _teacher_natural(question: str, identity: dict, memory: SessionMemory) -> tuple[str, str] | None:
    """Teacher-only answers from the verified profile. None keeps the normal route."""
    from user_login.firebase_login_check import teacher_name_from_profile

    q_lower = question.lower()
    if not re.search(r"\b(my|i|am|me)\b", q_lower):
        return None
    teacher = teacher_name_from_profile(identity)
    if not teacher:
        return None
    memory.last_teacher = teacher
    if re.search(r"\bnext class\b", q_lower):
        info = tt.find_next_teacher_class(teacher)
        if not info:
            return "I can't find an upcoming class for you in the current timetable.", "teacher"
        parts = []
        for meeting in info.get("classes") or []:
            room = str(meeting.get("room") or "").strip()
            parts.append(f"{meeting.get('subject')} for {meeting.get('class')}" + (f" in {room}" if room and room != "N/A" else ""))
        day = "today" if info["day"] == tt.today_name() else f"on {info['day']}"
        return f"Your next class is {'; '.join(parts)} {day} at {info['slot'].replace('-', '–')}.", "teacher"
    if _NOW_PATTERN.search(q_lower) and _CLASS_WORDS.search(q_lower):
        today = tt.today_name()
        busy = tt.get_teacher_availability(teacher, [today])[today]["busy"]
        minute = tt._current_minutes()
        for slot, infos in busy.items():
            if tt._slot_contains(slot, minute):
                info = infos[0]
                room = str(info.get("room") or "").strip()
                return (
                    f"Right now you're teaching {info.get('subject')} to {info.get('class')} ({slot.replace('-', '–')})"
                    + (f" in {room}." if room and room != "N/A" else "."),
                    "teacher",
                )
        return "You don't have a class right now.", "teacher"
    if _FREE_TIME_PATTERN.search(q_lower):
        day = (tt.detect_day(question) or [tt.today_name()])[0]
        data = tt.get_teacher_availability(teacher, [day])[day]
        if not data["busy"]:
            return f"You have no classes on {day}, so you're free all day.", "teacher"
        free = _merge_slots(list(data["free"]))
        if not free:
            return f"You're teaching in every slot on {day}.", "teacher"
        return f"On {day} you're free at " + ", ".join(free) + ".", "teacher"
    return None
