"""Per-chat memory: recent messages for the AI, and the last class/teacher/room for follow-ups.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from chatbot.answer_formatter import card_to_text
from settings.app_settings import settings


@dataclass
class SessionMemory:
    messages: List[BaseMessage] = field(default_factory=list)
    last_teacher: Optional[str] = None
    last_class: Optional[str] = None
    last_room: Optional[str] = None
    last_intent: Optional[str] = None
    last_subjects: List[str] = field(default_factory=list)
    last_day: Optional[str] = None
    last_rooms: List[str] = field(default_factory=list)
    last_classes: List[str] = field(default_factory=list)
    last_catalog_metric: Optional[str] = None
    last_catalog_items: List[str] = field(default_factory=list)
    last_day_meetings: List[dict] = field(default_factory=list)
    is_guest: bool = False  # guests only get university information
    last_facts: str = ""  # plain-text facts of the last data answer, for "which of those...?"

    def add_turn(self, question: str, answer: Any) -> None:
        self.messages.append(HumanMessage(content=question))
        # Keep the readable text of timetable/room answers too, so the model can see them.
        text = answer if isinstance(answer, str) else card_to_text(answer)
        self.messages.append(AIMessage(content=text[:600]))
        max_msgs = settings.memory_window * 2
        if len(self.messages) > max_msgs:
            self.messages = self.messages[-max_msgs:]


_SESSIONS: Dict[str, SessionMemory] = {}


def get_session(session_id: str) -> SessionMemory:
    if session_id not in _SESSIONS:
        # Naive eviction so memory can't grow forever
        if len(_SESSIONS) > 500:
            _SESSIONS.pop(next(iter(_SESSIONS)))
        _SESSIONS[session_id] = SessionMemory()
    return _SESSIONS[session_id]
