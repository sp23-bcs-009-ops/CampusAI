"""Decides what kind of question it is (timetable, teacher, room, website, off-topic...).

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

import re

from chatbot.campus_question_check import is_comsats_question
from chatbot.off_topic_guard import has_campus_anchor, is_creative_request, off_topic_category
from data_sources.website_knowledge_reader import KnowledgePackUnavailable, pack_is_relevant
from timetable import timetable_lookup as tt

from chatbot.fixed_replies import _UNRELATED_NOTE
from chatbot.chat_memory import SessionMemory
from chatbot.question_checks import (
    _asks_for_schedule,
    _asks_own_schedule,
    _bare_day_followup,
    _class_key_from_text,
    _class_teacher_followup,
    _FACILITY_WORDS,
    _has_university_signal,
    _is_bot_identity,
    _is_exam_question,
    _is_social,
    _previous_room_reference,
    _PRIVATE_RECORDS,
    _record_kind,
    _remembered_rooms,
    _room_named_in_question,
    _teacher_name_actually_mentioned,
    ROOMS_ALL_PHRASES,
    RoutedQuestion,
)


def _clearly_unrelated(question: str) -> bool:
    """True only when the question asks for something outside the campus.

    A campus word or class code keeps the question,
    so "cricket match on campus" or "who teaches Physics?" still get answered.
    Jokes, poems and stories are declined even when they mention the campus.
    This does not download the timetable.
    """
    if _is_social(question) or _is_bot_identity(question):
        return False
    if is_creative_request(question):
        return True
    return off_topic_category(question) is not None and not _has_university_signal(question)


def _university_portion(question: str) -> str | None:
    """The university clauses of a mixed question. None when it is not mixed."""
    if off_topic_category(question) is None or not _has_university_signal(question):
        return None
    pieces = re.split(r"(?:,?\s+and\s+|\s*;\s+|\s+also\s+|\s+plus\s+|\?\s+)", question, flags=re.I)
    kept = []
    dropped = False
    for piece in pieces:
        text = piece.strip(" ?.,")
        if not text:
            continue
        if _clearly_unrelated(text):
            dropped = True
        elif _has_university_signal(text):
            kept.append(text)
    if not kept or not dropped:
        return None
    return ". ".join(kept)


def _with_unrelated_note(result: dict) -> dict:
    answer = result.get("answer")
    if isinstance(answer, dict):
        updated = dict(answer)
        updated["note"] = _UNRELATED_NOTE
        return {"answer": updated, "intent": result.get("intent")}
    return {
        "answer": str(answer).rstrip() + "\n\n" + _UNRELATED_NOTE,
        "intent": result.get("intent"),
    }


def route(question: str, memory: SessionMemory, identity: dict | None = None) -> RoutedQuestion:
    q_lower = question.lower()

    # Greetings and bare follow-ups have no campus records to look up.
    # Detecting a teacher or room would download the whole timetable first.
    if _is_social(question) or _is_bot_identity(question):
        return RoutedQuestion("general", question)
    if _is_exam_question(question):
        exam_cls = _class_key_from_text(question)
        if not exam_cls and memory.last_class and re.search(r"\b(this|that|same) class\b", q_lower):
            exam_cls = memory.last_class
        return RoutedQuestion("exams", question, cls=exam_cls)
    if _PRIVATE_RECORDS.search(q_lower):
        return RoutedQuestion("private_records", question)
    if _FACILITY_WORDS.search(q_lower) and not tt.detect_class(question):
        return RoutedQuestion("comsats_info", question)
    if _clearly_unrelated(question):
        return RoutedQuestion("off_topic", question)
    if _bare_day_followup(question) and not (memory.last_class or memory.last_teacher or memory.last_room):
        if identity and identity.get("type") == "student":
            from user_login.firebase_login_check import class_key_from_profile
            personal = class_key_from_profile(identity)
            tt.ensure_timetable()
            if personal and personal in tt.TIMETABLE:
                return RoutedQuestion("timetable", question, cls=personal)
        return RoutedQuestion("timetable", question)
    if _class_teacher_followup(q_lower):
        # Stay on the class. A later "what about Tuesday?" should not switch to a teacher.
        classes = []
        if memory.last_intent == "timetable" and memory.last_class:
            classes = [memory.last_class]
        elif memory.last_classes:
            classes = list(dict.fromkeys(memory.last_classes))
        elif memory.last_class:
            classes = [memory.last_class]
        chosen = classes[0] if len(classes) == 1 else None
        return RoutedQuestion("timetable", question, cls=chosen)
    record_kind = _record_kind(question)
    if record_kind in {"notifications", "events", "announcements", "lostfound"}:
        cls = _class_key_from_text(question) if record_kind == "notifications" else None
        return RoutedQuestion(record_kind, question, cls=cls)

    cls = tt.detect_class(question)
    teacher = tt.detect_teacher(question)
    room = tt.detect_room(question)
    slot_filter, time_label = tt._make_time_filter(question)

    # Reject fuzzy teacher false-positives (name never actually mentioned)
    if teacher and not _teacher_name_actually_mentioned(question, teacher):
        teacher = None

    # ── Follow-up resolution using entity memory ────────────────
    # "what about tuesday?" / "and on friday?" → reuse last entity.
    # A new name, room, or class code must not inherit the previous entity
    # just because detection failed.
    followup_words = re.findall(r"[a-z0-9]+", q_lower)
    followup_glue = {
        "what", "about", "and", "on", "how", "the", "for", "please", "show",
        "me", "now", "then", "also", "same", "that", "this", "a", "of", "to",
        "do", "does", "is", "are", "my", "its", "it", "free", "busy",
        "available", "classes", "class", "schedule", "timetable", "slots",
        "slot", "today", "tomorrow", "week",
    }
    day_words = set(tt.DAY_MAP) | {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
    followup_content = [word for word in followup_words if word not in followup_glue and word not in day_words]
    is_bare_followup = (
        not cls and not teacher and not room
        and tt.detect_day(question)
        and not followup_content
        and len(followup_words) <= 6
    )
    if is_bare_followup:
        if memory.last_intent == "teacher" and memory.last_teacher:
            teacher = memory.last_teacher
        elif memory.last_intent == "room" and memory.last_room:
            room = memory.last_room
        elif memory.last_intent == "timetable" and memory.last_class:
            cls = memory.last_class

    if not cls and memory.last_class and re.search(r"\b(this|that) class\b", q_lower):
        cls = memory.last_class

    from_profile = False
    if identity and not cls and _asks_own_schedule(q_lower):
        from user_login.firebase_login_check import class_key_from_profile, teacher_name_from_profile
        if identity.get("type") == "teacher":
            named = teacher_name_from_profile(identity)
            if named:
                teacher = named
                from_profile = True
        elif identity.get("type") == "student":
            personal = class_key_from_profile(identity)
            if personal and personal in tt.TIMETABLE:
                cls = personal
                from_profile = True

    # A signed-in student asking about classes without naming one means their own
    # class ("do I have class on Saturday?", "when is the first class tomorrow?").
    if (
        identity and identity.get("type") == "student" and not cls and not teacher and not room
        and not re.search(r"\brooms?\b|\bclassrooms?\b", q_lower)  # "free rooms now" is about rooms
        and _asks_for_schedule(q_lower)
    ):
        from user_login.firebase_login_check import class_key_from_profile
        personal = class_key_from_profile(identity)
        tt.ensure_timetable()
        if personal and personal in tt.TIMETABLE:
            cls = personal
            from_profile = True

    base = dict(cls=cls, teacher=teacher, room=room,
                slot_filter=slot_filter, time_label=time_label)

    # Guard against fuzzy teacher false-positives:
    # "What are BCS-1 classes on Monday?" must stay a timetable question even
    # if the fuzzy matcher accidentally grabs a teacher name from stray words.
    explicit_teacher_signal = bool(
        tt.re.search(r"\b(sir|maam|madam|teacher|professor|faculty|instructor|dr|mr|ms|miss)\b", q_lower)
        or any(p in q_lower for p in ["who teaches", "which teacher", "all teachers", "teacher schedule"])
    )
    if teacher and cls and not explicit_teacher_signal:
        teacher = None
        base["teacher"] = None

    # "is there a lab for BCS-1?" asks about lab meetings, not the room named Lab.
    if cls and room and str(room).strip().lower() in {"lab", "labs"} and not re.search(r"\blab\s*\d", q_lower):
        room = None
        base["room"] = None

    # "the room" is the room from this conversation, not a fuzzy match on the word room.
    if _previous_room_reference(q_lower) and not _room_named_in_question(question, room):
        remembered = _remembered_rooms(memory)
        room = remembered[0] if len(remembered) == 1 else None
        base["room"] = room

    record_kind = _record_kind(question)
    if record_kind:
        return RoutedQuestion(record_kind, question, **base)

    if any(phrase in q_lower for phrase in (
        "my semester", "don't know my semester", "do not know my semester", "not know my semester",
    )):
        return RoutedQuestion("general", question, **base)

    if is_comsats_question(question) and not cls and not room:
        return RoutedQuestion("comsats_info", question, **base)

    campus_lookup = (
        tt.is_teacher_intent(question, teacher)
        or tt.is_room_intent(question, room)
        or tt.timetable_question(question)
        or bool(teacher or room or cls)
    )
    if not campus_lookup:
        try:
            # A campus word is required, so "dog vs cat" can't match a record by chance.
            if has_campus_anchor(question) and pack_is_relevant(question):
                return RoutedQuestion("comsats_info", question, **base)
        except KnowledgePackUnavailable:
            pass

    # A verified profile answers "my schedule". Words such as "I am a teacher" do not.
    if from_profile and cls and identity and identity.get("type") == "student":
        base["cls"] = cls
        base["teacher"] = None
        return RoutedQuestion("timetable", question, **base)
    if from_profile and teacher and identity and identity.get("type") == "teacher":
        base["teacher"] = teacher
        return RoutedQuestion("teacher", question, **base)

    if tt.is_teacher_intent(question, teacher):
        return RoutedQuestion("teacher", question, **base)

    if any(p in q_lower for p in ROOMS_ALL_PHRASES):
        return RoutedQuestion("rooms_all", question, **base)

    if room:
        return RoutedQuestion("room", question, **base)

    generic_lab_for_class = (
        cls
        and re.search(r"\blabs?\b", q_lower)
        and not re.search(r"\blab\s*\d", q_lower)
        and "which room" not in q_lower
        and "room is used" not in q_lower
    )
    if tt.is_room_intent(question, room) and not generic_lab_for_class:
        return RoutedQuestion("room_unknown", question, **base)

    # Whole words only: "exams" must not match "ms", nor "address" match "dr".
    if not cls and re.search(
        r"\b(free|available|sir|teacher|professor|dr|mr|ms|miss)\b", q_lower
    ):
        return RoutedQuestion("teacher_secondary", question, **base)

    if tt.timetable_question(question) and (cls or _asks_for_schedule(q_lower)):
        return RoutedQuestion("timetable", question, **base)

    return RoutedQuestion("general", question, **base)
