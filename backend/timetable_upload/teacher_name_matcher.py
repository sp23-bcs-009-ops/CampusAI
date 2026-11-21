"""Conservative timetable teacher-name matching against the canonical list."""
from __future__ import annotations

import difflib
import re

TEACHER_TITLES = {"MR", "MRS", "MS", "MISS", "DR", "PROF", "PROFESSOR"}


def teacher_match_form(value: str) -> tuple[str, ...]:
    words = re.findall(r"[A-Z0-9]+", str(value or "").upper())
    while words and words[0] in TEACHER_TITLES:
        words.pop(0)
    return tuple(words)


def match_teacher_list_name(value: str, teacher_names: list[str] | None) -> str:
    """Return a confident Teacher List spelling, otherwise keep the source."""
    raw = " ".join(str(value or "").split())
    form = teacher_match_form(raw)
    if not form or not teacher_names:
        return raw

    candidates = []
    for listed_name in teacher_names:
        listed_form = teacher_match_form(listed_name)
        if not listed_form:
            continue
        if listed_form == form:
            return str(listed_name).strip()
        if len(listed_form) != len(form):
            continue

        differences = 0
        for source_token, listed_token in zip(sorted(form), sorted(listed_form)):
            if source_token == listed_token:
                continue
            differences += 1
            if min(len(source_token), len(listed_token)) < 5:
                break
            if difflib.SequenceMatcher(None, source_token, listed_token).ratio() < 0.82:
                break
        else:
            if differences > 1:
                continue
            source_compact = "".join(sorted(form))
            listed_compact = "".join(sorted(listed_form))
            score = difflib.SequenceMatcher(None, source_compact, listed_compact).ratio()
            threshold = 0.88 if len(form) == 1 else 0.90
            if score >= threshold:
                candidates.append((score, str(listed_name).strip()))

    candidates.sort(key=lambda item: item[0], reverse=True)
    if candidates and (len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= 0.04):
        return candidates[0][1]
    return raw
