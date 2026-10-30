"""
Central configuration for Campus AI backend.
Everything is driven by environment variables so the same code runs
locally, in Docker, or with the optional OpenAI provider.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    """Tiny .env loader (no external dependency). Real env vars win."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


class Settings:
    # ── LLM provider ─────────────────────────────────────────────
    # Groq is the default. Optional override: LLM_PROVIDER=openai and OPENAI_API_KEY.
    llm_provider: str = _env("LLM_PROVIDER", "groq").lower()
    groq_api_key: str = _env("GROQ_API_KEY")
    groq_model: str = _env("GROQ_MODEL", "openai/gpt-oss-120b")
    openai_model: str = _env("OPENAI_MODEL", "gpt-4o-mini")
    openai_api_key: str = _env("OPENAI_API_KEY")

    # ── RAG / ChromaDB ───────────────────────────────────────────
    chroma_dir: str = _env("CHROMA_DIR", str(BASE_DIR / "chroma_db"))
    rag_top_k: int = int(_env("RAG_TOP_K", "4"))

    # ── Security ─────────────────────────────────────────────────
    # If CAMPUS_AI_API_KEY is set, every request must send
    # header  X-API-Key: <key>.  Leave unset to keep the API open (dev).
    api_key: str = _env("CAMPUS_AI_API_KEY")
    rate_limit: str = _env("RATE_LIMIT", "20/minute")

    # Comma-separated allowed origins. "*" (default) = open, for dev.
    # For production set e.g.  CORS_ORIGINS=https://myapp.com,https://admin.myapp.com
    cors_origins: list = [
        o.strip() for o in _env("CORS_ORIGINS", "*").split(",") if o.strip()
    ]

    # ── Knowledge freshness ──────────────────────────────────────
    # Auto re-scrape COMSATS website on startup if cache is older than this
    # many days (0 disables the check).
    knowledge_max_age_days: int = int(_env("KNOWLEDGE_MAX_AGE_DAYS", "7"))

    # ── Memory ───────────────────────────────────────────────────
    memory_window: int = int(_env("MEMORY_WINDOW", "8"))  # messages kept per session


settings = Settings()

# When LLM_PROVIDER is unset, use Groq if its key is present, otherwise
# keep the optional OpenAI path when only that key is present.
if _env("LLM_PROVIDER", "") == "":
    if settings.groq_api_key:
        settings.llm_provider = "groq"
    elif settings.openai_api_key:
        settings.llm_provider = "openai"
