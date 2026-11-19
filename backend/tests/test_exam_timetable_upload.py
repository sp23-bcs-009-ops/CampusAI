from __future__ import annotations

import json
import os
import sys
from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import Workbook

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from timetable_upload import exam_datesheet_upload as exam


HEADERS = [
    "S No", "Date", "Time", "Course Code", "Course Title", "Class",
    "Strength", "Instructor", "Hall/Room", "Invigilators",
]


def _workbook_bytes(rows_by_sheet: dict[str, list[list]]) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    for sheet_name, rows in rows_by_sheet.items():
        sheet = workbook.create_sheet(sheet_name)
        sheet.append(["COMSATS University Islamabad"])
        sheet.append(["Midterm Exams - FA26"])
        sheet.append(HEADERS)
        for row in rows:
            sheet.append(row)
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def _row(serial, date, time_range, code, title, class_code, strength, instructor, room, invigilators):
    return [serial, date, time_range, code, title, class_code, strength, instructor, room, invigilators]


def test_excel_exam_rows_convert_to_dates_and_keep_duplicate_sections():
    payload = _workbook_bytes({
        "BAI": [
            _row(1, "2026-11-04", "0830-1000", "CSC291", "Software Engineering", "BAI-III", 8,
                 "Dr. Muazzam Maqsood", "EEhall", "Invigilator A, Invigilator B"),
            _row(2, "2026-11-04", "0830-1000", "CSC291", "Software Engineering", "BAI-III", 50,
                 "Syed Usman Anwar", "EEhall", "Invigilator A, Invigilator B"),
        ],
        "BCS": [
            _row(1, "2026-11-05", "1700-1830", "CSC418", "DevOps", "BCS-XI", 1,
                 "Babar Shazad", "CR2", ""),
        ],
    })

    documents, digest, row_count = exam.parse_exam_timetable_xlsx(
        payload,
        uploaded_by="staff@example.edu",
        version="Midterm Datesheet Modified.xlsx",
        source_file_name="Midterm Datesheet Modified.xlsx",
    )

    assert set(documents) == {"exam_ai_sem3", "exam_cs_sem11"}
    assert len(digest) == 64
    assert row_count == 3
    ai_doc = documents["exam_ai_sem3"]
    rooms = json.loads(ai_doc["roomMap"])
    assert len(rooms["EEhall"]) == 2
    assert [(slot["prof"], slot["strength"]) for slot in rooms["EEhall"]] == [
        ("Dr. Muazzam Maqsood", 8),
        ("Syed Usman Anwar", 50),
    ]
    assert rooms["EEhall"][0]["day"] == "2026-11-04"
    assert rooms["EEhall"][0]["start"] == "08:30"
    assert rooms["EEhall"][0]["courseCode"] == "CSC291"
    assert rooms["EEhall"][0]["classCode"] == "BAI-III"
    assert rooms["EEhall"][0]["invigilators"] == "Invigilator A, Invigilator B"
    assert json.loads(ai_doc["displayRows"])[0]["day"] == "2026-11-04"
    assert json.loads(ai_doc["lectureSlots"])["1"]["start"] == "08:30"
    assert documents["exam_cs_sem11"]["semester"] == 11


def test_excel_date_cells_and_combined_room_names_are_supported():
    payload = _workbook_bytes({
        "BMD": [
            _row(1, __import__("datetime").date(2026, 11, 7), "0830-1000", "HUM120",
                 "Expository Writing", "BMD-III", 13, "Muneeba Rehman", "CR4, CR3",
                 "Invigilator A; Invigilator B"),
        ],
    })

    documents, _, row_count = exam.parse_exam_timetable_xlsx(payload, uploaded_by="staff")
    slot = json.loads(documents["exam_md_sem3"]["roomMap"])["CR4, CR3"][0]
    assert row_count == 1
    assert slot["day"] == "2026-11-07"
    assert slot["room"] == "CR4, CR3"
    assert slot["invigilators"] == "Invigilator A; Invigilator B"


def test_missing_room_is_retained_as_not_assigned():
    payload = _workbook_bytes({
        "BSE": [
            _row(1, "2026-11-04", "0830-1000", "HUM208", "Civics", "BSE-II", 2,
                 "Sanober Tariq", None, None),
        ],
    })

    documents, _, _ = exam.parse_exam_timetable_xlsx(payload, uploaded_by="staff")
    slot = json.loads(documents["exam_se_sem2"]["roomMap"])["Not assigned"][0]
    assert slot["room"] == "Not assigned"
    assert slot["invigilators"] == ""


@pytest.mark.parametrize(
    ("row", "message"),
    [
        (_row(1, "2026-02-31", "0830-1000", "CSC101", "ICT", "BCS-I", 10, "Teacher", "CR1", ""),
         "Date must be a valid calendar date"),
        (_row(1, "2026-11-04", "1500-0830", "CSC101", "ICT", "BCS-I", 10, "Teacher", "CR1", ""),
         "does not end after it starts"),
        (_row(1, "2026-11-04", "0830-1000", "CSC101", "ICT", "BCS-XXI", 10, "Teacher", "CR1", ""),
         "Roman semester"),
        (_row(1, "2026-11-04", "0830-1000", "CSC101", "ICT", "BCS-I", 10.5, "Teacher", "CR1", ""),
         "Strength must be a whole number"),
    ],
)
def test_invalid_excel_rows_fail_before_publish(row, message):
    payload = _workbook_bytes({"BCS": [row]})

    with pytest.raises(exam.ExamTimetableValidationError, match=message):
        exam.parse_exam_timetable_xlsx(payload, uploaded_by="staff")


def test_publish_writes_only_exam_documents_and_manifest(monkeypatch):
    payload = _workbook_bytes({
        "BAF": [
            _row(1, "2026-11-04", "1010-1140", "CSC101", "Introduction to ICT",
                 "BAF-I", 23, "Sania Irum", "LH1", "Invigilator A"),
        ],
    })
    writes = []
    monkeypatch.setattr(exam, "save_text_pdf_timetable_documents", lambda docs, **kwargs: writes.append((docs, kwargs)))

    documents, row_count, digest = exam.publish_exam_timetable_xlsx(
        payload,
        uploaded_by="staff@example.edu",
        source_file_name="datesheet.xlsx",
    )

    assert row_count == 1
    assert len(digest) == 64
    assert set(documents) == {"exam_af_sem1"}
    assert writes[0][1]["active_document_ids"] == ["exam_af_sem1"]
    assert writes[0][1]["schedule_mode"] == "exam"
    assert documents["exam_af_sem1"]["sourceFormat"] == "xlsx"


def test_exam_upload_endpoint_is_staff_only_and_requires_exam_mode():
    api_source = (Path(__file__).parents[2] / "backend" / "api_server.py").read_text(encoding="utf-8")
    assert '@app.post("/upload-exam-timetable")' in api_source
    assert "_exam_upload_role_allowed(uploader)" in api_source
    assert 'current_mode != "exam"' in api_source
    assert "publish_exam_timetable_xlsx," in api_source


def test_exam_upload_accepts_dev_test_identity_only_when_dev_mode_is_enabled(monkeypatch):
    import api_server as API

    monkeypatch.setenv("TIMETABLE_UPLOAD_DEV_MODE", "false")
    assert API._exam_upload_role_allowed({"role": "staff"})
    assert not API._exam_upload_role_allowed({"role": "dev"})

    monkeypatch.setenv("TIMETABLE_UPLOAD_DEV_MODE", "true")
    assert API._exam_upload_role_allowed({"role": "dev"})
