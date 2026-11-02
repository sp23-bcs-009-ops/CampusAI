# Architecture

```mermaid
flowchart LR
  subgraph clients [Clients]
    Web[Expo web]
    Go[Expo Go]
  end
  subgraph api [FastAPI]
    Ask["POST /ask"]
    Health["GET /health"]
  end
  subgraph engine [Engine]
    Ident[identity.py]
    Pipe[pipeline.py]
    TT[timetable_service.py]
    Pack[knowledge_pack.py]
  end
  subgraph data [Data]
    FS[Firestore]
    KP[Attock pack JSON]
    Groq[Groq gpt-oss-120b]
  end
  Web --> Ask
  Go --> Ask
  Ask --> Ident
  Ask --> Pipe
  Pipe --> TT
  Pipe --> Pack
  TT --> FS
  Pipe --> Groq
  Pack --> KP
```

## Layers

1. HTTP validation, rate limit, optional API key — `API.py`
2. Token verify and profile read — `identity.py`
3. Session scope — `API.chat_session_id` + `pipeline.get_session`
4. Policy and route — `pipeline.route`
5. Structured queries — `university_data` / `timetable_service`
6. Unstructured website records — `knowledge_pack.retrieve_campus_documents`
7. Prose — Groq only when a pack answer needs wording

Chroma (`rag_store.py`) is **not** connected to `/ask`.
