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

# Copy application code + data
COPY config.py llm.py pipeline.py timetable_service.py API.py \
     normalizer.py comsats_scraper.py timetable_upload.py text_pdf_layout.py \
     rule_based_text_pdf.py exam_timetable_upload.py teacher_matching.py university_data.py knowledge_pack.py identity.py \
     catalog.py user_memory.py presentation.py topic_guard.py ./
COPY knowledge_pack ./knowledge_pack

# Writable data folder (docker-compose mounts a volume here)
VOLUME /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "API:app", "--host", "0.0.0.0", "--port", "8000"]
