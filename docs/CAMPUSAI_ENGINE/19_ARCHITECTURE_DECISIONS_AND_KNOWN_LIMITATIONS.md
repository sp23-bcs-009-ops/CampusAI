# Decisions and limitations

- Keep Knowledge Pack as the website retriever instead of turning on Chroma, because `/ask` tests forbid importing `rag_store` and the pack is the approved corpus.
- Social/identity stay deterministic, not Groq, so greetings stay fast and on-policy.
- Long-term memory is process-local to avoid Firestore writes.
- Overlap answers compare published slots; the bot cannot edit timetables.

Limitations: in-memory sessions; open local API; clock leeway 300s; department-list routing still incomplete from earlier stages; Expo Go needs LAN firewall for port 8000.
