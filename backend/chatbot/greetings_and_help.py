"""Greetings, 'what can you do?' help, and 'who am I / my role' replies for each user type.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

from data_sources.firebase_reader import UniversityDataUnavailable
from timetable import timetable_lookup as tt

from chatbot.question_checks import _asks_own_schedule, _asks_role, _HELP_PATTERN, _is_hello
from chatbot.timetable_answers import _next_class_sentence
from chatbot.student_answers import _student_identity_sentence


_HELP_BY_ROLE = {
    "student": (
        "Here's what I can do for you:\n"
        "• Your timetable: \"my classes today\", \"my next class\", \"my class now\"\n"
        "• Free time: \"when am I free today?\"\n"
        "• Subjects and teachers: \"my subjects\", \"who teaches my PF?\"\n"
        "• Notices: \"my notifications\", \"announcements\"\n"
        "• Campus: any class, teacher or room, events, lost & found, and COMSATS information"
    ),
    "teacher": (
        "Here's what I can do for you:\n"
        "• Your schedule: \"my classes today\", \"my next class\", \"my class now\"\n"
        "• Your free slots: \"when am I free today?\"\n"
        "• Rooms: \"free rooms now\", \"is LT 4 free at 11:30?\"\n"
        "• Any class or teacher timetable, announcements, events and COMSATS information"
    ),
    "staff": (
        "Here's what I can do for you:\n"
        "• Rooms: \"free rooms now\", \"free rooms Monday at 10\", \"LT 4 schedule\"\n"
        "• Teachers: \"which teachers are free now?\", \"is Aamir Ali free today?\"\n"
        "• Any class timetable: \"BCS-1 Monday\"\n"
        "• Announcements, events, lost & found and COMSATS information"
    ),
    None: (
        "Here's what I can do for guests:\n"
        "• University information: admissions, departments, programs, fees, campus facilities\n"
        "Sign in with your university account for full access to timetables, teachers, rooms, "
        "events, notices and lost & found."
    ),
}


def _first_name(identity: dict) -> str:
    raw = str(identity.get("fullName") or identity.get("name") or "").strip()
    titles = {"mr", "mr.", "ms", "ms.", "mrs", "mrs.", "dr", "dr.", "sir", "miss", "madam", "prof", "prof."}
    words = [w for w in raw.split() if w.lower() not in titles]
    return words[0] if words else ""


def role_reply(question: str, identity: dict | None) -> str | None:
    """Greetings and help shaped for guest, student, teacher or staff. None keeps normal routing."""
    role = (identity or {}).get("type") if identity else None
    if role not in _HELP_BY_ROLE:
        role = None if not identity else role
    q_lower = (question or "").lower()
    if _HELP_PATTERN.search(q_lower):
        return _HELP_BY_ROLE.get(role, _HELP_BY_ROLE[None])
    if not identity or not _is_hello(question):
        return None
    name = _first_name(identity)
    hello = f"Hi {name}! 👋" if name else "Hi! 👋"
    try:
        if role == "student":
            from user_login.firebase_login_check import class_key_from_profile
            key = class_key_from_profile(identity)
            tt.ensure_timetable()
            if key and key in tt.TIMETABLE:
                nxt = _next_class_sentence(tt.find_next_class(key), "Your next class is")
                if nxt:
                    return f"{hello} {nxt} Ask me about your timetable, free time or campus news."
            return f"{hello} Ask me about your timetable, free time, teachers, rooms or campus news."
        if role == "teacher":
            from user_login.firebase_login_check import teacher_name_from_profile
            teacher = teacher_name_from_profile(identity)
            if teacher:
                info = tt.find_next_teacher_class(teacher)
                if info:
                    first = (info.get("classes") or [{}])[0]
                    nxt = _next_class_sentence(
                        {"subject": f"{first.get('subject') or 'a class'} ({first.get('class')})",
                         "day": info.get("day"), "time": info.get("slot"), "room": first.get("room")},
                        "Your next class is",
                    )
                    return f"{hello} {nxt} Ask me about your schedule, free slots or free rooms."
            return f"{hello} Ask me about your schedule, free slots, rooms or any class timetable."
        if role == "staff":
            return f"{hello} Ask me about free rooms, which teachers are free now, any class timetable or announcements."
    except UniversityDataUnavailable:
        return None
    return None


def personal_reply(question: str, identity: dict | None) -> str | None:
    """Use a verified profile for the caller's own role or timetable. None means keep normal routing."""
    q_lower = question.lower()
    if _asks_role(q_lower):
        if not identity:
            return "You are in guest mode, so there is no signed-in profile."
        role = identity.get("type")
        if role == "student":
            return _student_identity_sentence(identity)
        if role == "teacher":
            name = identity.get("fullName") or identity.get("name") or "a teacher"
            return f"You are signed in as a teacher ({name})."
        if role == "staff":
            return "You are signed in as staff."
        return "You are signed in, but I could not read a student, teacher, or staff profile."
    if not identity and _asks_own_schedule(q_lower) and not tt.detect_class(question):
        return (
            "Guest mode does not have a personal timetable. "
            "Sign in with your university account to see your own classes, "
            "or tell me the class, for example BCS-1."
        )
    if not identity or not _asks_own_schedule(q_lower):
        return None
    role = identity.get("type")
    if role == "staff":
        return (
            "Staff accounts do not have a personal class timetable. "
            "Tell me a class (for example BCS-1), a teacher, or ask \"free rooms now\"."
        )
    if role == "teacher":
        from user_login.firebase_login_check import teacher_name_from_profile
        if teacher_name_from_profile(identity):
            return None
        name = identity.get("fullName") or identity.get("name") or "that name"
        return (
            f"I could not find {name} in the current timetable, "
            "so I cannot show a personal schedule."
        )
    if role == "student":
        from user_login.firebase_login_check import class_key_from_profile
        tt.ensure_timetable()
        key = class_key_from_profile(identity)
        if key and key in tt.TIMETABLE:
            return None
        if key:
            return f"Your profile points to {key}, but that class is not in the current timetable."
        return (
            "Your student profile does not include a department and semester, "
            "so I cannot tell which timetable is yours."
        )
    return "I could not read a student, teacher, or staff profile for this signed-in account."
