"""Answers for a signed-in student about their own class: my classes, my subjects, my teachers...

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

from typing import Any
import re

from data_sources import firebase_reader as university_data
from data_sources.firebase_reader import UniversityDataUnavailable
from timetable import timetable_lookup as tt

from chatbot.chat_memory import SessionMemory
from chatbot.question_checks import (
    _class_key_from_text,
    _class_teacher_followup,
    _CLASS_WORDS,
    _FREE_TIME_PATTERN,
    _is_exam_question,
    _notification_target,
    _NOW_PATTERN,
    _WHO_TEACHES,
    RoutedQuestion,
)
from chatbot.record_answers import _readable_date
from chatbot.exam_answers import exam_answer
from chatbot.timetable_answers import (
    _base_subject,
    _combine_lab_names,
    _current_row,
    _display_base,
    _free_slots,
    _next_class_sentence,
    _ordinal_meeting_reply,
    _own_subject_rows,
    _row_slot,
    _slot_bounds,
    class_subject_teacher,
)


def _student_now(key: str, memory: SessionMemory) -> str:
    today = tt.today_name()
    rows = tt.get_schedule(key, today) or []
    row = _current_row(rows)
    if row:
        memory.last_class, memory.last_day = key, today
        memory.last_subjects = [str(row.get("subject") or "")]
        memory.last_room = row.get("room")
        memory.last_teacher = row.get("teacher")
        teacher = str(row.get("teacher") or "").strip()
        room = str(row.get("room") or "").strip()
        sentence = f"Right now you have {row.get('subject')} ({str(row.get('time')).replace('-', '–')})"
        if teacher and teacher != "N/A":
            sentence += f" with {teacher}"
        if room and room != "N/A":
            sentence += f" in {room}"
        return sentence + "."
    nxt = _next_class_sentence(tt.find_next_class(key), "Your next class is")
    return "You don't have a class right now." + (f" {nxt}" if nxt else "")


def _student_free_time(question: str, key: str) -> str:
    day = (tt.detect_day(question) or [tt.today_name()])[0]
    rows = tt.get_schedule(key, day) or []
    if not rows:
        return f"You have no classes on {day}, so the whole day is free."
    free = _free_slots([str(row.get("time") or "") for row in rows])
    if not free:
        return f"You have classes in every slot on {day}, so there's no free period."
    return f"On {day} you're free at " + ", ".join(free) + "."


def _shown_semester(semester) -> str:
    try:
        number = float(semester)
    except (TypeError, ValueError):
        return str(semester).strip()
    if number.is_integer():
        return str(int(number))
    return str(semester).strip()


def _student_identity_sentence(identity: dict) -> str:
    """Say only the profile fields that are actually stored."""
    name = str(identity.get("fullName") or identity.get("name") or "").strip()
    department = str(identity.get("department") or "").strip()
    dept = str(identity.get("dept") or "").strip()
    shown_dept = department or dept
    semester = identity.get("semester")
    has_semester = semester not in (None, "")
    shown_semester = _shown_semester(semester) if has_semester else ""
    if name:
        sentence = f"You are {name}, a student"
    else:
        sentence = "You are signed in as a student"
    if shown_dept:
        sentence += f" in {shown_dept}"
    if has_semester:
        sentence += f", semester {shown_semester}"
    sentence += "."
    from user_login.firebase_login_check import class_key_from_profile
    class_key = class_key_from_profile(identity)
    if class_key:
        sentence += f" Your class is {class_key}."
    if not shown_dept and not has_semester:
        sentence += " Your profile does not include a department or semester."
    elif not shown_dept:
        sentence += " Your profile does not include a department."
    elif not has_semester:
        sentence += " Your profile does not include a semester."
    return sentence


_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}


def _asked_calendar_date(question: str):
    """The date written in the question. Today is used only when no date is written."""
    from datetime import date

    q_lower = question.lower()
    iso = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", q_lower)
    if iso:
        try:
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        except ValueError:
            return None
    months = "|".join(_MONTHS)
    written = re.search(
        rf"\b({months})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,)?\s+(20\d{{2}})\b",
        q_lower,
    )
    if not written:
        written = re.search(
            rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({months})\s+(20\d{{2}})\b",
            q_lower,
        )
        if written:
            month = _MONTHS.get(written.group(2))
            day = int(written.group(1))
            year = int(written.group(3))
        else:
            month = day = year = None
    else:
        month = _MONTHS.get(written.group(1))
        day = int(written.group(2))
        year = int(written.group(3))
    if month:
        try:
            return date(year, month, day)
        except ValueError:
            return None
    if re.search(r"\btoday\b", q_lower):
        return tt.campus_now().date()
    return None


def _student_subject_count(identity: dict) -> str:
    from user_login.firebase_login_check import class_key_from_profile

    key = class_key_from_profile(identity)
    if not key:
        return (
            "I can't tell which class is yours from your profile. "
            "Tell me the class, for example BCS-1."
        )
    tt.ensure_timetable()
    if key not in tt.TIMETABLE:
        return f"Your profile points to {key}, but that class is not in the current timetable."
    subjects = []
    for row in tt.get_class_week_schedule(key):
        name = str(row.get("subject") or "").strip()
        if name and name not in subjects:
            subjects.append(name)
    listed = ", ".join(subjects) if subjects else "none listed"
    return (
        f"{key} has {len(subjects)} unique subjects in the currently published timetable"
        + (f": {listed}." if subjects else ".")
        + " That is this class group, not every course the university offers."
    )


def _student_compare_days(question: str, identity: dict) -> str | None:
    if not re.search(r"\bcompare\b", (question or "").lower()):
        return None
    days = [
        name.title()
        for name in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
        if re.search(rf"\b{name}\b", (question or "").lower())
    ]
    if len(days) < 2:
        return None
    from user_login.firebase_login_check import class_key_from_profile

    key = class_key_from_profile(identity)
    if not key:
        return "I can't tell which class is yours. Tell me the class, for example BCS-1."
    tt.ensure_timetable()
    if key not in tt.TIMETABLE:
        return f"Your profile points to {key}, but that class is not in the current timetable."
    parts = []
    for day in days:
        rows = tt.get_schedule(key, day) or []
        subjects = []
        for row in rows:
            name = str(row.get("subject") or "").strip()
            if name and name not in subjects:
                subjects.append(name)
        if not rows:
            parts.append(f"{day}: no published meetings")
        else:
            parts.append(f"{day}: {len(rows)} meeting(s) ({', '.join(subjects)})")
    return (
        f"I compared the published timetable for {key}. "
        + "; ".join(parts)
        + ". I cannot change the timetable."
    )


def _student_subjects(identity: dict) -> str:
    from user_login.firebase_login_check import class_key_from_profile

    key = class_key_from_profile(identity)
    if not key:
        return (
            "I can't tell which class is yours from your profile. "
            "Tell me the class, for example BCS-1."
        )
    tt.ensure_timetable()
    if key not in tt.TIMETABLE:
        return f"Your profile points to {key}, but that class is not in the current timetable."
    subjects = []
    for row in tt.get_class_week_schedule(key):
        name = str(row.get("subject") or "").strip()
        if name and name not in subjects:
            subjects.append(name)
    if not subjects:
        return f"The current timetable for {key} does not list any subjects."
    return f"📚 Your subjects ({key})\n" + "\n".join(f"• {name}" for name in _combine_lab_names(subjects))


def _own_class_key(identity: dict) -> str | None:
    from user_login.firebase_login_check import class_key_from_profile

    key = class_key_from_profile(identity)
    tt.ensure_timetable()
    return key if key and key in tt.TIMETABLE else None


def _student_subject_teacher(question: str, identity: dict) -> str | None:
    """'Who teaches my Discrete Structures?' answered from the student's own class only."""
    if not _WHO_TEACHES.search((question or "").lower()) or _class_key_from_text(question):
        return None
    key = _own_class_key(identity)
    return class_subject_teacher(question, key) if key else None


def _student_subject_meetings(question: str, identity: dict) -> str | None:
    """'When is my Discrete Structures class?', 'when is OOP lab', 'which room is my OOP lab'."""
    q_lower = (question or "").lower()
    if not re.search(r"\b(when|where|which room|what time|room)\b", q_lower):
        return None
    if re.search(r"\bnext class\b", q_lower) or _class_key_from_text(question):
        return None
    key = _own_class_key(identity)
    if not key:
        return None
    rows = _own_subject_rows(question, key)
    if not rows:
        return None
    rows = sorted(rows, key=lambda r: (
        tt.WEEK_DAYS.index(r["day"]) if r.get("day") in tt.WEEK_DAYS else 9,
        tt._slot_start_minutes(_row_slot(r).replace("–", "-")),
    ))
    subjects = list(dict.fromkeys(str(r.get("subject") or "") for r in rows))
    same_course = len({_base_subject(s) for s in subjects}) == 1
    title = _display_base(subjects[0]) if same_course and len(subjects) > 1 else " / ".join(subjects)
    lines = [f"📚 {title} — {key}"]
    for row in rows:
        room = str(row.get("room") or "").strip()
        teacher = str(row.get("teacher") or "").strip()
        details = [d for d in (room if room != "N/A" else "", teacher if teacher != "N/A" else "") if d]
        line = f"• {row.get('day')} {_row_slot(row)}"
        if details:
            line += " — " + ", ".join(details)
        if same_course and len(subjects) > 1 and "lab" in str(row.get("subject") or "").lower():
            line += " (lab)"
        lines.append(line)
    return "\n".join(lines)


def _student_day_summary(question: str, identity: dict) -> str | None:
    """First / last class, when the day ends, and how many classes on a day."""
    q_lower = (question or "").lower()
    first = re.search(r"\b(first|1st|start|starts|begin|begins)\b", q_lower)
    last = re.search(r"\b(last|end|ends|finish|finishes|over)\b", q_lower)
    count = re.search(r"\bhow many (classes|lectures)\b", q_lower)
    if not (first or last or count):
        return None
    if not (_CLASS_WORDS.search(q_lower) or re.search(r"\b(day|uni|university|campus)\b", q_lower)):
        return None
    if _class_key_from_text(question):
        return None
    key = _own_class_key(identity)
    if not key:
        return None
    day = (tt.detect_day(question) or [tt.today_name()])[0]
    rows = sorted(tt.get_schedule(key, day) or [], key=lambda r: tt._slot_start_minutes(r["time"]))
    if not rows:
        return f"You have no classes on {day}."
    if count:
        names = ", ".join(str(r.get("subject")) for r in rows)
        return f"You have {len(rows)} class{'es' if len(rows) != 1 else ''} on {day}: {names}."

    def where(row: dict) -> str:
        room = str(row.get("room") or "").strip()
        return f" in {room}" if room and room != "N/A" else ""

    if first and not last:
        row = rows[0]
        start = str(row["time"]).split("-", 1)[0]
        return f"On {day}, your first class is {row.get('subject')} at {start}{where(row)}."
    row = rows[-1]
    end = str(row["time"]).split("-", 1)[-1]
    return f"On {day}, your last class is {row.get('subject')}{where(row)}, ending at {end}."


def _student_my_teachers(question: str, identity: dict) -> Any:
    if not re.search(
        r"\b(my|our) (teachers|instructors|faculty|teacher list)\b|\bwho are my teachers\b",
        (question or "").lower(),
    ):
        return None
    key = _own_class_key(identity)
    if not key:
        return None
    return {"type": "class_teachers", "class": key, "teachers": tt.teachers_for_class(key)}


def _student_class_change(question: str, identity: dict) -> str | None:
    """'I am in BCS-4 now': the profile class wins; explain how to change it."""
    q_lower = (question or "").lower()
    if not re.search(r"\b(i am|i'm|im) (now )?(in|of|from)\b|\bmy class (is|changed)\b", q_lower):
        return None
    said = _class_key_from_text(question)
    key = _own_class_key(identity)
    if not said or not key or said == key:
        return None
    return (
        f"Your profile says you're in {key}, so questions about \"my\" classes use that class. "
        "If your class has changed, update your department and semester in My Profile. "
        f"You can still ask about {said} directly, for example \"{said} Monday\"."
    )


def _student_events(question: str) -> str | None:
    if not re.search(r"\b(events?|seminar|workshop)\b", question.lower()):
        return None
    asked = _asked_calendar_date(question)
    if asked is None:
        return None
    try:
        records = university_data.firebase_records("events")
    except UniversityDataUnavailable as exc:
        return str(exc)
    matched = [
        record for record in records
        if str(record.get("date") or "")[:10] == asked.isoformat()
    ]
    label = asked.strftime("%B") + f" {asked.day}, {asked.year}"
    if not matched:
        return f"I checked the published events and nothing is listed on {label}."
    lines = [f"Published events on {label}:"]
    for record in matched[:10]:
        title = str(record.get("title") or "Untitled event").strip()
        when = str(record.get("time") or "").strip()
        venue = str(record.get("venue") or "").strip()
        detail = title
        if when:
            detail += f" at {when}"
        if venue:
            detail += f", {venue}"
        lines.append(detail + ".")
    return " ".join(lines)


_MY_SUBJECT_TEACHER = re.compile(r"\bmy ([a-z0-9 .&()/,-]+?) (teacher|sir|madam|maam|instructor)\b")


def _student_named_teacher(question: str, identity: dict, memory: SessionMemory):
    """'who is my OOP teacher?' → the teacher of that subject in the student's own class.
    With "free / now / where / busy" it checks that teacher's slots instead."""
    match = _MY_SUBJECT_TEACHER.search((question or "").lower())
    key = _own_class_key(identity) if match else None
    if not key:
        return None
    rows = _own_subject_rows(match.group(1), key)
    teachers = list(dict.fromkeys(str(r.get("teacher") or "").strip() for r in rows if r.get("teacher")))
    if not teachers:
        return None
    subject = _display_base(str(rows[0].get("subject") or match.group(1)))
    if len(teachers) > 1:
        return f"Your {subject} has more than one teacher: {', '.join(teachers)}. Which one do you mean?", "teacher"
    teacher = teachers[0]
    memory.last_teacher = teacher
    if re.search(r"\b(free|now|where|busy|available)\b", question.lower()):
        from chatbot.timetable_answers import handle_teacher

        # "is my DS teacher free now?" → "is Mehreen Wahab free now?" ("teacher" would read as "teach").
        asked = _MY_SUBJECT_TEACHER.sub(teacher, question.lower())
        slot_filter, time_label = tt._make_time_filter(asked)
        rq = RoutedQuestion("teacher", asked, teacher=teacher, slot_filter=slot_filter, time_label=time_label)
        return handle_teacher(rq, memory), "teacher"
    return f"Your {subject} teacher is {teacher}.", "teacher"


def _student_natural(question: str, identity: dict, memory: SessionMemory) -> tuple[str, str] | None:
    """Student-only answers from the verified profile. None keeps the normal route."""
    q_lower = question.lower()
    personal = bool(re.search(r"\b(my|i|i'm|im|me)\b", q_lower))
    asks_other_class = _class_key_from_text(question) is not None
    if _is_exam_question(question) and not asks_other_class:
        from user_login.firebase_login_check import class_key_from_profile
        return exam_answer(class_key_from_profile(identity), question, mine=True), "exams"
    now_class = bool(_NOW_PATTERN.search(q_lower) and _CLASS_WORDS.search(q_lower))
    named_teacher = _student_named_teacher(question, identity, memory)
    if named_teacher is not None:
        return named_teacher
    if not asks_other_class and (
        (personal and _FREE_TIME_PATTERN.search(q_lower)) or now_class
    ):
        from user_login.firebase_login_check import class_key_from_profile
        key = class_key_from_profile(identity)
        tt.ensure_timetable()
        if not key or key not in tt.TIMETABLE:
            return "I can't tell which class is yours. Tell me the class, for example BCS-1.", "general"
        if _FREE_TIME_PATTERN.search(q_lower):
            return _student_free_time(question, key), "timetable"
        return _student_now(key, memory), "timetable"
    if (
        re.search(r"\bsemester\b", q_lower)
        and re.search(r"\b(my|i|i'm|im)\b", q_lower)
        and not _class_key_from_text(question)
        and not re.search(r"\b(subjects?|courses?|timetable|schedule|classes)\b", q_lower)
    ):
        semester = identity.get("semester")
        if semester in (None, ""):
            return "Your profile does not include a semester, so I can't say which semester you are in.", "general"
        return f"You are in semester {_shown_semester(semester)}.", "general"
    if re.search(r"\bmy name\b", q_lower):
        name = str(identity.get("fullName") or identity.get("name") or "").strip()
        if not name:
            return "Your profile does not include a name.", "general"
        return f"Your name is {name}.", "general"
    if re.search(r"\b(department|program)\b", q_lower) and re.search(r"\b(my|i|i'm|im)\b", q_lower) and not _class_key_from_text(question):
        department = str(identity.get("department") or identity.get("dept") or "").strip()
        if not department:
            return "Your profile does not include a department.", "general"
        return f"You are in {department}.", "general"
    notices = _student_notices(question, identity)
    if notices is not None:
        return notices
    compared = _student_compare_days(question, identity)
    if compared is not None:
        return compared, "timetable"
    for helper in (_student_class_change, _student_my_teachers, _student_day_summary,
                   _student_subject_teacher, _student_subject_meetings):
        found = helper(question, identity)
        if found is not None:
            return found, "timetable"
    if re.search(r"\b(subjects|courses)\b", q_lower) and re.search(r"\b(my|i|i'm|im|studying)\b", q_lower):
        if re.search(r"\b(how many|number of|count)\b", q_lower):
            return _student_subject_count(identity), "catalog"
        return _student_subjects(identity), "general"
    events = _student_events(question)
    if events is not None:
        return events, "events"
    if re.search(r"\bnext class\b", q_lower):
        from user_login.firebase_login_check import class_key_from_profile
        key = class_key_from_profile(identity)
        if not key:
            return "I can't tell which class is yours. Tell me the class, for example BCS-1.", "general"
        tt.ensure_timetable()
        if key not in tt.TIMETABLE:
            return f"Your profile points to {key}, but that class is not in the current timetable.", "general"
        info = tt.find_next_class(key)
        memory.last_class = key
        memory.last_intent = "timetable"
        if not info:
            return f"I can't find an upcoming class for {key} in the current timetable.", "timetable"
        memory.last_teacher = info.get("teacher")
        memory.last_day = info.get("day")
        memory.last_room = info.get("room")
        subject = str(info.get("subject") or "a class")
        memory.last_subjects = [subject]
        when = str(info.get("time") or "").strip().replace("-", "–")
        teacher = str(info.get("teacher") or "").strip()
        room = str(info.get("room") or "").strip()
        day = "today" if info.get("day") == tt.today_name() else f"on {info.get('day')}"
        sentence = f"Your next class is {subject} {day}"
        if when:
            sentence += f" at {when}"
        if teacher:
            sentence += f" with {teacher}"
        if room:
            sentence += f" in {room}"
        return sentence + ".", "timetable"
    if re.search(r"\b(clash\w*|overlap\w*|same time|two classes at the same time|conflict\w*)\b", q_lower):
        return _student_timetable_overlaps(identity), "timetable"
    if re.search(r"\b(where is it|which room is that|where is that class)\b", q_lower) and memory.last_room:
        return f"That class is in {memory.last_room}.", "timetable"
    if _class_teacher_followup(q_lower) and memory.last_teacher and memory.last_subjects:
        subject = memory.last_subjects[0]
        sentence = f"{memory.last_teacher} teaches {subject}"
        if memory.last_day:
            sentence += f" on {memory.last_day}"
        if memory.last_room:
            sentence += f" in {memory.last_room}"
        return sentence + ".", "timetable"
    ordinal = _ordinal_meeting_reply(question, memory)
    if ordinal is not None:
        return ordinal, "timetable"
    return None


def _student_timetable_overlaps(identity: dict) -> str:
    from user_login.firebase_login_check import class_key_from_profile

    key = class_key_from_profile(identity)
    if not key:
        return "I can't tell which class is yours. Tell me the class, for example BCS-1."
    tt.ensure_timetable()
    if key not in tt.TIMETABLE:
        return f"Your profile points to {key}, but that class is not in the current timetable."
    clashes = []
    week = tt.TIMETABLE.get(key) or {}
    for day, slots in week.items():
        meetings = []
        for slot, rows in (slots or {}).items():
            bounds = _slot_bounds(slot)
            if not bounds:
                continue
            for row in rows or []:
                meetings.append((bounds, row, slot))
        for i, (left, row_a, slot_a) in enumerate(meetings):
            for right, row_b, slot_b in meetings[i + 1:]:
                if left[0] < right[1] and right[0] < left[1]:
                    clashes.append(
                        f"{day}: {row_a.get('subject')} ({slot_a}) overlaps "
                        f"{row_b.get('subject')} ({slot_b})."
                    )
    if not clashes:
        return f"The published timetable for {key} does not show overlapping classes."
    return (
        f"I compared the published meetings for {key}. Overlaps: "
        + " ".join(clashes)
        + " I cannot change the timetable. Ask the department office about the published slots."
    )


def _student_notices(question: str, identity: dict) -> tuple[str, str] | None:
    """Short announcement and notification answers. None leaves the normal route."""
    q_lower = question.lower()
    wants_announcements = bool(re.search(r"\bannouncements?\b", q_lower))
    wants_notifications = bool(re.search(r"\b(notifications?|notices?)\b", q_lower))
    if not wants_announcements and not wants_notifications:
        return None

    def line(record: dict) -> str:
        title = str(record.get("title") or "Untitled").strip()
        priority = str(record.get("priority") or "").strip()
        when = _readable_date(record.get("date") or record.get("createdAt"))
        text = title
        if priority:
            text += f", priority {priority}"
        if when:
            text += f", {when}"
        return text

    lines = []
    try:
        if wants_announcements:
            records = university_data.firebase_records("announcements")
            if not records:
                lines.append("There are no published announcements.")
            else:
                shown = [line(record) for record in records[:8]]
                lines.append("Published announcements: " + "; ".join(shown) + ".")
        if wants_notifications:
            from user_login.firebase_login_check import class_key_from_profile
            key = class_key_from_profile(identity)
            dept, semester = _notification_target(key) if key else (None, None)
            if not key or dept is None or semester is None:
                lines.append(
                    "I can't tell which class your notifications belong to. "
                    "Tell me the class, for example BCS-1."
                )
            else:
                records = university_data.firebase_records("notifications", dept=dept, semester=semester)
                if not records:
                    lines.append(f"There are no published notifications for {key}.")
                else:
                    shown = [line(record) for record in records[:8]]
                    lines.append(f"Published notifications for {key}: " + "; ".join(shown) + ".")
    except UniversityDataUnavailable as exc:
        return str(exc), "unavailable"
    if wants_announcements and wants_notifications:
        intent = "general"
    elif wants_announcements:
        intent = "announcements"
    else:
        intent = "notifications"
    return " ".join(lines), intent
