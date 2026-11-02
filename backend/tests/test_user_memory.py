"""Durable signed-in preferences stay on this server and never use Firestore."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import user_memory


def test_guest_cannot_save_and_signed_in_memory_survives_reload(tmp_path, monkeypatch):
    store = tmp_path / "long_term_memory.json"
    monkeypatch.setattr(user_memory, "STORE", store)
    guest = user_memory.save_memory("", "short answers")
    assert "sign in" in guest.lower()
    saved = user_memory.save_memory("student@cuiatk.edu.pk", "prefer short timetable answers")
    assert "remember" in saved.lower()
    other = user_memory.memories_for("other@cuiatk.edu.pk")
    assert other == []
    secret = user_memory.save_memory("student@cuiatk.edu.pk", "my password is secret")
    assert "won't save" in secret.lower()
    assert store.exists()
    reloaded = user_memory._load()
    assert reloaded["student@cuiatk.edu.pk"][0]["text"] == "prefer short timetable answers"
    forgotten = user_memory.forget_memories("student@cuiatk.edu.pk")
    assert "deleted" in forgotten.lower()
    assert user_memory.memories_for("student@cuiatk.edu.pk") == []


def test_replace_memory_overwrites_and_write_is_atomic(tmp_path, monkeypatch):
    store = tmp_path / "long_term_memory.json"
    monkeypatch.setattr(user_memory, "STORE", store)
    user_memory.save_memory("student@cuiatk.edu.pk", "short answers")
    replaced = user_memory.replace_memory("student@cuiatk.edu.pk", "use room names")
    assert "replaced" in replaced.lower()
    items = user_memory.memories_for("student@cuiatk.edu.pk")
    assert items == [{"text": "use room names", "purpose": "preference"}]
    assert store.exists()
    assert not list(tmp_path.glob("*.tmp"))
