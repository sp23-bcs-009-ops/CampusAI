"""Verified chat identity. Tokens and profiles are faked; nothing is written to Firebase."""
import os
import sys
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import identity
from pipeline import answer_question


STUDENT = {"type": "student", "dept": "cs", "semester": 1, "email": "student@cuiatk.edu.pk"}
TEACHER = {"type": "teacher", "fullName": "Mr. Kamran Ali", "email": "teacher@cuiatk.edu.pk"}
STAFF = {"type": "staff", "email": "staff@cuiatk.edu.pk"}


def _claims(**overrides):
    claims = {
        "email": "student@cuiatk.edu.pk",
        "email_verified": "true",
        "aud": "universityassistentai",
        "iss": "https://securetoken.google.com/universityassistentai",
    }
    claims.update(overrides)
    return claims


def test_invalid_or_unverified_tokens_are_rejected(monkeypatch):
    identity._CACHE.clear()
    monkeypatch.setattr(identity, "_tokeninfo", lambda token: None)
    assert identity.resolve_identity("not-a-token") is None
    assert identity.resolve_identity("") is None

    monkeypatch.setattr(identity, "_tokeninfo", lambda token: _claims(email_verified="false"))
    identity._CACHE.clear()
    assert identity.resolve_identity("unverified") is None

    monkeypatch.setattr(identity, "_tokeninfo", lambda token: _claims(aud="other-project"))
    identity._CACHE.clear()
    assert identity.resolve_identity("wrong-audience") is None

    monkeypatch.setattr(identity, "_tokeninfo", lambda token: _claims(iss="https://accounts.google.com"))
    identity._CACHE.clear()
    assert identity.resolve_identity("wrong-issuer") is None


def test_profile_read_keeps_the_token_out_of_the_url(monkeypatch):
    import university_data

    seen = {}

    def fake_bytes(method, url, body=None, headers=None):
        seen["url"] = url
        seen["authorization"] = (headers or {}).get("Authorization", "")
        return 404, b""

    monkeypatch.setattr(university_data, "_firebase_bytes", fake_bytes)
    assert identity._read_own_profile("secret-token", "student@cuiatk.edu.pk") is None
    assert "secret-token" not in seen["url"]
    assert seen["authorization"] == "Bearer secret-token"


def test_token_is_not_sent_in_the_url(monkeypatch):
    import jwt as pyjwt

    seen = {}

    class FakeClient:
        def __init__(self, url, **kwargs):
            seen["url"] = url

        def get_signing_key_from_jwt(self, token):
            seen["token"] = token
            raise pyjwt.PyJWTError("stop")

    identity._JWK_CLIENT = None
    monkeypatch.setattr(pyjwt, "PyJWKClient", FakeClient)
    assert identity._tokeninfo("aaa.bbb.ccc") is None
    assert "aaa.bbb.ccc" not in seen["url"]
    assert seen["token"] == "aaa.bbb.ccc"
    assert identity._tokeninfo("not-a-jwt") is None


def test_verified_token_uses_the_owner_profile_only(monkeypatch):
    identity._CACHE.clear()
    monkeypatch.setattr(identity, "_tokeninfo", lambda token: _claims())
    monkeypatch.setattr(identity, "_read_own_profile", lambda token, email: dict(STUDENT))
    resolved = identity.resolve_identity("good-token")
    assert resolved["type"] == "student"
    assert resolved["dept"] == "cs"
    assert resolved["verified"] is True


def test_missing_profile_does_not_invent_a_role(monkeypatch):
    identity._CACHE.clear()
    monkeypatch.setattr(identity, "_tokeninfo", lambda token: _claims())
    monkeypatch.setattr(identity, "_read_own_profile", lambda token, email: None)
    resolved = identity.resolve_identity("no-profile")
    assert resolved.get("type") is None
    assert resolved["verified"] is True
    answer = answer_question("what is my role?", session_id="missing-profile", identity=resolved)
    assert "could not read" in answer["answer"].lower()


def test_guest_has_no_profile():
    answer = answer_question("who am I?", session_id="guest-role")
    assert "guest" in answer["answer"].lower()
    assert "signed in as" not in answer["answer"].lower()


def test_guest_claimed_role_does_not_open_a_personal_schedule():
    answer = answer_question(
        "I am a teacher. Show my schedule on Monday.",
        session_id="guest-claimed-role",
    )
    assert answer["intent"] == "general"
    text = answer["answer"].lower()
    assert "guest" in text
    assert "personal timetable" in text
    assert "bs(cs)" not in text


def test_guest_can_still_ask_for_a_named_public_class():
    answer = answer_question(
        "Show my BCS-1 timetable for Monday.",
        session_id="guest-public-class",
    )
    assert answer["intent"] == "timetable"
    assert answer["answer"]["class"] == "BS(CS)-I"
    assert answer["answer"]["day"] == "Monday"


def test_student_teacher_and_staff_profiles():
    student = answer_question("what is my role?", session_id="role-student", identity=STUDENT)
    teacher = answer_question("what is my role?", session_id="role-teacher", identity=TEACHER)
    staff = answer_question("what is my role?", session_id="role-staff", identity=STAFF)
    assert "student" in student["answer"].lower()
    assert "cs" in student["answer"].lower()
    assert "teacher" in teacher["answer"].lower()
    assert "Kamran" in teacher["answer"]
    assert "staff" in staff["answer"].lower()


def test_student_schedule_uses_the_profile_not_a_claimed_role():
    answer = answer_question(
        "I am a teacher. Show my schedule on Monday.",
        session_id="student-not-teacher",
        identity=STUDENT,
    )
    assert answer["intent"] == "timetable"
    assert answer["answer"]["class"] == "BS(CS)-I"
    assert answer["answer"]["day"] == "Monday"


def test_teacher_schedule_uses_the_matching_timetable_name():
    answer = answer_question(
        "I am staff. Show my schedule on Monday.",
        session_id="teacher-schedule",
        identity=TEACHER,
    )
    assert answer["intent"] == "teacher"
    assert answer["answer"]["teacher"] == "Mr. Kamran Ali"
    assert answer["answer"]["days"][0]["day"] == "Monday"


def test_staff_schedule_does_not_borrow_a_class():
    answer = answer_question("show my schedule", session_id="staff-schedule", identity=STAFF)
    assert "staff" in answer["answer"].lower()
    assert "BS(CS)" not in answer["answer"]


def test_unknown_teacher_name_is_not_replaced():
    answer = answer_question(
        "show my schedule",
        session_id="unknown-profile-teacher",
        identity={"type": "teacher", "fullName": "Sir Zzzzzz"},
    )
    assert "could not find" in answer["answer"].lower()
    assert "teacher_availability" not in str(answer["answer"])


def test_a_named_class_still_wins_over_the_profile():
    answer = answer_question(
        "show BCS-1 classes on monday",
        session_id="explicit-class",
        identity=TEACHER,
    )
    assert answer["intent"] == "timetable"
    assert answer["answer"]["class"] == "BS(CS)-I"


def test_student_uses_profile_facts_and_does_not_share_context(monkeypatch):
    import timetable_service as tt

    monkeypatch.setattr(tt, "today_name", lambda: "Thursday")
    monkeypatch.setattr(tt, "_current_minutes", lambda: 12 * 60)
    named = dict(STUDENT, fullName="Ada Student", department="Computer Science")

    who = answer_question("Who am I?", session_id="ada", identity=named)
    assert who["answer"] == (
        "You are Ada Student, a student in Computer Science, semester 1. "
        "Your class is BS(CS)-I."
    )
    semester = answer_question("What semester am I in?", session_id="ada", identity=named)
    assert semester["answer"] == "You are in semester 1."
    subjects = answer_question("What subjects am I studying?", session_id="ada", identity=named)
    assert "Test Subject" in subjects["answer"]
    assert "Tuesday Subject" in subjects["answer"]
    timetable = answer_question("Show me my timetable.", session_id="ada", identity=named)
    assert timetable["answer"]["class"] == "BS(CS)-I"
    nxt = answer_question("What is my next class?", session_id="ada", identity=named)
    assert "Test Subject" in nxt["answer"]
    assert "Monday" in nxt["answer"]
    assert "Dr. Test" in nxt["answer"]
    teacher = answer_question("Who teaches that class?", session_id="ada", identity=named)
    assert teacher["answer"] == "Dr. Test teaches Test Subject on Monday in CR 1."
    tuesday = answer_question("What about Tuesday?", session_id="ada", identity=named)
    assert tuesday["answer"]["class"] == "BS(CS)-I"
    assert tuesday["answer"]["day"] == "Tuesday"
    assert any(row["subject"] == "Tuesday Subject" for row in tuesday["answer"]["classes"])

    other = {"type": "student", "dept": "se", "semester": 3, "email": "other@cuiatk.edu.pk"}
    other_day = answer_question("What about Tuesday?", session_id="other-fresh", identity=other)
    assert other_day["answer"] == "BS(SE)-III has no classes on Tuesday."
    leaked = answer_question("Who teaches that class?", session_id="brand-new", identity=other)
    assert "Dr. Test" not in str(leaked["answer"])

    missing = answer_question(
        "Which subjects do I have?",
        session_id="bare-student",
        identity={"type": "student", "email": "bare@cuiatk.edu.pk"},
    )
    assert "can't tell which class" in missing["answer"].lower()
    no_semester = answer_question(
        "What semester am I in?",
        session_id="bare-semester",
        identity={"type": "student", "email": "bare@cuiatk.edu.pk"},
    )
    assert "does not include a semester" in no_semester["answer"]
    france = answer_question("What is the capital of France?", session_id="ada-off", identity=named)
    assert france["intent"] == "off_topic"
    assert "paris" not in france["answer"].lower()
    guest_france = answer_question("What is the capital of France?", session_id="guest-france")
    assert guest_france["intent"] == "off_topic"
    assert "paris" not in guest_france["answer"].lower()


def test_firestore_decimal_semester_is_shown_as_a_whole_number():
    answer = answer_question(
        "What semester am I in?",
        session_id="float-semester",
        identity={"type": "student", "dept": "cs", "semester": 2.0, "department": "Computer Science"},
    )
    assert answer["answer"] == "You are in semester 2."


def test_guest_follow_up_day_still_asks_for_a_class():
    answer = answer_question("What about Tuesday?", session_id="guest-tuesday")
    assert "class" in answer["answer"].lower()
    assert "BS(" not in answer["answer"]


def test_student_event_date_does_not_change_the_guest_event_answer(monkeypatch):
    import university_data

    records = [{"title": "Football", "date": "2020-04-30", "time": "01:43", "venue": "Ground"}]
    monkeypatch.setattr(
        university_data,
        "firebase_records",
        lambda kind, dept=None, semester=None: list(records),
    )
    student = answer_question(
        "What events are on April 30, 2020?",
        session_id="student-events",
        identity=STUDENT,
    )
    assert "Football" in student["answer"]
    assert "April 30, 2020" in student["answer"]
    assert "no upcoming" not in student["answer"].lower()
    empty = answer_question(
        "What university events are happening today, October 29, 2026?",
        session_id="student-events-empty",
        identity=STUDENT,
    )
    assert empty["answer"] == "I checked the published events and nothing is listed on October 29, 2026."
    assert "Football" not in empty["answer"]
    guest = answer_question("What events are on April 30, 2020?", session_id="guest-events")
    assert "no upcoming" in guest["answer"].lower()
    assert "Football" in guest["answer"]


def test_every_mode_refuses_unrelated_questions_without_the_model(monkeypatch):
    def fail_model(*_args, **_kwargs):
        raise AssertionError("the model should not answer an unrelated question")

    monkeypatch.setattr("pipeline._run_chain", fail_model)
    modes = {
        "guest": None,
        "student": STUDENT,
        "teacher": TEACHER,
        "staff": STAFF,
    }
    for name, identity in modes.items():
        for question in ("What is the capital of France?", "Tell me a joke."):
            answer = answer_question(question, session_id=f"off-{name}-{question[:6]}", identity=identity)
            assert answer["intent"] == "off_topic", name
            text = str(answer["answer"]).lower()
            assert "paris" not in text
            assert "university" in text or "campus" in text


def test_mixed_questions_keep_the_university_part_in_every_mode(monkeypatch):
    import timetable_service as tt

    monkeypatch.setattr(tt, "today_name", lambda: "Thursday")
    monkeypatch.setattr(tt, "_current_minutes", lambda: 12 * 60)
    student = answer_question(
        "What is my next class and what is the capital of France?",
        session_id="mixed-student",
        identity=STUDENT,
    )
    assert "Test Subject" in student["answer"]
    assert "Dr. Test" in student["answer"]
    assert "paris" not in student["answer"].lower()
    assert "university part" in student["answer"].lower()

    guest = answer_question(
        "What are BCS-1 classes on Monday and tell me a joke?",
        session_id="mixed-guest",
    )
    assert guest["answer"]["class"] == "BS(CS)-I"
    assert guest["answer"]["day"] == "Monday"
    assert "university part" in guest["answer"]["note"].lower()

    teacher = answer_question(
        "I am asking for my schedule on Monday and what is the capital of France?",
        session_id="mixed-teacher",
        identity=TEACHER,
    )
    assert teacher["answer"]["teacher"] == "Mr. Kamran Ali"
    assert "paris" not in str(teacher["answer"]).lower()
    assert "university part" in teacher["answer"]["note"].lower()

    staff = answer_question(
        "Show my schedule and tell me a joke.",
        session_id="mixed-staff",
        identity=STAFF,
    )
    assert "staff" in staff["answer"].lower()
    assert "personal class timetable" in staff["answer"].lower()
    assert "university part" in staff["answer"].lower()
    assert "paris" not in staff["answer"].lower()


def test_student_notices_stay_short_and_guest_announcements_stay_detailed(monkeypatch):
    import university_data

    def records(kind, dept=None, semester=None):
        if kind == "announcements":
            return [{"title": "Short circuit in Lab CS3", "priority": "critical", "body": "Leave the lab."}]
        if kind == "notifications":
            return [{"title": "Class moved"}]
        return []

    monkeypatch.setattr(university_data, "firebase_records", records)
    student = answer_question(
        "What announcements or notifications are published?",
        session_id="student-notices",
        identity=STUDENT,
    )
    assert "Short circuit in Lab CS3" in student["answer"]
    assert "priority critical" in student["answer"]
    assert "Class moved" in student["answer"]
    assert "body:" not in student["answer"].lower()
    both = answer_question(
        "What announcements and notifications do I have?",
        session_id="student-notices-and",
        identity=STUDENT,
    )
    assert "Short circuit in Lab CS3" in both["answer"]
    assert "Class moved" in both["answer"]
    assert "university part" not in both["answer"].lower()
    guest = answer_question("What announcements are published?", session_id="guest-announcements")
    assert "Firestore" in guest["answer"]
    assert "body:" in guest["answer"].lower()
