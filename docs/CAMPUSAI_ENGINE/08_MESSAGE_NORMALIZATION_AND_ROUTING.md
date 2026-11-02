# Normalization and routing

There is no `normalization.py`. Class tokens use `normalizer.normalize_to_key` (`BCS-1` → `BS(CS)-I`).

Router: `pipeline.route`.

```mermaid
flowchart TD
  Q[Question] --> S{Social or bot identity?}
  S -->|yes| G[general]
  S -->|no| U{Clearly unrelated?}
  U -->|yes| O[off_topic]
  U -->|no| F{Bare day follow-up?}
  F --> T[timetable / teacher / room / records / pack]
```

False-positive guards: whole-word keywords; `_has_pack_anchor`; lab-for-class vs room named Lab; teacher fuzzy match must mention the name.
