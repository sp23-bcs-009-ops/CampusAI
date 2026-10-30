"""Offline chatbot tests inject a tiny timetable. Production never reads it.

Live university answers always come from Firestore. This fixture exists so
unit tests do not hit the network and cannot become a production fallback.
"""
import os
import tempfile

import pytest

os.environ.setdefault("KNOWLEDGE_MAX_AGE_DAYS", "0")
os.environ.setdefault(
    "CHROMA_DIR",
    tempfile.mkdtemp(prefix="campusai-test-chroma-"),
)
os.environ.setdefault("CAMPUS_AI_API_KEY", "")

TEST_TIMETABLE = {
    "BS(CS)-I": {
        "Monday": {
            "8:30-10:00": [{
                "subject": "Test Subject",
                "teacher": "Dr. Test",
                "room": "CR 1",
                "time": "8:30-10:00",
                "day": "Monday",
            }],
        },
        "Tuesday": {
            "8:30-10:00": [{
                "subject": "Tuesday Subject",
                "teacher": "Dr. Test",
                "room": "CR 2",
                "time": "8:30-10:00",
                "day": "Tuesday",
            }],
        },
    },
    "BS(CS)-II": {
        "Monday": {
            "11:30-13:15": [{
                "subject": "Intro",
                "teacher": "Dr. Sameen Khalid",
                "room": "LT 4",
                "time": "11:30-13:15",
                "day": "Monday",
            }],
        },
    },
    "BS(SE)-III": {
        "Monday": {
            "8:30-10:00": [{
                "subject": "SE Subject",
                "teacher": "Dr. Test",
                "room": "CR 3",
                "time": "8:30-10:00",
                "day": "Monday",
            }],
        },
    },
    "BS(CS)-V": {
        "Monday": {
            "13:35-15:00": [{
                "subject": "Mobile Application Development (Lab)",
                "teacher": "Mr. Kamran Ali",
                "room": "CS C.Lab 1",
                "time": "13:35-15:00",
                "day": "Monday",
            }],
        },
        "Thursday": {
            "11:30-13:15": [{
                "subject": "Mobile Application Development",
                "teacher": "Mr. Kamran Ali",
                "room": "LT 4",
                "time": "11:30-13:15",
                "day": "Thursday",
            }],
        },
        "Friday": {
            "15:00-16:30": [{
                "subject": "Mobile Application Development (Lab)",
                "teacher": "Mr. Kamran Ali",
                "room": "CS C.Lab 1",
                "time": "15:00-16:30",
                "day": "Friday",
            }],
        },
    },
}


@pytest.fixture(autouse=True)
def _offline_timetable(request, monkeypatch):
    if request.node.name == "test_firebase_failure_does_not_read_local_json":
        return

    import timetable_service as tt
    import university_data

    monkeypatch.setattr(university_data, "load_timetable", lambda: TEST_TIMETABLE)
    monkeypatch.setattr(university_data, "schedule_mode", lambda: "regular")
    monkeypatch.setattr(university_data, "active_mode", lambda: "regular")
    tt._rebuild_indexes(TEST_TIMETABLE)
