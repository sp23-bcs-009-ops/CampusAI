FROM python:3.11-slim AS dependencies

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

# Install dependencies first (cached layer).
# Optional: put pre-downloaded Linux wheels in backend/wheels/ (git-ignored) when
# Docker's own network is slow; pip uses them first and downloads only what's missing.
COPY requirements.txt wheels* ./wheels/
RUN pip install --no-cache-dir --find-links=/app/wheels -r /app/wheels/requirements.txt \
    && rm -rf /app/wheels

FROM dependencies AS test

RUN pip install --no-cache-dir pytest
ENV PYTHONPATH=/workspace
CMD ["python", "-m", "pytest", "-q", "/workspace/backend/tests"]

FROM dependencies AS backend

# Copy application code + data (website_knowledge/ lives inside data_sources/)
COPY api_server.py ./
COPY settings ./settings
COPY chatbot ./chatbot
COPY timetable ./timetable
COPY data_sources ./data_sources
COPY user_login ./user_login
COPY timetable_upload ./timetable_upload

# Writable data folder (docker-compose mounts a volume here)
VOLUME /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]
