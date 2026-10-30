"""
normalizer.py  –  CampusAI Input Normalization
================================================
Converts ANY way a student might write their class into the exact
timetable key used by the Firestore timetable.

Timetable key format:  BS(PROGRAM)-ROMAN
Examples:  BS(CS)-I   BS(AI)-IV   BS(SE)-VIII   BA(BA)-VII

Handles inputs like:
  BSCS1 / BSCS-1 / BSCS I / BSCS Semester 1 / BCS sem 1 / CS 1
  BSAI2 / BS AI 2 / AI-II / AI 2
  BSSE3 / SE-III / Software Engineering 3
  BA 7 / BA VII / BA(BA)-VII
  BCS1 / BCS-I / BCSsem1 / CS semester II
  ... and many more
"""

import re

# ──────────────────────────────────────────────
# 1. Digit ↔ Roman mapping (1-8)
# ──────────────────────────────────────────────
DIGIT_TO_ROMAN = {
    '1': 'I',   '2': 'II',  '3': 'III', '4': 'IV',
    '5': 'V',   '6': 'VI',  '7': 'VII', '8': 'VIII',
}
ROMAN_TO_DIGIT = {v: k for k, v in DIGIT_TO_ROMAN.items()}

# ──────────────────────────────────────────────
# 2. All known aliases → canonical program code
#    (canonical = exactly what appears inside BS(...) in the JSON)
# ──────────────────────────────────────────────
PROGRAM_ALIASES = {
    # Computer Science
    'BSCS':              'CS',
    'BCS':               'CS',
    'CS':                'CS',
    'COMPUTER SCIENCE':  'CS',
    'COMP SCI':          'CS',

    # Artificial Intelligence
    'BSAI':              'AI',
    'AI':                'AI',
    'ARTIFICIAL INTELLIGENCE': 'AI',

    # Software Engineering
    'BSSE':              'SE',
    'SE':                'SE',
    'SOFTWARE ENGINEERING': 'SE',
    'SOFTWARE ENG':      'SE',

    # Computer Engineering
    'BSCE':              'CE',
    'CE':                'CE',
    'COMPUTER ENGINEERING': 'CE',

    # Electrical Engineering
    'BSEE':              'EE',
    'EE':                'EE',
    'ELECTRICAL ENGINEERING': 'EE',
    'ELECTRICAL ENG':    'EE',

    # Business Administration
    'BBA':               'BA',
    'BSBA':              'BA',
    'BA':                'BA',
    'BUSINESS ADMIN':    'BA',
    'BUSINESS ADMINISTRATION': 'BA',

    # Accounting & Finance
    'BSAF':              'A&F',
    'BSAandF':           'A&F',
    'AF':                'A&F',
    'A&F':               'A&F',
    'ACCOUNTING':        'A&F',
    'FINANCE':           'A&F',
    'ACCOUNTING AND FINANCE': 'A&F',
    'ACCOUNTING & FINANCE':   'A&F',

    # Big Data Analytics
    'BSBDA':             'BDA',
    'BDA':               'BDA',
    'BIG DATA':          'BDA',
    'BIG DATA ANALYTICS': 'BDA',

    # Mathematics
    'BSMATHS':           'Maths',
    'MATHS':             'Maths',
    'MATH':              'Maths',
    'MATHEMATICS':       'Maths',

    # English
    'BSENGLISH':         'English',
    'ENGLISH':           'English',
    'ENG':               'English',   # careful – ENG ≠ EE, handled by order

    # BA(BA) – Arts
    'BABA':              'BA',         # fallback; will produce BS(BA)
}

# Programs that are NOT wrapped in BS(…) — special top-level keys
SPECIAL_KEYS = {
    'BA': 'BA(BA)',    # only one BA class: BA(BA)-VII
}

# Noise words to strip before parsing
NOISE_WORDS = re.compile(
    r'\b(semester|sem|section|class|year|batch|batch no|no|of|the|and)\b',
    re.IGNORECASE
)


# ──────────────────────────────────────────────
# 3. Core normalizer
# ──────────────────────────────────────────────

def normalize_to_key(text: str) -> str | None:
    """
    Convert any student input into an exact timetable key.
    Returns the key string (e.g. "BS(CS)-I") or None if unrecognized.
    """
    original = text.strip()
    t = original.upper()

    # ── Step 0: separate glued tokens so noise stripping & numeral extraction work ──

    # 0a) Break SEM away from surrounding text (e.g. BCSSEM1 → BCS SEM 1)
    #     Handles: BCSsem1 / BCSsemI / BCSsemII / BCSsem8 etc.
    t = re.sub(r'(BCS|BSCS|BSAI|BSSE|BSCE|BSEE|BSAF|BSBDA|BSMATHS|BSENGLISH|BS|BA|AI|SE|CE|EE|CS)'
               r'SEM\s*([IVXLCDM1-8])',
               r'\1 SEM \2', t)

    # 0b) Break SEM away when it appears before a numeral without separation
    t = re.sub(r'\bSEM([IVXLCDM1-8])', r'SEM \1', t)

    # 0c) Split digits/roman numerals glued right after program letters (e.g. BSCS3 → BSCS 3, BCSI → BCS I)
    t = re.sub(r'(BCS|BSCS|BSAI|BSSE|BSCE|BSEE|BSAF|BSBDA|BSMATHS|BSENGLISH|BS|BA|AI|SE|CE|EE|CS)'
               r'(VIII|VII|VI|IV|V|III|II|I|[1-8])\b',
               r'\1 \2', t)

    # 0d) Generic: any letter-digit boundary for remaining cases (e.g. BSCS3 → BSCS 3)
    t = re.sub(r'([A-Z&])([1-8])\b', r'\1 \2', t)

    # ── Step 1: strip noise words ──────────────────────────────
    t = NOISE_WORDS.sub(' ', t).strip()
    t = re.sub(r'\s+', ' ', t)   # collapse multiple spaces

    # ── Step 2: extract the Roman/digit numeral from the end ───
    # Accept:  trailing "I / II / III / IV / V / VI / VII / VIII"
    #          or trailing digit 1-8
    numeral_pattern = re.compile(
        r'[\s\-]*(VIII|VII|VI|IV|V|III|II|I|[1-8])\s*$',
        re.IGNORECASE
    )
    num_match = numeral_pattern.search(t)
    if not num_match:
        return None   # no semester found — can't resolve

    raw_numeral = num_match.group(1).upper()
    roman = DIGIT_TO_ROMAN.get(raw_numeral, raw_numeral)   # digit → roman, or keep roman
    prog_part = t[:num_match.start()].strip().rstrip('-').strip()

    # ── Step 3: resolve program part → canonical code ──────────
    canonical = _resolve_program(prog_part)
    if canonical is None:
        return None

    # ── Step 4: build the timetable key ────────────────────────
    # BA(BA)-VII is the only non-BS key; only match it if explicitly written
    if canonical == 'BA' and re.match(r'^BA\(BA\)$', prog_part):
        return f'BA(BA)-{roman}'

    return f'BS({canonical})-{roman}'


def _resolve_program(prog: str) -> str | None:
    """Match the program string to a canonical code."""
    prog = prog.strip().upper()

    # Direct alias lookup (longest-match wins → sort by length desc)
    for alias in sorted(PROGRAM_ALIASES.keys(), key=len, reverse=True):
        if prog == alias.upper():
            return PROGRAM_ALIASES[alias]

    # Try prefix: e.g. "BS(CS)" → extract inner part
    inner = re.match(r'^BS\(([^)]+)\)$', prog)
    if inner:
        return inner.group(1)   # return as-is (already canonical)

    # Try stripping leading BS/BCS and matching the rest
    stripped = re.sub(r'^(BS|BCS|B)', '', prog).strip()
    for alias in sorted(PROGRAM_ALIASES.keys(), key=len, reverse=True):
        if stripped == alias.upper():
            return PROGRAM_ALIASES[alias]

    return None


# ──────────────────────────────────────────────
# 4. High-level: extract from a full sentence
# ──────────────────────────────────────────────

def extract_class_from_sentence(sentence: str, known_keys: list[str]) -> str | None:
    """
    Try to find and normalize a class name embedded anywhere in a sentence.
    Falls back to fuzzy-matching against known_keys if direct normalization fails.

    Args:
        sentence:   raw user question e.g. "show me BSCS 3 timetable"
        known_keys: list of exact keys from the loaded timetable

    Returns:
        Matching timetable key or None
    """
    # Punctuation such as "BCS-1?" must not hide the class token.
    words = re.findall(r"[A-Za-z0-9()&.+\-]+", sentence or "")
    for span_len in range(min(6, len(words)), 0, -1):
        for i in range(len(words) - span_len + 1):
            span = ' '.join(words[i:i + span_len])
            key = normalize_to_key(span)
            if key and key in known_keys:
                return key

    # ── Direct exact match against known keys (case-insensitive) ──
    upper_sentence = sentence.upper()
    for key in known_keys:
        if key.upper() in upper_sentence:
            return key

    return None
