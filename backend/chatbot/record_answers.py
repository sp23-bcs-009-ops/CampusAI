"""Firestore record answers: events, announcements, lost and found, class notifications.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

import datetime
import re
from typing import Any

from timetable import timetable_lookup as tt


_RECORD_LABELS = {
    "events": "events",
    "lostfound": "lost-and-found items",
    "announcements": "emergency announcements",
    "teachers": "teacher directory entries",
    "notifications": "class notifications",
}


def _annotate_event_dates(records: list[dict]) -> list[dict]:
    today = tt.campus_now().date().isoformat()
    annotated = []
    for record in records:
        item = dict(record)
        raw = str(item.get("date") or "")[:10]
        if len(raw) == 10 and raw < today:
            item["when"] = "past — not an upcoming event"
        elif raw == today:
            item["when"] = "today"
        elif len(raw) == 10:
            item["when"] = "upcoming"
        else:
            item["when"] = "date not published"
        annotated.append(item)
    return annotated


def _format_records(records: list) -> str:
    lines = []
    for record in records[:30]:
        parts = [f"{key}: {value}" for key, value in record.items()]
        lines.append("- " + "; ".join(parts))
    extra = len(records) - 30
    if extra > 0:
        lines.append(f"- {extra} more records were omitted.")
    return "\n".join(lines)


def _readable_date(value: Any) -> str:
    """'2026-04-30' or a millisecond timestamp → '30 April 2026'. Unknown text is kept."""
    from datetime import datetime, timezone

    if value in (None, ""):
        return ""
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
        number = float(value)
        if number > 10_000_000_000:  # milliseconds
            number /= 1000
        try:
            moment = datetime.fromtimestamp(number, tz=timezone.utc)
            moment = moment.astimezone(tt.campus_now().tzinfo or timezone.utc)
            return f"{moment.day} {moment.strftime('%B %Y')}"
        except (OverflowError, OSError, ValueError):
            return ""
    text = str(value).strip()
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        try:
            moment = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            return f"{moment.day} {moment.strftime('%B %Y')}"
        except ValueError:
            return text
    return text


def _short(value: Any, limit: int = 140) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _event_line(item: dict) -> str:
    title = str(item.get("title") or "Untitled event").strip()
    parts = [_readable_date(item.get("date"))]
    start, end = str(item.get("time") or "").strip(), str(item.get("endTime") or "").strip()
    parts.append(f"{start}–{end}" if start and end else start)
    parts.append(str(item.get("venue") or "").strip())
    detail = ", ".join(p for p in parts if p)
    text = f"• {title}" + (f" — {detail}" if detail else "")
    if item.get("when") == "today":
        text += " (today)"
    if item.get("body"):
        text += f"\n  {_short(item['body'])}"
    return text


def _asked_event_range(question: str):
    """(label, first day, last day) for "today", "tomorrow", "this week", "next week", "this weekend"."""
    q = (question or "").lower()
    today = tt.campus_now().date()
    monday = today - datetime.timedelta(days=today.weekday())
    if re.search(r"\b(today|aaj)\b", q):
        return "today", today, today
    if re.search(r"\b(tomorrow|kal)\b", q):
        day = today + datetime.timedelta(days=1)
        return "tomorrow", day, day
    if "next week" in q:
        return "next week", monday + datetime.timedelta(days=7), monday + datetime.timedelta(days=13)
    if "weekend" in q:
        return "this weekend", monday + datetime.timedelta(days=5), monday + datetime.timedelta(days=6)
    if "this week" in q:
        return "this week", today, monday + datetime.timedelta(days=6)
    return None


def _event_day(item: dict):
    try:
        return datetime.date.fromisoformat(str(item.get("date") or "")[:10])
    except ValueError:
        return None


def _event_lines(records: list[dict], question: str = "") -> str:
    records = _annotate_event_dates(records)
    asked = _asked_event_range(question)
    if asked:
        label, first, last = asked
        upcoming_all = sorted(
            (item for item in records if item.get("when") in {"today", "upcoming"}),
            key=lambda item: str(item.get("date") or ""),
        )
        in_range = [item for item in upcoming_all if _event_day(item) and first <= _event_day(item) <= last]
        span = _readable_date(first.isoformat()) if first == last else (
            f"{_readable_date(first.isoformat())} – {_readable_date(last.isoformat())}")
        if in_range:
            return f"🎉 Events {label} ({span})\n" + "\n".join(_event_line(item) for item in in_range[:8])
        text = f"There are no events {label} ({span})."
        later = [item for item in upcoming_all if _event_day(item) and _event_day(item) > last]
        if later:
            text += " The next upcoming ones:\n" + "\n".join(_event_line(item) for item in later[:3])
        return text
    upcoming = sorted(
        (item for item in records if item.get("when") in {"today", "upcoming"}),
        key=lambda item: str(item.get("date") or ""),
    )

    if upcoming:
        return "🎉 Upcoming events\n" + "\n".join(_event_line(item) for item in upcoming[:8])
    past = sorted(records, key=lambda item: str(item.get("date") or ""), reverse=True)[:3]
    if not past:
        return "There are no published events right now."
    return (
        "There are no upcoming events right now. The most recent ones were:\n"
        + "\n".join(_event_line(item) for item in past)
    )


def _announcement_lines(records: list[dict]) -> str:
    ordered = sorted(records, key=lambda item: float(item.get("createdAt") or 0), reverse=True)
    lines = []
    for item in ordered[:6]:
        title = str(item.get("title") or "Announcement").strip()
        priority = str(item.get("priority") or "").strip().lower()
        when = _readable_date(item.get("createdAt"))
        head = f"⚠️ {title}" + (f" ({priority})" if priority else "") + (f" — {when}" if when else "")
        lines.append(head + (f"\n{_short(item.get('body'), 220)}" if item.get("body") else ""))
    return "\n\n".join(lines)


_LOSTFOUND_STOP = {
    "lost", "found", "item", "items", "any", "anyone", "someone", "somebody", "has", "have",
    "did", "does", "find", "my", "a", "an", "the", "is", "are", "there", "and", "or", "of",
    "show", "me", "list", "what", "please", "in", "on", "at", "i", "it", "today", "campus",
    "one", "ones", "anybody", "seen", "can", "you", "know", "if", "where", "who", "help", "lose",
}

_ITEM_SYNONYMS = {
    "phone": {"phone", "mobile", "iphone", "cell", "android", "smartphone"},
    "mobile": {"phone", "mobile", "iphone", "cell", "android", "smartphone"},
    "card": {"card", "id", "cnic"},
    "wallet": {"wallet", "purse"},
    "bottle": {"bottle", "flask"},
    "laptop": {"laptop", "notebook", "computer"},
}


def _lostfound_lines(question: str, records: list[dict]) -> str:
    open_items = [item for item in records if str(item.get("resolved")).lower() not in {"true", "1"}]
    terms = [w for w in re.findall(r"[a-z]+", question.lower()) if w not in _LOSTFOUND_STOP and len(w) >= 2]
    shown = open_items
    if terms:
        wanted = set()
        for term in terms:
            wanted |= _ITEM_SYNONYMS.get(term, {term})

        groups = [_ITEM_SYNONYMS.get(term, {term}) for term in terms]
        needed = len(groups) if len(groups) <= 2 else 2  # "id card": both words; longer: any two

        def matches(item: dict) -> bool:
            text = " ".join(str(item.get(k) or "") for k in ("title", "body", "location", "cat")).lower()
            hits = sum(1 for group in groups if any(re.search(rf"\b{re.escape(word)}", text) for word in group))
            return hits >= needed

        shown = [item for item in open_items if matches(item)]
        if not shown:
            return (
                f"I couldn't find any open lost-and-found posts matching \"{' '.join(terms)}\". "
                "You can post it in the app's Lost & Found section so others can reply."
            )

    def line(item: dict) -> str:
        title = str(item.get("title") or "Item").strip()
        parts = [str(item.get("location") or "").strip(), _readable_date(item.get("date"))]
        detail = ", ".join(p for p in parts if p)
        text = f"• {title}" + (f" — {detail}" if detail else "")
        if item.get("body"):
            text += f"\n  {_short(item['body'], 100)}"
        return text

    lost = [item for item in shown if str(item.get("type")).lower() == "lost"]
    found = [item for item in shown if str(item.get("type")).lower() == "found"]
    other = [item for item in shown if item not in lost and item not in found]
    sections = []
    if found:
        sections.append("Found items\n" + "\n".join(line(item) for item in found[:8]))
    if lost:
        sections.append("Lost items\n" + "\n".join(line(item) for item in lost[:8]))
    if other:
        sections.append("\n".join(line(item) for item in other[:8]))
    if not sections:
        return "There are no open lost-and-found posts right now."
    return "\n\n".join(sections) + "\n\nTo claim or report something, use the app's Lost & Found section."


def _notification_lines(records: list[dict], class_key: str | None) -> str:
    ordered = sorted(records, key=lambda item: str(item.get("date") or ""), reverse=True)
    lines = []
    for item in ordered[:8]:
        title = str(item.get("title") or item.get("type") or "Notice").strip()
        parts = [
            str(item.get("subject") or "").strip(),
            _readable_date(item.get("date")),
            str(item.get("room") or "").strip(),
        ]
        detail = ", ".join(p for p in parts if p)
        text = f"• {title}" + (f" — {detail}" if detail else "")
        message = item.get("message") or item.get("body")
        if message:
            text += f"\n  {_short(message)}"
        lines.append(text)
    heading = f"🔔 Notifications for {class_key}" if class_key else "🔔 Class notifications"
    return heading + "\n" + "\n".join(lines)
