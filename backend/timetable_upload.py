"""OCR-to-Firestore conversion and authenticated timetable persistence."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import threading
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from .teacher_matching import match_teacher_list_name
except ImportError:
    from teacher_matching import match_teacher_list_name

import firebase_admin
from firebase_admin import auth, credentials, firestore


logger = logging.getLogger(__name__)

DAY_ORDER = {day: index for index, day in enumerate(
    ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
)}
DEFAULT_TEACHER_LIST = Path(__file__).resolve().parents[1] / "Frontend" / "src" / "data" / "teachers_seed.json"
_FIREBASE_LOCK = threading.Lock()


class TimetableConversionError(ValueError):
    """Raised when OCR output cannot be safely represented by the app schema."""


class InvalidFirebaseToken(ValueError):
    """Raised when a supplied Firebase ID token cannot be verified."""


def _firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    with _FIREBASE_LOCK:
        try:
            return firebase_admin.get_app()
        except ValueError:
            encoded = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "").strip()
            inline_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
            credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
            project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip() or None

            if encoded:
                try:
                    service_account = json.loads(base64.b64decode(encoded).decode("utf-8"))
                except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is invalid.") from exc
                firebase_credential = credentials.Certificate(service_account)
            elif inline_json:
                try:
                    firebase_credential = credentials.Certificate(json.loads(inline_json))
                except (ValueError, json.JSONDecodeError) as exc:
                    raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is invalid.") from exc
            elif credential_path:
                firebase_credential = credentials.Certificate(credential_path)
            else:
                raise RuntimeError(
                    "Configure FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 or "
                    "GOOGLE_APPLICATION_CREDENTIALS for server-side Firebase access."
                )

            options = {"projectId": project_id} if project_id else None
            try:
                return firebase_admin.initialize_app(firebase_credential, options)
            except ValueError:
                return firebase_admin.get_app()


def verify_timetable_uploader(id_token: str) -> dict:
    """Verify a Firebase ID token and require a saved teacher/staff profile."""
    app = _firebase_app()
    try:
        decoded = auth.verify_id_token(id_token, app=app, check_revoked=True)
    except Exception as exc:
        raise InvalidFirebaseToken("Firebase ID token is invalid or expired.") from exc
    if os.getenv("TIMETABLE_UPLOAD_DEV_MODE", "false").strip().lower() == "true":
        uid = decoded.get("uid")
        if not uid:
            raise PermissionError("A verified university account is required.")
        try:
            firebase_user = auth.get_user(uid, app=app)
        except Exception as exc:
            raise PermissionError("A verified university account is required.") from exc
        email = str(firebase_user.email or "").strip() or "dev-upload-user"
        logger.warning("TIMETABLE_UPLOAD_DEV_MODE is enabled; accepting Firebase user %s", email)
        return {"email": email, "role": "dev"}

    email = str(decoded.get("email") or "").strip()
    if not email or decoded.get("email_verified") is not True:
        raise PermissionError("A verified university account is required.")

    profile_id = email.replace(".", "_")
    profile_snapshot = firestore.client(app=app).collection("users").document(profile_id).get()
    profile = profile_snapshot.to_dict() if profile_snapshot.exists else None
    role = profile.get("type") if profile else None
    if role not in {"teacher", "staff"}:
        raise PermissionError("Only a registered Teacher or Staff account can upload timetables.")
    return {"email": email, "role": role}


def _normalize_department_code(value) -> str | None:
    raw = " ".join(str(value or "").strip().upper().split())
    if not raw:
        return None
    wrapped = re.fullmatch(r"(?:BS\s*)?\(\s*(.+?)\s*\)", raw)
    if wrapped:
        raw = wrapped.group(1).strip()
    raw = re.sub(r"^(?:BS|B)\s+", "", raw)
    raw = re.sub(r"\s+DEPARTMENT$", "", raw)
    aliases = {
        "COMPUTER SCIENCE": "CS", "COMPUTER SCIENCES": "CS", "COMP SCI": "CS",
        "SOFTWARE ENGINEERING": "SE", "ARTIFICIAL INTELLIGENCE": "AI",
    }
    raw = aliases.get(raw, raw)
    code = re.sub(r"[^A-Z0-9]+", "_", raw).strip("_")
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,15}", code):
        return None
    return code.lower()


def _normalize_semester_number(value) -> int | None:
    raw = " ".join(str(value or "").strip().upper().split())
    raw = re.sub(r"^(?:SEMESTER|SEM)\s*[:#-]?\s*", "", raw)
    if raw.isdigit():
        number = int(raw)
        return number if number > 0 else None
    if not re.fullmatch(r"[MDCLXVI]+", raw):
        return None
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for index, char in enumerate(raw):
        value_at_index = values[char]
        if index + 1 < len(raw) and value_at_index < values[raw[index + 1]]:
            total -= value_at_index
        else:
            total += value_at_index
    canonical = ""
    remainder = total
    for number, numeral in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
                            (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
                            (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        count, remainder = divmod(remainder, number)
        canonical += numeral * count
    return total if total > 0 and canonical == raw else None


def _normalize_lecture_number(value) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    raw = " ".join(str(value).strip().split())
    match = re.fullmatch(r"(?:LECTURE|LEC)\s*#?\s*(\d+)|#?(\d+)", raw, re.I)
    if not match:
        return None
    number = int(match.group(1) or match.group(2))
    return number if number > 0 else None


def _normalize_clock(value) -> str | None:
    if value is None or not str(value).strip():
        return None
    minutes = _clock_minutes(str(value))
    return _format_clock(minutes) if minutes is not None else None


def ocr_page_has_structured_schema(page: dict) -> bool:
    """Validate shape only; ambiguous values are handled as conversion warnings."""
    if not isinstance(page, dict):
        return False
    # Only the versioned row/column schema is valid for new OCR or checkpoints.
    # In particular, legacy flat `entries` pages must be re-OCRed even when they
    # happen to contain all fields required by the older converter.
    if page.get("schema_version") != 2:
        return False
    if page.get("department") is not None and not isinstance(page.get("department"), str):
        return False
    if page.get("semester") is not None and not isinstance(page.get("semester"), (str, int)):
        return False
    if not isinstance(page.get("lecture_slots"), list):
        return False
    if not isinstance(page.get("rows"), list):
        return False
    expected_days = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
    if len(page["rows"]) != len(expected_days):
        return False
    expected_columns = len(page["lecture_slots"])
    return all(
        isinstance(row, dict) and row.get("day") == expected_days[row_index]
        and isinstance(row.get("columns"), list) and len(row["columns"]) == expected_columns and all(
            isinstance(cell, dict) and isinstance(cell.get("entries"), list)
            and len(cell["entries"]) <= 2
            and all(isinstance(entry, dict) for entry in cell["entries"])
            for cell in row["columns"]
        ) for row_index, row in enumerate(page["rows"])
    )


def ocr_checkpoint_page_is_reusable(page: dict) -> bool:
    """Reuse only complete pages written with the current row/column schema."""
    return ocr_page_has_structured_schema(page)

def _normalize_day(value) -> str | None:
    raw = re.sub(r"[^A-Z]", "", str(value or "").upper())
    aliases = {
        "MON": "Mon", "MONDAY": "Mon", "TUE": "Tue", "TUES": "Tue", "TUESDAY": "Tue",
        "WED": "Wed", "WEDNESDAY": "Wed", "THU": "Thu", "THUR": "Thu", "THURS": "Thu", "THURSDAY": "Thu",
        "FRI": "Fri", "FRIDAY": "Fri",
    }
    return aliases.get(raw)


def normalize_department_semester(page: dict) -> tuple[str, int] | None:
    """Read an explicit department/semester pair; never infer from old docs."""
    label = " ".join(str(page.get("semester") or "").strip().upper().split())
    semester_token = r"([MDCLXVI]+|\d+)"
    patterns = (
        rf"^(?:BS|BA|BBA|BSC|B)\s*\(\s*([A-Z][A-Z0-9_& ]{{0,19}}?)\s*\)\s*[-–:]?\s*{semester_token}$",
        rf"^(?:BS[\s-]+)?([A-Z][A-Z0-9_& ]{{0,19}}?)\s*[-–:]\s*{semester_token}$",
        rf"^([A-Z][A-Z0-9_& ]{{0,19}}?)\s+SEM(?:ESTER)?\s+{semester_token}$",
    )
    parsed_label = None
    for pattern in patterns:
        match = re.fullmatch(pattern, label)
        if match:
            dept = _normalize_department_code(match.group(1))
            semester = _normalize_semester_number(match.group(2))
            if dept and semester:
                parsed_label = (dept, semester)
            break

    declared_department = _normalize_department_code(page.get("department"))
    if parsed_label:
        if declared_department and declared_department != parsed_label[0]:
            return None
        return parsed_label
    if not declared_department:
        return None
    semester = _normalize_semester_number(page.get("semester"))
    if semester is None:
        return None
    return declared_department, semester


def normalize_room_id(value) -> str:
    """Mirror the app's LT/Lab normalization for room IDs."""
    raw = " ".join(str(value or "").strip().split())
    if not raw:
        return ""
    lecture_room = re.search(r"\bLT\s*(\d+)\b", raw, re.IGNORECASE)
    if lecture_room:
        return f"LT{lecture_room.group(1)}"
    lab_room = re.search(r"(?:C\s*\.?\s*Lab|Lab)\s*(\d+)\b", raw, re.IGNORECASE)
    if lab_room:
        return f"Lab{lab_room.group(1)}"
    return raw


def _clock_minutes(value: str) -> int | None:
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})(?:\s*([AP]M))?\s*", value, re.I)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    suffix = (match.group(3) or "").upper()
    if minute > 59:
        return None
    if suffix:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if suffix == "PM" else 0)
    elif hour > 23:
        return None
    return hour * 60 + minute


def _format_clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_time_slot(value) -> dict | None:
    """Read explicit Lecture N and time range from a legacy combined OCR field."""
    raw = " ".join(str(value or "").replace("\u2013", "-").replace("\u2014", "-").split())
    if not raw:
        return None
    numbers = [int(n) for n in re.findall(r"\b(?:Lecture|Lec)\s*#?\s*(\d+)\b", raw, re.I)]
    if len(numbers) > 1 or (numbers and numbers[0] < 1):
        return None
    clocks = re.findall(r"(?<!\d)(\d{1,2}:\d{2}(?:\s*[AP]M)?)(?!\d)", raw, re.I)
    if clocks and len(clocks) != 2:
        return None
    if len(clocks) == 2:
        start_min, end_min = _clock_minutes(clocks[0]), _clock_minutes(clocks[1])
        if start_min is None or end_min is None or end_min <= start_min:
            return None
        return {"lecture_num": numbers[0] if numbers else None,
                "start": _format_clock(start_min), "end": _format_clock(end_min)}
    if len(numbers) == 1:
        return {"lecture_num": numbers[0], "start": None, "end": None}
    return None


def parse_ocr_entry_slot(entry: dict) -> dict | None:
    """Prefer structured fields; read legacy time_slot only for resumable checkpoints."""
    number = _normalize_lecture_number(entry.get("lecture_num"))
    start = _normalize_clock(entry.get("start_time"))
    end = _normalize_clock(entry.get("end_time"))
    legacy = parse_time_slot(entry.get("time_slot"))
    if legacy:
        number = number or legacy.get("lecture_num")
        start = start or legacy.get("start")
        end = end or legacy.get("end")
    if number is None and start is None and end is None:
        return None
    if bool(start) != bool(end):
        return {"lecture_num": number, "start": None, "end": None}
    if start and end:
        start_min, end_min = _clock_minutes(start), _clock_minutes(end)
        if start_min is None or end_min is None or end_min <= start_min:
            return {"lecture_num": number, "start": None, "end": None}
        start, end = _format_clock(start_min), _format_clock(end_min)
    return {"lecture_num": number, "start": start, "end": end}


_SUBJECT_STOP_WORDS = {"a", "an", "and", "for", "in", "of", "the", "to"}
_TEACHER_TITLES = ("professor", "prof", "doctor", "dr", "mr", "mrs", "ms", "miss")


def _subject_match_keys(value: str) -> set[str]:
    """Return conservative phrase/acronym keys for clash-only subject matching."""
    text = str(value or "").strip()
    compact = re.sub(r"[^a-z0-9]", "", text.casefold())
    if not compact:
        return set()

    words = re.findall(r"[a-z0-9]+", text.casefold())
    meaningful = [word for word in words if word not in _SUBJECT_STOP_WORDS]
    keys = {compact}
    if len(compact) >= 4:
        keys.add(compact)
    if len(words) >= 2:
        keys.add("".join(word[0] for word in words))
    if len(meaningful) >= 2:
        keys.add("".join(word[0] for word in meaningful))

    # Preserve capitals from timetable abbreviations such as "ItM" -> "IM".
    capitals = "".join(re.findall(r"[A-Z]", text))
    if len(capitals) >= 2:
        keys.add(capitals.casefold())
    return {key for key in keys if len(key) >= 2}


def _subjects_are_aliases(left: str, right: str) -> bool:
    left_text = str(left or "").strip()
    right_text = str(right or "").strip()
    left_compact = re.sub(r"[^a-z0-9]", "", left_text.casefold())
    right_compact = re.sub(r"[^a-z0-9]", "", right_text.casefold())
    if not left_compact or not right_compact or left_compact == right_compact:
        return False
    if min(len(left_compact), len(right_compact)) >= 4 and (
        left_compact in right_compact or right_compact in left_compact
    ):
        return True
    return bool(_subject_match_keys(left_text) & _subject_match_keys(right_text))


def _normalized_teacher_name(value: str) -> str:
    words = re.findall(r"[a-z0-9]+", str(value or "").casefold())
    while words and words[0] in _TEACHER_TITLES:
        words.pop(0)
    return " ".join(words)


def _load_canonical_teacher_names() -> list[str]:
    try:
        payload = json.loads(DEFAULT_TEACHER_LIST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    return [
        str(item.get("name", "")).strip()
        for item in payload
        if isinstance(item, dict) and str(item.get("name", "")).strip()
    ]


def _canonicalize_clashing_subject_aliases(
    entries_by_group: dict[tuple[str, int], list[dict]],
) -> int:
    """Unify subject labels only for same-room/time clashes with the same teacher."""
    collision_groups: dict[tuple[str, str, str, str], list[dict]] = defaultdict(list)
    for entries in entries_by_group.values():
        for entry in entries:
            if not entry.get("room"):
                continue
            collision_groups[(
                str(entry.get("day") or "").casefold(),
                str(entry.get("start") or ""),
                str(entry.get("end") or ""),
                normalize_room_id(entry.get("room")).casefold(),
            )].append(entry)

    changed = 0
    for collisions in collision_groups.values():
        if len(collisions) < 2:
            continue
        # Build connected alias groups, requiring both a teacher match and a
        # subject-name relation for every union. Different classes stay intact.
        parent = list(range(len(collisions)))

        def find(index: int) -> int:
            while parent[index] != index:
                parent[index] = parent[parent[index]]
                index = parent[index]
            return index

        for left_index in range(len(collisions)):
            left = collisions[left_index]
            left_teacher = _normalized_teacher_name(left.get("prof"))
            if not left_teacher:
                continue
            for right_index in range(left_index + 1, len(collisions)):
                right = collisions[right_index]
                if left_teacher != _normalized_teacher_name(right.get("prof")):
                    continue
                if not _subjects_are_aliases(left.get("subject"), right.get("subject")):
                    continue
                left_root, right_root = find(left_index), find(right_index)
                if left_root != right_root:
                    parent[right_root] = left_root

        components: dict[int, list[dict]] = defaultdict(list)
        for index, entry in enumerate(collisions):
            components[find(index)].append(entry)
        for component in components.values():
            if len(component) < 2:
                continue
            # The full phrase is the persisted/displayed canonical subject.
            canonical = max(
                (str(entry.get("subject") or "").strip() for entry in component),
                key=lambda subject: (len(re.sub(r"[^a-z0-9]", "", subject.casefold())), subject.casefold()),
            )
            for entry in component:
                if entry.get("subject") != canonical:
                    entry["subject"] = canonical
                    changed += 1
    return changed

def convert_ocr_to_documents(ocr_result: dict, *, version: str, effective_date: str,
                             uploaded_by: str, status: str = "active",
                             schedule_mode: str = "regular",
                             teacher_names: list[str] | None = None) -> tuple[dict, list[str]]:
    """Build timetable documents only from department, semester, and times in this PDF."""
    if not isinstance(ocr_result, dict) or not isinstance(ocr_result.get("pages"), list):
        raise TimetableConversionError("OCR result does not contain a pages array.")
    if ocr_result.get("failed_pages"):
        raise TimetableConversionError(
            f"OCR is incomplete; failed pages: {ocr_result['failed_pages']}"
        )
    if schedule_mode not in {"regular", "exam"}:
        raise TimetableConversionError("scheduleMode must be 'regular' or 'exam'.")

    warnings: list[str] = []
    canonical_teacher_names = teacher_names if teacher_names is not None else _load_canonical_teacher_names()
    records_by_group: dict[tuple[str, int], list[dict]] = defaultdict(list)
    ranges_by_group: dict[tuple[str, int], set[tuple[int, int]]] = defaultdict(set)
    labeled_ranges: dict[tuple[str, int], dict[int, set[tuple[int, int]]]] = defaultdict(
        lambda: defaultdict(set)
    )

    def warn(message: str) -> None:
        warnings.append(message)
        logger.warning("%s", message)

    for page in ocr_result["pages"]:
        if not isinstance(page, dict):
            warn("Skipped malformed OCR page record.")
            continue
        page_number = page.get("page", "?")
        detected_departments = page.get("detected_departments") or []
        detected_semesters = page.get("detected_semesters") or []
        if len({str(x).strip().upper() for x in detected_departments if str(x).strip()}) > 1 or len(
            {str(x).strip().upper() for x in detected_semesters if str(x).strip()}
        ) > 1:
            raise TimetableConversionError(
                f"Page Structure Error / Multiple Department or Semester Detected: page {page_number}; "
                f"departments={detected_departments}; semesters={detected_semesters}."
            )
        group = normalize_department_semester(page)
        if group is None:
            warn(
                f"Skipped page {page.get('page', '?')}: department/semester is ambiguous "
                f"({page.get('department')!r}, {page.get('semester')!r})."
            )
            continue
        department, semester = group
        page_entries = page.get("entries")
        structural_rows = page.get("rows")
        if isinstance(structural_rows, list):
            if len(structural_rows) != 5:
                raise TimetableConversionError(
                    f"Page Structure Error: page {page_number} must contain Monday-Friday rows."
                )
            # Position is authoritative: the blank corner is outside this array,
            # row position maps to weekday, and each cell's column maps to L number.
            day_names = ("Mon", "Tue", "Wed", "Thu", "Fri")
            expected_columns = len(page.get("lecture_slots", []))
            positional_entries = []
            for row_index, row in enumerate(structural_rows):
                columns = row.get("columns", []) if isinstance(row, dict) else []
                if not isinstance(columns, list):
                    raise TimetableConversionError(f"Page Structure Error: invalid row on page {page_number}.")
                if len(columns) != expected_columns:
                    raise TimetableConversionError(
                        f"Page Structure Error: page {page_number} row {row_index + 1} has "
                        f"{len(columns)} columns; expected {expected_columns} from the header."
                    )
                for column_index, cell in enumerate(columns):
                    if column_index >= len(page.get("lecture_slots", [])):
                        raise TimetableConversionError(
                            f"Page Structure Error: page {page_number} row {row_index + 1} has a column "
                            "without a matching lecture header."
                        )
                    cell_entries = cell.get("entries", []) if isinstance(cell, dict) else []
                    if not isinstance(cell_entries, list):
                        raise TimetableConversionError(f"Page Structure Error: invalid cell on page {page_number}.")
                    for cell_entry in cell_entries:
                        item = dict(cell_entry)
                        item["day"] = day_names[row_index]
                        item["lecture_num"] = column_index + 1
                        item["_structural"] = True
                        positional_entries.append(item)
            page_entries = positional_entries
        if not isinstance(page_entries, list):
            warn(f"Skipped page {page.get('page', '?')}: entries is not an array.")
            continue

        page_slots = page.get("lecture_slots")
        for slot_index, slot in enumerate(page_slots if isinstance(page_slots, list) else [], start=1):
            if not isinstance(slot, dict):
                warn(f"Skipped page {page.get('page', '?')} lecture slot {slot_index}: malformed slot.")
                continue
            # The header array's left-to-right position defines lecture number.
            number = slot_index
            start = _normalize_clock(slot.get("start_time") or slot.get("start"))
            end = _normalize_clock(slot.get("end_time") or slot.get("end"))
            start_min = _clock_minutes(start) if start else None
            end_min = _clock_minutes(end) if end else None
            if number is None or start_min is None or end_min is None or end_min <= start_min:
                warn(f"Skipped page {page.get('page', '?')} lecture slot {slot_index}: invalid PDF lecture number/time.")
                continue
            interval = (start_min, end_min)
            ranges_by_group[group].add(interval)
            labeled_ranges[group][number].add(interval)

        for index, entry in enumerate(page_entries, start=1):
            if not isinstance(entry, dict):
                warn(f"Skipped page {page.get('page', '?')} entry {index}: malformed entry.")
                continue
            parsed_time = parse_ocr_entry_slot(entry)
            has_class_data = any(
                str(entry.get(field) or "").strip()
                for field in ("day", "subject", "room", "teacher")
            )
            if parsed_time is None:
                if has_class_data:
                    warn(
                        f"Skipped page {page.get('page', '?')} entry {index}: "
                        "no explicit lecture number or usable time fields were extracted."
                    )
                continue

            number = _normalize_lecture_number(entry.get("lecture_num")) if entry.get("_structural") else parsed_time["lecture_num"]
            if number is not None:
                interval = None
            if parsed_time["start"] and parsed_time["end"]:
                start_min = _clock_minutes(parsed_time["start"])
                end_min = _clock_minutes(parsed_time["end"])
                if start_min is not None and end_min is not None and end_min > start_min:
                    interval = (start_min, end_min)
                    ranges_by_group[group].add(interval)
                    if number is not None:
                        labeled_ranges[group][number].add(interval)

            records_by_group[group].append({
                "page": page.get("page", "?"),
                "index": index,
                "entry": entry,
                "lecture_num": number,
                "interval": interval,
            })

    # Use only lecture-number/time pairs explicitly identified in this PDF.
    for group, by_number in labeled_ranges.items():
        conflicts = {number: values for number, values in by_number.items() if len(values) > 1}
        if conflicts:
            detail = ", ".join(
                f"Lecture {number}={sorted((_format_clock(a), _format_clock(b)) for a, b in values)}"
                for number, values in sorted(conflicts.items())
            )
            raise TimetableConversionError(
                f"PDF has conflicting times within {group[0].upper()} semester {group[1]} ({detail}); no data was written."
            )

    # A missing entry number is never inferred from its time range. Only explicit
    # PDF slot definitions can supply a time for an entry that already has a number.
    slot_ranges_by_group: dict[tuple[str, int], dict[int, tuple[int, int]]] = {}
    for group in records_by_group:
        number_ranges: dict[int, tuple[int, int]] = {}
        for number, intervals in labeled_ranges[group].items():
            if len(intervals) == 1:
                number_ranges[number] = next(iter(intervals))
        slot_ranges_by_group[group] = number_ranges

        numbered_intervals = {
            next(iter(intervals))
            for intervals in labeled_ranges[group].values()
            if len(intervals) == 1
        }
        unnumbered_ranges = ranges_by_group[group] - numbered_intervals
        if unnumbered_ranges:
            warn(
                f"{group[0].upper()} semester {group[1]}: "
                f"{len(unnumbered_ranges)} PDF time range(s) had no explicit Lecture number."
            )

    entries_by_group: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for group, records in records_by_group.items():
        department, semester = group
        for record in records:
            entry = record["entry"]
            day = _normalize_day(entry.get("day"))
            room = normalize_room_id(entry.get("room"))
            subject = str(entry.get("subject") or "").strip()
            if not day or (not subject and not room and not str(entry.get("teacher") or "").strip()):
                # Empty timetable cells still contributed PDF slot definitions above.
                continue

            number = record["lecture_num"]
            interval = record["interval"]
            if number is None:
                warn(
                    f"Skipped page {record['page']} entry {record['index']}: "
                    "lecture number could not be determined from this PDF."
                )
                continue

            if interval is None:
                interval = slot_ranges_by_group[group].get(number)
            if interval is None:
                warn(
                    f"Skipped page {record['page']} entry {record['index']}: "
                    f"no PDF time range was found for Lecture {number}."
                )
                continue

            start, end = _format_clock(interval[0]), _format_clock(interval[1])
            entries_by_group[group].append({
                "page": record["page"],
                "day": day,
                "lectureNum": number,
                "start": start,
                "end": end,
                "subject": subject,
                "prof": match_teacher_list_name(
                    str(entry.get("teacher") or "").strip(), canonical_teacher_names
                ),
                "dept": department,
                "sem": semester,
                "isLab": bool(entry.get("is_lab")),
                "isRepeater": bool(entry.get("is_repeater")),
                "labGroup": entry.get("group") or entry.get("lab_group") or "",
                "room": room,
                "mine": False,
            })

    entries_by_group = {
        group: entries for group, entries in entries_by_group.items() if entries
    }
    if not entries_by_group:
        raise TimetableConversionError(
            "No timetable entries with an explicit department, semester, lecture number, and PDF time could be converted; no data was written."
        )

    unified_aliases = _canonicalize_clashing_subject_aliases(entries_by_group)
    if unified_aliases:
        warn(
            f"Unified {unified_aliases} clashing timetable subject label(s) using the same-room/time and same-teacher checks."
        )

    # Report same-slot, same-room collisions without removing or merging entries.
    for (department, semester), entries in entries_by_group.items():
        clashes: dict[tuple[str, int, str], list[dict]] = defaultdict(list)
        for item in entries:
            clashes[(item["day"], item["lectureNum"], item["room"])].append(item)
        for (day, lecture, room), conflicts in clashes.items():
            if room and len(conflicts) > 1:
                detail = "; ".join(
                    f"{x['subject']} — {x['prof']} — Group {x['labGroup']} (page {x.get('page', '?')})"
                    for x in conflicts
                )
                warn(
                    f"Timetable Clash Detected: Department {department.upper()}, Semester {semester}, "
                    f"Day {day}, L{lecture} {conflicts[0]['start']}-{conflicts[0]['end']}, Room {room}; "
                    f"conflicting entries: {detail}."
                )

    slot_definitions: dict[tuple[str, int], dict[int, dict]] = {}
    for group in entries_by_group:
        definitions = {}
        for number, interval in sorted(slot_ranges_by_group[group].items()):
            definitions[number] = {
                "label": f"Lecture {number}",
                "start": _format_clock(interval[0]),
                "end": _format_clock(interval[1]),
            }
        slot_definitions[group] = definitions

    def make_document(entries: list[dict], department: str, semester: int | None,
                      lecture_slots: dict[int, dict]) -> dict:
        room_map: dict[str, list[dict]] = defaultdict(list)
        rows_by_day: dict[str, list[dict]] = defaultdict(list)
        subjects: list[dict] = []
        seen_subjects: set[tuple[str, str, bool]] = set()

        for item in entries:
            room = item["room"]
            room_map[room].append(
                {key: value for key, value in item.items() if key not in {"room", "mine"}}
                | {"isMine": False}
            )
            rows_by_day[item["day"]].append({
                "n": item["lectureNum"],
                "start": item["start"],
                "end": item["end"],
                "subject": item["subject"],
                "prof": item["prof"],
                "room": room,
                "dept": department,
                "sem": item["sem"],
                "isLab": item["isLab"],
                "mine": False,
            })
            subject_key = (item["subject"], item["prof"], item["isLab"])
            if subject_key not in seen_subjects:
                seen_subjects.add(subject_key)
                subjects.append({
                    "subject": item["subject"],
                    "prof": item["prof"],
                    "dept": department,
                    "sem": item["sem"],
                    "isLab": item["isLab"],
                })

        for room_slots in room_map.values():
            room_slots.sort(key=lambda slot: (DAY_ORDER.get(slot["day"], 99), slot["start"], slot["lectureNum"]))
        display_rows = [
            {"day": day, "slots": sorted(rows, key=lambda row: (row["n"], row["start"], row["room"]))}
            for day, rows in sorted(rows_by_day.items(), key=lambda pair: DAY_ORDER.get(pair[0], 99))
        ]
        document = {
            "dept": department,
            "version": version,
            "effectiveDate": effective_date,
            "uploadedBy": uploaded_by,
            "status": status,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "lectureSlots": json.dumps(lecture_slots, ensure_ascii=False),
            "roomMap": json.dumps(dict(room_map), ensure_ascii=False),
            "displayRows": json.dumps(display_rows, ensure_ascii=False),
            "subjectsList": json.dumps(subjects, ensure_ascii=False),
        }
        if semester is not None:
            document["semester"] = semester
        return document

    # Exam keeps the same per-department/semester document granularity as the
    # regular timetable. The `exam_` prefix lets both datasets live side by
    # side in the shared collection so neither overwrites the other.
    document_prefix = "exam_" if schedule_mode == "exam" else ""
    documents = {}
    for group, entries in sorted(entries_by_group.items()):
        department, semester = group
        documents[f"{document_prefix}{department}_sem{semester}"] = make_document(
            entries, department, semester, slot_definitions[group]
        )

    return documents, warnings

def _save_timetable_documents_to_collection(
    collection_name: str,
    documents: dict,
    *,
    active_document_ids: list[str] | None = None,
    source_hash: str | None = None,
    manifest_id: str = "pdf_upload_active",
) -> None:
    """Merge generated docs and atomically publish the active set in one collection."""
    db = firestore.client(app=_firebase_app())
    batch = db.batch()
    collection = db.collection(collection_name)
    for document_id, data in documents.items():
        batch.set(collection.document(document_id), data, merge=True)

    if active_document_ids is not None:
        batch.set(collection.document(manifest_id), {
            "documentIds": sorted(set(active_document_ids)),
            "sourceHash": source_hash or "",
            "status": "active",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }, merge=False)
    batch.commit()


def save_text_pdf_timetable_documents(
    documents: dict,
    *,
    active_document_ids: list[str] | None = None,
    source_hash: str | None = None,
    schedule_mode: str = "regular",
) -> None:
    """Persist only in the isolated Text PDF collection and manifest namespace."""
    if schedule_mode not in {"regular", "exam"}:
        raise TimetableConversionError("scheduleMode must be 'regular' or 'exam'.")
    _save_timetable_documents_to_collection(
        "text_pdf_timetables",
        documents,
        active_document_ids=active_document_ids,
        source_hash=source_hash,
        manifest_id="current" if schedule_mode == "regular" else "exam_current",
    )
