"""
Timetable service — all deterministic timetable/teacher/room logic.

Extracted verbatim from the original 1400-line API.py so the FastAPI app
and the LangChain pipeline can share it. No behavior changes.
"""
import datetime
import re

from rapidfuzz import process

from normalizer import extract_class_from_sentence, normalize_to_key
from comsats_scraper import is_comsats_question

# Indexes are filled by ensure_timetable() from Firestore.
TIMETABLE = {}
ALL_TEACHERS = set()
ALL_SLOTS = set()
ALL_SLOTS_SORTED = []
ALL_ROOMS = set()
_ROOM_INDEX = {}
_TEACHER_INDEX = {}


def _parse_time(t_str):
    try: return int(t_str.split(':')[0])
    except: return 0


def _rebuild_indexes(data: dict) -> None:
    global TIMETABLE, ALL_TEACHERS, ALL_SLOTS, ALL_SLOTS_SORTED, ALL_ROOMS, _ROOM_INDEX, _TEACHER_INDEX
    TIMETABLE = data
    ALL_TEACHERS = set()
    ALL_SLOTS = set()
    ALL_ROOMS = set()
    _ROOM_INDEX = {}
    _TEACHER_INDEX = {}

    for class_data in TIMETABLE.values():
        for day_schedule in class_data.values():
            for slot, classes in day_schedule.items():
                ALL_SLOTS.add(slot)
                for c in classes:
                    t = c.get("teacher", "").strip()
                    if t and t != "N/A" and t.lower() != "staff":
                        ALL_TEACHERS.add(t)

    ALL_SLOTS_SORTED = sorted(list(ALL_SLOTS), key=_parse_time)

    for cls_name, class_data in TIMETABLE.items():
        for day_name_key, day_schedule in class_data.items():
            for slot, entries in day_schedule.items():
                for entry in entries:
                    room = entry.get("room", "").strip()
                    if room:
                        ALL_ROOMS.add(room)
                        _ROOM_INDEX.setdefault(room, {}).setdefault(day_name_key, {}).setdefault(slot, []).append({
                            "class": cls_name,
                            "subject": entry.get("subject", "N/A"),
                            "teacher": entry.get("teacher", "N/A"),
                        })
                    teacher_name = entry.get("teacher")
                    if teacher_name:
                        meeting = {
                            "class": cls_name,
                            "room": entry.get("room", "N/A"),
                            "subject": entry.get("subject", ""),
                        }
                        keys = [teacher_name]
                        stripped = teacher_name.strip()
                        if stripped and stripped != teacher_name:
                            keys.append(stripped)
                        for key in keys:
                            _TEACHER_INDEX.setdefault(key, {}).setdefault(day_name_key, {}).setdefault(slot, []).append(dict(meeting))


def ensure_timetable() -> None:
    """Load the authoritative timetable. A failed Firebase read is not replaced with JSON."""
    from university_data import load_timetable

    data = load_timetable()
    if data is not TIMETABLE:
        _rebuild_indexes(data)


def schedule_mode() -> str:
    from university_data import active_mode

    return active_mode()

# Map full day names and abbreviations to timetable keys (Monday, Tuesday, etc.)
DAY_MAP = {
    "monday": "Monday",
    "mon": "Monday",
    "tuesday": "Tuesday",
    "tue": "Tuesday",
    "wednesday": "Wednesday",
    "wed": "Wednesday",
    "thursday": "Thursday",
    "thu": "Thursday",
    "friday": "Friday",
    "fri": "Friday",
    "saturday": "Saturday",
    "sat": "Saturday",
}

WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

def _words(text: str):
    return re.findall(r"[a-z0-9]+", (text or "").lower())

def _has_word(text: str, *needles: str) -> bool:
    word_set = set(_words(text))
    return any(n.lower() in word_set for n in needles)

def _has_phrase(text: str, phrase: str) -> bool:
    return phrase.lower() in (text or "").lower()

def _slot_start_minutes(slot: str) -> int:
    return _time_to_minutes((slot or "").split("-", 1)[0])

def _time_to_minutes(raw: str) -> int:
    raw = (raw or "").strip().lower().replace(".", "")
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", raw)
    if not match:
        return -1
    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    suffix = match.group(3)
    if suffix == "pm" and hour != 12:
        hour += 12
    elif suffix == "am" and hour == 12:
        hour = 0
    elif not suffix and hour <= 7:
        hour += 12
    return hour * 60 + minute

def _slot_contains(slot: str, minute: int) -> bool:
    try:
        start, end = slot.split("-", 1)
    except ValueError:
        return False
    start_m = _time_to_minutes(start)
    end_m = _time_to_minutes(end)
    return start_m <= minute < end_m

def _current_minutes() -> int:
    now = datetime.datetime.now()
    return now.hour * 60 + now.minute

def _make_time_filter(question: str):
    q = (question or "").lower()

    if "right now" in q or " now" in q or "current" in q:
        minute = _current_minutes()
        return lambda slot: _slot_contains(slot, minute), "right now"

    if "morning" in q:
        return lambda slot: _slot_start_minutes(slot) < 12 * 60, "in the morning"

    if "evening" in q or "afternoon" in q:
        return lambda slot: _slot_start_minutes(slot) >= 12 * 60, "after 12 PM"

    between = re.search(r"\bbetween\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:and|to|-)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", q)
    if between:
        start_m = _time_to_minutes(between.group(1))
        end_m = _time_to_minutes(between.group(2))
        return lambda slot: start_m <= _slot_start_minutes(slot) < end_m, f"between {between.group(1).strip()} and {between.group(2).strip()}"

    after = re.search(r"\bafter\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", q)
    if after:
        start_m = _time_to_minutes(after.group(1))
        return lambda slot: _slot_start_minutes(slot) >= start_m, f"after {after.group(1).strip()}"

    at = re.search(r"\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", q)
    if at:
        minute = _time_to_minutes(at.group(1))
        return lambda slot: _slot_contains(slot, minute), f"at {at.group(1).strip()}"

    return None, None

def _sort_by_slot(items):
    return sorted(items, key=lambda x: (_slot_start_minutes(x.get("time") or x.get("lecture") or x.get("slot") or ""), x.get("subject", "")))

def today_name():
    """Returns today's day as a timetable key e.g. Monday, Tuesday"""
    full = datetime.datetime.today().strftime("%A").lower()
    return DAY_MAP.get(full, "Monday")


def detect_teacher(question):
    """Detects a specific teacher name from the user question, handling typos and partial names."""
    ensure_timetable()
    from rapidfuzz import fuzz
    import re

    q_lower = question.lower()
    # 0. Pre-normalize: handle contractions/possessives and alternate spellings
    q_lower = re.sub(r"ma'am", 'maam', q_lower)   # ma'am -> maam
    q_lower = re.sub(r"'s\b", '', q_lower)         # possessive: Haidar's -> Haidar

    # 1. Remove noise: titles, days, question words, and timetable jargon
    # Include common misspellings of days so they don't pollute teacher matching
    noise_pattern = (
        r'\b(is|when|who|what|where|sir|maam|miss|mr\.?|ms\.?|dr\.?|free|on|'
        r'monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'mondy|monady|munday|tuseday|tusday|wensday|wenesday|'
        r'thrusday|thursdai|firday|'
        r'today|tomorrow|available|schedule|timetable|time|of|the|for|now|'
        r'current|tell|me|professor|prof|visiting|teach|teaches|teaching|'
        r'have|has|class|classes|between|and|at|am|pm|afternoon|morning|'
        r'evening|week|whole|show|does|o|clock|oclock|period|meeting|busy|'
        r'slot|slots|lecture|lab|room|building|floor)\b'
    )
    clean_q = re.sub(noise_pattern, ' ', q_lower).strip()
    clean_q = re.sub(r'\b\d+\b', ' ', clean_q)       # strip bare numbers (2, 11, 3)
    clean_q = re.sub(r'[^\w\s]', ' ', clean_q)
    clean_q = re.sub(r'\s+', ' ', clean_q).strip()

    if not clean_q or len(clean_q) < 3:
        return None

    query_words = [w for w in clean_q.split() if len(w) >= 3]
    if not query_words:
        return None

    best_match = None
    best_score = 0

    for t in sorted(ALL_TEACHERS):
        # Clean teacher name of titles/noise for comparison
        t_clean = re.sub(r'\b(sir|maam|miss|mr\.?|ms\.?|dr\.?|professor|prof|visiting)\b', ' ', t.lower())
        t_clean = re.sub(r'[^\w\s]', ' ', t_clean)
        t_clean = re.sub(r'\s+', ' ', t_clean).strip()
        teacher_words = [w for w in t_clean.split() if len(w) >= 3]

        if not teacher_words:
            continue

        # ── Metric A: base fuzzy token-set ratio ───────────────────────────
        score = fuzz.token_set_ratio(clean_q, t_clean)

        # ── Metric B: per-word fuzzy matching (handles typos in each word) ─
        matched_query_words = 0
        total_word_score = 0
        for qw in query_words:
            best_word_score = max(
                (fuzz.ratio(qw, tw) for tw in teacher_words),
                default=0
            )
            if best_word_score >= 70:  # 70% catches more extreme typos
                matched_query_words += 1
                total_word_score += best_word_score

        if matched_query_words > 0:
            avg_word_score = total_word_score / matched_query_words
            word_bonus = (matched_query_words * 25) + (avg_word_score * 0.3)
            score = max(score, word_bonus)

            # ── Metric C: penalise unmatched teacher-name words ──────────
            # Prevents "Dr. Ali Imran" beating "Mr. Imran Bashir" when
            # query contains "bashir" (ali has no match in query).
            unmatched_teacher_words = 0
            for tw in teacher_words:
                best_q = max((fuzz.ratio(tw, qw) for qw in query_words), default=0)
                if best_q < 70:
                    unmatched_teacher_words += 1
            score = max(0, score - unmatched_teacher_words * 8)

        # ── Metric D: exact substring in cleaned name ───────────────────
        if len(clean_q) >= 4 and clean_q in t_clean:
            score = max(score, 92)

        if score > best_score:
            best_score = score
            best_match = t

    if best_score >= 58:
        return best_match

    return None


def teacher_name_candidates(question):
    ensure_timetable()
    """
    Return possible teachers when a short titled name is ambiguous.
    Extracts ALL name tokens after the title so that a full name like
    'Mr. Usman Anwar' narrows down to exactly one candidate (not ambiguous).
    """
    q_lower = question.lower()

    # Match title followed by one or more name words
    # e.g. "Mr. Usman Anwar" → title="mr", rest="usman anwar"
    title_match = re.search(
        r"\b(dr|sir|mr|ms|miss|maam|madam)\.?\s+([a-z][a-z\s]*)",
        q_lower
    )
    if not title_match:
        return []

    title = title_match.group(1)
    # Extract individual name tokens (skip noise / stop words)
    raw_name_part = title_match.group(2)
    # Stop at common sentence words that aren't names
    stop_words = {"free", "on", "is", "when", "what", "does", "have", "classes",
                  "schedule", "timetable", "available", "today", "monday", "tuesday",
                  "wednesday", "thursday", "friday", "saturday", "sunday", "the", "of",
                  "for", "whole", "week", "tell", "me", "show", "time"}
    name_tokens = []
    for w in re.findall(r"[a-z]+", raw_name_part):
        if w in stop_words:
            break  # stop as soon as we hit a non-name word
        if len(w) >= 2:
            name_tokens.append(w)

    if not name_tokens or len(name_tokens[0]) < 3:
        return []

    candidates = []
    for teacher in sorted(ALL_TEACHERS):
        t_lower = teacher.lower()
        t_clean = re.sub(r"\b(dr|sir|mr|ms|miss|maam|madam)\.?\b", " ", t_lower)
        words = set(re.findall(r"[a-z]+", t_clean))

        # ALL extracted name tokens must appear in the teacher's name
        if not all(tok in words for tok in name_tokens):
            continue
        if title == "dr" and not t_lower.startswith("dr"):
            continue
        if title in {"mr", "sir"} and t_lower.startswith(("ms", "miss")):
            continue
        candidates.append(teacher)

    return candidates


def get_teacher_availability(teacher, days):
    """Returns the free and busy slots for a teacher on specific days."""
    if not TIMETABLE:
        ensure_timetable()
    result = {}
    teacher_days = _TEACHER_INDEX.get(teacher, {})
    for d in days:
        busy_slots = {
            slot: list(entries)
            for slot, entries in teacher_days.get(d, {}).items()
        }
        result[d] = {
            "busy": busy_slots,
            "free": [slot for slot in ALL_SLOTS_SORTED if slot not in busy_slots],
        }
    return result


def get_teacher_classes(teacher, days=None, slot_filter=None):
    ensure_timetable()
    days = days or WEEK_DAYS
    rows = []
    for day, data in get_teacher_availability(teacher, days).items():
        for slot, infos in data["busy"].items():
            if slot_filter and not slot_filter(slot):
                continue
            for info in infos:
                rows.append({
                    "day": day,
                    "time": slot,
                    "class": info.get("class", "N/A"),
                    "subject": info.get("subject", ""),
                    "room": info.get("room", "N/A"),
                })
    return _sort_by_slot(rows)


def get_teachers_free_now():
    ensure_timetable()
    day = today_name()
    minute = _current_minutes()
    matching_slot = next((slot for slot in ALL_SLOTS_SORTED if _slot_contains(slot, minute)), None)
    if not matching_slot:
        return {"day": day, "slot": None, "teachers": []}

    free = []
    for teacher in sorted(ALL_TEACHERS):
        busy = _TEACHER_INDEX.get(teacher, {}).get(day, {})
        if matching_slot not in busy:
            free.append(teacher)
    return {"day": day, "slot": matching_slot, "teachers": free}

def get_room_availability(room, days):
    if not TIMETABLE:
        ensure_timetable()
    """Returns busy and free slots for a room across given days."""
    result = {}
    room_data = _ROOM_INDEX.get(room, {})
    for d in days:
        day_data = room_data.get(d, {})
        busy = {slot: info for slot, info in day_data.items()}
        free = [s for s in ALL_SLOTS_SORTED if s not in busy]
        result[d] = {"busy": busy, "free": free}
    return result


def normalize_room(token: str) -> str:
    """
    Normalise a raw user token to match canonical room names.
    Handles: lt4, LT-4, lt 4, lecture theater 4, cr4, CR-4,
             lh4, LH 4, cs lab 1, cs c.lab 1, cs c lab 1 etc.
    """
    import re
    t = token.strip().lower()
    t = re.sub(r'[\-_]', ' ', t)           # LT-4 -> lt 4
    t = re.sub(r'[^a-z0-9 ]', ' ', t)     # remove dots etc
    t = re.sub(r'\s+', ' ', t).strip()

    # Alias expansions
    aliases = [
        (r'\blecture hall\b',      'lh'),
        (r'\blecture theater\b',   'lt'),
        (r'\blecture theatre\b',   'lt'),
        (r'\bclass room\b',        'cr'),
        (r'\bclassroom\b',         'cr'),
        (r'\bconf room\b',         'cr'),
        (r'\bcomputer lab\b',      'cs c lab'),
        (r'\bcs lab\b',            'cs c lab'),
    ]
    for pattern, repl in aliases:
        t = re.sub(pattern, repl, t)

    # Compact form: "lt4" -> "lt 4", "cr4" -> "cr 4"
    t = re.sub(r'\b(lt|lh|cr)(\d)', r'\1 \2', t)
    # cs c lab4 -> cs c lab 4
    t = re.sub(r'(lab)(\d)', r'\1 \2', t)

    return t.strip()


def detect_room(question: str):
    ensure_timetable()
    """
    Find which canonical room the user is asking about.
    Returns the exact room string from ALL_ROOMS, or None.
    """
    from rapidfuzz import fuzz
    import re

    # Build a normalised -> canonical map once
    norm_map = {normalize_room(r): r for r in ALL_ROOMS}

    # Tokenise the question aggressively so "is lt4 free" -> tokens include "lt4"
    # We try all contiguous n-grams (1..4 words) to catch "cs c lab 1"
    words = re.findall(r'[a-z0-9]+', question.lower())
    candidates = []
    for size in range(1, 5):
        for i in range(len(words) - size + 1):
            candidates.append(' '.join(words[i:i+size]))

    best_room = None
    best_score = 0
    for cand in candidates:
        norm_cand = normalize_room(cand)
        if not norm_cand:
            continue
        for norm_r, canon_r in norm_map.items():
            # Exact match on normalised forms
            if norm_cand == norm_r:
                return canon_r
            # Fuzzy fallback
            score = fuzz.ratio(norm_cand, norm_r)
            if score > best_score and score >= 80:
                best_score = score
                best_room = canon_r

    return best_room

def detect_class(question):
    ensure_timetable()
    """
    Detect class name from question.
    Priority:
      1. extract_class_from_sentence()  — handles ALL input variants
         (BCS1, BSCS I, BCSsem1, SE semester 7, AI-II, ...)
      2. Direct substring match against known keys
      3. RapidFuzz fuzzy match as last resort
    """
    classes = list(TIMETABLE.keys())


    # ── 1. Normalizer (primary) ──────────────────────────────────
    result = extract_class_from_sentence(question, classes)
    if result:
        return result

    # ── 2. Exact substring match (case-insensitive) ─────────────
    q_upper = question.upper()
    for cls in classes:
        if cls.upper() in q_upper:
            return cls

    # Do not fuzzy-match the whole sentence. A cutoff that is low enough to
    # catch typos also maps an unknown code such as BS(XX)-IX onto a real class.
    return None


def detect_day(question):
    """Detect all days requested in the question, returning a list of canonical day names."""
    q_lower = question.lower()
    
    # 1. Check for whole week requests
    if any(phrase in q_lower for phrase in ["whole week", "all week", "entire week", "week", "all days"]):
        return WEEK_DAYS
        
    # 2. Check for specific days
    found_days = []
    seen = set()
    
    import re
    words = re.findall(r'\b[a-z]+\b', q_lower)
    for w in words:
        if w in DAY_MAP:
            day_full = DAY_MAP[w]
            if day_full not in seen:
                found_days.append(day_full)
                seen.add(day_full)
                
    if found_days:
        return found_days

    if "today" in q_lower:
        return [today_name()]
        
    if "tomorrow" in q_lower:
        days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        idx = days_order.index(today_name())
        # If today is Saturday or Sunday, tomorrow's classes are on Monday
        next_day = "Monday" if idx >= 5 else days_order[idx + 1]
        return [next_day]

    return None


def wants_full_week(question: str) -> bool:
    q = (question or "").lower()
    if any(p in q for p in ["full week", "whole week", "all week", "entire week", "all days"]):
        return True
    if any(p in q for p in ["full timetable", "complete schedule", "complete timetable"]):
        return True
    if "timetable" in q and not detect_day(question):
        return True
    if "schedule" in q and not detect_day(question) and not _make_time_filter(question)[0]:
        return True
    return False


def is_teacher_intent(question: str, teacher=None) -> bool:
    q = (question or "").lower()
    if teacher:
        return True
    if re.search(r"\b(sir|maam|madam|teacher|professor|faculty|instructor|dr|mr|ms|miss)\b", q):
        return True
    if any(p in q for p in ["who teaches", "which teacher", "all teachers", "teacher schedule"]):
        return True
    return False


def is_room_intent(question: str, room=None) -> bool:
    q = (question or "").lower()
    if room:
        return True
    room_patterns = [
        r"\b(lt|lh|cr)\s*-?\s*\d+\b",
        r"\blecture\s+(theater|theatre|hall)\s*\d+\b",
        r"\bclass\s*room\s*\d+\b",
        r"\bcs\s*(c\s*)?lab\s*\d+\b",
        r"\b(room|rooms|lab|labs|lecture theaters|lecture theatres)\b",
    ]
    return any(re.search(pattern, q) for pattern in room_patterns)


def timetable_question(text):
    """Detect if question is about timetable with typo tolerance"""
    ensure_timetable()
    keywords = [
        "class", "classes", "lecture", "lectures", "room", "rooms", "teacher",
        "today", "tomorrow", "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday",
        "mon", "tue", "wed", "thu", "fri", "sat",
        "schedule", "shedule", "subject", "timetable", "timetable",
    ]

    t = text.lower()
    # Whole words only. Substring checks treated "what" and "time" as timetable questions.
    has_keyword = any(re.search(rf"\b{re.escape(k)}\b", t) for k in keywords)

    # Check if it contains a recognizable class reference
    # (normalizer returns a key if it can find a class in the text)
    classes = list(TIMETABLE.keys())
    has_class = extract_class_from_sentence(text, classes) is not None

    return has_keyword or has_class


# Off-topic keywords that have nothing to do with a university timetable
_OFF_TOPIC_KEYWORDS = [
    # Animals / nature
    "cat", "dog", "animal", "bird", "fish", "lion", "tiger", "elephant",
    "snake", "horse", "cow", "pet", "wildlife", "zoo",
    # General knowledge / science
    "history", "geography", "physics", "chemistry", "biology", "math",
    "capital of", "who invented", "what is a", "tell me about",
    "explain", "define", "meaning of", "difference between",
    # Professor personal background
    "biography", "background", "personal life", "family", "wife", "husband",
    "born", "age of", "nationality", "hometown", "qualification", "degree of",
    "phd", "education of", "experience of",
    # Tech / coding help
    "code", "python", "javascript", "html", "css", "programming",
    "algorithm", "bug", "error", "function", "variable",
    # Other unrelated
    "movie", "song", "music", "game", "sport", "cricket", "football",
    "weather", "news", "politics", "religion", "cook", "recipe",
    "joke", "story", "poem", "write a poem", "translate",
]

# Greetings that are always allowed
_GREETINGS = [
    "hello", "hi", "hey", "how are you", "good morning",
    "good afternoon", "good evening", "thanks", "thank you",
    "assalam", "salam", "bye", "goodbye",
]

def is_off_topic(text: str) -> bool:
    """
    Returns True if the question is clearly unrelated to the university timetable.
    Greetings are always allowed. Teacher availability & schedule questions are allowed.
    """
    t = text.lower().strip()

    # Always allow greetings
    if any(g in t for g in _GREETINGS):
        return False

    # Official COMSATS University questions are on-topic.
    if is_comsats_question(text):
        return False

    # If it's a timetable question or teacher query, it's on-topic
    if timetable_question(text) or is_teacher_intent(text):
        return False

    # Check for off-topic keywords
    if any(kw in t for kw in _OFF_TOPIC_KEYWORDS):
        return True

    return False


def get_schedule(cls, day, slot_filter=None):
    """Returns structured JSON array of classes for a given day"""
    ensure_timetable()
    if cls not in TIMETABLE:
        return None

    data = TIMETABLE[cls]
    if day not in data:
        return None

    classes = []
    for lecture, entries in data[day].items():
        if slot_filter and not slot_filter(lecture):
            continue
        for info in entries:
            classes.append({
                "subject": info.get("subject", "N/A"),
                "teacher": info.get("teacher", "N/A"),
                "room": info.get("room", ""),
                "time": lecture,
                "day": day
            })

    return _sort_by_slot(classes) if classes else None


def get_class_week_schedule(cls, slot_filter=None):
    classes = []
    for day in WEEK_DAYS:
        for row in get_schedule(cls, day, slot_filter) or []:
            item = dict(row)
            item["time"] = f"{day} - {item['time']}"
            item["day"] = day
            classes.append(item)
    return classes


def find_next_class(cls):
    if cls not in TIMETABLE:
        return None
    today = today_name()
    now_minutes = _current_minutes()
    ordered = WEEK_DAYS
    start_index = ordered.index(today) if today in ordered else 0
    for offset in range(len(ordered)):
        day = ordered[(start_index + offset) % len(ordered)]
        for row in get_schedule(cls, day) or []:
            start = _slot_start_minutes(row["time"])
            if offset > 0 or start >= now_minutes:
                item = dict(row)
                item["day"] = day
                return item
    return None


def find_next_teacher_class(teacher):
    today = today_name()
    now_minutes = _current_minutes()
    start_index = WEEK_DAYS.index(today) if today in WEEK_DAYS else 0
    for offset in range(len(WEEK_DAYS)):
        day = WEEK_DAYS[(start_index + offset) % len(WEEK_DAYS)]
        busy = get_teacher_availability(teacher, [day])[day]["busy"]
        for slot in sorted(busy, key=_slot_start_minutes):
            if offset > 0 or _slot_start_minutes(slot) >= now_minutes:
                return {"day": day, "slot": slot, "classes": busy[slot]}
    return None


def classes_for_subject(subject_query: str):
    ensure_timetable()
    q = re.sub(r"\b(who|teaches|teacher|for|of|the|subject|course|is)\b", " ", subject_query.lower())
    q = re.sub(r"[^a-z0-9 ]", " ", q)
    q = re.sub(r"\s+", " ", q).strip()
    terms = [term for term in q.split() if len(term) > 2]
    results = []
    seen = set()
    for cls, class_data in TIMETABLE.items():
        for day, day_data in class_data.items():
            for slot, entries in day_data.items():
                for info in entries:
                    subject = info.get("subject", "")
                    haystack = subject.lower()
                    is_match = False
                    if terms and all(term in haystack for term in terms):
                        is_match = True
                    elif q and len(terms) == 1 and process.extractOne(q, [haystack], score_cutoff=88):
                        is_match = True
                    if is_match:
                        key = (subject, info.get("teacher", ""), cls, day, slot)
                        if key not in seen:
                            seen.add(key)
                            results.append({
                                "subject": subject,
                                "teacher": info.get("teacher", "N/A"),
                                "class": cls,
                                "day": day,
                                "time": slot,
                                "room": info.get("room", "N/A"),
                            })
    return _sort_by_slot(results)


def teachers_for_class(cls):
    ensure_timetable()
    teachers = []
    seen = set()
    for day in WEEK_DAYS:
        for row in get_schedule(cls, day) or []:
            key = (row["teacher"], row["subject"])
            if row["teacher"] and row["teacher"] != "N/A" and key not in seen:
                seen.add(key)
                teachers.append({
                    "teacher": row["teacher"],
                    "subject": row["subject"],
                    "day": day,
                    "time": row["time"],
                    "room": row["room"],
                })
    return teachers


def all_rooms_at(days, slot_filter, want_free=True):
    ensure_timetable()
    rows = []
    for room in sorted(ALL_ROOMS):
        availability = get_room_availability(room, days)
        for day, data in availability.items():
            busy_slots = [slot for slot in data["busy"] if not slot_filter or slot_filter(slot)]
            matching_slots = [slot for slot in ALL_SLOTS_SORTED if not slot_filter or slot_filter(slot)]
            if want_free:
                free_slots = [slot for slot in matching_slots if slot not in data["busy"]]
                if free_slots:
                    rows.append({"room": room, "day": day, "free": free_slots})
            elif busy_slots:
                rows.append({
                    "room": room,
                    "day": day,
                    "busy": [
                        {
                            "slot": slot,
                            "classes": [i["class"] for i in data["busy"][slot]],
                            "subjects": [i.get("subject", "") for i in data["busy"][slot]],
                            "teachers": [i.get("teacher", "N/A") for i in data["busy"][slot]],
                        }
                        for slot in sorted(busy_slots, key=_slot_start_minutes)
                    ],
                })
    return rows
