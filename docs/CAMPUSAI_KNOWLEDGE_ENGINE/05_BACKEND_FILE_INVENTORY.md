# Backend file inventory

| File | Status on `/ask` | Role |
| --- | --- | --- |
| API.py | Active | HTTP, auth header, rate limit, health |
| pipeline.py | Active | Routing, handlers, memory, social/university policy |
| catalog.py | Active | Canonical meetings and allowlisted counts |
| user_memory.py | Active | Durable signed-in preferences |
| identity.py | Active | JWT + profile |
| university_data.py | Active | Public Firestore REST |
| timetable_service.py | Active | Class/teacher/room lookups |
| normalizer.py | Active | Class-token spans only |
| knowledge_pack.py | Active | Website document retrieval |
| llm.py | Active | Groq client |
| config.py | Active | Settings from env |
| rag_store.py | Unused on `/ask` | Chroma helper |
| comsats_scraper.py | Indirect | `is_comsats_question` |
| teacher_matching.py | Indirect | Teacher name matching |
| pdf_to_json.py, text_pdf_layout.py, rule_based_text_pdf.py, timetable_upload.py | Not live `/ask` | Upload/OCR path |
| update_comsats_data.py | Unused live | Pack maintenance |
