"""Premium chatbot behaviour: answers each screen can show, exams, role help, readable records.

Profiles, the clock and Firestore records are faked; nothing reaches Firebase or Groq.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

import api_server as API
from timetable import timetable_lookup as tt
from data_sources import firebase_reader as university_data
from chatbot.answer_pipeline import answer_question
from chatbot.fixed_replies import EXAM_NOT_PUBLISHED
from chatbot.answer_formatter import plain_text, present

STUDENT = {"type": "student", "dept": "cs", "semester": 1, "fullName": "Ali Khan",
           "email": "student@cuiatk.edu.pk"}
TEACHER = {"type": "teacher", "fullName": "Mr. Kamran Ali", "email": "teacher@cuiatk.edu.pk"}
STAFF = {"type": "staff", "email": "staff@cuiatk.edu.pk"}


@pytest.fixture
def monday_at(monkeypatch):
    """Freeze the campus clock on a Monday at the given minute of the day."""
    def set_minute(minute: int):
        monkeypatch.setattr(tt, "today_name", lambda: "Monday")
        monkeypatch.setattr(tt, "_current_minutes", lambda: minute)
    return set_minute


def ask(question, identity=None, session="premium"):
    return answer_question(question, session_id=session + str(id(identity)), identity=identity)


# ── What each screen can show ────────────────────────────────────────────────

def test_cards_the_app_cannot_draw_become_text():
    card = {"type": "next_class", "class": "BS(CS)-I",
            "class_info": {"subject": "PF", "teacher": "Umar Zia", "room": "LT8", "time": "10:00-11:30", "day": "Tuesday"}}
    shown = present(card, STUDENT)
    assert isinstance(shown, str)
    assert "PF on Tuesday at 10:00–11:30 with Umar Zia in LT8" in shown
    assert "{" not in shown

    for kind, extra in [
        ("teacher_next_class", {"teacher": "Aamir Ali", "class_info": {"day": "Tuesday", "slot": "08:30-10:00",
                                "classes": [{"class": "BS(Maths)-VII", "room": "CR 5", "subject": "OR"}]}}),
        ("class_teachers", {"class": "BS(CS)-I", "teachers": [{"teacher": "Umar Zia", "subject": "PF"}]}),
        ("subject_teachers", {"matches": [{"subject": "PF", "teacher": "Umar Zia", "class": "BS(CS)-I"}]}),
    ]:
        text = present({"type": kind, **extra}, STUDENT)
        assert isinstance(text, str) and "{" not in text and "type" not in text


def test_signed_in_users_get_text_not_cards():
    schedule = {"type": "schedule", "class": "BS(CS)-I", "day": "Monday", "classes": [
        {"subject": "PF", "teacher": "Umar Zia", "room": "LT8", "time": "10:00-11:30", "day": "Monday"}]}
    assert present(schedule, STUDENT) == "📅 BS(CS)-I — Monday\n• 10:00–11:30  PF — Umar Zia, LT8"
    assert present(schedule, STUDENT) == present(schedule, None)


def test_guests_always_get_text():
    card = {"type": "rooms_free", "days": ["Wednesday"],
            "rooms": [{"room": "CR 2", "day": "Wednesday", "free": ["10:00-11:30"]}]}
    shown = present(card, None)
    assert shown == "📍 Free rooms\n• CR 2: 10:00–11:30"

    schedule = {"type": "schedule", "class": "BS(CS)-I", "day": "Monday", "classes": [
        {"subject": "PF", "teacher": "Umar Zia", "room": "LT8", "time": "10:00-11:30", "day": "Monday"}]}
    assert present(schedule, None) == "📅 BS(CS)-I — Monday\n• 10:00–11:30  PF — Umar Zia, LT8"


def test_markdown_symbols_are_removed():
    text = "**CS Department**\n\n## Programs\n- BS CS\n- BS SE\n[Site](https://x.edu)"
    assert plain_text(text) == "CS Department\n\nPrograms\n• BS CS\n• BS SE\nSite (https://x.edu)"


def test_ask_endpoint_returns_displayable_answers(monkeypatch):
    monkeypatch.setattr(API, "answer_question", lambda q, session_id="d", identity=None: {
        "answer": {"type": "class_teachers", "class": "BS(CS)-I", "teachers": [{"teacher": "Umar Zia", "subject": "PF"}]},
        "intent": "teacher",
    })
    API.limiter.reset()
    body = TestClient(API.app).post("/ask", json={"question": "all teachers of BCS-1"}).json()
    assert body["answer"] == "👨‍🏫 Teachers of BS(CS)-I\n• PF — Umar Zia"


def test_expired_sign_in_is_explained_not_silent(monkeypatch):
    """Firebase tokens expire after an hour; the app keeps sending the old one."""
    monkeypatch.setattr(API, "answer_question", lambda q, session_id="d", identity=None: {
        "answer": "You are in guest mode, so there is no signed-in profile.", "intent": "general"})
    monkeypatch.setattr("user_login.firebase_login_check.resolve_identity", lambda token: None)
    API.limiter.reset()
    client = TestClient(API.app)
    expired = client.post("/ask", json={"question": "who am i"}, headers={"Authorization": "Bearer old"}).json()
    assert expired["answer"].startswith(API.SIGN_IN_EXPIRED)
    campus = client.post("/ask", json={"question": "BCS-1 Monday"}, headers={"Authorization": "Bearer old"}).json()
    assert not campus["answer"].startswith("⚠️")
    guest = client.post("/ask", json={"question": "who am i"}).json()
    assert not guest["answer"].startswith("⚠️")
    API.limiter.reset()


# ── Rate limit per signed-in user ────────────────────────────────────────────

def test_each_signed_in_user_gets_their_own_limit(monkeypatch):
    monkeypatch.setattr(API, "answer_question", lambda q, session_id="d", identity=None: {"answer": "ok", "intent": "general"})
    monkeypatch.setattr("user_login.firebase_login_check.resolve_identity", lambda token: None)
    client = TestClient(API.app)
    API.limiter.reset()
    for token in ("student-a", "student-b"):
        for _ in range(20):
            response = client.post("/ask", json={"question": "hi"}, headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 200
    blocked = client.post("/ask", json={"question": "hi"}, headers={"Authorization": "Bearer student-a"})
    assert blocked.status_code == 429
    API.limiter.reset()


# ── Routing fixes ────────────────────────────────────────────────────────────

def test_exam_questions_no_longer_look_for_a_teacher():
    answer = ask("When are midterm exams?")
    assert answer["intent"] == "exams"
    # Regular Mode: no datesheet is published for any class yet.
    assert answer["answer"] == EXAM_NOT_PUBLISHED
    assert ask("When are BCS-1 midterm exams?")["answer"] == EXAM_NOT_PUBLISHED


def test_any_exam_question_says_exams_are_not_being_held(monkeypatch):
    monkeypatch.setattr(
        "chatbot.answer_pipeline._run_general_chain",
        lambda question, memory: "model reply",
    )
    for question in (
        "I'm stressed about exams, any tips?",
        "I missed my paper yesterday, what should I do?",
        "when are the midterms?",
    ):
        for identity in (None, STUDENT):
            answer = ask(question, identity, session=question[:10])
            assert answer["answer"] == EXAM_NOT_PUBLISHED, question
    assert "not being held" in EXAM_NOT_PUBLISHED


def test_misspelled_days(monkeypatch):
    monkeypatch.setattr(tt, "today_name", lambda: "Monday")
    assert tt.detect_day("bcs1 mondy clases") == ["Monday"]
    assert tt.detect_day("wendesday schedule") == ["Wednesday"]
    assert tt.detect_day("BCS-1 classes tomorrow") == ["Tuesday"]
    assert tt.detect_day("today's classes") == ["Monday"]
    assert tt.detect_day("my friend asked") is None


def test_campus_clock_uses_pakistan_time():
    assert getattr(tt.campus_now().tzinfo, "key", "") == "Asia/Karachi"


# ── Exams in Exam Mode ───────────────────────────────────────────────────────

def test_student_sees_their_exams_in_exam_mode(monkeypatch):
    exam_tt = {"BS(CS)-I": {
        "2099-01-12": {"09:00-12:00": [{"subject": "Calculus", "teacher": "N/A", "room": "Hall A", "time": "09:00-12:00", "day": "2099-01-12"}]},
        "2099-01-10": {"09:00-12:00": [{"subject": "Programming Fundamentals", "teacher": "N/A", "room": "Hall B", "time": "09:00-12:00", "day": "2099-01-10"}]},
    }}
    monkeypatch.setattr(university_data, "load_timetable", lambda: exam_tt)
    monkeypatch.setattr(tt, "schedule_mode", lambda: "exam")
    tt._rebuild_indexes(exam_tt)

    mine = ask("my exams", STUDENT)
    assert mine["answer"] == (
        "📝 Your exams (BS(CS)-I)\n"
        "• 10 January 2099, 09:00–12:00  Programming Fundamentals — Hall B\n"
        "• 12 January 2099, 09:00–12:00  Calculus — Hall A"
    )
    nxt = ask("when is my next paper?", STUDENT, session="next-paper")
    assert nxt["answer"] == "Your next paper is Programming Fundamentals on 10 January 2099 at 09:00–12:00 in Hall B."
    assert ask("when are the exams?")["answer"] == "Which class's exams should I show? For example: BCS-1 or BS(SE)-III."
    assert ask("BCS-1 datesheet", session="guest-ds")["answer"].startswith("📝 Exams for BS(CS)-I")


# ── Role help and greetings ──────────────────────────────────────────────────

@pytest.mark.parametrize("identity, expected", [
    (None, "Sign in with your university account"),
    (STUDENT, "\"my next class\""),
    (TEACHER, "Your free slots"),
    (STAFF, "which teachers are free now?"),
])
def test_help_is_shaped_for_each_role(identity, expected):
    assert expected in ask("what can you do?", identity)["answer"]


def test_student_greeting_is_personal(monday_at):
    monday_at(7 * 60)  # 07:00, before the first class
    answer = ask("hi", STUDENT)["answer"]
    assert answer.startswith("Hi Ali! 👋 Your next class is Test Subject today at 8:30–10:00 in CR 1.")


def test_teacher_greeting_names_their_next_class(monday_at):
    monday_at(12 * 60)
    answer = ask("hello", TEACHER)["answer"]
    assert answer.startswith("Hi Kamran! 👋 Your next class is Mobile Application Development (Lab) (BS(CS)-V) today at 13:35–15:00")


# ── Student: now and free time ───────────────────────────────────────────────

def test_student_class_right_now(monday_at):
    monday_at(9 * 60)  # 09:00, inside 8:30-10:00
    answer = ask("which class do I have now?", STUDENT)["answer"]
    assert answer == "Right now you have Test Subject (8:30–10:00) with Dr. Test in CR 1."
    monday_at(11 * 60)
    later = ask("my class right now?", STUDENT, session="later")["answer"]
    assert later.startswith("You don't have a class right now. Your next class is Tuesday Subject on Tuesday")


def test_student_free_time(monday_at):
    monday_at(7 * 60)
    answer = ask("when am I free today?", STUDENT)["answer"]
    assert answer.startswith("On Monday you're free at ")
    assert "8:30–10:00" not in answer
    assert "11:30–13:15" in answer
    assert ask("am I free on Saturday?", STUDENT, session="sat")["answer"] == "You have no classes on Saturday, so the whole day is free."


def test_student_tomorrow_clashes_and_own_teacher(monday_at):
    """Bugs found in the live student test on 17 Nov 2026."""
    monday_at(7 * 60)
    tomorrow = ask("my classes tomorrow", STUDENT)
    assert tomorrow["answer"]["type"] == "schedule"
    assert tomorrow["answer"]["day"] == "Tuesday"

    clashes = ask("do I have any clashes?", STUDENT, session="clash")["answer"]
    assert clashes == "The published timetable for BS(CS)-I does not show overlapping classes."

    own = ask("who teaches my test subject?", STUDENT, session="own-teacher")["answer"]
    assert own == "In BS(CS)-I, Test Subject is taught by Dr. Test."

    nxt = ask("my next class", STUDENT, session="next")["answer"]
    assert nxt == "Your next class is Test Subject today at 8:30–10:00 with Dr. Test in CR 1."


def test_student_questions_without_my_use_their_class(monday_at):
    """Second live student round, 17 Nov 2026: these used to ask "which class?"."""
    monday_at(7 * 60)
    assert ask("do I have class on saturday", STUDENT, session="s1")["answer"] == \
        "BS(CS)-I has no classes on Saturday."
    assert ask("how many classes do I have on monday", STUDENT, session="s2")["answer"] == \
        "You have 1 class on Monday: Test Subject."
    assert ask("when is my first class tomorrow", STUDENT, session="s3")["answer"] == \
        "On Tuesday, your first class is Tuesday Subject at 8:30 in CR 2."
    assert ask("when does my day end today", STUDENT, session="s4")["answer"] == \
        "On Monday, your last class is Test Subject in CR 1, ending at 10:00."


def test_student_subject_questions_and_teachers(monday_at):
    monday_at(7 * 60)
    assert ask("when is my test subject class", STUDENT, session="m1")["answer"] == \
        "📚 Test Subject — BS(CS)-I\n• Monday 8:30–10:00 — CR 1, Dr. Test"
    teachers = ask("my teachers", STUDENT, session="m2")["answer"]
    assert teachers["type"] == "class_teachers" and teachers["class"] == "BS(CS)-I"
    assert ask("who teaches intro in BCS-2", STUDENT, session="m3")["answer"] == \
        "In BS(CS)-II, Intro is taught by Dr. Sameen Khalid."


def test_private_records_facilities_and_class_change():
    from chatbot.answer_pipeline import PRIVATE_RECORDS, SessionMemory, route

    assert ask("what is my gpa", STUDENT, session="p1")["answer"] == PRIVATE_RECORDS
    assert ask("my attendance", None, session="p2")["answer"] == PRIVATE_RECORDS
    assert route("library timings", SessionMemory()).intent == "comsats_info"
    assert route("free rooms now", SessionMemory()).intent == "rooms_all"
    change = ask("I am in BCS-2 now", STUDENT, session="p3")["answer"]
    assert change.startswith("Your profile says you're in BS(CS)-I")
    assert "My Profile" in change


def test_teacher_and_room_free_now_are_yes_or_no(monday_at):
    monday_at(9 * 60)
    assert ask("is Dr. Test free now", STUDENT, session="n1")["answer"] == \
        "No, Dr. Test is teaching right now: Test Subject for BS(CS)-I (8:30–10:00) in CR 1."
    assert ask("is CR 1 free now", None, session="n2")["answer"] == \
        "No, CR 1 is in use right now: Test Subject for BS(CS)-I (8:30–10:00)."
    monday_at(12 * 60)
    assert ask("is CR 1 free now", None, session="n3")["answer"].startswith("Yes, CR 1 is free right now.")


def test_audit_fixes_rooms_free_slots_and_tidy_lists(monday_at):
    """From the 74-question student audit against Firebase, 17 Nov 2026."""
    from chatbot.timetable_answers import _combine_lab_names, _merge_slots

    monday_at(9 * 60)
    assert ask("free rooms now", STUDENT, session="a1")["intent"] == "rooms_all"
    assert _merge_slots(["15:00-16:30", "13:35-15:00", "08:30-10:00"]) == ["08:30–10:00", "13:35–16:30"]
    assert _combine_lab_names(["OOP (Lab)", "Calculus", "OOP"]) == ["OOP (theory and lab)", "Calculus"]
    subjects = ask("my subjects", STUDENT, session="a2")["answer"]
    assert subjects.startswith("📚 Your subjects (BS(CS)-I)\n• ")
    card = {"type": "class_teachers", "class": "BS(CS)-II", "teachers": [
        {"teacher": "M. Sharif", "subject": "OOP (Lab)"}, {"teacher": "M. Sharif", "subject": "OOP"},
        {"teacher": "Muhammad Zeb", "subject": "Applied Physics"},
        {"teacher": "Abbas Ali Shah", "subject": "Applied Physics (Lab)"}]}
    assert present(card, STUDENT) == (
        "👨‍🏫 Teachers of BS(CS)-II\n• OOP (theory and lab) — M. Sharif\n"
        "• Applied Physics — Muhammad Zeb\n• Applied Physics (Lab) — Abbas Ali Shah"
    )
    assert plain_text("Head Dr. Muazzam Block‑II") == "Head Dr. Muazzam Block-II"


# ── Teacher: next class and free slots ───────────────────────────────────────

def test_teacher_next_class_and_free_slots(monday_at):
    monday_at(12 * 60)
    nxt = ask("my next class", TEACHER)["answer"]
    assert nxt == ("Your next class is Mobile Application Development (Lab) for BS(CS)-V in CS C.Lab 1 "
                   "today at 13:35–15:00.")
    free = ask("when am I free today?", TEACHER, session="t-free")["answer"]
    assert free.startswith("On Monday you're free at ")
    assert "13:35–15:00" not in free


def test_staff_my_schedule_points_to_useful_questions():
    answer = ask("show my schedule", STAFF)["answer"]
    assert "free rooms now" in answer


# ── Readable records ─────────────────────────────────────────────────────────

def test_records_are_readable(monkeypatch):
    def records(kind, dept=None, semester=None):
        if kind == "announcements":
            return [{"title": "Short circuit", "priority": "critical", "createdAt": 1789461463401, "body": "Stay out."}]
        if kind == "lostfound":
            return [
                {"title": "Mobile", "type": "found", "location": "LT3", "date": "2026-04-18", "resolved": False, "body": "iPhone"},
                {"title": "Monitor", "type": "lost", "location": "Lab 3", "date": "2026-05-01", "resolved": False},
                {"title": "Old bag", "type": "found", "resolved": True},
            ]
        if kind == "events":
            return [{"title": "Football", "date": "2026-04-30", "time": "01:43", "endTime": "07:43",
                     "venue": "Ground", "cat": "academic", "body": "Event for boys"}]
        return []

    monkeypatch.setattr(university_data, "firebase_records", records)

    news = ask("emergency announcements")["answer"]
    assert news.startswith("⚠️ Short circuit (critical) — ")
    assert "2026" in news and "1789461463401" not in news

    phone = ask("has anyone found a phone?")["answer"]
    assert "Mobile — LT3, 18 April 2026" in phone
    assert "Monitor" not in phone and "resolved" not in phone.lower()

    everything = ask("lost and found items", session="all-lf")["answer"]
    assert "Monitor" in everything and "Old bag" not in everything

    events = ask("any upcoming events?")["answer"]
    assert events.startswith("There are no upcoming events right now.")
    assert "Football — 30 April 2026, 01:43–07:43, Ground" in events
    assert "cat:" not in events and "when:" not in events


def test_phase1_routes_feelings_policy_and_departments_correctly(monkeypatch):
    monkeypatch.setattr(
        "chatbot.answer_pipeline._run_general_chain",
        lambda question, memory: "model reply",
    )
    from chatbot.answer_pipeline import PRIVATE_RECORDS, SessionMemory, route

    # A day word alone is not a timetable request, for guests and students.
    assert ask("I feel sad today")["answer"] == "model reply"
    assert ask("I feel sad today", STUDENT, session="sad")["answer"] == "model reply"
    # Policy questions are not the user's private records; "my CGPA" still is.
    assert ask("what is the minimum CGPA to avoid probation?")["answer"] != PRIVATE_RECORDS
    assert ask("what is my CGPA?")["answer"] == PRIVATE_RECORDS
    # A list of departments is website information, not the teacher directory.
    assert route("which departments are there at Attock campus?", SessionMemory()).intent == "comsats_info"
    # Greetings get the model's friendly reply.
    assert ask("hi", session="hi-guest")["answer"] == "model reply"
