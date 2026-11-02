# System overview

**Status:** Implemented and verified for Guest/Student unit paths. Teacher/Staff live browser: not fully verified.

CampusAI is a university-only assistant for COMSATS Attock. It is not a general chatbot.

## Modes

| Mode | Source of role | What it may see |
| --- | --- | --- |
| Guest | No Bearer token | Public class codes, public events dump, website pack |
| Student | Verified token + profile `type=student` | Own class timetable, notices, profile facts on the profile |
| Teacher | Verified token + profile | Name-matched published teaching slots |
| Staff | Verified token + profile | Public records; no personal class timetable |

## Stack

- FastAPI `backend/API.py`
- Chat engine `backend/pipeline.py`
- Firestore REST `backend/university_data.py`
- Knowledge pack `backend/knowledge_pack.py`
- Groq via LangChain `backend/llm.py`
- Expo frontend `Frontend/` posting to `POST /ask`

## Boundaries

Live campus facts: Firestore project `universityassistentai`. Website facts: Attock Knowledge Pack JSON in-repo. LLM: Groq. Frontend local history is not server memory.
