"""Bulk QA: ~500 questions built from the REAL Firestore data, each checked automatically.

Run inside the backend container, from backend/:
    python quality_check/bulk_qa.py            # summary + every failure
    python quality_check/bulk_qa.py --all      # also print every passing answer

The AI is switched off: this tests that the chatbot understands the question and
finds the right facts. (AI wording is checked separately by fact_check.py.)
Each question has an expectation; anything else is reported as a failure.
"""
from __future__ import annotations

import random
import re
import sys
import time
from collections import Counter

from chatbot import answer_pipeline as pipeline
from chatbot.answer_formatter import present
from data_sources import firebase_reader as university_data
from timetable import timetable_lookup as tt

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
ROMAN_TO_INT = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}
BAD_TEXT = re.compile(r"Traceback|Exception|\{'|'type':|\bNone\b|\bnan\b|undefined")


def _off(*_a, **_k):
    raise RuntimeError("AI off for bulk QA")


def name_words(name: str) -> list[str]:
    clean = re.sub(r"\b(dr|mr|ms|miss|prof|sir)\.?\s+", " ", name, flags=re.I)
    return [w for w in re.findall(r"[A-Za-z]+", clean) if len(w) >= 3]


def typo(word: str) -> str:
    """Drop one middle letter: 'Shahzad' → 'Shazad'."""
    if len(word) < 6:
        return word
    i = len(word) // 2
    return word[:i] + word[i + 1:]


def class_subjects(key: str) -> dict[str, set[str]]:
    """subject → teachers, for one class."""
    out: dict[str, set[str]] = {}
    for slots in tt.TIMETABLE.get(key, {}).values():
        for entries in slots.values():
            for e in entries:
                if e.get("subject") and e.get("teacher") and e["teacher"] != "N/A":
                    out.setdefault(e["subject"].strip(), set()).add(e["teacher"].strip())
    return out


def build_cases():
    rnd = random.Random(7)
    teachers = sorted(tt.ALL_TEACHERS)
    cases = []  # (category, question, identity, check)

    def is_type(kind, **fields):
        def check(ans, intent, text):
            if not isinstance(ans, dict) or ans.get("type") != kind:
                return f"expected {kind}"
            for key, value in fields.items():
                if ans.get(key) != value:
                    return f"{key}={ans.get(key)!r}, expected {value!r}"
            return None
        return check

    def teacher_is(name):
        def check(ans, intent, text):
            if isinstance(ans, dict):
                if ans.get("teacher") == name:
                    return None
                if ans.get("type") == "teacher_ambiguous" and name in (ans.get("matches") or []):
                    return None
            return f"expected an answer about {name}"
        return check

    # Teachers: profile, availability, typo, last name only.
    for i, name in enumerate(teachers):
        cases.append(("teacher: who is", f"who is {name}", None, is_type("teacher_profile", teacher=name)))
        day = DAYS[i % len(DAYS)]
        cases.append(("teacher: free on day", f"is {name} free on {day.lower()}?", None,
                      is_type("teacher_availability", teacher=name)))
    for name in rnd.sample(teachers, 40):
        words = name_words(name)
        longest = max(words, key=len)
        if typo(longest) != longest:
            cases.append(("teacher: typo", f"tell me about sir {name.replace(longest, typo(longest))}", None,
                          teacher_is(name)))
    for name in rnd.sample(teachers, 40):
        last = name_words(name)[-1]
        cases.append(("teacher: last name", f"do you know sir {last.lower()}", None, teacher_is(name)))

    # Rooms.
    for i, room in enumerate(sorted(tt.ALL_ROOMS)):
        if room.lower() in {"lab", "el", "apl"}:
            continue
        day = DAYS[i % len(DAYS)]
        cases.append(("room: free on day", f"is {room} free on {day}?", None, is_type("room_availability", room=room)))

    # Class timetables, by full key and short form.
    for i, key in enumerate(sorted(tt.TIMETABLE)):
        day = DAYS[i % len(DAYS)]

        def schedule_of(key=key):
            def check(ans, intent, text):
                if isinstance(ans, dict) and ans.get("type") == "schedule" and str(ans.get("class", "")).startswith(key):
                    return None
                if isinstance(ans, str) and key in ans and "no classes" in ans:
                    return None
                return f"expected {key}'s timetable"
            return check
        cases.append(("class timetable", f"{key} timetable on {day}", None, schedule_of()))
        prog, roman = re.match(r"BS\((.+)\)-([IVX]+)", key).groups()
        if prog in {"CS", "SE", "AI", "EE", "CE"}:
            cases.append(("class timetable: short", f"show {prog.lower()} {ROMAN_TO_INT[roman]} classes on {day.lower()}",
                          None, schedule_of()))

    # Signed-in students: their own day, and "who is my <subject> teacher".
    dept_for = {code: dept for dept, code in university_data.DEPT_CODE.items()}
    for i, key in enumerate(sorted(tt.TIMETABLE)):
        prog, roman = re.match(r"BS\((.+)\)-([IVX]+)", key).groups()
        if prog not in dept_for:
            continue
        student = {"type": "student", "dept": dept_for[prog], "semester": ROMAN_TO_INT[roman],
                   "email": f"bulk.{i}@cuiatk.edu.pk", "fullName": "QA Student"}
        day = DAYS[i % len(DAYS)]

        def own_day(key=key):
            def check(ans, intent, text):
                if isinstance(ans, dict) and ans.get("type") == "schedule" and str(ans.get("class", "")).startswith(key):
                    return None
                if isinstance(ans, str) and "You have no classes" in ans:
                    return None
                return f"expected the student's own ({key}) day"
            return check
        cases.append(("student: my classes", f"my classes on {day.lower()}", student, own_day()))
        subjects = {s: t for s, t in class_subjects(key).items() if "lab" not in s.lower()}
        if subjects:
            subject, names = sorted(subjects.items())[0]

            def names_teacher(names=names, subject=subject):
                def check(ans, intent, text):
                    return None if any(n in text for n in names) else f"expected {sorted(names)} for {subject}"
                return check
            cases.append(("student: my subject teacher", f"who is my {subject.lower()} teacher?", student,
                          names_teacher()))

    # Second batch: other ways of asking the same things.
    for name in rnd.sample(teachers, 60):
        cases.append(("teacher: next class", f"when is {name}'s next class?", None,
                      is_type("teacher_next_class", teacher=name)))
        cases.append(("teacher: what does X teach", f"what does {name} teach?", None,
                      is_type("teacher_profile", teacher=name)))

    def mentions(*needles):
        def check(ans, intent, text):
            flat = re.sub(r"\s+", "", text.lower())
            return None if any(re.sub(r"\s+", "", n.lower()) in flat for n in needles) else f"expected a mention of {needles}"
        return check

    for room in sorted(tt.ALL_ROOMS):
        if room.lower() in {"lab", "el", "apl"}:
            continue
        cases.append(("room: free now", f"is {room} free right now?", None, mentions(room)))
    for i, key in enumerate(sorted(tt.TIMETABLE)):
        prog, roman = re.match(r"BS\((.+)\)-([IVX]+)", key).groups()
        if prog not in dept_for:
            continue
        student = {"type": "student", "dept": dept_for[prog], "semester": ROMAN_TO_INT[roman],
                   "email": f"bulk2.{i}@cuiatk.edu.pk", "fullName": "QA Student"}
        teachers_of_class = {t for ts in class_subjects(key).values() for t in ts}
        cases.append(("student: my next class", "what is my next class?", student,
                      mentions("next class", "no class", "no upcoming")))
        cases.append(("student: my teachers", "who are my teachers?", student,
                      mentions(*teachers_of_class) if teachers_of_class else mentions("teacher")))
        cases.append(("student: tomorrow", "my classes tomorrow", student, own_day(key)))

    def intent_is(*wanted):
        def check(ans, intent, text):
            return None if intent in wanted else f"intent {intent}, expected {wanted}"
        return check

    fixed = {
        ("events",): ["any events this week?", "is there any event tomorrow?", "what is happening on campus today?",
                      "upcoming events", "any seminar next week?", "workshops this weekend?", "campus news",
                      "events on campus", "what activities are going on?", "is anything happening tomorrow?"],
        ("lostfound",): ["I lost my wallet", "anyone found a phone?", "lost my id card", "found a water bottle",
                         "show lost and found", "has someone found my keys?", "i lost my charger in lt3",
                         "any found items in the library?", "lost and found items", "did anyone find a laptop?"],
        ("off_topic",): ["tell me a movie name", "who won the cricket world cup?", "what is the capital of France?",
                         "tell me a joke", "write a poem about love", "what's the weather today?",
                         "recommend some songs", "latest netflix series", "who is the prime minister of Pakistan?",
                         "let's play a game"],
        ("exams",): ["when are the exams?", "my datesheet", "when is my next paper?", "midterm schedule",
                     "I missed my paper yesterday", "are finals starting?"],
        ("general",): ["hi", "hello", "thanks", "who are you?", "how are you?", "I feel sad today"],
        ("comsats_info",): ["how do I apply for admission?", "which departments are there at Attock campus?",
                            "who is the rector?", "tell me about CU Online"],
        ("private_records",): ["what is my CGPA?", "my attendance", "my marks"],
    }
    for intents, questions in fixed.items():
        for q in questions:
            cases.append((f"fixed: {intents[0]}", q, None, intent_is(*intents)))

    # Guests (gate on): campus data asks them to sign in; university info, greetings and refusals still work.
    guest_data = [f"who is {t}" for t in rnd.sample(teachers, 15)]
    guest_data += [f"{k} timetable on Monday" for k in rnd.sample(sorted(tt.TIMETABLE), 10)]
    guest_data += [f"is {r} free right now?" for r in ["LT4", "CR 2", "Lab3"]]
    guest_data += fixed[("events",)][:4] + fixed[("lostfound",)][:4] + fixed[("exams",)][:2]
    guest_data += ["what are my classes today?", "who am i?", "who teaches data structures?"]
    for q in guest_data:
        cases.append(("guest: sign in for data", q, None, intent_is("sign_in_required")))
    for q in fixed[("comsats_info",)]:
        cases.append(("guest: university info", q, None, intent_is("comsats_info")))
    for q in ["hi", "thanks", "what can you do?"]:
        cases.append(("guest: greetings", q, None, intent_is("general")))
    for q in fixed[("off_topic",)][:5]:
        cases.append(("guest: off-topic", q, None, intent_is("off_topic")))
    return cases


def main():
    pipeline._run_facts_chain = _off
    pipeline._run_general_chain = _off
    pipeline._run_chain = _off
    tt.ensure_timetable()
    cases = build_cases()
    failures, totals, bad = [], Counter(), Counter()
    started = time.time()
    for n, (category, question, identity, check) in enumerate(cases):
        session = f"bulk-{n}"
        # Guest cases test the guest gate; all others test the answer logic itself.
        pipeline.settings.guest_university_info_only = category.startswith("guest:")
        try:
            result = pipeline.answer_question(question, session_id=session, identity=identity)
            answer, intent = result["answer"], result["intent"]
            text = present(answer, identity)
            problem = check(answer, intent, text)
            if not problem and (not text.strip() or BAD_TEXT.search(text)):
                problem = "empty or broken text"
        except Exception as exc:  # a crash is a failure, keep going
            answer, intent, text, problem = None, "crash", "", f"crash: {type(exc).__name__}: {exc}"
        totals[category] += 1
        if problem:
            bad[category] += 1
            failures.append((category, question, intent, problem, text))
        elif "--all" in sys.argv:
            print(f"OK [{category}] {question}\n   {text[:160]!r}")

    print(f"\n{len(cases)} questions in {time.time() - started:.0f}s — "
          f"{len(cases) - len(failures)} passed, {len(failures)} failed\n")
    for category in sorted(totals):
        print(f"  {category:32} {totals[category] - bad[category]:4}/{totals[category]}")
    print()
    for category, question, intent, problem, text in failures:
        print(f"FAIL [{category}] {question}\n   → {problem} (intent {intent})\n   answer: {text[:200]!r}\n")


if __name__ == "__main__":
    main()
