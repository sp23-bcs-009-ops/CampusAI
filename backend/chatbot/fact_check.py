"""Safety net for AI-worded answers: every detail in the AI's reply must come from the facts.

The AI is given facts from Firestore (timetable, records) and asked to put them
into friendly words. Before that reply reaches the student, this file checks it.
If the reply mentions a time, number, class, room, teacher, subject or day that
is not in the facts (or the question), it is rejected and the bot sends the
plain fact text instead. Nothing here calls the AI or Firestore.
"""
from __future__ import annotations

import re

from timetable import timetable_lookup as tt
from timetable.class_name_normalizer import normalize_to_key

_TIME = re.compile(r"\b(\d{1,2})[:.](\d{2})\b")
_NUMBER = re.compile(r"(?<![\w:.])(\d+)(?![\w:])")
_CLASS_KEY = re.compile(r"\b[A-Z]{2,3}\([A-Z&]+\)-[IVX]+\b")
_SHORT_CLASS = re.compile(r"\b(B[A-Z]{1,4})[\s-]?(\d)\b")
_DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _flat(text: str) -> str:
    """Lowercase, one kind of dash, no spaces: '11:30 – 13:15' and '11:30-13:15' look the same."""
    text = (text or "").lower().replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", "", text)


def _times(text: str) -> set[str]:
    return {f"{int(h)}:{m}" for h, m in _TIME.findall(text or "")}


def _subjects() -> set[str]:
    names = set()
    for days in (tt.TIMETABLE or {}).values():
        for slots in (days or {}).values():
            for entries in (slots or {}).values():
                for entry in entries or []:
                    subject = str(entry.get("subject") or "").strip()
                    if len(subject) > 6:
                        names.add(subject)
    return names


def unsupported_details(reply: str, facts: str, question: str = "") -> list[str]:
    """Details in the reply that the facts don't contain. An empty list means the reply is safe."""
    allowed = f"{facts}\n{question}"
    flat_allowed = _flat(allowed)
    lower_allowed = allowed.lower()
    problems = []

    allowed_times = _times(allowed)
    problems += [t for t in _times(reply) if t not in allowed_times]

    # Numbers other than times and small counts (dates, years, phone numbers) must be in the facts.
    reply_no_times = _TIME.sub(" ", reply)
    allowed_numbers = set(_NUMBER.findall(_TIME.sub(" ", allowed)))
    problems += [n for n in _NUMBER.findall(reply_no_times) if int(n) > 10 and n not in allowed_numbers]

    problems += [c for c in _CLASS_KEY.findall(reply) if _flat(c) not in flat_allowed]
    for prefix, number in _SHORT_CLASS.findall(reply):
        key = normalize_to_key(f"{prefix}-{number}")
        if key and _flat(key) not in flat_allowed and _flat(f"{prefix}{number}") not in flat_allowed:
            problems.append(f"{prefix}-{number}")

    reply_flat = _flat(reply)
    for room in tt.ALL_ROOMS:
        room_flat = _flat(room)
        if any(ch.isdigit() for ch in room_flat) and room_flat in reply_flat and room_flat not in flat_allowed:
            problems.append(room)

    reply_lower = reply.lower()
    for teacher in tt.ALL_TEACHERS:
        if teacher.lower() in reply_lower and teacher.lower() not in lower_allowed:
            problems.append(teacher)
    for subject in _subjects():
        if subject.lower() in reply_lower and subject.lower() not in lower_allowed:
            problems.append(subject)

    problems += [d for d in _DAYS if re.search(rf"\b{d}\b", reply_lower) and d not in lower_allowed]

    # A busy time must not be passed off as free: if the reply names one, it must say it's busy.
    busy_times = set()
    for line in facts.splitlines():
        if line.strip().lower().startswith("busy:"):
            busy_times |= _times(line)
    busy_words = r"\b(busy|teach\w*|class(es)?|booked|occupied|not free|tied up|lectures?|labs?|sessions?|engaged)\b"
    if busy_times & _times(reply) and not re.search(busy_words, reply_lower):
        problems.append("busy time shown without saying busy")
    return problems
