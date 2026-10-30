"""Regression checks: Exam mode keeps its own timetable dataset and reflection.

Covers the three contracts agreed for Exam mode:
1. Exam documents are stored at the regular per-department/semester granularity
   under `exam_` ids, with the `exam_current` manifest, coexisting with the
   regular `current` dataset.
2. The frontend loads both manifests once and keeps both datasets in state so
   mode switches never re-read Firebase.
3. The screens reflect the active mode's timetable, expose the exam timetable
   viewer, and lock Add / Cancel Class during Exam mode.
"""
from __future__ import annotations

import re
from pathlib import Path

from backend import rule_based_text_pdf as local
from backend import timetable_upload

ROOT = Path(__file__).parents[2]


# ── Backend: conversion granularity ─────────────────────────────────────────

def _ocr_page(department: str, semester: int) -> dict:
    return {
        "page": 1,
        "department": department,
        "semester": str(semester),
        "detected_departments": [department],
        "detected_semesters": [str(semester)],
        "lecture_slots": [
            {"start_time": "07:00", "end_time": "08:00"},
            {"start_time": "08:00", "end_time": "09:00"},
        ],
        "entries": [
            {
                "day": "Mon",
                "lecture_num": 1,
                "subject": "Database Systems",
                "room": "CR 7",
                "teacher": "Farman Ali Khan",
            }
        ],
    }


def _ocr_result() -> dict:
    return {"pages": [_ocr_page("CS", 1), _ocr_page("CS", 2)], "failed_pages": []}


def test_exam_conversion_uses_regular_granularity_with_separate_ids():
    documents, _ = timetable_upload.convert_ocr_to_documents(
        _ocr_result(),
        version="v1",
        effective_date="2026-01-01",
        uploaded_by="tester",
        schedule_mode="exam",
    )
    assert set(documents) == {"exam_cs_sem1", "exam_cs_sem2"}
    assert documents["exam_cs_sem1"]["dept"] == "cs"
    assert documents["exam_cs_sem1"]["semester"] == 1
    assert documents["exam_cs_sem2"]["semester"] == 2
    # The legacy single merged document id must not come back.
    assert "exam" not in documents
    assert "multi" not in {doc["dept"] for doc in documents.values()}


def test_regular_conversion_document_ids_are_unchanged():
    documents, _ = timetable_upload.convert_ocr_to_documents(
        _ocr_result(),
        version="v1",
        effective_date="2026-01-01",
        uploaded_by="tester",
        schedule_mode="regular",
    )
    assert set(documents) == {"cs_sem1", "cs_sem2"}
    assert all(not key.startswith("exam_") for key in documents)


def test_full_exam_pipeline_prefixes_every_group_document():
    source_pdf = Path(__file__).parents[1] / "timetable.pdf"
    _, documents, _, _ = local.process_rule_based_pdf(str(source_pdf), schedule_mode="exam")
    assert documents
    for key, document in documents.items():
        assert re.fullmatch(r"exam_[a-z0-9_]+_sem\d+", key), key
        assert document.get("dept")
        assert document.get("semester")



# ── Backend: persistence coexistence ────────────────────────────────────────

class FakeDocument:
    def __init__(self, collection_name, document_id):
        self.collection_name = collection_name
        self.document_id = document_id


class FakeCollection:
    def __init__(self, collection_name):
        self.collection_name = collection_name

    def document(self, document_id):
        return FakeDocument(self.collection_name, document_id)


class FakeBatch:
    def __init__(self):
        self.writes = []

    def set(self, document, data, merge):
        self.writes.append((document.collection_name, document.document_id, data, merge))

    def commit(self):
        return None


class FakeFirestore:
    def __init__(self):
        self.batch_instance = FakeBatch()
        self.collections = []

    def batch(self):
        return self.batch_instance

    def collection(self, name):
        self.collections.append(name)
        return FakeCollection(name)


def _capture_saver(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(timetable_upload, "_firebase_app", lambda: object())
    monkeypatch.setattr(timetable_upload.firestore, "client", lambda app: db)
    return db


def test_exam_and_regular_manifests_write_side_by_side(monkeypatch):
    db = _capture_saver(monkeypatch)
    timetable_upload.save_text_pdf_timetable_documents(
        {"cs_sem1": {"dept": "cs"}},
        active_document_ids=["cs_sem1"],
        source_hash="regular-sha",
        schedule_mode="regular",
    )
    timetable_upload.save_text_pdf_timetable_documents(
        {"exam_cs_sem1": {"dept": "cs", "semester": 1}},
        active_document_ids=["exam_cs_sem1"],
        source_hash="exam-sha",
        schedule_mode="exam",
    )
    written = {(collection, doc_id) for collection, doc_id, _, _ in db.batch_instance.writes}
    assert written == {
        ("text_pdf_timetables", "cs_sem1"),
        ("text_pdf_timetables", "current"),
        ("text_pdf_timetables", "exam_cs_sem1"),
        ("text_pdf_timetables", "exam_current"),
    }
    # Neither dataset touches the other's manifest or the legacy manifest id.
    assert "pdf_upload_active" not in {doc_id for _, doc_id in written}


# ── Frontend source regressions ─────────────────────────────────────────────

def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_use_timetable_loads_both_manifests_once_and_keeps_both_datasets():
    source = _read("Frontend/src/hooks/useTimetable.js")
    # One load pass reads both manifests in parallel…
    assert "fsGet(`${TIMETABLE_COLLECTION}/current`)" in source
    assert "fsGet(`${TIMETABLE_COLLECTION}/exam_current`)" in source
    assert "useEffect(() => { load(); }, []);" in source
    # …and both datasets are selected separately from the same listing.
    assert "allDocs.filter(doc => activeIds.has(doc._docId))" in source
    assert "allDocs.filter(doc => examIds.has(doc._docId))" in source
    # Both stay in the returned state at the same time: switching the campus
    # mode only re-derives the view, it never triggers a reload.
    assert "currentManifest," in source
    assert "exam," in source
    assert "rawDocuments: examDocs" in source
    assert "manifest: examManifest" in source
    # Regular dataset fields must remain untouched.
    assert "lectureSlotsByDepartmentSemester," in source
    assert "displayRowsBySemester," in source


def test_home_screen_reflects_only_the_active_mode_timetable():
    source = _read("Frontend/src/screens/HomeScreen.js")
    assert "const activeTimetable = isExam ? (examTimetable?.timetables || {}) : timetable;" in source
    assert "const visibleTimetable = isHoliday ? {} : activeTimetable;" in source
    assert "const activeLectureSlots = isExam" in source
    # Full-screen viewer: weekly list for regular, date list for exam.
    assert "{!isGuest && (isRegular || isExam) && (" in source
    assert "{isExam ? 'View Exam Timetable' : 'View Weekly Timetable'}" in source
    assert "mode={currentMode}" in source
    assert "ttMeta={isExam ? (examTimetable?.meta || null) : ttMeta}" in source
    # Staff edit panel operates on the active mode's own documents/manifest.
    assert "documents={isExam ? (examTimetable?.rawDocuments || []) : timetableDocuments}" in source
    assert "manifest={isExam ? (examTimetable?.manifest || null) : timetableManifest}" in source
    # Uploads stay linked to the current campus mode (panel selector = future).
    assert "formData.append('scheduleMode', mode === 'exam' ? 'exam' : 'regular');" in source


def test_class_board_locks_add_and_cancel_only_during_exam_mode():
    app_source = _read("Frontend/App.js")
    assert re.search(r"<ClassScreen[^>]*schedule=\{schedule\}", app_source)
    source = _read("Frontend/src/screens/ClassScreen.js")
    assert "const examModeActive = (schedule?.mode || 'regular') === 'exam';" in source
    assert "'Unavailable during Exam mode'" in source
    assert "Adding notifications and Cancel Class cannot be posted while Exam mode is active." in source
    assert "onPress={startNewPost}" in source
    assert "if (!editItem && examModeActive)" in source
    # Viewing, editing, and deleting existing notifications stay available.
    assert "onEdit={item => { setEditItem(item); setShowPost(true); }}" in source
    assert "onDelete={handleDelete}" in source

