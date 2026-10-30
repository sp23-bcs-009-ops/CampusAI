"""Offline checks that formal Text PDF writes stay in their timetable collection."""
from __future__ import annotations

from pathlib import Path

from backend import timetable_upload


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


def test_text_pdf_regular_docs_and_current_manifest_write_formal_collection(monkeypatch):
    db = _capture_saver(monkeypatch)
    timetable_upload.save_text_pdf_timetable_documents(
        {"cs_sem1": {"dept": "cs"}},
        active_document_ids=["cs_sem1"],
        source_hash="fixture-sha",
    )
    assert db.collections == ["text_pdf_timetables"]
    assert {(collection, doc_id) for collection, doc_id, _, _ in db.batch_instance.writes} == {
        ("text_pdf_timetables", "cs_sem1"),
        ("text_pdf_timetables", "current"),
    }


def test_exam_manifest_is_also_within_formal_collection(monkeypatch):
    db = _capture_saver(monkeypatch)
    timetable_upload.save_text_pdf_timetable_documents(
        {"exam_cs_sem1": {"dept": "cs", "semester": 1}},
        active_document_ids=["exam_cs_sem1"],
        source_hash="fixture-sha",
        schedule_mode="exam",
    )
    assert db.collections == ["text_pdf_timetables"]
    assert {write[:2] for write in db.batch_instance.writes} == {
        ("text_pdf_timetables", "exam_cs_sem1"),
        ("text_pdf_timetables", "exam_current"),
    }
    assert not any(document_id == "pdf_upload_active" for _, document_id, _, _ in db.batch_instance.writes)
    assert not any(document_id == "current" for _, document_id, _, _ in db.batch_instance.writes)


def test_frontend_view_and_floor_map_have_no_legacy_timetable_fallback():
    root = Path(__file__).parents[2]
    source = (root / "Frontend/src/hooks/useTimetable.js").read_text(encoding="utf-8")
    app_source = (root / "Frontend/App.js").read_text(encoding="utf-8")
    api_source = (root / "backend/API.py").read_text(encoding="utf-8")
    legacy_server = (root / "Frontend/server/index.js").read_text(encoding="utf-8")
    assert "export const TIMETABLE_COLLECTION = 'text_pdf_timetables'" in source
    assert "fsList(TIMETABLE_COLLECTION" in source
    assert "fsGet(`${TIMETABLE_COLLECTION}/current`)" in source
    assert "fsGet(`${TIMETABLE_COLLECTION}/exam_current`)" in source
    assert "fsList('timetables')" not in source
    assert "fsGet('timetables/" not in source
    assert "useTimetable()" in app_source
    assert "process_rule_based_pdf(" in api_source
    assert "upload-timetable-local-test" not in api_source
    assert "save_text_pdf_timetable_documents(" in api_source
    assert "process_pdf(" not in api_source
    assert "save_timetable_documents(" not in api_source
    assert "tesseract" not in legacy_server.lower()
    assert "pdf2pic" not in legacy_server.lower()
    assert "text_pdf_timetables" not in legacy_server
    assert "status(410)" in legacy_server
