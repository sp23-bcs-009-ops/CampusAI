"""
ChromaDB-backed RAG store for COMSATS knowledge.

Replaces the old keyword search in comsats_scraper.search_comsats_knowledge()
with proper semantic vector search:

    scraper (comsats_scraper.py)  ->  comsats_knowledge.json  ->  ChromaDB

- On startup we ingest the scraped chunks into a persistent Chroma collection.
- `/comsats/refresh` re-scrapes and rebuilds the vectors.
- Embeddings: ChromaDB's default all-MiniLM-L6-v2 (ONNX). If the model can't
  be downloaded (offline machine / firewall) we fall back to a deterministic
  local hashing embedder so the app never crashes.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Optional

import chromadb

from config import settings
from comsats_scraper import load_comsats_knowledge

COLLECTION_NAME = "comsats_knowledge"


# ── Fallback embedder (no downloads, deterministic) ─────────────────────────
class HashingEmbedder(chromadb.EmbeddingFunction):
    """Lightweight local embedding: hashed bag-of-words + char trigrams.

    Not as smart as MiniLM, but fully offline and good enough to rank
    scraped chunks by lexical/semantic overlap.
    """

    DIM = 512

    def __init__(self):
        super().__init__()

    def name(self) -> str:  # required by newer chromadb versions
        return "campus-ai-hashing-embedder"

    def get_config(self) -> dict:
        return {}

    @staticmethod
    def build_from_config(config: dict):
        return HashingEmbedder()

    @staticmethod
    def _tokens(text: str):
        text = text.lower()
        words = re.findall(r"[a-z0-9]+", text)
        grams = []
        for w in words:
            grams.append(w)
            padded = f"#{w}#"
            grams.extend(padded[i:i + 3] for i in range(len(padded) - 2))
        return grams

    def _embed_one(self, text: str):
        vec = [0.0] * self.DIM
        for tok in self._tokens(text):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            idx = h % self.DIM
            sign = 1.0 if (h >> 16) & 1 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def __call__(self, input):  # noqa: A002 (chromadb API name)
        return [self._embed_one(t) for t in input]


def _pick_embedding_function():
    """Prefer the real MiniLM ONNX embedder; fall back to local hashing."""
    try:
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

        ef = DefaultEmbeddingFunction()
        ef(["warmup"])  # forces model download/load; raises if unavailable
        return ef, "all-MiniLM-L6-v2 (onnx)"
    except Exception:
        return HashingEmbedder(), "hashing-fallback (offline)"


# ── Store ────────────────────────────────────────────────────────────────────
class ComsatsRAGStore:
    def __init__(self):
        self._client = chromadb.PersistentClient(path=settings.chroma_dir)
        self._ef, self.embedder_name = _pick_embedding_function()
        self._collection = self._get_collection()

    def _get_collection(self):
        try:
            return self._client.get_or_create_collection(
                COLLECTION_NAME, embedding_function=self._ef
            )
        except Exception:
            # Embedder changed between runs -> rebuild collection
            try:
                self._client.delete_collection(COLLECTION_NAME)
            except Exception:
                pass
            return self._client.get_or_create_collection(
                COLLECTION_NAME, embedding_function=self._ef
            )

    # ── Ingestion ────────────────────────────────────────────────
    def ingest_from_knowledge_file(self, force: bool = False) -> int:
        """Load comsats_knowledge.json chunks into Chroma.

        Skips work when the collection already matches the file
        (compared via a fingerprint of the scraped data).
        """
        data = load_comsats_knowledge()
        chunks = data.get("chunks", [])
        if not chunks:
            return self._collection.count()

        fingerprint = hashlib.md5(
            json.dumps(
                [c.get("url", "") + c.get("text", "")[:80] for c in chunks],
                sort_keys=True,
            ).encode()
        ).hexdigest()

        meta = self._collection.metadata or {}
        if (
            not force
            and self._collection.count() == len(chunks)
            and meta.get("fingerprint") == fingerprint
        ):
            return self._collection.count()

        # Rebuild from scratch (chunk count is small, this is instant)
        try:
            self._client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        self._collection = self._client.get_or_create_collection(
            COLLECTION_NAME,
            embedding_function=self._ef,
            metadata={"fingerprint": fingerprint},
        )

        ids, docs, metas = [], [], []
        for i, chunk in enumerate(chunks):
            text = (chunk.get("text") or "").strip()
            if not text:
                continue
            ids.append(f"chunk-{i}")
            docs.append(f"{chunk.get('title', '')}\n{text}")
            metas.append(
                {
                    "title": chunk.get("title", ""),
                    "url": chunk.get("url", ""),
                }
            )

        if ids:
            self._collection.add(ids=ids, documents=docs, metadatas=metas)
        return self._collection.count()

    # ── Retrieval ────────────────────────────────────────────────
    def search(self, question: str, top_k: Optional[int] = None):
        """Semantic search. Returns [{title, url, text, score}, ...]."""
        k = top_k or settings.rag_top_k
        count = self._collection.count()
        if count == 0:
            return []

        res = self._collection.query(
            query_texts=[question],
            n_results=min(k, count),
        )
        hits = []
        for doc, meta, dist in zip(
            res["documents"][0], res["metadatas"][0], res["distances"][0]
        ):
            hits.append(
                {
                    "title": meta.get("title", ""),
                    "url": meta.get("url", ""),
                    "text": doc,
                    "score": round(1.0 - dist / 2.0, 4),  # cosine dist -> similarity-ish
                }
            )
        return hits

    def build_context(self, hits) -> str:
        blocks = []
        for h in hits:
            blocks.append(f"[{h['title']}]({h['url']})\n{h['text'][:1200]}")
        return "\n\n---\n\n".join(blocks)

    def status(self):
        return {
            "collection": COLLECTION_NAME,
            "documents": self._collection.count(),
            "embedder": self.embedder_name,
            "persist_dir": settings.chroma_dir,
        }


# Singleton used by the API
rag_store = ComsatsRAGStore()
