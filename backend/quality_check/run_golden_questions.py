"""Ask the running chatbot every golden question and save the answers.

Usage (from backend/, with the backend running):

    python quality_check/run_golden_questions.py baseline
    python quality_check/run_golden_questions.py after_phase_1 --url http://localhost:8000

Writes quality_check/results/<label>.md (easy to read) and <label>.json (to compare).
Questions in one group share a chat session, so follow-ups like "what about Tuesday?" work.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent


def ask(url: str, question: str, session_id: str) -> dict:
    body = json.dumps({"question": question, "session_id": session_id}).encode()
    request = urllib.request.Request(
        f"{url}/ask", data=body, headers={"Content-Type": "application/json"}
    )
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode())
    except Exception as exc:  # keep going so one failure doesn't hide the rest
        data = {"answer": f"ERROR: {exc}", "intent": "error"}
    data["seconds"] = round(time.time() - started, 1)
    return data


def as_text(answer) -> str:
    return answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("label", help="name for this run, e.g. baseline or after_phase_1")
    parser.add_argument("--url", default="http://localhost:8000")
    args = parser.parse_args()

    golden = json.loads((HERE / "golden_questions.json").read_text(encoding="utf-8"))
    results = []
    lines = [f"# Golden questions: {args.label}", "", f"Server: {args.url}", ""]
    for group in golden["groups"]:
        session_id = f"golden-{uuid.uuid4().hex[:8]}"
        lines += [f"## {group['name']}", ""]
        for item in group["questions"]:
            reply = ask(args.url, item["q"], session_id)
            text = as_text(reply.get("answer"))
            results.append({
                "group": group["name"],
                "question": item["q"],
                "expect": item["expect"],
                "intent": reply.get("intent"),
                "seconds": reply.get("seconds"),
                "answer": text,
            })
            lines += [
                f"**Q:** {item['q']}  ",
                f"*expect:* {item['expect']} · *intent:* {reply.get('intent')} · *{reply.get('seconds')}s*",
                "",
                "> " + text.replace("\n", "\n> "),
                "",
            ]
            print(f"[{reply.get('intent')}] {item['q']}")

    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    (out_dir / f"{args.label}.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / f"{args.label}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\nSaved {len(results)} answers to {out_dir / (args.label + '.md')}")


if __name__ == "__main__":
    main()
