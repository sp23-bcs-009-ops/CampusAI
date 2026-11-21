"""QA round: ask real-data questions straight to the chatbot code (no HTTP, no rate limit).

Run inside the backend container, from backend/:
    python quality_check/qa_questions.py          # plain facts (AI off): checks routing and data
    python quality_check/qa_questions.py --ai     # with AI wording (slow: 5 AI calls a minute)

Questions in one block share a chat, so follow-ups ("he", "those") work.
"""
import sys
import time

from chatbot import answer_pipeline as pipeline
from chatbot.answer_formatter import present

STUDENT = {"type": "student", "dept": "cs", "semester": 2, "fullName": "Ali Khan",
           "email": "qa.student@cuiatk.edu.pk", "department": "Computer Science"}

BLOCKS = [
    ("guest", None, [
        "hello do you know rizwan",
        "i am talking about sir rizwan",
        "sir shazad rizwan",
        "which courses he is teaching",
        "how many subjects is he teaching",
        "when is he free on monday?",
    ]),
    ("guest", None, [
        "who is umar zia",
        "is umar zia free now?",
        "which teachers are free right now?",
        "who teaches data structures?",
    ]),
    ("guest", None, [
        "any events this week?",
        "is there any event tomorrow?",
        "I lost my calculator, has anyone found one?",
        "anyone found a black bag?",
        "show lost and found items",
        "Is LT 4 free now?",
        "which rooms are free at 10am tomorrow?",
    ]),
    ("student BS(CS)-II", STUDENT, [
        "my classes today",
        "my timetable tomorrow",
        "what is my next class",
        "who teaches my discrete structures?",
        "when am I free on monday?",
        "my teachers",
        "any notices for my class?",
        "what subjects do I have?",
    ]),
    ("guest, round 3", None, [
        "who teaches OOP?",
        "where is mehreen wahab right now?",
        "what does M. Sharif teach?",
        "is anyone teaching in LT2 on monday?",
        "which class is in LT8 at 10 on monday?",
        "show BS(SE)-I timetable for wednesday",
        "lost my id card",
        "any found items in the library?",
        "what is happening on campus this weekend?",
    ]),
    ("student BS(CS)-II, round 3", STUDENT, [
        "do i have any lab today?",
        "who is my OOP teacher?",
        "my classes tomorrow",
        "which class do I have right now?",
        "when does my last class end today?",
        "is my discrete structures teacher free now?",
    ]),
]


def main():
    use_ai = "--ai" in sys.argv
    if not use_ai:
        def off(*_a, **_k):
            raise RuntimeError("AI off for this QA run")
        pipeline._run_facts_chain = off
        pipeline._run_general_chain = off
    for index, (who, identity, questions) in enumerate(BLOCKS):
        session = f"qa-{index}-{int(time.time())}"
        print(f"\n===== {who} =====")
        for question in questions:
            result = pipeline.answer_question(question, session_id=session, identity=identity)
            print(f"\nQ: {question}\n[{result['intent']}]\n{present(result['answer'], identity)}")
            if use_ai:
                time.sleep(15)


if __name__ == "__main__":
    main()
