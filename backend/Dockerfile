FROM python:3.11-slim AS dependencies

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROMA_DIR=/data/chroma_db

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM dependencies AS test

RUN pip install --no-cache-dir pytest
ENV PYTHONPATH=/workspace
CMD ["python", "-m", "pytest", "-q", "/workspace/backend/tests"]

FROM dependencies AS backend

# Copy application code + data
COPY config.py llm.py rag_store.py pipeline.py timetable_service.py API.py \
     normalizer.py comsats_scraper.py pdf_to_json.py timetable_upload.py text_pdf_layout.py \
     rule_based_text_pdf.py teacher_matching.py university_data.py knowledge_pack.py identity.py ./
COPY timetable_flat.json comsats_knowledge.json timetable.pdf ./
COPY knowledge_pack ./knowledge_pack

# Persist the vector store outside the image layer
VOLUME /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "API:app", "--host", "0.0.0.0", "--port", "8000"]
