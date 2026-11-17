"""
Final shaping of chatbot answers before they leave /ask.

The app has two chat screens and neither can be changed from the backend:

  * ChatScreen.js (signed-in student / teacher / staff) draws the card types in
    SIGNED_IN_CARDS and prints any other dict as raw JSON.
  * GuestModeScreen.js (no sign-in token) only flattens a few card types and
    prints the rest as raw JSON, so guests always get text.

Both screens show text exactly as sent, so Markdown symbols are removed.
"""
from __future__ import annotations

import re
from typing import Any

SIGNED_IN_CARDS = {
    "schedule", "teacher_classes", "class_rooms", "teacher_availability",
    "room_availability", "rooms_free", "rooms_schedule", "teachers_free_now",
    "teacher_ambiguous",
}


def present(answer: Any, identity: dict | None) -> Any:
    """Return an answer the caller's chat screen can display."""
    if isinstance(answer, dict):
        if identity and answer.get("type") in SIGNED_IN_CARDS:
            return answer
        return plain_text(card_to_text(answer))
    if answer is None:
        return ""
    return plain_text(str(answer))


# ─────────────────────────────────────────────────────────────────────────────
# Markdown → plain text
# ─────────────────────────────────────────────────────────────────────────────

def plain_text(text: str) -> str:
    text = str(text or "")
    # [label](url) → label (url)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r"\1 (\2)", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.S)
    text = re.sub(r"__(.+?)__", r"\1", text, flags=re.S)
    text = re.sub(r"(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])", r"\1", text)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    lines = []
    for line in text.split("\n"):
        stripped = line.rstrip()
        stripped = re.sub(r"^\s{0,3}#{1,6}\s+", "", stripped)
        stripped = re.sub(r"^\s{0,3}>\s?", "", stripped)
        bullet = re.match(r"^(\s*)[-*+]\s+(.*)$", stripped)
        if bullet:
            indent = "  " if len(bullet.group(1)) >= 2 else ""
            stripped = f"{indent}• {bullet.group(2)}"
        if re.fullmatch(r"\s*([-*_]\s*){3,}", stripped):
            stripped = ""
        if re.fullmatch(r"\s*\|?[\s:-]*\|[\s|:-]*", stripped):
            continue  # Markdown table divider
        if stripped.count("|") >= 2:
            stripped = " · ".join(cell.strip() for cell in stripped.strip("|").split("|") if cell.strip())
        lines.append(stripped)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Cards → text
# ─────────────────────────────────────────────────────────────────────────────

DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _time(value: Any) -> str:
    text = str(value or "").strip()
    if " - " in text and text.split(" - ", 1)[0] in DAY_ORDER:
        text = text.split(" - ", 1)[1]
    return re.sub(r"\s*-\s*", "–", text)


def _known(value: Any) -> str:
    text = str(value or "").strip()
    return "" if text.upper() in {"", "N/A", "NA", "NONE"} else text


def _join(values) -> str:
    return ", ".join(v for v in (_known(x) for x in values or []) if v)


def _day_key(day: str) -> tuple:
    return (DAY_ORDER.index(day) if day in DAY_ORDER else 99, day)


def _meeting_line(row: dict, include_class: bool = False) -> str:
    when = _time(row.get("time") or row.get("slot"))
    subject = _known(row.get("subject")) or "Class"
    extras = [
        _known(row.get("class")) if include_class else "",
        _known(row.get("teacher")),
        _known(row.get("room")),
    ]
    detail = ", ".join(x for x in extras if x)
    line = f"• {when}  {subject}" if when else f"• {subject}"
    return line + (f" — {detail}" if detail else "")


def _by_day(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for row in rows or []:
        grouped.setdefault(str(row.get("day") or ""), []).append(row)
    return dict(sorted(grouped.items(), key=lambda item: _day_key(item[0])))


def _schedule_lines(title: str, rows: list[dict], include_class: bool = False) -> list[str]:
    grouped = _by_day(rows)
    if len(grouped) <= 1:
        day = next(iter(grouped), "")
        heading = f"{title} — {day}" if day and day not in title else title
        return [heading] + [_meeting_line(row, include_class) for row in rows]
    lines = [title]
    for day, day_rows in grouped.items():
        lines.append("")
        lines.append(day or "Other")
        lines.extend(_meeting_line(row, include_class) for row in day_rows)
    return lines


def _availability_lines(name: str, days: list[dict], who_key: str) -> list[str]:
    lines = [name]
    for day in days or []:
        if len(days) > 1:
            lines.append("")
        lines.append(str(day.get("day") or ""))
        free = [_time(slot) for slot in day.get("free") or []]
        lines.append("Free: " + (", ".join(free) if free else "no free slots"))
        busy = []
        for block in day.get("busy") or []:
            parts = [_join(block.get("classes")), _join(block.get(who_key)), _join(block.get("subjects"))]
            detail = ", ".join(p for p in parts if p)
            busy.append(_time(block.get("slot")) + (f" ({detail})" if detail else ""))
        if busy:
            lines.append("Busy: " + "; ".join(busy))
    return lines


def _next_line(prefix: str, info: dict | None) -> str:
    if not info:
        return f"{prefix}: I can't find an upcoming class in the current timetable."
    subject = _known(info.get("subject")) or "a class"
    sentence = f"{prefix} is {subject} on {info.get('day')}"
    when = _time(info.get("time"))
    if when:
        sentence += f" at {when}"
    teacher = _known(info.get("teacher"))
    if teacher:
        sentence += f" with {teacher}"
    room = _known(info.get("room"))
    if room:
        sentence += f" in {room}"
    return sentence + "."


def card_to_text(card: dict) -> str:
    kind = card.get("type")
    lines: list[str]

    if kind == "schedule":
        rows = card.get("classes") or []
        title = f"📅 {card.get('class') or 'Class'}"
        day = str(card.get("day") or "")
        if day and len(_by_day(rows)) > 1:
            title += f" — {day}"
        lines = _schedule_lines(title, rows) if rows else [f"{card.get('class')} has no classes on {day}."]

    elif kind == "teacher_classes":
        rows = card.get("classes") or []
        title = f"👨‍🏫 {card.get('teacher')} — classes"
        lines = _schedule_lines(title, rows, include_class=True) if rows else [
            f"{card.get('teacher')} has no classes in that time."]

    elif kind == "class_rooms":
        lines = _schedule_lines(f"📍 {card.get('class')} — rooms", card.get("rooms") or [])

    elif kind == "teacher_availability":
        lines = _availability_lines(f"👨‍🏫 {card.get('teacher')}", card.get("days") or [], "rooms")

    elif kind == "room_availability":
        lines = _availability_lines(f"📍 Room {card.get('room')}", card.get("days") or [], "teachers")

    elif kind == "rooms_free":
        rooms = card.get("rooms") or []
        if not rooms:
            lines = ["No rooms are free at that time in the current timetable."]
        else:
            lines = ["📍 Free rooms"]
            for day, day_rooms in _by_day(rooms).items():
                if len(card.get("days") or []) > 1:
                    lines.append("")
                    lines.append(day)
                for room in day_rooms:
                    lines.append(f"• {room.get('room')}: {', '.join(_time(s) for s in room.get('free') or [])}")

    elif kind == "rooms_schedule":
        lines = ["📍 Room schedule"]
        for room in card.get("rooms") or []:
            for block in room.get("busy") or []:
                detail = ", ".join(p for p in (_join(block.get("classes")), _join(block.get("subjects"))) if p)
                lines.append(f"• {room.get('day')} {_time(block.get('slot'))}  {room.get('room')}" + (f" — {detail}" if detail else ""))

    elif kind == "teachers_free_now":
        teachers = card.get("teachers") or []
        if not card.get("slot"):
            lines = ["There is no class slot running right now, so every teacher is free of timetabled classes."]
        elif not teachers:
            lines = [f"No teachers are free on {card.get('day')} at {_time(card.get('slot'))}."]
        else:
            shown = teachers[:30]
            lines = [f"🟢 Teachers free now ({card.get('day')}, {_time(card.get('slot'))}):"]
            lines.append(", ".join(shown) + (f", and {len(teachers) - len(shown)} more." if len(teachers) > len(shown) else "."))

    elif kind == "teacher_ambiguous":
        lines = [card.get("message") or "Which teacher do you mean?"]
        lines += [f"• {name}" for name in card.get("matches") or []]

    elif kind == "next_class":
        lines = [_next_line(f"The next class for {card.get('class')}", card.get("class_info"))]

    elif kind == "teacher_next_class":
        info = card.get("class_info") or {}
        if not info:
            lines = [f"I can't find an upcoming class for {card.get('teacher')} in the current timetable."]
        else:
            parts = []
            for meeting in info.get("classes") or []:
                bits = [_known(meeting.get("subject")), _known(meeting.get("class"))]
                text = " for ".join(b for b in bits if b) or "a class"
                room = _known(meeting.get("room"))
                parts.append(text + (f" in {room}" if room else ""))
            lines = [f"{card.get('teacher')}'s next class is on {info.get('day')} at {_time(info.get('slot'))}: "
                     + "; ".join(parts) + "."]

    elif kind == "class_teachers":
        teachers = card.get("teachers") or []
        if not teachers:
            lines = [f"I couldn't find teachers for {card.get('class')} in the current timetable."]
        else:
            lines = [f"👨‍🏫 Teachers of {card.get('class')}"]
            seen = set()
            for row in teachers:
                key = (row.get("teacher"), row.get("subject"))
                if key in seen:
                    continue
                seen.add(key)
                lines.append(f"• {row.get('subject')} — {row.get('teacher')}")

    elif kind == "subject_teachers":
        matches = card.get("matches") or []
        if not matches:
            lines = ["I couldn't find that subject in the current timetable."]
        else:
            by_subject: dict[str, list[str]] = {}
            for row in matches:
                subject = _known(row.get("subject")) or "Subject"
                entry = _known(row.get("teacher"))
                if _known(row.get("class")):
                    entry = f"{entry} ({row.get('class')})" if entry else str(row.get("class"))
                bucket = by_subject.setdefault(subject, [])
                if entry and entry not in bucket:
                    bucket.append(entry)
            lines = []
            for subject, people in by_subject.items():
                lines.append(f"{subject} is taught by " + ", ".join(people) + ".")

    else:
        lines = [str(card.get("message") or card.get("text") or "Here is what I found.")]
        for key, value in card.items():
            if key in {"type", "message", "text", "note"} or isinstance(value, (dict, list)):
                continue
            lines.append(f"{key.replace('_', ' ').title()}: {value}")

    if card.get("note"):
        lines += ["", str(card["note"])]
    return "\n".join(lines).strip()
