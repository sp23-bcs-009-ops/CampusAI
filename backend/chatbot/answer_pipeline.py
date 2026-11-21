"""
The chatbot's main entry: answer_question() takes a question and returns an answer.

Order of checks for each question:
  1. greetings_and_help.py   greetings, "what can you do?", "who am I?"
  2. student_answers.py      a signed-in student's own classes, subjects, teachers
     teacher_answers.py      a signed-in teacher's own schedule
  3. count_and_list_answers  "how many teachers", lists
  4. question_router.py      decides the kind of question, then one handler answers:
       timetable / teacher / room  → timetable_answers.py  (code only, Firestore data)
       events / notices / lost     → record_answers.py     (code only, Firestore data)
       exams                       → exam_answers.py
       campus website info         → handle_comsats() here (knowledge pack + AI)
       chat, feelings, unclear     → handle_general() here (AI)
       off-topic                   → fixed refusal (fixed_replies.py)

Everything that talks to the AI lives in this file (the chains below), and the
AI's rules live in ai_prompts.py. Small shared checks on the question text are
in question_checks.py, and per-chat memory in chat_memory.py.
"""
from __future__ import annotations

import re
import time
from collections import deque
from functools import lru_cache
from typing import Any, Dict

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from chatbot.ai_prompts import COMSATS_PROMPT, FACTS_PROMPT, GENERAL_PROMPT, RECORD_PROMPT, UNDERSTAND_PROMPT
from chatbot.question_understanding import parse_understanding, standard_question
from chatbot.off_topic_guard import has_campus_anchor
from chatbot.question_router import _clearly_unrelated
from chatbot.question_checks import _is_exam_question
from langchain_core.messages import HumanMessage
from chatbot.answer_formatter import card_to_text
from chatbot.fact_check import unsupported_details
from chatbot.campus_question_check import is_comsats_question
from chatbot.count_and_list_answers import answer_catalog
from data_sources import firebase_reader as university_data
from data_sources.firebase_reader import UniversityDataUnavailable
from data_sources.website_knowledge_reader import (
    ARCHIVE_CATEGORIES,
    KnowledgePackUnavailable,
    format_pack_context,
    retrieve_campus_documents,
)
from settings.app_settings import settings
from settings.llm_provider import get_chat_model
from timetable import timetable_lookup as tt

from chatbot.fixed_replies import (
    CLARIFY, GUEST_SIGN_IN, INTRO, NOT_IN_RECORDS, PRIVATE_RECORDS, REFUSAL, _UNRELATED_NOTE,
)
from langchain_core.messages import AIMessage
from chatbot.chat_memory import get_session, SessionMemory
from chatbot.question_checks import (
    _class_key_from_text,
    _is_bot_identity,
    _is_social,
    _notification_target,
    _plain_words,
    _WHO_TEACHES,
    RoutedQuestion,
)
from chatbot.record_answers import (
    _announcement_lines,
    _event_lines,
    _format_records,
    _lostfound_lines,
    _notification_lines,
    _RECORD_LABELS,
)
from chatbot.exam_answers import handle_exams
from chatbot.timetable_answers import (
    _ordinal_meeting_reply,
    class_subject_teacher,
    handle_room,
    handle_room_unknown,
    handle_rooms_all,
    handle_teacher,
    handle_teacher_secondary,
    handle_timetable,
)
from chatbot.student_answers import _student_natural
from chatbot.teacher_answers import _teacher_natural
from chatbot.greetings_and_help import personal_reply, role_reply
from chatbot.question_router import _university_portion, _with_unrelated_note, route


@lru_cache(maxsize=8)
def _build_chain(system_prompt: str):
    """prompt → model → text. Built once per prompt and reused for every question."""
    # LangChain reads {...} as a placeholder; the prompts' JSON examples must stay literal text.
    literal_prompt = system_prompt.replace("{", "{{").replace("}", "}}")
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", literal_prompt),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}"),
        ]
    )
    return prompt | get_chat_model() | StrOutputParser()


_AI_CALLS: deque = deque()  # times of recent AI calls, to stay under the provider's per-minute limit


def _ai_calls_last_minute() -> int:
    cutoff = time.monotonic() - 60
    while _AI_CALLS and _AI_CALLS[0] < cutoff:
        _AI_CALLS.popleft()
    return len(_AI_CALLS)


def _ai_budget_left(reserve: int = 0) -> bool:
    """True when another AI call fits in this minute, keeping `reserve` calls for chat/website answers."""
    return _ai_calls_last_minute() + reserve < settings.ai_calls_per_minute


def _run_chain(system_prompt: str, user_input: str, memory: SessionMemory) -> str:
    chain = _build_chain(system_prompt)
    _AI_CALLS.append(time.monotonic())
    return chain.invoke({"input": user_input, "history": memory.messages})


def _run_facts_chain(question: str, facts: str, memory: SessionMemory) -> str:
    return _run_chain(
        FACTS_PROMPT,
        f"Question: {question}\n\nFACTS (from the university timetable and records):\n{facts}",
        memory,
    )


def _ai_words_for_facts(question: str, facts: str, memory: SessionMemory, reserve: int) -> str | None:
    """The AI's friendly wording of the facts, or None when it's unavailable or adds anything new."""
    if not facts.strip():
        return None
    if len(facts) > _MAX_FACTS_FOR_AI:
        print(f"[AI] wording skipped: facts too long ({len(facts)} characters), using plain facts")
        return None
    if not _ai_budget_left(reserve):
        print("[AI] wording skipped: AI calls per minute used up, using plain facts")
        return None
    try:
        reply = str(_run_facts_chain(question, facts, memory) or "").strip()
    except Exception as exc:
        print(f"[AI] wording failed ({type(exc).__name__}), using plain facts")
        return None
    problems = unsupported_details(reply, facts, question) if reply else ["empty reply"]
    if problems:
        print(f"[AI] wording rejected, using plain facts: {problems[:5]}")
        return None
    return reply


def _run_general_chain(question: str, memory: SessionMemory) -> str:
    now = tt.campus_now().strftime("%A, %d %B %Y, %I:%M %p")
    guest = (
        "(The user is a guest: only university information is available to them. For timetables, "
        "teachers, rooms, events, notices or lost & found, tell them to sign in.)\n"
        if memory.is_guest else ""
    )
    return _run_chain(GENERAL_PROMPT, f"(Current campus date and time: {now})\n{guest}{question}", memory)


def _ai_reply(question: str, memory: SessionMemory, fallback: str) -> str:
    """A friendly model reply for chat and unclear questions. Fixed text if the model is unavailable."""
    try:
        answer = str(_run_general_chain(question, memory) or "").strip()
    except Exception:
        return fallback
    return answer or fallback


def handle_comsats(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    try:
        documents = retrieve_campus_documents(rq.question)
    except KnowledgePackUnavailable as exc:
        return str(exc)
    if not documents:
        return NOT_IN_RECORDS
    context = format_pack_context(documents, rq.question)
    prompt = f"Question: {rq.question}\n\nApproved campus website records:\n{context}\n"
    try:
        answer = _run_chain(COMSATS_PROMPT, prompt, memory)
    except Exception:
        answer = (
            "I found these approved website records, but the answer model is unavailable:\n\n"
            + context
        )
    if documents[0].get("category") in ARCHIVE_CATEGORIES:
        answer = (
            "This is a historical archive record, not an upcoming event.\n\n"
            + str(answer)
        )
    return answer


def handle_records(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    dept = semester = None
    if rq.intent == "notifications":
        dept, semester = _notification_target(rq.cls)
    try:
        records = university_data.firebase_records(rq.intent, dept=dept, semester=semester)
    except UniversityDataUnavailable as exc:
        return str(exc)
    label = _RECORD_LABELS[rq.intent]
    if not records:
        return f"There are no published {label} right now."
    if rq.intent == "events":
        return _event_lines(records, rq.question)
    if rq.intent == "announcements":
        return _announcement_lines(records)
    if rq.intent == "lostfound":
        return _lostfound_lines(rq.question, records)
    if rq.intent == "notifications":
        return _notification_lines(records, rq.cls)
    payload = _format_records(records)
    prompt = f"Question: {rq.question}\n\nCurrent Firestore records:\n{payload}"
    try:
        return _run_chain(RECORD_PROMPT, prompt, memory)
    except Exception:
        return f"Current {label} from Firestore:\n\n{payload}"


_UNIVERSITY_FACT_WORDS = (
    "timetable", "schedule", "class", "teacher", "faculty", "professor",
    "room", "event", "announcement", "lost", "found", "notification",
    "office", "semester", "lecture", "subject", "exam", "lab",
)


def handle_general(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    q_lower = rq.question.lower()
    if _is_bot_identity(rq.question):
        return INTRO
    if _is_social(rq.question):
        if "thank" in _plain_words(rq.question):
            fallback = "You're welcome. Ask anytime about a class, teacher, room, or campus information."
        elif _plain_words(rq.question).startswith("how are you"):
            fallback = "I'm well, thanks. I can help with class schedules and campus information."
        else:
            fallback = (
                "Hello. I can help with class schedules, teacher availability, rooms, "
                "events, announcements, and COMSATS campus information."
            )
        return _ai_reply(rq.question, memory, fallback)
    if any(phrase in q_lower for phrase in ("my semester", "don't know my semester", "do not know my semester", "not know my semester")):
        return (
            "Tell me your program and semester and I will look it up. "
            "For example: BCS-1, BSSE-3, or BS(AI)-I."
        )
    if any(word in q_lower for word in _UNIVERSITY_FACT_WORDS):
        return _ai_reply(rq.question, memory, (
            "I don't have that in the current university records. "
            "Ask about a class timetable, a teacher, a room, events, announcements, "
            "lost and found, or notifications."
        ))
    # Not off-topic, just unclear or conversational: let the model reply.
    return _ai_reply(rq.question, memory, CLARIFY)


HANDLERS = {
    "comsats_info": handle_comsats,
    "exams": handle_exams,
    "private_records": lambda rq, mem: PRIVATE_RECORDS,
    "off_topic": lambda rq, mem: REFUSAL,
    "teacher": handle_teacher,
    "rooms_all": handle_rooms_all,
    "room": handle_room,
    "room_unknown": handle_room_unknown,
    "teacher_secondary": handle_teacher_secondary,
    "timetable": handle_timetable,
    "events": handle_records,
    "lostfound": handle_records,
    "announcements": handle_records,
    "teachers": handle_records,
    "notifications": handle_records,
    "general": handle_general,
}

# Which intents update entity memory's "last_intent"
_ENTITY_INTENTS = {"teacher", "teacher_secondary", "room", "timetable"}


# Answers built from Firestore facts that the AI may reword (never exams, refusals or private data).
_AI_WORDED_INTENTS = {
    "teacher", "teacher_secondary", "timetable", "room", "rooms_all", "room_unknown",
    "events", "announcements", "lostfound", "notifications", "catalog",
}
_MAX_FACTS_FOR_AI = 2500  # a whole week of every room is too long to reword safely; send it as is
_FOLLOWUP_REF = re.compile(r"\b(those|these|them|which of|that one|in that list|from that)\b")


def answer_question(question: str, session_id: str = "default", identity: dict | None = None) -> Dict[str, Any]:
    """Facts from code, words from the AI.

    The code finds the answer from Firestore exactly as before. For data answers
    (timetable, teachers, rooms, events, notices) the AI then rewrites those facts
    in friendly words. fact_check.py rejects any wording that adds a detail the
    facts don't have, and then the plain fact text is sent instead.
    """
    memory = get_session(session_id)
    if identity is None and settings.guest_university_info_only:
        return _guest_answer(question, session_id, memory)
    followup = _followup_from_last_facts(question, memory)
    if followup is not None:
        memory.add_turn(question, followup)
        return {"answer": followup, "intent": "followup"}
    which = _which_teacher_question(question, memory)
    if which is not None:
        memory.add_turn(question, which)
        return {"answer": which, "intent": "teacher"}
    understood = _understood_answer(question, session_id, identity, memory)
    result = understood if understood is not None else _answer_from_code(question, session_id, identity)
    return _with_ai_wording(question, result, memory)


# What a guest (no verified university sign-in) may get: university information, greetings and
# help, and the polite off-topic refusal. Everything else asks them to sign in.
_GUEST_INTENTS = {"comsats_info", "general", "off_topic"}
_GUEST_AI_INTENTS = {"campus_info", "chat", "off_topic"}


def _guest_answer(question: str, session_id: str, memory: SessionMemory) -> Dict[str, Any]:
    """The guest gate: one place that decides what a guest may see.

    The AI's reading of the question is used first, so data questions are refused before any
    Firestore read. Whatever answers, the final intent is checked again, so nothing else
    reaches a guest even when the AI is unavailable.
    """
    memory.is_guest = True
    if personal_reply(question, None) is not None:
        # "my classes", "who am I": personal data always needs a sign-in.
        memory.add_turn(question, GUEST_SIGN_IN)
        return {"answer": GUEST_SIGN_IN, "intent": "sign_in_required"}
    if not _needs_no_understanding(question) and _ai_budget_left():
        try:
            understood = parse_understanding(_run_understanding_chain(
                f"Today: {tt.campus_now().strftime('%A, %d %B %Y')}. The user is a guest.\n"
                f"Previous: teacher=; class=; room=\nMessage: {question}"
            ))
        except Exception:
            understood = None
        if understood and understood["intent"] not in _GUEST_AI_INTENTS:
            memory.add_turn(question, GUEST_SIGN_IN)
            return {"answer": GUEST_SIGN_IN, "intent": "sign_in_required"}
    result = _answer_from_code(question, session_id, None)
    if result.get("intent") in _GUEST_INTENTS:
        return result
    # Data was found for a guest: replace it, and keep it out of the chat memory too.
    if memory.messages and isinstance(memory.messages[-1], AIMessage):
        memory.messages[-1] = AIMessage(content=GUEST_SIGN_IN)
    memory.last_facts = ""
    return {"answer": GUEST_SIGN_IN, "intent": "sign_in_required"}


def _run_understanding_chain(message: str) -> str:
    """One AI call that says what the message asks for (JSON). No chat history: the context is in the message."""
    return _run_chain(UNDERSTAND_PROMPT, message, SessionMemory())


def _needs_no_understanding(question: str) -> bool:
    """Greetings, exam questions, obvious off-topic and mixed questions are already answered well
    without spending an AI call (the provider allows only a few per minute)."""
    return bool(
        _is_social(question) or _is_bot_identity(question) or _is_exam_question(question)
        or _clearly_unrelated(question) or _university_portion(question)
    )


def _understood_answer(question: str, session_id: str, identity: dict | None, memory: SessionMemory):
    """Phase 7: the AI reads the question, code checks what it found and answers with the tested code.

    Returns None to let the rules answer the original question: when the AI limit is reached,
    the AI isn't sure, or a name it found isn't in the timetable.
    """
    if _needs_no_understanding(question) or not _ai_budget_left():
        return None
    who = "a guest"
    if identity and identity.get("type") == "student":
        from user_login.firebase_login_check import class_key_from_profile

        who = f"a student of {class_key_from_profile(identity) or 'an unknown class'}"
    elif identity and identity.get("type") in {"teacher", "staff"}:
        who = f"a {identity['type']}"
    context = (
        f"Today: {tt.campus_now().strftime('%A, %d %B %Y')}. The user is {who}.\n"
        f"Previous: teacher={memory.last_teacher or ''}; class={memory.last_class or ''}; "
        f"room={memory.last_room or ''}\n"
        f"Message: {question}"
    )
    try:
        understood = parse_understanding(_run_understanding_chain(context))
        tt.ensure_timetable()
    except Exception:
        return None
    if not understood:
        return None
    intent = understood["intent"]
    if intent == "off_topic":
        if has_campus_anchor(question) or _class_key_from_text(question):
            return None  # says something about the campus: let the rules decide
        memory.add_turn(question, REFUSAL)
        return {"answer": REFUSAL, "intent": "off_topic"}
    if intent == "followup" and memory.last_facts:
        reply = _ai_words_for_facts(question, memory.last_facts, memory, reserve=0)
        if reply:
            memory.add_turn(question, reply)
            return {"answer": reply, "intent": "followup"}
        return None
    if intent == "subject_teachers" and not understood.get("class") and memory.last_class:
        understood["class"] = memory.last_class  # the class just shown ("the first one" is in it)
    standard = standard_question(understood)
    print(f"[AI] understood {understood.get('intent')} → {standard!r}")
    if not standard:
        return None  # chat, website, private records, or a name we couldn't confirm: the rules answer
    result = _answer_from_code(standard, session_id, identity)
    if len(memory.messages) >= 2:
        memory.messages[-2] = HumanMessage(content=question)  # remember what the student actually typed
    return result


def _followup_from_last_facts(question: str, memory: SessionMemory) -> str | None:
    """'Which of those are labs?' is answered from the last data answer, not routed by keywords."""
    if not memory.last_facts or not _FOLLOWUP_REF.search(question.lower()) or _class_key_from_text(question):
        return None
    return _ai_words_for_facts(question, memory.last_facts, memory, reserve=0)


def _with_ai_wording(question: str, result: Dict[str, Any], memory: SessionMemory) -> Dict[str, Any]:
    if result.get("intent") not in _AI_WORDED_INTENTS:
        return result
    answer = result.get("answer")
    note = ""
    if isinstance(answer, dict):
        note = str(answer.get("note") or "")
        facts = card_to_text({key: value for key, value in answer.items() if key != "note"})
    else:
        facts = str(answer or "")
        if _UNRELATED_NOTE in facts:
            facts, note = facts.replace(_UNRELATED_NOTE, "").strip(), _UNRELATED_NOTE
    memory.last_facts = facts
    # Keep 2 calls a minute free for greetings and website questions.
    reply = _ai_words_for_facts(question, facts, memory, reserve=2)
    if reply is None:
        return result
    return {"answer": reply + (f"\n\n{note}" if note else ""), "intent": result["intent"]}


_TEACHER_REF = re.compile(r"\b(he|him|his|she|her|this teacher|that teacher|the teacher|same teacher)\b")


def _which_teacher_question(question: str, memory: SessionMemory) -> str | None:
    """After "I found more than one Kamran", a "he / his" question can't be answered yet: ask which one."""
    candidates = memory.last_teacher_candidates
    if memory.last_teacher or len(candidates) < 2 or not _TEACHER_REF.search(question.lower()):
        return None
    try:
        if tt.detect_teacher(question):
            return None  # a name is given this time; answer normally
    except UniversityDataUnavailable:
        return None
    names = ", ".join(candidates[:-1]) + f" or {candidates[-1]}"
    return f"Which teacher do you mean: {names}? Please write the full name."


def _teacher_followup(question: str, memory: SessionMemory) -> Any:
    """'Which courses is he teaching?' after a teacher answer is about that teacher.

    This runs before the count/list and student answers, which would otherwise read
    "how many subjects" as the student's own class.
    """
    if not memory.last_teacher or not _TEACHER_REF.search(question.lower()) or _class_key_from_text(question):
        return None
    try:
        named = tt.detect_teacher(question)
    except UniversityDataUnavailable:
        return None
    if named and named != memory.last_teacher:
        return None  # a different teacher is named; the router handles it
    slot_filter, time_label = tt._make_time_filter(question)
    rq = RoutedQuestion("teacher", question, teacher=memory.last_teacher,
                        slot_filter=slot_filter, time_label=time_label)
    answer = handle_teacher(rq, memory)
    if isinstance(answer, dict) and answer.get("type") == "teacher_profile":
        answer["confirm_name"] = False  # we already know who "he" is; don't ask "Do you mean...?" again
    return answer


def _answer_from_code(question: str, session_id: str = "default", identity: dict | None = None) -> Dict[str, Any]:
    university_part = _university_portion(question)
    if university_part:
        result = _answer_from_code(university_part, session_id=session_id, identity=identity)
        return _with_unrelated_note(result)
    memory = get_session(session_id)
    greeting_or_help = role_reply(question, identity)
    if greeting_or_help is not None:
        memory.add_turn(question, greeting_or_help)
        return {"answer": greeting_or_help, "intent": "general"}
    personal = personal_reply(question, identity)
    if personal is not None:
        memory.add_turn(question, personal)
        return {"answer": personal, "intent": "general"}
    teacher_followup = _teacher_followup(question, memory)
    if teacher_followup is not None:
        memory.add_turn(question, teacher_followup)
        return {"answer": teacher_followup, "intent": "teacher"}
    natural = None
    try:
        if identity and identity.get("type") == "student":
            natural = _student_natural(question, identity, memory)
        elif identity and identity.get("type") == "teacher":
            natural = _teacher_natural(question, identity, memory)
    except UniversityDataUnavailable as exc:
        natural = (str(exc), "unavailable")
    if natural is not None:
        answer, intent = natural
        memory.add_turn(question, answer)
        return {"answer": answer, "intent": intent}
    ordinal = _ordinal_meeting_reply(question, memory)
    if ordinal is not None:
        memory.add_turn(question, ordinal)
        return {"answer": ordinal, "intent": "timetable"}
    named_class = _class_key_from_text(question) if _WHO_TEACHES.search(question.lower()) else None
    if named_class:
        # "Who teaches PF in BCS-1?" stays inside that class.
        try:
            tt.ensure_timetable()
            scoped = class_subject_teacher(question, named_class) if named_class in tt.TIMETABLE else None
        except UniversityDataUnavailable:
            scoped = None
        if scoped is not None:
            memory.last_class = named_class
            memory.add_turn(question, scoped)
            return {"answer": scoped, "intent": "teacher"}
    catalog = answer_catalog(question, memory)
    if catalog is not None:
        answer, intent = catalog
        memory.add_turn(question, answer)
        return {"answer": answer, "intent": intent}
    try:
        rq = route(question, memory, identity=identity)
        handler = HANDLERS[rq.intent]
        result = handler(rq, memory)
    except UniversityDataUnavailable as exc:
        if is_comsats_question(question):
            result = handle_comsats(RoutedQuestion("comsats_info", question), memory)
            memory.add_turn(question, result)
            return {"answer": result, "intent": "comsats_info"}
        memory.add_turn(question, str(exc))
        return {"answer": str(exc), "intent": "unavailable"}
    except KnowledgePackUnavailable as exc:
        memory.add_turn(question, str(exc))
        return {"answer": str(exc), "intent": "unavailable"}

    if rq.intent in _ENTITY_INTENTS:
        memory.last_intent = "teacher" if rq.intent == "teacher_secondary" else rq.intent
    memory.add_turn(question, result)

    return {"answer": result, "intent": rq.intent}
