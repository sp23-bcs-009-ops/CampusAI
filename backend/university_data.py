"""Read-only university records from the CampusAI Firestore project.

Live answers must come from Firestore. A failed read raises
UniversityDataUnavailable and must not be replaced with local JSON.
"""
from __future__ import annotations

import http.client
import json
import os
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

import config  # loads backend/.env without exposing secrets

ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII"}
DEPT_CODE = {
    "a_f": "A&F",
    "ai": "AI",
    "ba": "BA",
    "bda": "BDA",
    "ce": "CE",
    "cs": "CS",
    "ee": "EE",
    "english": "English",
    "maths": "Maths",
    "maths_ds": "Maths",
    "se": "SE",
}
DAY_NAMES = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}

_timetable_cache: dict | None = None
_cache_token: tuple | None = None
_cache_checked_at = 0.0
_active_mode = "regular"
# A manifest check is several seconds. Keep a loaded timetable in memory and
# only compare the manifest after this window. Documents are downloaded again
# only when that manifest token changes.
_CACHE_TTL_SECONDS = 300.0
_RECORD_CACHE: dict[tuple, tuple[float, list]] = {}
_RECORD_TTL_SECONDS = 300.0
NOTIF_DEPTS = ("ai", "a_f", "ba", "bda", "ce", "cs", "ee", "english", "math", "se")


class UniversityDataUnavailable(RuntimeError):
    """Firestore could not be read. Callers must not substitute local files."""


def project_id() -> str:
    return os.getenv("FIREBASE_PROJECT_ID", "universityassistentai").strip() or "universityassistentai"


def _base_url() -> str:
    project = urllib.parse.quote(project_id(), safe="")
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents"


_HTTP_LOCK = Lock()
_HTTP: http.client.HTTPSConnection | None = None


def _firebase_bytes(
    method: str,
    url: str,
    body: bytes | None = None,
    headers: dict | None = None,
) -> tuple[int, bytes]:
    """One reused HTTPS connection. Opening a new TLS session was several seconds."""
    global _HTTP
    parsed = urllib.parse.urlparse(url)
    target = parsed.path or "/"
    if parsed.query:
        target = f"{target}?{parsed.query}"
    request_headers = {"User-Agent": "campusai-backend/1.0"}
    if headers:
        request_headers.update(headers)
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    headers = request_headers
    last_error: Exception | None = None
    with _HTTP_LOCK:
        for _attempt in (1, 2):
            try:
                if _HTTP is None:
                    _HTTP = http.client.HTTPSConnection(parsed.hostname, timeout=25)
                _HTTP.request(method, target, body=body, headers=headers)
                response = _HTTP.getresponse()
                return response.status, response.read()
            except (http.client.HTTPException, TimeoutError, OSError) as exc:
                last_error = exc
                if _HTTP is not None:
                    try:
                        _HTTP.close()
                    except OSError:
                        pass
                _HTTP = None
    raise UniversityDataUnavailable(
        "Could not reach Firestore. Current university records are unavailable."
    ) from last_error


def _request_json(url: str, missing_ok: bool = False):
    status, raw = _firebase_bytes("GET", url)
    if missing_ok and status == 404:
        return None
    if status >= 400:
        raise UniversityDataUnavailable(
            f"Firestore returned HTTP {status} while reading university records."
        )
    try:
        return json.loads(raw.decode())
    except json.JSONDecodeError as exc:
        raise UniversityDataUnavailable(
            "Could not reach Firestore. Current university records are unavailable."
        ) from exc


def _unwrap(value):
    if not isinstance(value, dict):
        return value
    if "stringValue" in value:
        return value["stringValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return value["doubleValue"]
    if "booleanValue" in value:
        return value["booleanValue"]
    if "nullValue" in value:
        return None
    if "timestampValue" in value:
        return value["timestampValue"]
    if "arrayValue" in value:
        return [_unwrap(item) for item in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {key: _unwrap(item) for key, item in value["mapValue"].get("fields", {}).items()}
    return None


def _decode(document: dict) -> dict:
    return {key: _unwrap(value) for key, value in (document.get("fields") or {}).items()}


def _document(path: str, missing_ok: bool = False):
    payload = _request_json(f"{_base_url()}/{path}", missing_ok=missing_ok)
    if payload is None:
        return None
    if "fields" not in payload and "name" not in payload:
        return None
    return _decode(payload)


def _batch_get(paths: list[str], field_paths: tuple[str, ...] | None = None) -> list[dict | None]:
    """Read many documents in one Firestore request. Missing paths come back as None."""
    if not paths:
        return []
    project = project_id()
    names = [
        f"projects/{project}/databases/(default)/documents/{path}"
        for path in paths
    ]
    body: dict = {"documents": names}
    if field_paths:
        body["mask"] = {"fieldPaths": list(field_paths)}
    status, raw = _firebase_bytes("POST", f"{_base_url()}:batchGet", json.dumps(body).encode())
    if status >= 400:
        raise UniversityDataUnavailable(
            f"Firestore returned HTTP {status} while reading university records."
        )
    try:
        payload = json.loads(raw.decode())
    except json.JSONDecodeError as exc:
        raise UniversityDataUnavailable(
            "Could not reach Firestore. Current university records are unavailable."
        ) from exc
    if not isinstance(payload, list):
        raise UniversityDataUnavailable("Firestore returned an unreadable timetable batch.")
    found: dict[str, dict | None] = {name: None for name in names}
    for item in payload:
        if not isinstance(item, dict):
            continue
        if "found" in item and isinstance(item["found"], dict):
            document = item["found"]
            found[str(document.get("name") or "")] = _decode(document)
        elif "missing" in item:
            found[str(item["missing"])] = None
    return [found.get(name) for name in names]


def _list_collection(collection: str, missing_ok: bool = False) -> list[dict]:
    documents = []
    token = None
    while True:
        query = {"pageSize": "100"}
        if token:
            query["pageToken"] = token
        url = f"{_base_url()}/{collection}?{urllib.parse.urlencode(query)}"
        try:
            payload = _request_json(url)
        except UniversityDataUnavailable as exc:
            if missing_ok and "HTTP 404" in str(exc):
                return []
            raise
        documents.extend(_decode(doc) for doc in payload.get("documents") or [])
        token = payload.get("nextPageToken")
        if not token:
            return documents


def _class_key(dept: str, semester) -> str | None:
    try:
        number = int(semester)
    except (TypeError, ValueError):
        return None
    code = DEPT_CODE.get(str(dept or "").strip().lower())
    roman = ROMAN.get(number)
    if not code or not roman:
        return None
    return f"BS({code})-{roman}"


def _day_name(value: str) -> str:
    text = str(value or "").strip()
    return DAY_NAMES.get(text.lower(), text)


def _entry_from_slot(slot: dict, day: str) -> dict | None:
    subject = str(slot.get("subject") or "").strip()
    if not subject:
        return None
    start = str(slot.get("start") or "").strip()
    end = str(slot.get("end") or "").strip()
    if start and end:
        when = f"{start}-{end}"
    else:
        when = start or end
    return {
        "subject": subject,
        "teacher": str(slot.get("prof") or slot.get("teacher") or "N/A").strip() or "N/A",
        "room": str(slot.get("room") or slot.get("venue") or "N/A").strip() or "N/A",
        "time": when,
        "day": day,
        "is_repeater": bool(slot.get("isRepeater") or slot.get("is_repeater")),
        "is_lab": bool(slot.get("isLab") or slot.get("is_lab")),
        "lab_group": slot.get("labGroup") or slot.get("lab_group"),
    }


def timetable_from_documents(documents: dict[str, dict]) -> dict:
    """Build the class/day/slot structure the timetable engine already expects."""
    timetable: dict = {}
    for data in documents.values():
        class_key = _class_key(data.get("dept"), data.get("semester"))
        if not class_key:
            continue
        raw_rows = data.get("displayRows")
        if isinstance(raw_rows, str):
            try:
                rows = json.loads(raw_rows)
            except json.JSONDecodeError as exc:
                raise UniversityDataUnavailable(
                    f"Firestore timetable for {class_key} has unreadable display rows."
                ) from exc
        else:
            rows = raw_rows or []
        if isinstance(rows, dict):
            rows = [{"day": day, "slots": slots} for day, slots in rows.items()]
        class_days = timetable.setdefault(class_key, {})
        for day_row in rows:
            day = _day_name(day_row.get("day"))
            if not day:
                continue
            slots = class_days.setdefault(day, {})
            for slot in day_row.get("slots") or []:
                entry = _entry_from_slot(slot, day)
                if entry is None:
                    continue
                slots.setdefault(entry["time"], []).append(entry)
    return timetable


def _active_ids(manifest: dict | None) -> list[str]:
    if not manifest:
        return []
    raw = manifest.get("documentIds")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if item]


def active_mode() -> str:
    return _active_mode


def schedule_mode() -> str:
    global _active_mode
    document = _document("settings/schedule_mode", missing_ok=True) or {}
    mode = str(document.get("mode") or "regular").strip().lower()
    _active_mode = mode if mode in {"regular", "holiday", "exam"} else "regular"
    return _active_mode


def _published_token(mode_doc: dict | None, current: dict | None, exam: dict | None) -> tuple:
    global _active_mode
    mode = str((mode_doc or {}).get("mode") or "regular").strip().lower()
    _active_mode = mode if mode in {"regular", "holiday", "exam"} else "regular"
    # Holiday still has a published regular timetable. Callers label it as not in session.
    manifest_mode = "exam" if _active_mode == "exam" else "regular"
    path = "text_pdf_timetables/exam_current" if manifest_mode == "exam" else "text_pdf_timetables/current"
    manifest = exam if manifest_mode == "exam" else current
    if not manifest:
        return (_active_mode, path, None, ())
    updated = manifest.get("updatedAt") or manifest.get("version") or "published"
    return (_active_mode, path, updated, tuple(_active_ids(manifest)))


def load_firebase_timetable() -> dict:
    global _timetable_cache, _cache_token, _cache_checked_at
    if _timetable_cache is not None and (time.time() - _cache_checked_at) < _CACHE_TTL_SECONDS:
        return _timetable_cache
    mode_doc, current, exam = _batch_get([
        "settings/schedule_mode",
        "text_pdf_timetables/current",
        "text_pdf_timetables/exam_current",
    ])
    token = _published_token(mode_doc, current, exam)
    if (
        _timetable_cache is not None
        and _cache_token is not None
        and token[2:] == _cache_token[2:]
        and token[2] is not None
    ):
        _cache_checked_at = time.time()
        return _timetable_cache
    _mode, _path, updated_at, active = token
    if updated_at is None:
        label = "exam" if _active_mode == "exam" else "regular"
        raise UniversityDataUnavailable(
            f"Firestore has no published {label} timetable."
        )
    if not active:
        raise UniversityDataUnavailable("Firestore timetable manifest lists no class documents.")

    fetched = _batch_get(
        [f"text_pdf_timetables/{document_id}" for document_id in active],
        ("dept", "semester", "displayRows"),
    )
    documents = {}
    for document_id, document in zip(active, fetched):
        if document is None:
            raise UniversityDataUnavailable(
                f"Firestore timetable document {document_id} is missing."
            )
        documents[document_id] = document
    timetable = timetable_from_documents(documents)
    if not timetable:
        raise UniversityDataUnavailable("Firestore timetable documents contained no class meetings.")
    _timetable_cache = timetable
    _cache_token = token
    _cache_checked_at = time.time()
    return timetable


def load_timetable() -> dict:
    return load_firebase_timetable()


def _public_records(documents: list[dict], fields: tuple[str, ...]) -> list[dict]:
    records = []
    for document in documents:
        record = {}
        for field in fields:
            value = document.get(field)
            if value in (None, "", [], {}):
                continue
            if isinstance(value, str) and len(value) > 500:
                value = value[:500].rstrip() + "..."
            record[field] = value
        if record:
            records.append(record)
    return records


def _notification_targets(dept: str | None, semester: int | None) -> list[tuple[str, int]]:
    depts = (dept,) if dept else NOTIF_DEPTS
    semesters = (semester,) if semester else tuple(range(1, 9))
    return [(item, number) for item in depts for number in semesters]


def firebase_records(
    kind: str,
    dept: str | None = None,
    semester: int | None = None,
) -> list[dict]:
    key = (kind, dept, semester)
    cached = _RECORD_CACHE.get(key)
    now = time.time()
    if cached and (now - cached[0]) < _RECORD_TTL_SECONDS:
        return cached[1]
    records = _firebase_records(kind, dept, semester)
    _RECORD_CACHE[key] = (time.time(), records)
    return records


def _firebase_records(
    kind: str,
    dept: str | None = None,
    semester: int | None = None,
) -> list[dict]:
    if kind == "events":
        return _public_records(
            _list_collection("events"),
            ("title", "date", "time", "endTime", "venue", "cat", "deadline", "body"),
        )
    if kind == "lostfound":
        return _public_records(
            _list_collection("lostfound"),
            ("title", "type", "cat", "location", "date", "resolved", "body"),
        )
    if kind == "announcements":
        return _public_records(
            _list_collection("emergency_announcements"),
            ("title", "priority", "createdAt", "body"),
        )
    if kind == "teachers":
        return _public_records(
            _list_collection("teachers"),
            ("name", "department", "office", "position", "classCount"),
        )
    if kind == "notifications":
        targets = _notification_targets(dept, semester)

        def fetch(target: tuple[str, int]):
            item, number = target
            posts = _list_collection(
                f"notifications/{item}/semesters/{number}/posts",
                missing_ok=True,
            )
            for post in posts:
                post["department"] = item
                post["semester"] = number
            return posts

        with ThreadPoolExecutor(max_workers=8) as pool:
            grouped = pool.map(fetch, targets)
        posts = [post for batch in grouped for post in batch]
        return _public_records(
            posts,
            ("title", "subject", "type", "date", "room", "lectureNum", "body", "message", "department", "semester"),
        )
    raise UniversityDataUnavailable(f"Unknown university record type {kind!r}.")
