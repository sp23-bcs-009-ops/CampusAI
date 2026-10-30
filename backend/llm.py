"""
LLM provider for generated chatbot replies.

Groq is the default. The key is read from the environment (backend/.env):

    GROQ_API_KEY=...

Optional OpenAI override:

    LLM_PROVIDER=openai
    OPENAI_API_KEY=sk-...

pipeline.py calls get_chat_model() and never sees the provider details.
"""
from functools import lru_cache

from config import settings

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def _require_groq_key() -> str:
    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it to backend/.env and do not commit that file."
        )
    return settings.groq_api_key


@lru_cache(maxsize=4)
def get_chat_model(temperature: float = 0.2, max_tokens: int = 300):
    from langchain_openai import ChatOpenAI

    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=30,
        )

    return ChatOpenAI(
        model=settings.groq_model,
        api_key=_require_groq_key(),
        base_url=GROQ_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=30,
    )


def get_fallback_chat_model(temperature: float = 0.2, max_tokens: int = 300):
    """pipeline.py still asks for a fallback. Groq has no second local model."""
    return None


def llm_info() -> dict:
    if settings.llm_provider == "openai":
        return {"provider": "openai", "model": settings.openai_model}
    return {
        "provider": "groq",
        "model": settings.groq_model,
        "base_url": GROQ_BASE_URL,
    }
