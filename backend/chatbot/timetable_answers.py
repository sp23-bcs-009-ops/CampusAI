"""Timetable, teacher and room answers from the Firestore timetable (no AI).

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

from typing import Any
import re

from timetable import timetable_lookup as tt

from chatbot.chat_memory import SessionMemory
from chatbot.question_checks import (
    _class_teacher_followup,
    _NOW_PATTERN,
    _previous_room_reference,
    _remembered_rooms,
    _uses_previous_day,
    _visible_class,
    RoutedQuestion,
)


def _subject_followup(question: str, memory: SessionMemory) -> Any:
    if not memory.last_subjects or not re.search(r"\b(that|this|the) subject\b", question.lower()):
        return None
    subjects = list(dict.fromkeys(memory.last_subjects))
    if len(subjects) > 1:
        return (
            "Which subject do you mean? I can check "
            + ", ".join(subjects)
            + "."
        )
    matches = tt.classes_for_subject(subjects[0])
    if not matches:
        return f"I could not find a teacher for {subjects[0]} in the current timetable."
    return {"type": "subject_teachers", "matches": matches}


def handle_teacher(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    teacher, cls, slot_filter = rq.teacher, rq.cls, rq.slot_filter
    subject_answer = _subject_followup(question, memory)
    if subject_answer is not None:
        return subject_answer

    if teacher is None:
        ambiguous = tt.teacher_name_candidates(question)
        if len(ambiguous) > 1:
            return {
                "type": "teacher_ambiguous",
                "message": "I found more than one matching teacher. Please ask with the full name.",
                "matches": ambiguous,
            }

    if cls and ("all teachers" in q_lower or "teachers teaching" in q_lower):
        return {"type": "class_teachers", "class": cls, "teachers": tt.teachers_for_class(cls)}

    if "which teacher" in q_lower and ("free right now" in q_lower or "free now" in q_lower):
        return {"type": "teachers_free_now", **tt.get_teachers_free_now()}

    if "who teaches" in q_lower:
        results = tt.classes_for_subject(question)
        if results:
            return {"type": "subject_teachers", "matches": results}

    if not teacher:
        if "teacher schedule" in q_lower and tt.detect_day(question):
            text = "Please mention a teacher name, for example: 'Show schedule of Sir Kamran on Monday'."
        elif "now" in q_lower or "current" in q_lower or "who" in q_lower or "which" in q_lower:
            text = "There are many teachers in the timetable. Please ask by name so I can check exact free/busy slots.\n"
        else:
            text = "I couldn't find a teacher matching that name in the timetable.\n"
        sample = sorted(tt.ALL_TEACHERS)[:8]
        text += "\nExamples of valid names:\n" + ", ".join(sample)
        text += f"\n\nTry asking: 'Is {sample[0]} free on Monday?'"
        return text

    memory.last_teacher = teacher

    if "next class" in q_lower:
        return {"type": "teacher_next_class", "teacher": teacher,
                "class_info": tt.find_next_teacher_class(teacher)}

    days_list = tt.detect_day(question)
    asks_teaching = any(p in q_lower for p in [
        "classes does", "classes taken", "have classes", "does ", " teach", "teaches", "taken by"
    ])
    if asks_teaching:
        return {
            "type": "teacher_classes",
            "teacher": teacher,
            "classes": tt.get_teacher_classes(teacher, days_list or tt.WEEK_DAYS, slot_filter),
        }

    if not days_list and _NOW_PATTERN.search(q_lower):
        # "Is Mehreen Wahab free now?" → a yes/no for the current slot, not a week card.
        today = tt.today_name()
        busy = tt.get_teacher_availability(teacher, [today])[today]["busy"]
        minute = tt._current_minutes()
        for slot, infos in busy.items():
            if tt._slot_contains(slot, minute):
                info = infos[0]
                room = str(info.get("room") or "").strip()
                return (
                    f"No, {teacher} is teaching right now: {info.get('subject')} for {info.get('class')} "
                    f"({slot.replace('-', '–')})" + (f" in {room}." if room and room != "N/A" else ".")
                )
        upcoming = sorted(
            (slot for slot in busy if tt._slot_start_minutes(slot) > minute), key=tt._slot_start_minutes
        )
        text = f"Yes, {teacher} has no class right now."
        if upcoming:
            text += f" Their next class today is at {upcoming[0].replace('-', '–')}."
        else:
            text += " They have no more classes today."
        return text

    if not days_list:
        days_list = (
            tt.WEEK_DAYS
            if any(p in q_lower for p in ["week", "all classes", "schedule", "busy", "available", "free"])
            else [tt.today_name()]
        )

    avail = tt.get_teacher_availability(teacher, days_list)
    days_data = []
    for d, data in avail.items():
        busy_list = []
        for slot, infos in sorted(data["busy"].items(), key=lambda x: tt._slot_start_minutes(x[0])):
            if slot_filter and not slot_filter(slot):
                continue
            busy_list.append({
                "slot": slot,
                "classes": [i["class"] for i in infos],
                "subjects": [i.get("subject", "") for i in infos],
                "rooms": [i.get("room", "N/A") for i in infos],
            })
        free_slots = [s for s in data["free"] if not slot_filter or slot_filter(s)]
        days_data.append({"day": d, "free": free_slots, "busy": busy_list})

    if len(days_data) == 1:
        memory.last_day = days_data[0]["day"]
        rooms = []
        classes = []
        for block in days_data[0]["busy"]:
            for room_name in block.get("rooms") or []:
                if room_name and room_name != "N/A" and room_name not in rooms:
                    rooms.append(room_name)
            for class_name in block.get("classes") or []:
                if class_name and class_name not in classes:
                    classes.append(class_name)
        memory.last_rooms = rooms
        memory.last_room = rooms[0] if len(rooms) == 1 else None
        memory.last_classes = classes

    return {"type": "teacher_availability", "teacher": teacher, "days": days_data}


def handle_rooms_all(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    days_list = tt.detect_day(question) or (
        [tt.today_name()] if "today" in q_lower or "now" in q_lower else tt.WEEK_DAYS
    )
    active_filter = rq.slot_filter or (lambda slot: True)
    want_busy = any(w in q_lower for w in ["schedule", "usage", "occupied", "busy"])
    rooms = tt.all_rooms_at(days_list, active_filter, want_free=not want_busy)
    if "lecture theater" in q_lower or "lecture theatre" in q_lower:
        rooms = [r for r in rooms if r["room"].startswith("LT ")]
    return {
        "type": "rooms_schedule" if want_busy else "rooms_free",
        "days": days_list,
        "rooms": rooms,
    }


def handle_room(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    room, slot_filter = rq.room, rq.slot_filter
    memory.last_room = room
    memory.last_rooms = [room]

    days_list = tt.detect_day(question)
    if (not days_list or days_list == [tt.today_name()]) and _NOW_PATTERN.search(q_lower):
        # "Is LT 4 free now?" → a yes/no for the current slot, like teachers.
        today = tt.today_name()
        busy = tt.get_room_availability(room, [today])[today]["busy"]
        minute = tt._current_minutes()
        for slot, infos in busy.items():
            if tt._slot_contains(slot, minute):
                info = infos[0]
                return (
                    f"No, {room} is in use right now: {info.get('subject')} for {info.get('class')} "
                    f"({slot.replace('-', '–')})."
                )
        upcoming = sorted((s for s in busy if tt._slot_start_minutes(s) > minute), key=tt._slot_start_minutes)
        text = f"Yes, {room} is free right now."
        if upcoming:
            text += f" It's next booked at {upcoming[0].replace('-', '–')}."
        else:
            text += " It has no more classes today."
        return text
    if not days_list and _uses_previous_day(q_lower):
        if not memory.last_day:
            return "Which day should I check?"
        days_list = [memory.last_day]
    if not days_list:
        days_list = [tt.today_name()] if any(
            p in q_lower for p in ["today", "now", "right now"]
        ) else tt.WEEK_DAYS
    if len(days_list) == 1:
        memory.last_day = days_list[0]

    avail = tt.get_room_availability(room, days_list)
    days_data = []
    for d, data in avail.items():
        busy_list = []
        for slot, infos in sorted(data["busy"].items(), key=lambda x: tt._slot_start_minutes(x[0])):
            if slot_filter and not slot_filter(slot):
                continue
            busy_list.append({
                "slot": slot,
                "classes": [i["class"] for i in infos],
                "subjects": [i.get("subject", "") for i in infos],
                "teachers": [i.get("teacher", "N/A") for i in infos],
            })
        free_slots = [s for s in data["free"] if not slot_filter or slot_filter(s)]
        days_data.append({"day": d, "free": free_slots, "busy": busy_list})

    return {"type": "room_availability", "room": room, "days": days_data}


def handle_room_unknown(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    q_lower = rq.question.lower()
    if _previous_room_reference(q_lower):
        remembered = _remembered_rooms(memory)
        if len(remembered) > 1:
            return "Which room do you mean? The last answer used " + ", ".join(remembered) + "."
        return "Which room should I check? Name one, for example LT 4."
    cls = rq.cls
    if cls and ("which room" in q_lower or "room is used" in q_lower or "rooms used" in q_lower):
        rows = []
        for row in tt.get_class_week_schedule(cls):
            rows.append({
                "day": row["day"],
                "time": row["time"].split(" - ", 1)[-1],
                "room": row["room"],
                "subject": row["subject"],
                "teacher": row["teacher"],
            })
        return {"type": "class_rooms", "class": cls, "rooms": rows}

    sample_rooms = sorted(tt.ALL_ROOMS)[:12]
    return (
        "\U0001f3db\ufe0f I couldn't identify the room you're asking about.\n\n"
        "You can ask me about any of these rooms:\n"
        + ", ".join(sample_rooms)
        + "\n\nExamples:\n"
        "\u2022 'Is LT 4 free on Monday?'\n"
        "\u2022 'When is CR 2 free this week?'\n"
        "\u2022 'Show LH 1 schedule for Friday'"
    )


def handle_teacher_secondary(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    teacher = rq.teacher or tt.detect_teacher(question)

    if teacher:
        memory.last_teacher = teacher
        days_list = tt.detect_day(question) or [tt.today_name()]
        avail = tt.get_teacher_availability(teacher, days_list)
        text = f"\U0001f468\u200d\U0001f3eb {teacher}\n\n"
        for d, data in avail.items():
            text += f"\U0001f4c5 {d}\n"
            if data["free"]:
                text += "\U0001f7e2 Free: " + ", ".join(data["free"]) + "\n"
            else:
                text += "\U0001f7e2 Free: No free slots\n"
            if data["busy"]:
                busy_lines = [f"{time} ({info[0]['class']})" for time, info in data["busy"].items()]
                text += "\U0001f534 Busy: " + ", ".join(busy_lines) + "\n"
            else:
                text += "\U0001f534 Busy: No classes scheduled\n"
            text += "\n"
        return text.strip()

    if "now" in q_lower or "current" in q_lower or "who" in q_lower or "which" in q_lower:
        text = "There are many teachers available! To check someone's schedule, please ask by name.\n"
    else:
        text = "I couldn't find a teacher matching that name in the timetable.\n"
    sample = sorted(tt.ALL_TEACHERS)[:8]
    text += "\nHere are some examples of valid names you can check:\n"
    text += ", ".join(sample) + "..."
    text += f"\n\nTry asking: 'Is {sample[0]} free on Monday?'"
    return text


def handle_timetable(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    cls, slot_filter, time_label = rq.cls, rq.slot_filter, rq.time_label

    if not cls:
        if _class_teacher_followup(q_lower):
            if len(memory.last_classes) > 1:
                return "Which class do you mean? I can check " + ", ".join(memory.last_classes) + "."
            return "Which class do you mean? For example: BCS-1 or BS(SE)-III."
        return (
            "Please mention your class name so I can look up the timetable, "
            "for example: BCS-I, BA-II, CS-III, CE-IV."
        )

    memory.last_class = cls

    if "next class" in q_lower:
        return {"type": "next_class", "class": cls, "class_info": tt.find_next_class(cls)}

    days_list = tt.detect_day(question)
    if not days_list and memory.last_day and re.search(r"\b(this|that) class\b", q_lower):
        days_list = [memory.last_day]
    if not days_list:
        if tt.wants_full_week(question) or (
            slot_filter and not any(p in q_lower for p in ["today", "tomorrow", "right now", "now", "current"])
        ):
            days_list = tt.WEEK_DAYS
        else:
            days_list = [tt.today_name()]

    aggregated = []
    for d in days_list:
        sched = tt.get_schedule(cls, d, slot_filter)
        if sched:
            aggregated.extend(sched)

    wants_lab = bool(re.search(r"\blabs?\b", q_lower) and not re.search(r"\blab\s*\d", q_lower))
    if wants_lab:
        aggregated = [
            row for row in aggregated
            if row.get("is_lab") or "lab" in str(row.get("subject") or "").lower()
        ]

    if aggregated:
        memory.last_subjects = [str(row.get("subject") or "") for row in aggregated if row.get("subject")]
        memory.last_classes = [cls]
        memory.last_day = days_list[0] if len(days_list) == 1 else None
        rooms = []
        for row in aggregated:
            room_name = str(row.get("room") or "").strip()
            if room_name and room_name.upper() != "N/A" and room_name not in rooms:
                rooms.append(room_name)
        memory.last_rooms = rooms
        memory.last_room = rooms[0] if len(rooms) == 1 else None
        memory.last_day_meetings = aggregated if len(days_list) == 1 else []
        if len(days_list) == 6:
            display_day = "the Whole Week"
        elif len(days_list) > 1:
            display_day = ", ".join(days_list[:-1]) + f" & {days_list[-1]}"
        else:
            display_day = days_list[0]
        return {
            "type": "schedule",
            "class": _visible_class(cls),
            "day": display_day,
            "classes": aggregated,
        }

    memory.last_classes = [cls]
    memory.last_rooms = []
    memory.last_room = None
    memory.last_day_meetings = []
    memory.last_day = days_list[0] if len(days_list) == 1 else None
    display_day = "the requested days" if len(days_list) > 1 else days_list[0]
    suffix = f" {time_label}" if time_label else ""
    if wants_lab:
        return f"I could not find a lab meeting for {cls} on {display_day}{suffix} in the current timetable."
    return f"{cls} has no classes on {display_day}{suffix}."


def _next_class_sentence(info: dict | None, lead: str) -> str:
    if not info:
        return ""
    subject = str(info.get("subject") or "a class")
    day = info.get("day")
    when = str(info.get("time") or "").replace("-", "–")
    day_text = "today" if day == tt.today_name() else f"on {day}"
    sentence = f"{lead} {subject} {day_text}"
    if when:
        sentence += f" at {when}"
    room = str(info.get("room") or "").strip()
    if room and room.upper() != "N/A":
        sentence += f" in {room}"
    return sentence + "."


def _current_row(rows: list[dict]) -> dict | None:
    minute = tt._current_minutes()
    for row in rows or []:
        if tt._slot_contains(str(row.get("time") or ""), minute):
            return row
    return None


def _merge_slots(slots: list[str]) -> list[str]:
    """Join back-to-back slots: 13:35-15:00 + 15:00-16:30 → 13:35–16:30."""
    merged: list[list[str]] = []
    for slot in sorted(slots, key=lambda s: tt._slot_start_minutes(s.replace("–", "-"))):
        start_text, _, end_text = slot.replace("–", "-").partition("-")
        start_text, end_text = start_text.strip(), end_text.strip()
        if merged and tt._time_to_minutes(merged[-1][1]) == tt._time_to_minutes(start_text):
            merged[-1][1] = end_text
        else:
            merged.append([start_text, end_text])
    return [f"{a}–{b}" for a, b in merged]


def _free_slots(busy_slots: list[str]) -> list[str]:
    busy = [b for b in (_slot_bounds(s) for s in busy_slots) if b]
    free = []
    for slot in tt.ALL_SLOTS_SORTED:
        bounds = _slot_bounds(slot)
        if bounds and not any(bounds[0] < end and start < bounds[1] for start, end in busy):
            free.append(slot)
    return _merge_slots(free)


def _ordinal_meeting_reply(question: str, memory: SessionMemory) -> str | None:
    q_lower = (question or "").lower()
    index = None
    for word, position in (("first", 0), ("1st", 0), ("second", 1), ("2nd", 1), ("third", 2), ("3rd", 2)):
        if re.search(rf"\b{word}\b", q_lower) and re.search(r"\b(class|meeting|lecture|slot)\b", q_lower):
            index = position
            break
    if index is None:
        return None
    rows = list(getattr(memory, "last_day_meetings", None) or [])
    if not rows:
        return None
    if index >= len(rows):
        return f"That day only lists {len(rows)} class(es) in the published timetable."
    row = rows[index]
    subject = str(row.get("subject") or "That class")
    when = str(row.get("time") or "").strip()
    teacher = str(row.get("teacher") or "").strip()
    room = str(row.get("room") or "").strip()
    sentence = f"The {('first', 'second', 'third')[index]} class is {subject}"
    if when:
        sentence += f" at {when}"
    if teacher:
        sentence += f" with {teacher}"
    if room:
        sentence += f" in {room}"
    return sentence + "."


def _combine_lab_names(subjects: list[str]) -> list[str]:
    """['OOP (Lab)', 'Calculus', 'OOP'] → ['OOP (theory and lab)', 'Calculus']."""
    bases: dict[str, list[str]] = {}
    for name in subjects:
        bases.setdefault(_base_subject(name), []).append(name)
    combined = []
    for names in bases.values():
        if len(names) > 1 and any("lab" in n.lower() for n in names) and any("lab" not in n.lower() for n in names):
            theory = next(n for n in names if "lab" not in n.lower())
            combined.append(f"{_display_base(theory)} (theory and lab)")
        else:
            combined.extend(names)
    return combined


_SUBJECT_STOP = {
    "who", "teaches", "teach", "teaching", "takes", "take", "is", "my", "the",
    "our", "for", "of", "subject", "course", "class", "classes", "teacher", "teachers", "sir", "maam",
    "us", "me", "a", "when", "where", "which", "what", "time", "room", "does", "do", "i", "have",
    "in", "at", "on", "lecture", "lectures", "held",
    "today", "tomorrow", "next", "this", "week", "and", "lab", "labs",
    "free", "empty", "now", "there", "any", "it", "be", "will",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "mon", "tue", "wed", "thu", "fri", "sat",
}


def _base_subject(subject: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*", " ", subject.lower()).strip()


def _own_subject_rows(question: str, key: str) -> list[dict]:
    """Meetings of the subject named in the question, from one class only.

    Understands short names (OOP, DS, PF) and "lab" vs theory."""
    from rapidfuzz import fuzz

    q_lower = (question or "").lower()
    # Drop class codes ("BCS-1", "BS(SE)-III") so only the subject words remain.
    q_subject = re.sub(
        r"\b(bs\s*\(?[a-z&]+\)?|b?s?(cs|se|ai|ee|ce|ba|bda|af)|bscs|bsse|bcs)\s*[-\s]?\s*"
        r"(\d|i{1,3}|iv|v|vi{1,3})?\b",
        " ",
        q_lower,
    )
    wanted = " ".join(w for w in re.findall(r"[a-z0-9]+", q_subject) if w not in _SUBJECT_STOP)
    if len(wanted) < 2:
        return []
    rows = []
    for row in tt.get_class_week_schedule(key):
        base = _base_subject(str(row.get("subject") or ""))
        initials = "".join(word[0] for word in re.findall(r"[a-z]+", base))
        if (wanted == initials
                or (len(wanted) >= 4 and fuzz.partial_ratio(wanted, base) >= 88)
                or fuzz.token_set_ratio(wanted, base) >= 85):
            rows.append(row)
    if not rows:
        return []
    wants_lab = bool(re.search(r"\blabs?\b", q_lower))
    lab_rows = [r for r in rows if "lab" in str(r.get("subject") or "").lower()]
    theory_rows = [r for r in rows if r not in lab_rows]
    if wants_lab and lab_rows:
        rows = lab_rows
    elif theory_rows and re.search(r"\b(theory|class|lecture)\b", q_lower):
        rows = theory_rows
    if re.search(r"\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday)\b", q_lower):
        days = tt.detect_day(question) or []
        rows = [r for r in rows if r.get("day") in days]
    return rows


def _row_slot(row: dict) -> str:
    return str(row.get("time") or "").split(" - ", 1)[-1].replace("-", "–")


def class_subject_teacher(question: str, key: str) -> str | None:
    """Teacher(s) of the subject named in the question, within one class."""
    by_teacher: dict[str, list[str]] = {}
    for row in _own_subject_rows(question, key):
        teacher = str(row.get("teacher") or "").strip() or "N/A"
        subject = str(row.get("subject") or "").strip()
        subjects = by_teacher.setdefault(teacher, [])
        if subject not in subjects:
            subjects.append(subject)
    if not by_teacher:
        return None
    if len(by_teacher) == 1:
        teacher, subjects = next(iter(by_teacher.items()))
        if len(subjects) > 1 and len({_base_subject(s) for s in subjects}) == 1:
            label = f"{_display_base(subjects[0])} (theory and lab)"
        else:
            label = " and ".join(subjects)
        return f"In {key}, {label} is taught by {teacher}."
    lines = [f"In {key}:"]
    for teacher, subjects in by_teacher.items():
        lines.extend(f"• {subject} — {teacher}" for subject in subjects)
    return "\n".join(lines)


def _display_base(subject: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*", " ", subject).strip()


def _slot_bounds(slot: str) -> tuple[int, int] | None:
    parts = re.split(r"\s*-\s*", str(slot or ""))
    if len(parts) != 2:
        return None
    try:
        start_h, start_m = [int(piece) for piece in parts[0].replace(".", ":").split(":")[:2]]
        end_h, end_m = [int(piece) for piece in parts[1].replace(".", ":").split(":")[:2]]
    except (TypeError, ValueError):
        return None
    return start_h * 60 + start_m, end_h * 60 + end_m
