"""Canonical academic entities derived from the published timetable.

Live Firestore remains the authority. This module does not invent courses,
IDs, or university-wide catalogues. Counts always state their coverage.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import timetable_service as tt
from university_data import DEPT_CODE

COVERAGE = (
    "This is counted from the currently loaded published timetable, "
    "not a complete university-wide course catalogue."
)

CLASS_KEY = re.compile(r"^BS\((.+)\)-(.+)$")
BA_KEY = re.compile(r"^BA\((.+)\)-(.+)$")


@dataclass(frozen=True)
class Meeting:
    class_key: str
    department: str
    semester: str
    day: str
    slot: str
    subject: str
    teacher: str
    room: str
    source_id: str = "text_pdf_timetables"


@dataclass
class Catalog:
    meetings: list[Meeting] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def sections(self) -> list[str]:
        return sorted({row.class_key for row in self.meetings})

    @property
    def subjects(self) -> list[str]:
        return sorted({row.subject for row in self.meetings if row.subject})

    @property
    def teachers(self) -> list[str]:
        return sorted({row.teacher for row in self.meetings if row.teacher and row.teacher != "N/A"})

    @property
    def rooms(self) -> list[str]:
        return sorted({row.room for row in self.meetings if row.room and row.room != "N/A"})


def _split_class_key(class_key: str) -> tuple[str, str]:
    match = CLASS_KEY.match(class_key) or BA_KEY.match(class_key)
    if not match:
        return "", ""
    return match.group(1), match.group(2)


def catalog_from_timetable(data: dict | None) -> Catalog:
    catalog = Catalog()
    seen: set[tuple] = set()
    if not data:
        catalog.warnings.append("No published timetable is loaded.")
        return catalog
    for class_key, days in data.items():
        department, semester = _split_class_key(str(class_key))
        if not department:
            catalog.warnings.append(f"Unparsed class key {class_key}.")
        for day, slots in (days or {}).items():
            for slot, rows in (slots or {}).items():
                for row in rows or []:
                    subject = str(row.get("subject") or "").strip()
                    if not subject:
                        catalog.warnings.append(f"Meeting in {class_key} {day} {slot} has no subject.")
                        continue
                    signature = (str(class_key), str(day), str(slot), subject, str(row.get("teacher") or ""), str(row.get("room") or ""))
                    if signature in seen:
                        catalog.warnings.append(f"Duplicate meeting {class_key} {day} {slot} {subject}.")
                    seen.add(signature)
                    catalog.meetings.append(
                        Meeting(
                            class_key=str(class_key),
                            department=department,
                            semester=semester,
                            day=str(row.get("day") or day),
                            slot=str(row.get("time") or slot),
                            subject=subject,
                            teacher=str(row.get("teacher") or "N/A").strip() or "N/A",
                            room=str(row.get("room") or "N/A").strip() or "N/A",
                        )
                    )
    return catalog


def load_catalog() -> Catalog:
    tt.ensure_timetable()
    return catalog_from_timetable(tt.TIMETABLE)


def _semester_from_text(question: str) -> str | None:
    text = (question or "").lower()
    digit = re.search(r"\b(?:semester|sem)\s*([1-8])\b", text)
    if digit:
        return ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][int(digit.group(1)) - 1]
    roman = re.search(r"\b(?:semester|sem)\s+(viii|vii|vi|iv|iii|ii|v|i)\b", text)
    if roman:
        return roman.group(1).upper()
    return None


def _dept_from_text(question: str) -> str | None:
    text = (question or "").lower()
    aliases = {
        "computer science": "CS",
        "software engineering": "SE",
        "artificial intelligence": "AI",
        "computer engineering": "CE",
        "electrical": "EE",
        "mathematics": "Maths",
        "english": "English",
        "accounting": "A&F",
        "business": "BA",
        "big data": "BDA",
    }
    for phrase, code in aliases.items():
        if phrase in text:
            return code
    for code in DEPT_CODE.values():
        if re.search(rf"\b{re.escape(code.lower())}\b", text):
            return code
    return None


def detect_catalog_op(question: str) -> str | None:
    """Allowlisted structured operations. None means not a catalog question."""
    q = (question or "").lower()
    if not q.strip():
        return None
    asks_how_many = bool(re.search(r"\b(how many|number of|count of|count the)\b", q))
    if asks_how_many and re.search(r"\b(subjects?|courses?)\b", q) and re.search(
        r"\b(each|per|every)\s+departments?\b", q
    ):
        return "department_counts"
    if re.search(r"\b(unique )?(courses?|subjects?)\b", q) and (
        asks_how_many
        or re.search(r"\b(offered|listed|available)\b", q)
        or re.search(r"\blist (all )?(the )?(unique )?(courses?|subjects?)\b", q)
    ):
        if re.search(r"\b(section|meeting|session)\b", q):
            return "clarify_class_count"
        return "unique_subjects"
    if re.search(r"\b(class sections?|class groups?|degree classes?|timetable classes)\b", q) and asks_how_many:
        return "sections"
    if re.search(r"\b(timetable meetings?|scheduled meetings?|class meetings?|sessions?|time slots?)\b", q) and asks_how_many:
        return "meetings"
    if re.search(r"\bhow many classes\b", q) and not re.search(r"\b(on|on monday|tuesday|wednesday|thursday|friday)\b", q):
        return "clarify_class_count"
    if asks_how_many and re.search(r"\bteachers?\b", q):
        return "teachers"
    if re.search(r"\b(which|what) (courses?|subjects?)\b", q) and re.search(r"\b(teach|teaches|teaching)\b", q):
        return "teacher_subjects"
    if re.search(r"\b(which|what) (courses?|subjects?)\b", q) and _dept_from_text(q):
        return "department_subjects"
    if re.search(r"\b(who teaches|which teacher teaches|which teachers teach)\b", q):
        if re.search(r"\b(that|this|the) subjects?\b", q):
            return None
        return "subject_teachers"
    if re.search(r"\b(those courses|those subjects|list them)\b", q):
        return "repeat_last"
    return None


def _qualify(text: str, catalog: Catalog) -> str:
    extra = " ".join(catalog.warnings[:3])
    return f"{text} {COVERAGE}" + (f" {extra}" if extra else "")


def _subject_from_text(question: str, catalog: Catalog, memory) -> str | None:
    q = (question or "").lower()
    for subject in sorted(catalog.subjects, key=len, reverse=True):
        if subject.lower() in q:
            return subject
    remembered = list(getattr(memory, "last_subjects", None) or [])
    remembered += list(getattr(memory, "last_catalog_items", None) or [])
    if remembered:
        return remembered[0]
    return None


def answer_catalog(question: str, memory, teacher: str | None = None) -> tuple[str, str] | None:
    op = detect_catalog_op(question)
    if op is None:
        return None
    if op == "clarify_class_count":
        return (
            "Do you mean unique subjects, class groups such as BS(CS)-I, "
            "or scheduled timetable meetings? Those are different counts.",
            "catalog",
        )
    if op == "repeat_last":
        items = getattr(memory, "last_catalog_items", None) or []
        metric = getattr(memory, "last_catalog_metric", "") or "items"
        if not items:
            return "I do not have a previous course list in this chat.", "catalog"
        return f"The previous {metric} were: " + ", ".join(items) + ".", "catalog"

    catalog = load_catalog()
    if op == "unique_subjects":
        dept = _dept_from_text(question)
        semester = _semester_from_text(question)
        rows = [
            row.subject
            for row in catalog.meetings
            if (not dept or row.department == dept)
            and (not semester or row.semester == semester)
        ]
        rows = sorted(set(rows))
        memory.last_catalog_metric = "subjects"
        memory.last_catalog_items = rows
        label = ""
        if dept:
            label += f" in {dept}"
        if semester:
            label += f" semester {semester}"
        text = f"There are {len(rows)} unique subjects{label} in the published timetable."
        if re.search(r"\b(university|whole university|all campuses)\b", (question or "").lower()):
            text += " I do not have a complete list of every course the university offers."
        return _qualify(text, catalog), "catalog"
    if op == "sections":
        memory.last_catalog_metric = "sections"
        memory.last_catalog_items = catalog.sections
        return _qualify(
            f"There are {len(catalog.sections)} class groups in the published timetable.",
            catalog,
        ), "catalog"
    if op == "meetings":
        memory.last_catalog_metric = "meetings"
        memory.last_catalog_items = []
        return _qualify(
            f"There are {len(catalog.meetings)} scheduled timetable meetings.",
            catalog,
        ), "catalog"
    if op == "teachers":
        memory.last_catalog_metric = "teachers"
        memory.last_catalog_items = catalog.teachers
        return _qualify(
            f"There are {len(catalog.teachers)} distinct teacher names in the published timetable.",
            catalog,
        ), "catalog"
    if op == "teacher_subjects":
        name = teacher or tt.detect_teacher(question)
        if not name:
            return "Tell me the teacher name to list their published subjects.", "catalog"
        rows = sorted({row.subject for row in catalog.meetings if row.teacher == name})
        memory.last_catalog_metric = "subjects"
        memory.last_catalog_items = rows
        if not rows:
            return _qualify(f"{name} does not appear as a teacher in the published timetable.", catalog), "catalog"
        return _qualify(
            f"{name} teaches {len(rows)} unique subjects in the published timetable: "
            + ", ".join(rows) + ".",
            catalog,
        ), "catalog"
    if op == "department_subjects":
        dept = _dept_from_text(question)
        rows = sorted({row.subject for row in catalog.meetings if row.department == dept})
        memory.last_catalog_metric = "subjects"
        memory.last_catalog_items = rows
        return _qualify(
            f"{dept} has {len(rows)} unique subjects in the published timetable.",
            catalog,
        ), "catalog"
    if op == "department_counts":
        counts = {}
        for row in catalog.meetings:
            if not row.department:
                continue
            counts.setdefault(row.department, set()).add(row.subject)
        parts = [f"{dept}: {len(names)}" for dept, names in sorted(counts.items())]
        memory.last_catalog_metric = "department_subject_counts"
        memory.last_catalog_items = parts
        return _qualify(
            "Unique subjects by department in the published timetable: " + "; ".join(parts) + ".",
            catalog,
        ), "catalog"
    if op == "subject_teachers":
        subject = _subject_from_text(question, catalog, memory)
        if not subject:
            return "Tell me the subject name to list the published teachers.", "catalog"
        names = sorted({
            row.teacher for row in catalog.meetings
            if row.subject.lower() == subject.lower() and row.teacher != "N/A"
        })
        memory.last_catalog_metric = "teachers"
        memory.last_catalog_items = names
        if not names:
            return _qualify(
                f"{subject} has no teacher name in the published timetable.",
                catalog,
            ), "catalog"
        return _qualify(
            f"{subject} is listed with {', '.join(names)} in the published timetable. "
            "That is the current timetable assignment, not a complete teaching-load record.",
            catalog,
        ), "catalog"
    return None
