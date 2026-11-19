"""Parse Excel exam datesheets and build the app's exam timetable documents."""
from __future__ import annotations

import hashlib
import json
import re
import zipfile
from collections import defaultdict
from datetime import date, datetime
from io import BytesIO

from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel
from openpyxl.utils.exceptions import InvalidFileException

if __package__:
    from .timetable_publisher import save_text_pdf_timetable_documents
else:
    from timetable_upload.timetable_publisher import save_text_pdf_timetable_documents


class ExamTimetableValidationError(ValueError):
    """Raised when an Excel datesheet cannot be safely published."""


_REQUIRED_HEADERS = {
    "date", "time", "coursecode", "coursetitle", "class", "instructor", "hallroom",
}
_HEADER_ALIASES = {
    "sno": "serial_number",
    "serialno": "serial_number",
    "date": "date",
    "time": "time",
    "coursecode": "course_code",
    "coursetitle": "course_title",
    "class": "class_code",
    "strength": "strength",
    "instructor": "instructor",
    "hallroom": "room",
    "invigilators": "invigilators",
}
_ROMAN_VALUES = (
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"),
    (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"),
    (5, "V"), (4, "IV"), (1, "I"),
)


def _header_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").casefold())


def _to_roman(number: int) -> str:
    result = []
    for value, numeral in _ROMAN_VALUES:
        count, number = divmod(number, value)
        result.extend([numeral] * count)
    return "".join(result)


def _roman_number(value: str) -> int | None:
    roman = value.upper()
    if not roman or not re.fullmatch(r"[IVXLCDM]+", roman):
        return None
    total = 0
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    for index, character in enumerate(roman):
        current = values[character]
        following = values[roman[index + 1]] if index + 1 < len(roman) else 0
        total += -current if current < following else current
    if not 1 <= total <= 20 or _to_roman(total) != roman:
        return None
    return total


def _class_identity(value: object, sheet_name: str, row_number: int) -> tuple[str, int, str]:
    label = " ".join(str(value or "").strip().upper().split())
    match = re.fullmatch(r"([A-Z][A-Z0-9]*)[- ]([IVXLCDM]+)", label)
    semester = _roman_number(match.group(2)) if match else None
    if not match or semester is None:
        raise ExamTimetableValidationError(
            f"{sheet_name} row {row_number}: Class must use a program and Roman semester, for example BCS-V."
        )
    program = match.group(1)
    # Student department codes come from the email segment after its optional B prefix.
    department = program[1:] if program.startswith("B") else program
    return department.lower(), semester, label


def _date_value(value: object, epoch: datetime, sheet_name: str, row_number: int) -> str:
    parsed: date | None = None
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        converted = from_excel(value, epoch)
        if isinstance(converted, datetime):
            parsed = converted.date()
        elif isinstance(converted, date):
            parsed = converted
    elif value is not None:
        text = str(value).strip()
        for date_format in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                parsed = datetime.strptime(text, date_format).date()
                break
            except ValueError:
                continue
    if parsed is None:
        raise ExamTimetableValidationError(
            f"{sheet_name} row {row_number}: Date must be a valid calendar date."
        )
    return parsed.isoformat()


def _clock_value(value: object, sheet_name: str, row_number: int) -> tuple[str, str]:
    text = str(value or "").strip()
    match = re.fullmatch(
        r"\s*(\d{1,2}:?\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}:?\d{2})\s*",
        text,
    )
    if not match:
        raise ExamTimetableValidationError(
            f"{sheet_name} row {row_number}: Time must be a range such as 0830-1000."
        )

    def parse_clock(raw: str) -> tuple[str, int] | None:
        digits = raw.replace(":", "")
        if len(digits) not in {3, 4}:
            return None
        hour, minute = int(digits[:-2]), int(digits[-2:])
        if hour > 23 or minute > 59:
            return None
        return f"{hour:02d}:{minute:02d}", hour * 60 + minute

    start, end = parse_clock(match.group(1)), parse_clock(match.group(2))
    if not start or not end or end[1] <= start[1]:
        raise ExamTimetableValidationError(
            f"{sheet_name} row {row_number}: Time range is invalid or does not end after it starts."
        )
    return start[0], end[0]


def _cell_value(row: tuple, columns: dict[str, int], field: str):
    index = columns.get(field)
    return row[index] if index is not None and index < len(row) else None


def _read_sheet(workbook, worksheet) -> list[dict]:
    header_row = None
    columns = {}
    rows = worksheet.iter_rows(values_only=True)
    for row_number, row in enumerate(rows, start=1):
        candidate = {
            _HEADER_ALIASES[key]: index
            for index, value in enumerate(row)
            if (key := _header_key(value)) in _HEADER_ALIASES
        }
        if _REQUIRED_HEADERS.issubset({
            key for key, field in _HEADER_ALIASES.items()
            if field in candidate
        }):
            header_row = row_number
            columns = candidate
            break
    if header_row is None:
        raise ExamTimetableValidationError(
            f"Sheet {worksheet.title}: could not find the required datesheet header row."
        )

    entries = []
    for row_number, row in enumerate(rows, start=header_row + 1):
        if not any(value is not None and str(value).strip() for value in row):
            continue
        dept, semester, class_code = _class_identity(
            _cell_value(row, columns, "class_code"), worksheet.title, row_number
        )
        date_value = _date_value(_cell_value(row, columns, "date"), workbook.epoch, worksheet.title, row_number)
        start, end = _clock_value(_cell_value(row, columns, "time"), worksheet.title, row_number)
        course_code = str(_cell_value(row, columns, "course_code") or "").strip()
        course_title = str(_cell_value(row, columns, "course_title") or "").strip()
        instructor = str(_cell_value(row, columns, "instructor") or "").strip()
        room = " ".join(str(_cell_value(row, columns, "room") or "").split()) or "Not assigned"
        if not course_code or not course_title or not instructor:
            raise ExamTimetableValidationError(
                f"{worksheet.title} row {row_number}: Course Code, Course Title, and Instructor are required."
            )

        strength_value = _cell_value(row, columns, "strength")
        try:
            strength_number = float(strength_value) if strength_value not in (None, "") else None
        except (TypeError, ValueError) as exc:
            raise ExamTimetableValidationError(
                f"{worksheet.title} row {row_number}: Strength must be a whole number."
            ) from exc
        if strength_number is not None and not strength_number.is_integer():
            raise ExamTimetableValidationError(
                f"{worksheet.title} row {row_number}: Strength must be a whole number."
            )
        strength = int(strength_number) if strength_number is not None else None
        if strength is not None and strength < 0:
            raise ExamTimetableValidationError(
                f"{worksheet.title} row {row_number}: Strength cannot be negative."
            )

        entries.append({
            "serialNumber": _cell_value(row, columns, "serial_number"),
            "date": date_value,
            "start": start,
            "end": end,
            "courseCode": course_code,
            "subject": course_title,
            "classCode": class_code,
            "dept": dept,
            "sem": semester,
            "strength": strength,
            "prof": instructor,
            "room": room,
            "invigilators": str(_cell_value(row, columns, "invigilators") or "").strip(),
        })
    if not entries:
        raise ExamTimetableValidationError(f"Sheet {worksheet.title}: no exam rows were found.")
    return entries


def parse_exam_timetable_xlsx(
    payload: bytes,
    *,
    uploaded_by: str,
    version: str = "current",
    source_file_name: str = "",
) -> tuple[dict, str, int]:
    """Validate all sheets and convert each exam row into a department/semester document."""
    try:
        workbook = load_workbook(BytesIO(payload), read_only=True, data_only=True)
    except (InvalidFileException, OSError, ValueError, zipfile.BadZipFile) as exc:
        raise ExamTimetableValidationError("Upload a valid .xlsx Excel workbook.") from exc

    try:
        entries = [
            entry
            for worksheet in workbook.worksheets
            for entry in _read_sheet(workbook, worksheet)
        ]
    finally:
        workbook.close()
    if not entries:
        raise ExamTimetableValidationError("The Excel workbook contains no exam rows.")

    times = sorted({(entry["start"], entry["end"]) for entry in entries})
    lecture_slots = {
        str(number): {"label": f"Exam slot {number}", "start": start, "end": end}
        for number, (start, end) in enumerate(times, start=1)
    }
    time_numbers = {time_range: number for number, time_range in enumerate(times, start=1)}
    grouped: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for entry in entries:
        grouped[(entry["dept"], entry["sem"])].append(entry)

    documents = {}
    for (department, semester), group_entries in sorted(grouped.items()):
        room_map: dict[str, list[dict]] = defaultdict(list)
        rows_by_date: dict[str, list[dict]] = defaultdict(list)
        subjects = {}
        for entry in sorted(
            group_entries,
            key=lambda item: (item["date"], item["start"], item["room"], item["courseCode"], item["classCode"]),
        ):
            slot_number = time_numbers[(entry["start"], entry["end"])]
            slot = {
                "day": entry["date"],
                "lectureNum": slot_number,
                "start": entry["start"],
                "end": entry["end"],
                "subject": entry["subject"],
                "courseCode": entry["courseCode"],
                "classCode": entry["classCode"],
                "prof": entry["prof"],
                "dept": department,
                "sem": semester,
                "strength": entry["strength"],
                "invigilators": entry["invigilators"],
                "serialNumber": entry["serialNumber"],
                "isLab": False,
                "room": entry["room"],
                "isMine": False,
            }
            room_map[entry["room"]].append(slot)
            rows_by_date[entry["date"]].append({
                "n": slot_number,
                "start": entry["start"],
                "end": entry["end"],
                "subject": entry["subject"],
                "courseCode": entry["courseCode"],
                "classCode": entry["classCode"],
                "prof": entry["prof"],
                "room": entry["room"],
                "dept": department,
                "sem": semester,
                "strength": entry["strength"],
                "invigilators": entry["invigilators"],
                "serialNumber": entry["serialNumber"],
                "isLab": False,
                "mine": False,
            })
            subject_key = (entry["courseCode"], entry["subject"], entry["prof"])
            subjects[subject_key] = {
                "courseCode": entry["courseCode"],
                "subject": entry["subject"],
                "prof": entry["prof"],
                "dept": department,
                "sem": semester,
            }

        display_rows = [
            {"day": exam_date, "slots": slots}
            for exam_date, slots in sorted(rows_by_date.items())
        ]
        documents[f"exam_{department}_sem{semester}"] = {
            "dept": department,
            "semester": semester,
            "version": version,
            "effectiveDate": min(entry["date"] for entry in group_entries),
            "uploadedBy": uploaded_by,
            "status": "active",
            "updatedAt": datetime.now().astimezone().isoformat(),
            "sourceFormat": "xlsx",
            "sourceFileName": source_file_name,
            "lectureSlots": json.dumps(lecture_slots, ensure_ascii=False),
            "roomMap": json.dumps(dict(room_map), ensure_ascii=False),
            "displayRows": json.dumps(display_rows, ensure_ascii=False),
            "subjectsList": json.dumps(list(subjects.values()), ensure_ascii=False),
        }

    return documents, hashlib.sha256(payload).hexdigest(), len(entries)


def publish_exam_timetable_xlsx(
    payload: bytes,
    *,
    uploaded_by: str,
    version: str = "current",
    source_file_name: str = "",
) -> tuple[dict, int, str]:
    """Parse an Excel datesheet and atomically publish it as the active Exam dataset."""
    documents, source_hash, row_count = parse_exam_timetable_xlsx(
        payload,
        uploaded_by=uploaded_by,
        version=version,
        source_file_name=source_file_name,
    )
    save_text_pdf_timetable_documents(
        documents,
        active_document_ids=list(documents),
        source_hash=source_hash,
        schedule_mode="exam",
    )
    return documents, row_count, source_hash
