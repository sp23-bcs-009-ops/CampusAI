CAMPUSAI — ATTОCK CAMPUS KNOWLEDGE PACK

Files
- attock_campus_knowledge_pack.json: machine-readable dataset with 35 document records and per-record source metadata.
- attock_campus_knowledge_sources.md: human-readable source register and limitations.

Important
This is a curated seed pack from official, publicly indexed COMSATS sources, not a complete live scrape. The requested homepage https://attock.comsats.edu.pk/ returned HTTP 403 from the crawler environment. Do not state that every current page or event was scraped.

Recommended CampusAI integration
1. Inspect the existing backend/comsats_knowledge.json and rag_store.py format before importing. Do not overwrite the current store blindly.
2. Import the `documents` array and store `id`, `title`, `category`, `content`, `source.url`, `source.checked_or_indexed_on`, `source.freshness_label`, and `keywords` with every chunk.
3. Split long content into retrieval-sized chunks while preserving source metadata.
4. Do not index the `website_access_limitation` record as university facts; it is an ingestion note.
5. Keep all records about archived events marked as historical. Never treat them as upcoming events.
6. Keep live operational data in Firestore: timetables, current teacher schedule/availability, CampusAI events, notifications, emergency announcements, lost-and-found posts, and schedule mode. The static web pack is secondary and cannot override live Firestore.
7. For live staff employment status, check current official profiles and live Firestore data; public staff snapshots may be out of date.
8. Do not deploy Firestore changes or modify production records to ingest this static knowledge.
