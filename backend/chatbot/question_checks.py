"""Small checks on the question text (is it a greeting, which class, an exam question...), shared by every answer file.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
import re

from chatbot.off_topic_guard import has_campus_anchor
from timetable import timetable_lookup as tt
from timetable.class_name_normalizer import normalize_to_key

from chatbot.chat_memory import SessionMemory


_NOTIF_DEPT = {
    "CS": "cs",
    "SE": "se",
    "AI": "ai",
    "EE": "ee",
    "CE": "ce",
    "BA": "ba",
    "A&F": "a_f",
    "BDA": "bda",
    "ENGLISH": "english",
    "MATHS": "math",
}

_ROMAN_NUMBER = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}


def _record_kind(question: str) -> str | None:
    q = question.lower()
    if any(phrase in q for phrase in ("emergency", "announcement")):
        return "announcements"
    if ("lost" in q and "found" in q) or any(
        phrase in q for phrase in ("lost item", "found item")
    ) or re.search(
        r"\b(anyone|someone|somebody) (found|seen)\b|\bfound (a|an|my|any)\b|"
        r"\b(lost|misplaced) (my|a|an)\b|\bi lost\b",
        q,
    ):
        return "lostfound"
    if any(phrase in q for phrase in (
        "event", "seminar", "workshop", "campus news", "university news", "uni news"
    )):
        return "events"
    if any(phrase in q for phrase in ("notification", "class notice", "cancel class", "cancelled class")):
        return "notifications"
    directory = any(phrase in q for phrase in (
        "teacher directory", "faculty directory", "staff directory", "office",
    )) or re.search(r"\b(which|what) department (is|does)\b", q)
    timetableish = any(phrase in q for phrase in ("free", "busy", "available", "timetable", "schedule"))
    if directory and not timetableish:
        return "teachers"
    return None


def _notification_target(class_key: str | None) -> tuple[str | None, int | None]:
    if not class_key or "-" not in class_key:
        return None, None
    program, roman = class_key.rsplit("-", 1)
    if not (program.startswith("BS(") and program.endswith(")")):
        return None, None
    return _NOTIF_DEPT.get(program[3:-1].upper()), _ROMAN_NUMBER.get(roman.upper())


def _visible_class(class_key: str) -> str:
    mode = tt.schedule_mode()
    if mode == "exam":
        return f"{class_key} (exam timetable)"
    if mode == "holiday":
        return f"{class_key} (holiday mode — published timetable, classes not in session)"
    return class_key


@dataclass
class RoutedQuestion:
    intent: str
    question: str
    cls: Optional[str] = None
    teacher: Optional[str] = None
    room: Optional[str] = None
    slot_filter: Any = None
    time_label: Optional[str] = None


ROOMS_ALL_PHRASES = [
    "all rooms", "available rooms", "rooms are free", "rooms are empty",
    "room availability", "room usage", "lecture theaters", "lecture theatres",
    "free rooms", "empty rooms", "rooms free", "free room", "empty room",
    "free classroom", "empty classroom",
]


def _teacher_name_actually_mentioned(question: str, teacher: str) -> bool:
    """Verify a fuzzy teacher match: at least one real name token of the
    teacher must appear (fuzzily) in the question. Prevents generic words
    like 'are'/'classes' from matching 'Ms. Areeba'."""
    from rapidfuzz import fuzz

    q_tokens = [w for w in tt._words(question) if len(w) >= 4]
    name_tokens = [
        w for w in tt._words(teacher)
        if len(w) >= 4 and w not in {"miss", "maam", "madam", "visiting", "professor"}
    ]
    if not q_tokens or not name_tokens:
        return False
    return any(
        fuzz.ratio(qt, nt) >= 75
        for qt in q_tokens
        for nt in name_tokens
    )


_SMALLTALK = {
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "salam", "assalam", "assalamu alaikum", "how are you", "how are you doing",
    "thanks", "thank you", "thankyou", "thanks a lot", "thank you so much",
    "ok thanks", "okay thanks",
}


def _plain_words(question: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z\s]", "", (question or "").lower())).strip()


_SOCIAL_EXTRA = {
    "friend", "friends", "buddy", "there", "doing", "today", "bro", "dear",
    "please", "my", "how", "are", "you", "going", "whats", "up",
}


def _is_social(question: str) -> bool:
    """Greetings and thanks, including a few extra friendly words."""
    plain = _plain_words(question)
    if not plain:
        return False
    if plain in _SMALLTALK:
        return True
    if plain.startswith("how are you"):
        extra = set(plain.split()) - {"how", "are", "you", "doing"} - _SOCIAL_EXTRA
        return not extra and len(plain.split()) <= 8
    if plain.startswith(("hello", "hi", "hey", "good morning", "good afternoon", "good evening", "salam", "assalam")):
        extra = set(plain.split()) - {
            "hello", "hi", "hey", "good", "morning", "afternoon", "evening",
            "salam", "assalam", "assalamu", "alaikum",
        } - _SOCIAL_EXTRA
        return not extra and len(plain.split()) <= 8
    if plain.startswith("thank"):
        extra = set(plain.split()) - {"thank", "thanks", "you", "so", "much", "a", "lot", "ok", "okay"} - _SOCIAL_EXTRA
        return not extra
    return False


def _is_bot_identity(question: str) -> bool:
    text = (question or "").lower()
    return bool(re.search(
        r"\b(who are you|what are you|what can you help|what can you do|"
        r"introduce yourself|what do you do|who is campusai|what is campusai)\b",
        text,
    ))


def _class_key_from_text(question: str) -> str | None:
    """Resolve a class code without downloading the timetable."""
    words = re.findall(r"[A-Za-z0-9()&.+\-]+", question or "")
    for span_len in range(min(6, len(words)), 0, -1):
        for i in range(len(words) - span_len + 1):
            key = normalize_to_key(" ".join(words[i:i + span_len]))
            if key:
                return key
    return None


def _bare_day_followup(question: str) -> bool:
    if not tt.detect_day(question):
        return False
    words = re.findall(r"[a-z0-9]+", question.lower())
    glue = {
        "what", "about", "and", "on", "how", "the", "for", "please", "show",
        "me", "now", "then", "also", "same", "that", "this", "a", "of", "to",
        "do", "does", "is", "are", "my", "its", "it", "free", "busy",
        "available", "classes", "class", "schedule", "timetable", "slots",
        "slot", "today", "tomorrow", "week",
    }
    day_words = set(tt.DAY_MAP) | {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
    content = [word for word in words if word not in glue and word not in day_words]
    return not content and len(words) <= 6


def _previous_room_reference(q_lower: str) -> bool:
    return bool(re.search(r"\b(the|that|this|same) room\b", q_lower))


def _room_named_in_question(question: str, room: str | None) -> bool:
    if not room:
        return False
    needle = tt.normalize_room(room)
    return bool(needle) and needle in tt.normalize_room(question)


def _remembered_rooms(memory: SessionMemory) -> list[str]:
    rooms = [room for room in (memory.last_rooms or []) if room]
    if not rooms and memory.last_room:
        rooms = [memory.last_room]
    return list(dict.fromkeys(rooms))


def _class_teacher_followup(q_lower: str) -> bool:
    return bool(
        re.search(r"\b(that|this) class\b", q_lower)
        and re.search(r"\b(teacher|teaches|teaching|takes|take)\b", q_lower)
    )


_SCHEDULE_WORDS = re.compile(
    r"\b(class|classes|lecture|lectures|period|timetable|schedule|shedule|subjects?|labs?|rooms?|"
    r"teachers?|free|busy|first|last|next|anything|do i have)\b"
)


def _asks_for_schedule(q_lower: str) -> bool:
    """A schedule request names something to look up, not just a day ("I feel sad today")."""
    return bool(_SCHEDULE_WORDS.search(q_lower))


def _uses_previous_day(q_lower: str) -> bool:
    return bool(re.search(r"\b(then|that day|the same day)\b", q_lower))


def _has_university_signal(question: str) -> bool:
    """The question points at the campus: a campus word or a class code."""
    return has_campus_anchor(question) or _class_key_from_text(question) is not None


_EXAM_WORDS = re.compile(
    r"\b(exams?|examinations?|midterms?|mids|final exams?|finals|terminals?|sessionals?|"
    r"datesheets?|date sheets?|papers?|invigilation)\b"
)

# In Exam Mode, only questions that ask WHEN or WHAT the exams are go to the datesheet.
_EXAM_LOOKUP = re.compile(
    r"\b(when|what time|which day|dates?|datesheets?|date sheets?|schedule|timetable|upcoming|"
    r"next (exam|paper)|show|list|my exams|my papers)\b|\b(exams?|papers?|midterms?|finals) (for|of)\b"
)

# Only the user's own records ("my GPA"). "Minimum CGPA to avoid probation?" is a policy question.
_PRIVATE_RECORDS = re.compile(
    r"\bmy (c?gpa|attendance|roll (no|number)|registration (no|number)|reg (no|number)|"
    r"results?|marks|grades?|transcript|fee (challan|voucher)|challan)\b"
)

_FACILITY_WORDS = re.compile(
    r"\b(library|cafeteria|canteen|cafe|hostel|transport|bus|buses|mosque|masjid|gym|"
    r"medical|clinic|dispensary|bank|atm|parking|scholarships?|fees?|fee structure)\b"
)


def _is_exam_question(question: str) -> bool:
    """Any exam question while exams aren't on; in Exam Mode only datesheet questions."""
    q_lower = (question or "").lower()
    if not _EXAM_WORDS.search(q_lower):
        return False
    if tt.schedule_mode() != "exam":
        return True  # answered with EXAM_NOT_PUBLISHED
    return bool(_EXAM_LOOKUP.search(q_lower))


_HELP_PATTERN = re.compile(
    r"\b(what can you do|what can you help|how can you help|what can i ask|what do you do|"
    r"help me|your features|what are your features)\b|^\s*help\s*[?!.]*\s*$"
)


def _is_hello(question: str) -> bool:
    plain = _plain_words(question)
    return _is_social(question) and not plain.startswith(("thank", "ok thank", "okay thank", "how are you"))


_NOW_PATTERN = re.compile(r"\b(now|right now|currently|ongoing|current)\b")

_CLASS_WORDS = re.compile(r"\b(class|classes|lecture|lectures|period)\b")

_FREE_TIME_PATTERN = re.compile(
    r"\b(when am i free|am i free|my free (time|slots?|periods?)|free time|my gaps?|my breaks?|"
    r"gaps? between)\b"
)

_WHO_TEACHES = re.compile(
    r"\b(who (teaches|takes|is teaching)|teachers? (of|for))\b"
)


def _asks_own_schedule(q_lower: str) -> bool:
    return bool(re.search(r"\bmy\b", q_lower) and any(
        word in q_lower for word in ("schedule", "timetable", "classes", "class")
    ))


def _asks_role(q_lower: str) -> bool:
    return bool(re.search(r"\b(who am i|my role|my profile|what is my role|what's my role)\b", q_lower))
