"""HTTP contract for /ask. The model call is mocked so tests stay offline."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

import API
from API import app

client = TestClient(app)


def _fake_answer(question, session_id="default", identity=None):
    return {"answer": f"echo:{question}", "intent": "general"}


def test_health_is_local():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "llm" in body
    assert "rag" in body


def test_ask_returns_answer_and_intent(monkeypatch):
    monkeypatch.setattr(API, "answer_question", _fake_answer)
    response = client.post(
        "/ask",
        json={"question": "Hello!", "session_id": "api-session"},
    )
    assert response.status_code == 200
    assert response.json() == {"answer": "echo:Hello!", "intent": "general"}


def test_ask_rejects_missing_question():
    response = client.post("/ask", json={"session_id": "api-session"})
    assert response.status_code == 422


def test_ask_rejects_malformed_json():
    response = client.post(
        "/ask",
        content=b"{not-json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_ask_verifies_the_bearer_token_and_ignores_a_json_role(monkeypatch):
    seen = {}

    def fake_resolve(token):
        seen["token"] = token
        return {"type": "student", "dept": "cs", "semester": 1}

    def fake_answer(question, session_id="default", identity=None):
        seen["identity"] = identity
        seen["question"] = question
        return {"answer": "ok", "intent": "general"}

    monkeypatch.setattr("identity.resolve_identity", fake_resolve)
    monkeypatch.setattr(API, "answer_question", fake_answer)
    response = client.post(
        "/ask",
        json={"question": "show my schedule", "role": "staff", "session_id": "signed-in"},
        headers={"Authorization": "Bearer signed-token"},
    )
    assert response.status_code == 200
    assert response.json() == {"answer": "ok", "intent": "general"}
    assert seen["token"] == "signed-token"
    assert seen["identity"]["type"] == "student"
    assert "role" not in seen["question"]

    seen.clear()
    guest = client.post("/ask", json={"question": "who am I?", "session_id": "guest"})
    assert guest.status_code == 200
    assert seen["identity"] is None


def test_ask_rejects_blank_or_huge_questions_and_a_bad_token(monkeypatch):
    seen = {}

    def fake_resolve(token):
        seen["token"] = token
        return None

    def fake_answer(question, session_id="default", identity=None):
        seen["called"] = True
        seen["session_id"] = session_id
        seen["identity"] = identity
        return {"answer": "ok", "intent": "general"}

    monkeypatch.setattr("identity.resolve_identity", fake_resolve)
    monkeypatch.setattr(API, "answer_question", fake_answer)

    blank = client.post("/ask", json={"question": "   "})
    assert blank.status_code == 400
    assert seen == {}

    huge = client.post("/ask", json={"question": "x" * 2001})
    assert huge.status_code == 400
    assert seen == {}

    guest = client.post(
        "/ask",
        json={"question": "hello", "session_id": "guest session\n" + ("y" * 300)},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert guest.status_code == 200
    assert seen["token"] == "not-a-real-token"
    assert seen["identity"] is None
    assert seen["session_id"] == "guest:" + ("guest session" + ("y" * 300))[:120]
    assert "\n" not in seen["session_id"]


def test_guest_session_cannot_reuse_a_verified_user_session(monkeypatch):
    seen = []

    def fake_resolve(token):
        if token == "good-token":
            return {"type": "student", "email": "Student@cuiatk.edu.pk", "dept": "cs", "semester": 1}
        return None

    def fake_answer(question, session_id="default", identity=None):
        seen.append({"session_id": session_id, "identity": identity, "question": question})
        return {"answer": "ok", "intent": "general"}

    monkeypatch.setattr("identity.resolve_identity", fake_resolve)
    monkeypatch.setattr(API, "answer_question", fake_answer)
    signed = client.post(
        "/ask",
        json={"question": "hello", "session_id": "shared", "role": "teacher", "user_id": "other"},
        headers={"Authorization": "Bearer good-token"},
    )
    guest = client.post(
        "/ask",
        json={"question": "who am I?", "session_id": "shared", "role": "student"},
    )
    assert signed.status_code == 200
    assert guest.status_code == 200
    assert seen[0]["session_id"] == "user:student@cuiatk.edu.pk:shared"
    assert seen[0]["identity"]["type"] == "student"
    assert seen[1]["session_id"] == "guest:shared"
    assert seen[1]["identity"] is None
    assert seen[0]["session_id"] != seen[1]["session_id"]


def test_ask_rate_limit_returns_json(monkeypatch):
    monkeypatch.setattr(API, "answer_question", _fake_answer)
    API.limiter.reset()
    last = None
    for _ in range(21):
        last = client.post("/ask", json={"question": "hello", "session_id": "rate-check"})
    assert last is not None
    assert last.status_code == 429
    assert last.json()["detail"] == "Too many requests. Please wait a minute and try again."
    API.limiter.reset()


def test_ask_requires_api_key_only_when_configured(monkeypatch):
    monkeypatch.setattr(API, "answer_question", _fake_answer)
    monkeypatch.setattr(API.settings, "api_key", "test-only-key")

    blocked = client.post("/ask", json={"question": "Hello!"})
    assert blocked.status_code == 401

    allowed = client.post(
        "/ask",
        json={"question": "Hello!"},
        headers={"X-API-Key": "test-only-key"},
    )
    assert allowed.status_code == 200
    assert allowed.json()["answer"] == "echo:Hello!"
