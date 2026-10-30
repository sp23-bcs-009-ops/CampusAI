"""Approved COMSATS Attock website knowledge pack.

Live campus records still come from Firestore. This pack is only for
website and published campus-information questions.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

PACK_DIR = Path(__file__).resolve().parent / "knowledge_pack"
PACK_JSON = PACK_DIR / "attock_campus_knowledge_pack.json"
SKIP_IDS = {"website_access_limitation"}
SKIP_CATEGORIES = {"source_access_note"}
ARCHIVE_CATEGORIES = {"event_archive"}
SNAPSHOT_CATEGORIES = {"faculty_directory"}
STOP_WORDS = {
    "the", "and", "for", "with", "about", "what", "tell", "does",
    "have", "can", "you", "give", "show", "list", "page", "source",
    "url", "info", "information", "comsats", "university", "cui",
}


class KnowledgePackUnavailable(RuntimeError):
    """The approved website knowledge pack could not be read."""


def _terms(question: str) -> list[str]:
    return [
        word for word in re.findall(r"[a-z0-9]+", (question or "").lower())
        if len(word) > 2 and word not in STOP_WORDS
    ]


@lru_cache(maxsize=1)
def load_pack() -> dict:
    if not PACK_JSON.exists():
        raise KnowledgePackUnavailable(
            "The approved COMSATS website knowledge pack is missing."
        )
    try:
        data = json.loads(PACK_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise KnowledgePackUnavailable(
            "The approved COMSATS website knowledge pack could not be read."
        ) from exc
    if not isinstance(data, dict) or not isinstance(data.get("documents"), list):
        raise KnowledgePackUnavailable(
            "The approved COMSATS website knowledge pack has an unexpected format."
        )
    return data


def pack_status() -> dict:
    data = load_pack()
    usable = [doc for doc in data["documents"] if _is_usable(doc)]
    return {
        "dataset_id": data.get("dataset_id"),
        "compiled_date": data.get("compiled_date"),
        "document_count": len(usable),
        "path": str(PACK_JSON.name),
    }


def _is_usable(document: dict) -> bool:
    return (
        document.get("id") not in SKIP_IDS
        and document.get("category") not in SKIP_CATEGORIES
        and isinstance(document.get("content"), str)
        and document.get("content").strip()
    )


def _source(document: dict) -> dict:
    source = document.get("source")
    return source if isinstance(source, dict) else {}


def search_pack(question: str, limit: int = 5) -> list[dict]:
    """Return ranked pack records. Skips dataset-limitation notes."""
    data = load_pack()
    terms = _terms(question)
    q_lower = (question or "").lower()
    historical = any(word in q_lower for word in (
        "historical", "history", "archive", "archived", "past", "silver jubilee", "jubilee"
    ))
    scored = []
    for document in data["documents"]:
        if not _is_usable(document):
            continue
        category = str(document.get("category") or "")
        if category in ARCHIVE_CATEGORIES and not historical:
            continue
        title = str(document.get("title") or "")
        content = str(document.get("content") or "")
        keywords = " ".join(str(item) for item in (document.get("keywords") or []))
        haystack = f"{title} {keywords} {content} {category} {document.get('campus_scope') or ''}".lower()
        score = 0
        for term in terms:
            score += haystack.count(term)
            if term in title.lower():
                score += 6
            if term in keywords.lower():
                score += 4
            if term in category.lower():
                score += 3
        if any(word in q_lower for word in ("campus", "campuses")) and document.get("id") in {
            "university_campuses", "campus_overview_2025_26", "campus_contact_general"
        }:
            score += 12
        if "rector" in q_lower and document.get("id") == "university_rector_2026":
            score += 16
        if any(word in q_lower for word in ("admission", "admissions")) and "admission" in haystack:
            score += 8
        if any(word in q_lower for word in ("program", "programs")) and "program" in haystack:
            score += 8
        if "department" in q_lower and category in {"department", "departments"}:
            score += 24
        if any(phrase in q_lower for phrase in ("cu online", "student portal", "cms", "portal")) and document.get("id") == "student_academic_portals":
            score += 24
        if "cwur" in q_lower and document.get("id") == "university_news_cwur_2026":
            score += 24
        if score:
            scored.append((score, document))
    scored.sort(key=lambda item: item[0], reverse=True)
    if "department" in q_lower:
        limit = max(limit, 8)
    return [document for _, document in scored[:limit]]


def pack_is_relevant(question: str, min_score: int = 8) -> bool:
    """True when the pack has a real match, not a single incidental word."""
    data = load_pack()
    terms = _terms(question)
    if not terms:
        return False
    q_lower = (question or "").lower()
    best = 0
    for document in data["documents"]:
        if not _is_usable(document):
            continue
        title = str(document.get("title") or "").lower()
        keywords = " ".join(str(item) for item in (document.get("keywords") or [])).lower()
        content = str(document.get("content") or "").lower()
        score = 0
        for term in terms:
            if term in title:
                score += 6
            if term in keywords:
                score += 4
            if term in content:
                score += 1
        doc_id = document.get("id")
        if "cwur" in q_lower and doc_id == "university_news_cwur_2026":
            score += 24
        if any(phrase in q_lower for phrase in ("cu online", "student portal", "portal")) and doc_id == "student_academic_portals":
            score += 24
        if "department" in q_lower and str(document.get("category") or "") in {"department", "departments"}:
            score += 24
        best = max(best, score)
    return best >= min_score


def format_pack_context(documents: list[dict]) -> str:
    blocks = []
    for document in documents:
        source = _source(document)
        category = str(document.get("category") or "")
        flags = []
        if category in ARCHIVE_CATEGORIES:
            flags.append("HISTORICAL ARCHIVE — not an upcoming event")
        if category in SNAPSHOT_CATEGORIES:
            flags.append("PUBLIC WEB SNAPSHOT — live teacher schedules are in Firestore")
        if source.get("freshness_label") == "official_guide_2025_26":
            flags.append("PROSPECTUS 2025-26 FIGURES — not live 2026 statistics")
        header = [
            f"Title: {document.get('title')}",
            f"Category: {category}",
            f"Scope: {document.get('campus_scope')}",
            f"Freshness: {source.get('freshness_label')} (indexed {source.get('checked_or_indexed_on')})",
            f"Source: {source.get('url')}",
        ]
        if flags:
            header.append("Flags: " + "; ".join(flags))
        header.append(str(document.get("content") or ""))
        blocks.append("\n".join(header))
    return "\n\n---\n\n".join(blocks)
