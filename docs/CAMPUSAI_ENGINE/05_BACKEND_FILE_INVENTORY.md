# Backend file inventory

Python sources under `backend/`, excluding `.venv`, `__pycache__`, and pytest cache.

| Path | Purpose | Runtime | Importers | Tests | This pass |
| --- | --- | --- | --- | --- | --- |
| API.py | FastAPI app, `/ask`, health, upload | Active | uvicorn | test_ask_api | Health RAG field |
| pipeline.py | Route, memory, handlers | Active `/ask` | API | many | Social, identity, LTM, overlap |
| identity.py | JWT + profile | Active | API, pipeline | test_identity | Unchanged |
| university_data.py | Firestore REST | Active | pipeline, API warmup, identity | test_university_data | Unchanged |
| timetable_service.py | Indexes, detect class/teacher/room | Active | pipeline | test_routing | Unchanged |
| knowledge_pack.py | Website records | Active | pipeline | test_knowledge_pack | `retrieve_campus_documents` |
| normalizer.py | Class-code keys | Active | pipeline | routing/class tests | Unchanged |
| llm.py | Groq client | Active when Groq called | pipeline | mocked | Unchanged |
| config.py | Env settings | Active | all | indirect | Unchanged |
| comsats_scraper.py | Keywords + unused scrape | `is_comsats_question` on `/ask`; scrape not used by pipeline | pipeline | pack routing | Unchanged |
| rag_store.py | Chroma store | Unused by `/ask` | update_comsats_data | test_university_data asserts no import | Unchanged |
| teacher_matching.py | Upload matching | Upload path | timetable_upload | PDF tests | Unchanged |
| rule_based_text_pdf.py | PDF parse | Upload | API | PDF tests | Unchanged |
| text_pdf_layout.py | Layout | Upload | rule_based | PDF tests | Unchanged |
| pdf_to_json.py | Conversion | Upload | upload stack | PDF tests | Unchanged |
| timetable_upload.py | Save text PDF docs | Upload | API | persistence tests | Unchanged |
| update_comsats_data.py | Reindex script | CLI only | none from `/ask` | none | Unchanged |
| tests/*.py | Pytest | Test | pytest | self | `test_engine_policy.py` added |
| knowledge_pack/*.json|md | Pack corpus | Active | knowledge_pack | pack tests | Unchanged |
| timetable_flat.json | Legacy JSON | Not `/ask` fallback | none in university_data load | failure test | Unchanged |
| .env | Secrets | Local | config | gitignored | Unchanged, not documented as values |
| chroma_db/ | Old vectors | Unused | rag_store | — | Unchanged |

Deep dives: [backend-modules/README.md](backend-modules/README.md).
