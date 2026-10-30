from __future__ import annotations

import json
from pathlib import Path

import pymupdf
import pytest

from backend import rule_based_text_pdf as local
from backend.text_pdf_layout import TextPdfValidationError


def _token(text, x, y, *, bold=False):
    return {
        "text": text, "x": float(x), "y": float(y),
        "bbox": [x - 2, y - 2, x + 2, y + 2],
        "font": "Helvetica-Bold" if bold else "Helvetica",
        "font_size": 8.0, "font_flags": 16 if bold else 0, "bold": bold,
    }


def _pdf(path: Path, *, lecture_count=3, omit_day=None, as_only=False, spanning_pair=False):
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    page.insert_text((20, 35), "BS(CS)-I", fontname="helv", fontsize=9)
    left, right = 80, 550
    width = (right - left) / lecture_count
    centers = [left + (index + 0.5) * width for index in range(lecture_count)]
    for number, center in enumerate(centers, start=1):
        page.insert_text((center - 26, 70), f"Lecture {number}", fontname="helv", fontsize=9)
        start_hour = 7 + number
        page.insert_text((center - 30, 94), f"{start_hour:02d}:00 - {start_hour + 1:02d}:00", fontname="helv", fontsize=8)

    row_edges = [100, 200, 300, 400, 500, 600]
    for y in row_edges:
        page.draw_line((left, y), (right, y), color=(0, 0, 0), width=0.5)
    x_edges = [left + index * width for index in range(lecture_count + 1)]
    for index, x in enumerate(x_edges):
        if spanning_pair and index == 1:
            continue
        page.draw_line((x, 100), (x, 600), color=(0, 0, 0), width=0.5)
    days = ("Mon", "Tue", "Wed", "Thu", "Fri")
    for index, day in enumerate(days):
        if day == omit_day:
            continue
        center_y = 150 + index * 100
        page.insert_text((16, center_y + 3), day, fontname="helv", fontsize=9)
    target_center = centers[-1]
    if as_only:
        page.insert_text((target_center - 8, 275), "AS", fontname="helv", fontsize=9)
        target_y = 150
    else:
        target_y = 250
    if spanning_pair:
        pair_center = (centers[0] + centers[1]) / 2
        page.insert_text((pair_center - 28, target_y - 22), "Database", fontname="hebo", fontsize=9)
        page.insert_text((left + 30, target_y + 12), "CR 7", fontname="helv", fontsize=9)
        page.insert_text((right - 112, target_y + 12), "Farman Ali Khan", fontname="helv", fontsize=9)
    elif not as_only or target_y == 150:
        page.insert_text((target_center - 28, target_y - 22), "Database", fontname="hebo", fontsize=9)
        page.insert_text((target_center - 39, target_y - 5), "Farman Ali Khan", fontname="helv", fontsize=9)
        page.insert_text((target_center - 13, target_y + 12), "CR 7", fontname="helv", fontsize=9)
    doc.save(path)
    doc.close()


def _teacher_file(path: Path):
    path.write_text(json.dumps([{"name": "Farman Ali Khan"}]), encoding="utf-8")
    return path


def test_rule_based_pdf_processing_validation_and_converter_compatibility(tmp_path):
    pdf_path = tmp_path / "timetable.pdf"
    teachers_path = _teacher_file(tmp_path / "teachers.json")
    _pdf(pdf_path, lecture_count=3)

    timetable, documents, warnings, digest = local.process_rule_based_pdf(str(pdf_path), teachers_path)

    assert timetable["failed_pages"] == []
    assert timetable["pages"][0]["schema_version"] == 2
    assert len(timetable["pages"][0]["lecture_slots"]) == 3
    assert [row["day"] for row in timetable["pages"][0]["rows"]] == list(local.WEEKDAYS)
    assert documents.keys() == {"cs_sem1"}
    assert json.loads(documents["cs_sem1"]["roomMap"])["CR 7"][0]["lectureNum"] == 3
    assert warnings == []
    assert len(digest) == 64


def test_teacher_missing_from_list_is_kept_from_pdf_and_converter_succeeds(tmp_path):
    pdf_path = tmp_path / "unknown-teacher.pdf"
    teachers_path = tmp_path / "empty-teachers.json"
    teachers_path.write_text("[]", encoding="utf-8")
    _pdf(pdf_path, lecture_count=3)

    timetable, documents, warnings, _ = local.process_rule_based_pdf(str(pdf_path), teachers_path)

    schema_entries = [
        entry
        for row in timetable["pages"][0]["rows"]
        for column in row["columns"]
        for entry in column["entries"]
    ]
    assert any(entry["teacher"] == "Farman Ali Khan" for entry in schema_entries)
    entries = json.loads(documents["cs_sem1"]["roomMap"])["CR 7"]
    assert entries[0]["prof"] == "Farman Ali Khan"
    assert warnings == []


def test_unparseable_cell_is_pending_edit_without_invalidating_timetable():
    source_pdf = Path(__file__).parents[1] / "timetable.pdf"

    timetable, documents, warnings, _ = local.process_rule_based_pdf(str(source_pdf))

    target = [
        cell for cell in timetable["pending_edit_cells"]
        if cell["page"] == 6 and cell["day"] == "Monday" and cell["lecture_num"] == 4
    ]
    assert len(timetable["pages"]) == 56
    assert timetable["failed_pages"] == []
    assert len(target) == 1
    assert target[0]["status"] == "pending_edit"
    assert "BT" in target[0]["source_text"] and "ODaCM" in target[0]["source_text"]
    assert json.loads(documents["ba_sem6"]["pendingEditCells"])
    # The only allowed warning is the subject-alias normalization notice.
    assert [w for w in warnings if not w.startswith("Unified ")] == []


def test_missing_pdf_weekday_fails_before_conversion_or_save(tmp_path):
    pdf_path = tmp_path / "incomplete.pdf"
    _pdf(pdf_path, omit_day="Fri")
    teachers_path = _teacher_file(tmp_path / "teachers.json")

    with pytest.raises(TextPdfValidationError, match=r"missing weekday\(s\) Friday"):
        local.process_rule_based_pdf(str(pdf_path), teachers_path)


def test_as_only_cell_is_ignored_after_existing_split(tmp_path):
    pdf_path = tmp_path / "as-only.pdf"
    _pdf(pdf_path, as_only=True)
    teachers_path = _teacher_file(tmp_path / "teachers.json")

    timetable, documents, warnings, _ = local.process_rule_based_pdf(str(pdf_path), teachers_path)
    entries = json.loads(documents["cs_sem1"]["roomMap"])["CR 7"]
    assert [entry["day"] for entry in entries] == ["Mon"]
    assert warnings == []
    assert len(timetable["pages"][0]["rows"]) == 5


def test_cell_patterns_two_and_three_use_positions_and_teacher_directory():
    names = ["Farman Ali Khan"]
    bounds = (0, 0, 100, 100)
    pattern_two_classes = [
        _token("Accounting", 24, 10, bold=True),
        _token("Farman", 48, 21), _token("Ali", 58, 21), _token("Khan", 68, 21),
        _token("G1", 18, 28), _token("CR", 74, 28), _token("1", 81, 28),
        _token("Economics", 24, 62, bold=True),
        _token("Farman", 48, 72), _token("Ali", 58, 72), _token("Khan", 68, 72),
        _token("G2", 18, 82), _token("CR", 74, 82), _token("2", 81, 82),
    ]
    regions = local._subject_regions(pattern_two_classes, bounds, {"rules": []})
    assert len(regions) == 2
    entries = [local._parse_one_pattern(region, bounds, names, split=True) for region in regions]
    assert [entry["subject"] for entry in entries] == ["Accounting", "Economics"]
    assert [entry["lab_group"] for entry in entries] == ["G1", "G2"]

    pattern_three = [
        _token("Accounting", 25, 20, bold=True),
        _token("Farman", 68, 20), _token("Ali", 78, 20), _token("Khan", 88, 20),
        _token("CR", 46, 48), _token("1", 53, 48),
    ]
    entry = local._parse_one_pattern(pattern_three, bounds, names)
    assert (entry["subject"], entry["teacher"], entry["room"]) == (
        "Accounting", "Farman Ali Khan", "CR 1"
    )


def test_two_column_pattern_four_keeps_one_class_in_both_lecture_cells():
    names = ["Farman Ali Khan"]
    left = [_token("CR", 25, 50), _token("7", 32, 50), _token("Database", 100, 25, bold=True)]
    right = [_token("Farman", 150, 50), _token("Ali", 160, 50), _token("Khan", 170, 50)]
    entry = local._parse_spanning_pair(left, right, (0, 0, 100, 100), (100, 0, 200, 100), names)
    assert entry == {
        "subject": "Database", "teacher": "Farman Ali Khan", "room": "CR 7",
        "is_lab": False, "lab_group": "",
    }


def test_pdf_spanning_pair_is_assigned_by_headers_to_both_columns(tmp_path):
    pdf_path = tmp_path / "spanning.pdf"
    teachers_path = _teacher_file(tmp_path / "teachers.json")
    _pdf(pdf_path, lecture_count=2, spanning_pair=True)

    timetable, documents, _, _ = local.process_rule_based_pdf(str(pdf_path), teachers_path)
    stored = json.loads(documents["cs_sem1"]["roomMap"])["CR 7"]
    spanning_entries = [entry for entry in stored if entry["day"] == "Tue"]
    assert [entry["lectureNum"] for entry in spanning_entries] == [1, 2]
    assert {entry["subject"] for entry in spanning_entries} == {"Database"}
    assert len(timetable["pages"][0]["lecture_slots"]) == 2


def test_validation_failure_never_calls_firestore_saver(tmp_path, monkeypatch, capsys):
    pdf_path = tmp_path / "incomplete.pdf"
    _pdf(pdf_path, omit_day="Fri")
    teachers_path = _teacher_file(tmp_path / "teachers.json")
    writes = []
    monkeypatch.setattr(local, "save_text_pdf_timetable_documents", lambda *args, **kwargs: writes.append(args))

    result = local.main([
        str(pdf_path), "--teacher-list", str(teachers_path), "--save-firestore",
    ])

    assert result == 1
    assert writes == []
    assert '"success": false' in capsys.readouterr().err


def test_frontend_uses_formal_timetable_collection_without_collection_override():
    hook = Path(__file__).parents[2] / "Frontend" / "src" / "hooks" / "useTimetable.js"
    source = hook.read_text(encoding="utf-8")
    assert "export const TIMETABLE_COLLECTION = 'text_pdf_timetables'" in source
    assert "local_test_text_pdf_timetables" not in source
    assert "fsList(TIMETABLE_COLLECTION" in source
    assert "fsGet(`${TIMETABLE_COLLECTION}/current`)" in source
    assert "fsGet(`${TIMETABLE_COLLECTION}/exam_current`)" in source

    rules = (Path(__file__).parents[2] / "firebase" / "firestore.rules").read_text(encoding="utf-8")
    assert "match /text_pdf_timetables/{doc}" in rules
