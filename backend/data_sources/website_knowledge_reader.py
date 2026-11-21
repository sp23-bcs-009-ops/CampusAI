"""Approved COMSATS Attock website knowledge pack.

Live campus records still come from Firestore. This pack is only for
website and published campus-information questions.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

PACK_DIR = Path(__file__).resolve().parent / "website_knowledge"
PACK_JSON = PACK_DIR / "attock_campus_knowledge_pack.json"
SKIP_IDS = {"website_access_limitation"}
SKIP_CATEGORIES = {"source_access_note"}
ARCHIVE_CATEGORIES = {"event_archive"}
SNAPSHOT_CATEGORIES = {"faculty_directory"}
CATEGORY_WEIGHT = 12  # a question word naming the record kind, e.g. "department"
STOP_WORDS = {
    "the", "and", "for", "with", "about", "what", "tell", "does",
    "have", "can", "you", "give", "show", "list", "page", "source",
    "url", "info", "information", "comsats", "university", "cui",
    # Every record is about the Attock campus, so these words don't tell records apart.
    "are", "which", "there", "attock",
}


class KnowledgePackUnavailable(RuntimeError):
    """The approved website knowledge pack could not be read."""


def _terms(question: str) -> list[str]:
    words = [
        word for word in re.findall(r"[a-z0-9]+", (question or "").lower())
        if len(word) > 2 and word not in STOP_WORDS
    ]
    return [_singular(word) for word in words]


def _singular(word: str) -> str:
    """"departments" → "department", "campuses" → "campus"; "campus" and "class" stay as they are."""
    if len(word) > 5 and word.endswith("ses"):
        return word[:-2]
    if len(word) > 4 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def _score(document: dict, terms: list[str], q_lower: str) -> int:
    """How well one record matches the question. One rule for every record, no per-record bonuses.

    A question word naming the record's kind ("department", "contact", "news") counts most,
    then title words, then the record's keywords, then words in the text.
    A keyword phrase from the record that appears in the question ("cu online", "cwur") is a strong match.
    """
    title = str(document.get("title") or "").lower()
    keyword_list = [str(item).lower() for item in (document.get("keywords") or [])]
    keywords = " ".join(keyword_list)
    category = str(document.get("category") or "").lower()
    kind = _singular(category)  # "departments" → "department"; "campus_overview" stays whole
    content = str(document.get("content") or "").lower()
    haystack = f"{title} {keywords} {content} {category} {document.get('campus_scope') or ''}".lower()
    score = 0
    for term in terms:
        score += min(haystack.count(term), 5)
        if term in title:
            score += 6
        if term in keywords:
            score += 4
        if term == kind:
            score += CATEGORY_WEIGHT
    score += 8 * sum(1 for phrase in keyword_list if len(phrase) > 3 and phrase in q_lower)
    return score


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


def retrieve_campus_documents(question: str, limit: int = 5) -> list[dict]:
    """Approved website records used by live /ask. This is not ChromaDB."""
    return search_pack(question, limit=limit)


def search_pack(question: str, limit: int = 5) -> list[dict]:
    """Return ranked pack records. Skips dataset-limitation notes and, unless asked, archives."""
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
        if document.get("category") in ARCHIVE_CATEGORIES and not historical:
            continue
        score = _score(document, terms, q_lower)
        if score:
            scored.append((score, document))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [document for _, document in scored[:limit]]


def pack_is_relevant(question: str, min_score: int = 8) -> bool:
    """True when the pack has a real match, not a single incidental word."""
    data = load_pack()
    terms = _terms(question)
    if not terms:
        return False
    q_lower = (question or "").lower()
    return any(
        _score(document, terms, q_lower) >= min_score
        for document in data["documents"]
        if _is_usable(document)
    )


def _passages(content: str, terms: list[str], limit: int = 900) -> str:
    text = str(content or "").strip()
    if not text:
        return ""
    if not terms or len(text) <= limit:
        return text
    sentences = re.split(r"(?<=[.!?])\s+", text)
    hits = [sentence for sentence in sentences if any(term in sentence.lower() for term in terms)]
    chosen = " ".join(hits) if hits else text
    if len(chosen) <= limit:
        return chosen
    return chosen[:limit].rstrip() + "..."


def format_pack_context(documents: list[dict], question: str = "") -> str:
    blocks = []
    terms = _terms(question)
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
        header.append(_passages(str(document.get("content") or ""), terms))
        blocks.append("\n".join(header))
    return "\n\n---\n\n".join(blocks)
