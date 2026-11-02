# Decisions and limitations

- Keep Knowledge Pack; do not enable Chroma without measured gain
- Retain `normalizer.py` for class tokens
- Canonical catalog is derived, not a second database
- Durable LTM is local JSON because Firestore writes are forbidden
- “How many classes” is ambiguous by design
- No university-wide course catalogue exists in the loaded sources
- `cs+2` is not a supported class alias in `normalize_to_key`
