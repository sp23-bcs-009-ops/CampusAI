# Document retrieval vs Chroma

**Live `/ask` document path: Implemented and verified** (`knowledge_pack.retrieve_campus_documents`).

**Chroma RAG: Not implemented** on `/ask`. `rag_store.py` remains for the optional `update_comsats_data.py` script.

Ingestion of the pack is a curated JSON file, not a runtime crawler. Pipeline does not call `fetch_official_pages`.

Chunking/embeddings/rerank settings in the master prompt apply to Chroma and were **not** applied, because activating Chroma would change the approved pack-only website source without a rebuild/approval.

Provenance: title, category, campus_scope, source URL, freshness flags in `format_pack_context`.

Evaluation: pack unit tests plus `test_document_retrieval_reaches_the_model_prompt`.
