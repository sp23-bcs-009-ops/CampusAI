# CampusAI engine documentation

Last reviewed: 2026-10-30. This package describes the **code that exists now**, not a future rewrite.

**Status key:** Implemented and verified · Implemented but not fully verified · Partially implemented · Not implemented · Not applicable

## Reading order

1. [System overview](01_SYSTEM_OVERVIEW.md)
2. [Architecture](02_ARCHITECTURE.md)
3. [End-to-end workflow](03_END_TO_END_WORKFLOW.md)
4. [API lifecycle](04_BACKEND_REQUEST_LIFECYCLE.md)
5. [Backend inventory](05_BACKEND_FILE_INVENTORY.md)
6. Topic guides 06–19, then [changelog](20_CHANGELOG_AND_IMPLEMENTATION_HISTORY.md)
7. [Module deep dives](backend-modules/README.md)
8. Implementation report at repo root: [`CAMPUSAI_FINAL_ENGINE_IMPLEMENTATION_REPORT.md`](../../CAMPUSAI_FINAL_ENGINE_IMPLEMENTATION_REPORT.md)

## Index

| File | Topic |
| --- | --- |
| [01_SYSTEM_OVERVIEW.md](01_SYSTEM_OVERVIEW.md) | Purpose, modes, stack |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) | Layers and diagrams |
| [03_END_TO_END_WORKFLOW.md](03_END_TO_END_WORKFLOW.md) | Message paths |
| [04_BACKEND_REQUEST_LIFECYCLE.md](04_BACKEND_REQUEST_LIFECYCLE.md) | `/ask` sequence |
| [05_BACKEND_FILE_INVENTORY.md](05_BACKEND_FILE_INVENTORY.md) | Every backend file |
| [06_IDENTITY_AUTHENTICATION_AND_ROLES.md](06_IDENTITY_AUTHENTICATION_AND_ROLES.md) | Tokens and roles |
| [07_GUARDRAILS_AND_SECURITY.md](07_GUARDRAILS_AND_SECURITY.md) | University-only and injection |
| [08_MESSAGE_NORMALIZATION_AND_ROUTING.md](08_MESSAGE_NORMALIZATION_AND_ROUTING.md) | Router |
| [09_PROMPTS_AND_GROQ_CONFIGURATION.md](09_PROMPTS_AND_GROQ_CONFIGURATION.md) | Prompts and Groq |
| [10_RAG_AND_DOCUMENT_PIPELINE.md](10_RAG_AND_DOCUMENT_PIPELINE.md) | Knowledge pack vs Chroma |
| [11_FIRESTORE_AND_STRUCTURED_DATA.md](11_FIRESTORE_AND_STRUCTURED_DATA.md) | Live records |
| [12_SHORT_TERM_CONVERSATION_MEMORY.md](12_SHORT_TERM_CONVERSATION_MEMORY.md) | Sessions |
| [13_LONG_TERM_MEMORY.md](13_LONG_TERM_MEMORY.md) | Optional preferences |
| [14_API_CONTRACTS_AND_INTEGRATIONS.md](14_API_CONTRACTS_AND_INTEGRATIONS.md) | HTTP |
| [15_CONFIGURATION_DEPENDENCIES_AND_ENVIRONMENT.md](15_CONFIGURATION_DEPENDENCIES_AND_ENVIRONMENT.md) | Env names only |
| [16_ERRORS_LOGGING_AND_PERFORMANCE.md](16_ERRORS_LOGGING_AND_PERFORMANCE.md) | Failures and timing |
| [17_TESTING_AND_VERIFICATION.md](17_TESTING_AND_VERIFICATION.md) | Commands and results |
| [18_OPERATIONS_AND_DEPLOYMENT.md](18_OPERATIONS_AND_DEPLOYMENT.md) | Local run; no deploy |
| [19_ARCHITECTURE_DECISIONS_AND_KNOWN_LIMITATIONS.md](19_ARCHITECTURE_DECISIONS_AND_KNOWN_LIMITATIONS.md) | Decisions |
| [20_CHANGELOG_AND_IMPLEMENTATION_HISTORY.md](20_CHANGELOG_AND_IMPLEMENTATION_HISTORY.md) | Stages |

## Not verified in this package

- Live Teacher and Staff browser sessions.
- Durable long-term memory after process restart.
- Chroma live retrieval.
- Production firewall, TLS, and deployment.

No secrets, tokens, or private student records are stored in these files.
