# RAG and documents

Live path: `retrieve_campus_documents` -> `search_pack` keyword scoring over the Attock Knowledge Pack JSON. Evidence is formatted into the Groq user message. Retrieved text is untrusted.

Chroma/`rag_store.py` is not imported by `pipeline.py`. It stays unused because the pack is small, versioned, and already cited in tests (`test_document_retrieval_reaches_the_model_prompt`). Switching would need a measured recall gain, versioned index, and rollback; none of that evidence exists in this checkout.

`KNOWLEDGE_MAX_AGE_DAYS=0` in tests disables stale-date filtering.
