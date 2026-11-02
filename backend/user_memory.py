"""Signed-in campus preferences stored on this server, not in Firestore."""
from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from threading import Lock

STORE = Path(
    os.environ.get("CAMPUSAI_MEMORY_PATH")
    or (Path(__file__).resolve().parent / "data" / "long_term_memory.json")
)
SECRET = re.compile(r"password|token|api key|bearer|gsk_|private key|date of birth|\bdob\b", re.I)
_LOCK = Lock()


def _load() -> dict:
    if not STORE.exists():
        return {}
    try:
        data = json.loads(STORE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _save(data: dict) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp_name = tempfile.mkstemp(dir=str(STORE.parent), suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as handle_out:
            json.dump(data, handle_out, indent=2)
        os.replace(tmp_name, STORE)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def memories_for(email: str) -> list[dict]:
    owner = str(email or "").strip().lower()
    if not owner:
        return []
    with _LOCK:
        return list(_load().get(owner) or [])


def save_memory(email: str, text: str) -> str:
    owner = str(email or "").strip().lower()
    note = (text or "").strip()[:200]
    if not owner:
        return "Sign in to save, view, or delete a campus preference. I will not keep this for a guest."
    if SECRET.search(note):
        return "I won't save passwords, tokens, or other private details."
    if not note:
        return "Tell me the campus preference to save, for example short timetable answers."
    with _LOCK:
        data = _load()
        bucket = list(data.get(owner) or [])
        bucket.append({"text": note, "purpose": "preference"})
        data[owner] = bucket[-10:]
        _save(data)
    return "I'll remember that campus preference for this signed-in account. Ask me to forget it any time."


def forget_memories(email: str) -> str:
    owner = str(email or "").strip().lower()
    if not owner:
        return "Sign in to save, view, or delete a campus preference. I will not keep this for a guest."
    with _LOCK:
        data = _load()
        data.pop(owner, None)
        _save(data)
    return "I deleted the campus preferences stored for this signed-in account."


def replace_memory(email: str, text: str) -> str:
    owner = str(email or "").strip().lower()
    note = (text or "").strip()[:200]
    if not owner:
        return "Sign in to save, view, or delete a campus preference. I will not keep this for a guest."
    if SECRET.search(note):
        return "I won't save passwords, tokens, or other private details."
    if not note:
        return "Tell me the campus preference to save, for example short timetable answers."
    with _LOCK:
        data = _load()
        data[owner] = [{"text": note, "purpose": "preference"}]
        _save(data)
    return "I replaced the campus preference stored for this signed-in account."


def describe_memories(email: str) -> str:
    items = memories_for(email)
    if not items:
        return "I do not have a saved campus preference for this account."
    return "Saved campus preferences: " + "; ".join(item.get("text", "") for item in items) + "."
