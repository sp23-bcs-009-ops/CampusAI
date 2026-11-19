"""Exam answers: 'exams are not being held', or the datesheet in Exam Mode.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

from typing import Any
import re

from timetable import timetable_lookup as tt

from chatbot.fixed_replies import EXAM_NOT_PUBLISHED
from chatbot.chat_memory import SessionMemory
from chatbot.question_checks import RoutedQuestion
from chatbot.record_answers import _readable_date


def _iso_day(value: str) -> str | None:
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", str(value or ""))
    return match.group(1) if match else None


def exam_answer(cls: str | None, question: str, mine: bool = False) -> str:
    """Exam datesheet for one class. In Exam Mode the published timetable holds exams by date."""
    tt.ensure_timetable()
    if tt.schedule_mode() != "exam":
        return EXAM_NOT_PUBLISHED
    if not cls:
        return "Which class's exams should I show? For example: BCS-1 or BS(SE)-III."
    rows = []
    for day, slots in (tt.TIMETABLE.get(cls) or {}).items():
        for slot, entries in (slots or {}).items():
            for entry in entries or []:
                rows.append({**entry, "day": day, "time": slot})
    if not rows:
        return f"I can't find any exams for {cls} in the published exam timetable."
    rows.sort(key=lambda row: (_iso_day(row["day"]) or str(row["day"]), tt._slot_start_minutes(row["time"])))
    today = tt.campus_now().date().isoformat()
    upcoming = [row for row in rows if (_iso_day(row["day"]) or today) >= today] or rows
    if re.search(r"\bnext\b", (question or "").lower()):
        row = upcoming[0]
        who = "Your next paper" if mine else f"The next paper for {cls}"
        room = str(row.get("room") or "").strip()
        sentence = f"{who} is {row.get('subject')} on {_readable_date(row['day'])} at {row['time'].replace('-', '–')}"
        return sentence + (f" in {room}." if room and room.upper() != "N/A" else ".")
    heading = f"📝 Your exams ({cls})" if mine else f"📝 Exams for {cls}"
    lines = [heading]
    for row in upcoming[:12]:
        room = str(row.get("room") or "").strip()
        line = f"• {_readable_date(row['day'])}, {row['time'].replace('-', '–')}  {row.get('subject')}"
        if room and room.upper() != "N/A":
            line += f" — {room}"
        lines.append(line)
    return "\n".join(lines)


def handle_exams(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    if rq.cls:
        memory.last_class = rq.cls
    return exam_answer(rq.cls, rq.question)
