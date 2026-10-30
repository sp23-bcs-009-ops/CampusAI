"""
Campus AI — FastAPI backend.

Architecture (refactored):
    API.py               ← thin HTTP layer: routes, rate limit, auth, CORS
    pipeline.py          ← LangChain intent router + per-session memory
    timetable_service.py ← deterministic timetable/teacher/room logic
    university_data.py   ← Firestore university records
    rag_store.py         ← unused by live chatbot answers
    llm.py               ← LLM provider (Groq, optional OpenAI)
    config.py            ← env-driven settings

Run:
    uvicorn API:app --host 0.0.0.0 --port 8000
"""
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

import timetable_service as tt
from university_data import UniversityDataUnavailable
from knowledge_pack import KnowledgePackUnavailable, pack_status
from config import settings
from llm import llm_info
from pipeline import answer_question
from timetable_upload import (
    InvalidFirebaseToken,
    TimetableConversionError,
    save_text_pdf_timetable_documents,
    verify_timetable_uploader,
)
from rule_based_text_pdf import process_rule_based_pdf
from text_pdf_layout import (
    TextPdfRequiredError,
    TextPdfValidationError,
)

import json
import logging
import os
import tempfile
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# App + middleware (rate limiter & API-key auth)
# ─────────────────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])

app = FastAPI(title="Campus AI", version="2.0.0")
app.state.limiter = limiter


def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """JSON limit response. No exception text and no request body."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please wait a minute and try again."},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# CORS: "*" with credentials is invalid per spec — only send credentials
# when explicit origins are configured (CORS_ORIGINS env var).
_open_cors = settings.cors_origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=not _open_cors,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)


def require_api_key(x_api_key: str | None = Header(default=None)):
    """API-key auth. Enabled only when CAMPUS_AI_API_KEY env var is set."""
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")


def require_timetable_uploader(authorization: str | None = Header(default=None)):
    """Require a verified Firebase account with a saved Teacher/Staff role."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Firebase bearer token is required.")
    id_token = authorization.split(" ", 1)[1].strip()
    if not id_token:
        raise HTTPException(status_code=401, detail="Firebase bearer token is required.")
    try:
        return verify_timetable_uploader(id_token)
    except InvalidFirebaseToken as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Firebase upload authorization failed")
        raise HTTPException(status_code=503, detail="Firebase authorization is temporarily unavailable.") from exc


def _warm_university_cache() -> None:
    """Open Firestore and load the timetable before the first student question.

    The timetable cache still expires after five minutes, so a new publish is not hidden.
    """
    try:
        from identity import warm_keys
        warm_keys()
        print("[AUTH] Firebase signing keys ready")
    except Exception as exc:
        print(f"[AUTH] Firebase signing keys were not prefetched: {exc}")
    try:
        from university_data import load_firebase_timetable
        load_firebase_timetable()
        print("[DATA] Timetable prefetched")
    except Exception as exc:
        print(f"[DATA] Timetable prefetch skipped: {exc}")


@app.on_event("startup")
def _startup():
    print(f"[LLM] {llm_info()}")
    print("[DATA] University records: Firestore project universityassistentai")
    try:
        pack = pack_status()
        print(f"[DATA] Website knowledge pack: {pack.get('document_count')} documents")
    except KnowledgePackUnavailable as exc:
        print(f"[DATA] Website knowledge pack unavailable: {exc}")
    if not settings.api_key:
        print("[AUTH] CAMPUS_AI_API_KEY not set — API is open (dev mode)")
    import threading
    threading.Thread(target=_warm_university_cache, name="campusai-warm", daemon=True).start()


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class Query(BaseModel):
    question: str
    session_id: str | None = None  # optional: enables per-user chat memory


class StudentTimetableRequest(BaseModel):
    class_name: str  # e.g., "CS-I", "BS-II", "BA-I"


def resolve_class_name(raw: str) -> str | None:
    """Resolve any class-name variant (CS-I, BCS-1, BSSE-3 …) to a timetable key."""
    tt.ensure_timetable()
    if raw in tt.TIMETABLE:
        return raw
    for cls in tt.TIMETABLE.keys():
        if cls.upper() == raw.upper():
            return cls
    return tt.detect_class(raw)


# ─────────────────────────────────────────────────────────────────────────────
# Health / info
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm": llm_info(),
        "rag": {"collection": "unused", "documents": 0, "embedder": "none"},
        "knowledge_pack": _knowledge_pack_health(),
        "auth_enabled": bool(settings.api_key),
        "rate_limit": settings.rate_limit,
    }


@app.post("/upload-timetable")
@limiter.limit("2/minute")
async def upload_timetable(
    request: Request,
    pdf: UploadFile = File(...),
    version: str = Form(""),
    effectiveDate: str = Form(""),
    scheduleMode: str = Form("regular"),
    uploader: dict = Depends(require_timetable_uploader),
):
    """Parse timetable cells with Python rules and save the formal Text PDF dataset."""
    filename = Path(pdf.filename or "timetable.pdf").name
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file.")
    max_bytes = int(os.getenv("TIMETABLE_UPLOAD_MAX_MB", "50")) * 1024 * 1024
    payload = await pdf.read(max_bytes + 1)
    await pdf.close()
    if len(payload) > max_bytes:
        raise HTTPException(status_code=413, detail="PDF exceeds the upload size limit.")
    if not payload.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="timetable-rules-", suffix=".pdf", delete=False) as temp_pdf:
            temp_pdf.write(payload)
            temp_path = temp_pdf.name

        def process_and_save():
            timetable, documents, warnings, source_hash = process_rule_based_pdf(
                temp_path,
                version=version.strip() or "current",
                effective_date=effectiveDate.strip(),
                uploaded_by=uploader["email"],
                schedule_mode=scheduleMode.strip().lower(),
            )
            save_text_pdf_timetable_documents(
                documents,
                active_document_ids=list(documents),
                source_hash=source_hash,
                schedule_mode=scheduleMode.strip().lower(),
            )
            return timetable, documents, warnings

        timetable, documents, warnings = await run_in_threadpool(process_and_save)
        return {
            "success": True,
            "message": "AI-free rule-based timetable processed and saved to text_pdf_timetables.",
            "collection": "text_pdf_timetables",
            "documentIds": list(documents),
            "roomCount": sum(len(json.loads(doc["roomMap"])) for doc in documents.values()),
            "subjectCount": sum(len(json.loads(doc["subjectsList"])) for doc in documents.values()),
            "pendingEditCount": len(timetable.get("pending_edit_cells", [])),
            "warnings": warnings,
            "uploadedBy": uploader["email"],
        }
    except HTTPException:
        raise
    except TextPdfRequiredError:
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": "TEXT_PDF_REQUIRED",
                "message": "Text PDF is required. Image/scan PDF is not supported.",
            },
        )
    except (TextPdfValidationError, TimetableConversionError) as exc:
        return JSONResponse(
            status_code=422,
            content={
                "success": False, "error": "TEXT_PDF_VALIDATION_FAILED", "message": str(exc),
            },
        )
    except Exception as exc:
        logger.error("Rule-based timetable upload failed (%s).", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Timetable processing failed; no successful save was confirmed.") from exc
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                logger.warning("Could not remove temporary timetable upload.")


# ─────────────────────────────────────────────────────────────────────────────
# Main chat endpoint — the old 1200-line body now lives in pipeline.py
# ─────────────────────────────────────────────────────────────────────────────

def chat_session_id(raw: str | None, request: Request) -> str:
    """Keep session keys small. A missing id stays anonymous and per client address."""
    text = "".join(ch for ch in str(raw or "") if ch.isprintable() and ch not in "\r\n\t")
    text = text.strip()[:120]
    if text:
        return text
    return get_remote_address(request) or "default"


@app.post("/ask", dependencies=[Depends(require_api_key)])
@limiter.limit(settings.rate_limit)
def ask(q: Query, request: Request, authorization: str | None = Header(default=None)):
    question = q.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")
    if len(question) > 2000:
        raise HTTPException(status_code=400, detail="Question is too long.")
    session_id = chat_session_id(q.session_id, request)
    identity = None
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if token:
        from identity import resolve_identity
        identity = resolve_identity(token)
    # A guest cannot continue a verified user's server memory by reusing a session id.
    if identity and identity.get("email"):
        session_id = f"user:{str(identity['email']).strip().lower()}:{session_id}"
    else:
        session_id = f"guest:{session_id}"
    result = answer_question(question, session_id=session_id, identity=identity)
    return {"answer": result["answer"], "intent": result["intent"]}


# ─────────────────────────────────────────────────────────────────────────────
# Timetable REST endpoints (unchanged behavior)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/student-timetable", dependencies=[Depends(require_api_key)])
def get_student_timetable(req: StudentTimetableRequest):
    """
    Get full timetable for a student's class
    Input: {"class_name": "CS-I"}
    """
    try:
        class_name = resolve_class_name(req.class_name)
    except UniversityDataUnavailable as exc:
        return {"success": False, "error": str(exc)}
    if not class_name:
        return {
            "success": False,
            "error": f"Class '{req.class_name}' not found in timetable",
            "available_classes": sorted(tt.TIMETABLE.keys()),
        }

    timetable_data = tt.TIMETABLE[class_name]
    formatted = {"class": class_name, "schedule_by_day": {}}
    for day, slots in timetable_data.items():
        formatted["schedule_by_day"][day] = []
        for lecture_slot, entries in slots.items():
            for class_info in entries:
                formatted["schedule_by_day"][day].append({
                    "lecture": lecture_slot,
                    "subject": class_info.get("subject", "N/A"),
                    "teacher": class_info.get("teacher", "N/A"),
                    "room": class_info.get("room", "N/A"),
                })
    for day in formatted["schedule_by_day"]:
        formatted["schedule_by_day"][day].sort(key=lambda x: x["lecture"])

    return {"success": True, "data": formatted}


@app.get("/today-classes/{class_name}", dependencies=[Depends(require_api_key)])
def get_today_classes(class_name: str):
    """Get today's classes for a student's class, e.g. /today-classes/CS-I"""
    try:
        actual_class = resolve_class_name(class_name)
    except UniversityDataUnavailable as exc:
        return {"success": False, "error": str(exc)}
    if not actual_class:
        return {
            "success": False,
            "error": f"Class '{class_name}' not found",
            "available_classes": sorted(tt.TIMETABLE.keys()),
        }

    today_day = tt.today_name()
    today_classes = []
    for lecture_slot, entries in tt.TIMETABLE[actual_class].get(today_day, {}).items():
        for class_info in entries:
            today_classes.append({
                "lecture": lecture_slot,
                "subject": class_info.get("subject", "N/A"),
                "teacher": class_info.get("teacher", "N/A"),
                "room": class_info.get("room", "N/A"),
            })
    today_classes.sort(key=lambda x: x["lecture"])

    return {
        "success": True,
        "class": actual_class,
        "day": today_day,
        "day_name": today_day,
        "classes": today_classes,
    }


@app.get("/class-schedule/{class_name}/{day}", dependencies=[Depends(require_api_key)])
def get_class_schedule_by_day(class_name: str, day: str):
    """Get schedule for a class on a specific day, e.g. /class-schedule/CS-I/Mon"""
    try:
        actual_class = resolve_class_name(class_name)
    except UniversityDataUnavailable as exc:
        return {"success": False, "error": str(exc)}
    if not actual_class:
        return {"success": False, "error": f"Class '{class_name}' not found"}

    if day.lower() not in tt.DAY_MAP:
        return {
            "success": False,
            "error": (
                f"Invalid day '{day}'. Use: Monday, Tuesday, Wednesday, Thursday, "
                "Friday, Saturday or Mon, Tue, Wed, Thu, Fri, Sat"
            ),
        }

    day = tt.DAY_MAP[day.lower()]
    schedule = []
    for lecture_slot, entries in tt.TIMETABLE[actual_class].get(day, {}).items():
        for class_info in entries:
            schedule.append({
                "lecture": lecture_slot,
                "subject": class_info.get("subject", "N/A"),
                "teacher": class_info.get("teacher", "N/A"),
                "room": class_info.get("room", "N/A"),
            })
    schedule.sort(key=lambda x: x["lecture"])

    return {"success": True, "class": actual_class, "day": day, "classes": schedule}


def _knowledge_pack_health():
    try:
        return pack_status()
    except KnowledgePackUnavailable as exc:
        return {"error": str(exc), "document_count": 0}


# ─────────────────────────────────────────────────────────────────────────────
# Approved website knowledge pack (not live Firestore campus records)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/comsats/status")
def comsats_status():
    pack = _knowledge_pack_health()
    return {
        "source": "backend/knowledge_pack/attock_campus_knowledge_pack.json",
        "storage": "approved Attock Campus Knowledge Pack",
        "updated_at": pack.get("compiled_date"),
        "page_count": pack.get("document_count", 0),
        "chunk_count": pack.get("document_count", 0),
        "vector_store": {"collection": "unused", "documents": 0, "embedder": "none"},
        "knowledge_pack": pack,
    }


@app.get("/comsats/refresh", dependencies=[Depends(require_api_key)])
@limiter.limit("2/minute")
def comsats_refresh(request: Request, max_pages: int = 20):
    pack = _knowledge_pack_health()
    return {
        "success": "error" not in pack,
        "source": "approved knowledge pack",
        "storage": "curated pack; not re-scraped",
        "updated_at": pack.get("compiled_date"),
        "page_count": pack.get("document_count", 0),
        "chunk_count": pack.get("document_count", 0),
        "vector_documents": 0,
        "errors": [] if "error" not in pack else [pack["error"]],
        "knowledge_pack": pack,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
