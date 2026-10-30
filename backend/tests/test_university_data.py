"""Firestore timetable parsing and the no-local-fallback rule."""
import json

import pytest

import university_data
from pipeline import SessionMemory, route
from university_data import UniversityDataUnavailable


def test_display_rows_map_onto_timetable_keys():
    documents = {
        "cs_sem1": {
            "dept": "cs",
            "semester": 1,
            "displayRows": json.dumps([
                {
                    "day": "Mon",
                    "slots": [
                        {
                            "start": "11:30",
                            "end": "13:15",
                            "subject": "AoIaCT (Lab)",
                            "prof": "Muhammad Fawad",
                            "room": "Lab",
                            "isLab": True,
                        },
                        {
                            "start": "08:30",
                            "end": "10:00",
                            "subject": "",
                            "prof": "",
                            "room": "",
                        },
                    ],
                }
            ]),
        }
    }

    table = university_data.timetable_from_documents(documents)
    monday = table["BS(CS)-I"]["Monday"]

    assert list(monday) == ["11:30-13:15"]
    assert monday["11:30-13:15"][0]["teacher"] == "Muhammad Fawad"
    assert monday["11:30-13:15"][0]["room"] == "Lab"
    assert monday["11:30-13:15"][0]["is_lab"] is True


def test_firebase_failure_does_not_read_local_json(monkeypatch):
    university_data._timetable_cache = None
    university_data._cache_token = None
    assert not hasattr(university_data, "load_local_timetable")

    def offline(*_args, **_kwargs):
        raise OSError("offline")

    monkeypatch.setattr(university_data.http.client.HTTPSConnection, "request", offline)

    with pytest.raises(UniversityDataUnavailable, match="Could not reach Firestore"):
        university_data.load_timetable()


def test_chatbot_modules_do_not_import_chroma_or_local_timetable():
    from pathlib import Path

    import pipeline

    backend = Path(__file__).resolve().parents[1]
    api_src = (backend / "API.py").read_text(encoding="utf-8")
    pipeline_src = (backend / "pipeline.py").read_text(encoding="utf-8")
    data_src = (backend / "university_data.py").read_text(encoding="utf-8")

    assert not hasattr(pipeline, "rag_store")
    assert "from rag_store import" not in api_src
    assert "from rag_store import" not in pipeline_src
    assert "fetch_official_pages" not in pipeline_src
    assert "comsats_knowledge.json" not in pipeline_src
    assert "load_local_timetable" not in data_src
    assert "timetable_data.json" not in data_src
    assert not hasattr(university_data, "load_local_timetable")


def test_university_record_questions_do_not_fall_through_to_chat():
    memory = SessionMemory()
    assert route("what events are happening this week?", memory).intent == "events"
    assert route("is there an emergency announcement?", memory).intent == "announcements"
    assert route("anything in lost and found?", memory).intent == "lostfound"
    notices = route("any class notifications for BCS-1?", memory)
    assert notices.intent == "notifications"
    assert notices.cls == "BS(CS)-I"
    assert route("where is the teacher directory office?", memory).intent == "teachers"
    assert route("what department is Aamir Ali in according to the teacher directory?", memory).intent == "teachers"


def test_timetable_batch_is_cached_until_the_manifest_changes(monkeypatch):
    university_data._timetable_cache = None
    university_data._cache_token = None
    university_data._cache_checked_at = 0.0
    calls = []
    rows = json.dumps([{
        "day": "Mon",
        "slots": [{
            "subject": "Programming Fundamentals",
            "prof": "Aamir Ali",
            "room": "LT8",
            "start": "10:00",
            "end": "11:30",
        }],
    }])

    def fake_batch(paths, field_paths=None):
        calls.append(list(paths))
        if paths[0] == "settings/schedule_mode":
            return [
                {"mode": "regular"},
                {"updatedAt": "2026-10-09T00:00:00Z", "documentIds": ["cs_sem1"]},
                None,
            ]
        return [{"dept": "cs", "semester": 1, "displayRows": rows}]

    monkeypatch.setattr(university_data, "_batch_get", fake_batch)
    table = university_data.load_firebase_timetable()
    assert table["BS(CS)-I"]["Monday"]["10:00-11:30"][0]["teacher"] == "Aamir Ali"
    assert len(calls) == 2

    calls.clear()
    assert university_data.load_firebase_timetable() is table
    assert calls == []

    university_data._cache_checked_at = 0.0
    assert university_data.load_firebase_timetable() is table
    assert len(calls) == 1
    assert calls[0][0] == "settings/schedule_mode"


def test_missing_timetable_document_is_reported(monkeypatch):
    university_data._timetable_cache = None
    university_data._cache_token = None
    university_data._cache_checked_at = 0.0

    def fake_batch(paths, field_paths=None):
        if paths[0] == "settings/schedule_mode":
            return [{"mode": "regular"}, {"updatedAt": "t", "documentIds": ["missing"]}, None]
        return [None]

    monkeypatch.setattr(university_data, "_batch_get", fake_batch)
    with pytest.raises(UniversityDataUnavailable, match="missing"):
        university_data.load_firebase_timetable()


def test_empty_notification_read_is_not_repeated(monkeypatch):
    university_data._RECORD_CACHE.clear()
    calls = []

    def fake_list(collection, missing_ok=False):
        calls.append(collection)
        return []

    monkeypatch.setattr(university_data, "_list_collection", fake_list)
    first = university_data.firebase_records("notifications", dept="cs", semester=1)
    second = university_data.firebase_records("notifications", dept="cs", semester=1)
    assert first == []
    assert second == []
    assert calls == ["notifications/cs/semesters/1/posts"]
