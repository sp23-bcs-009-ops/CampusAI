"""Offline regression fixture for split timetable cells."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import types

# Permit this converter-only fixture to run where firebase-admin is not installed.
try:
    import firebase_admin  # noqa: F401
except ImportError:
    firebase_admin = types.ModuleType("firebase_admin")
    firebase_admin.__path__ = []
    firebase_admin.auth = types.SimpleNamespace()
    firebase_admin.credentials = types.SimpleNamespace()
    firebase_admin.firestore = types.SimpleNamespace()
    sys.modules["firebase_admin"] = firebase_admin
    sys.modules["firebase_admin.auth"] = firebase_admin.auth
    sys.modules["firebase_admin.credentials"] = firebase_admin.credentials
    sys.modules["firebase_admin.firestore"] = firebase_admin.firestore

from backend.timetable_upload import (
    convert_ocr_to_documents,
    ocr_checkpoint_page_is_reusable,
    ocr_page_has_structured_schema,
)

FIXTURE = Path(__file__).parent / "fixtures" / "split_cell_timetable.json"


def test_split_cells_remain_entries_in_five_weekday_rows_and_convert():
    page = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert ocr_page_has_structured_schema(page)
    assert ocr_checkpoint_page_is_reusable(page)
    assert len(page["rows"]) == 5
    assert [len(row["columns"]) for row in page["rows"]] == [5] * 5

    documents, warnings = convert_ocr_to_documents(
        {"pages": [page]}, version="fixture", effective_date="", uploaded_by="offline"
    )
    assert warnings == []
    document = documents["cs_sem1"]
    lecture_slots = json.loads(document["lectureSlots"])
    assert list(lecture_slots) == ["1", "2", "3", "4", "5"]
    display_rows = json.loads(document["displayRows"])
    assert [row["day"] for row in display_rows] == ["Mon"]

    monday_entries = display_rows[0]["slots"]
    assert [(item["n"], item["subject"], item["room"]) for item in monday_entries] == [
        (1, "Upper split class", "LT1"),
        (1, "Lower split class", "LT2"),
        (2, "Upper only class", "LT3"),
        (3, "Lower only class", "LT4"),
    ]
    assert len(monday_entries) == 4  # L4 and L5 are empty split cells.
    assert len(json.loads(document["roomMap"])) == 4
