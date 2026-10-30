import pdfplumber
import json
import os
import re

# ─── CONFIG ───────────────────────────────────────────────────────────────────
PDF_PATH       = os.path.join(os.path.dirname(__file__), "timetable.pdf")
OUTPUT_JSON    = os.path.join(os.path.dirname(__file__), "timetable_data.json")
OUTPUT_FLAT    = os.path.join(os.path.dirname(__file__), "timetable_flat.json")
# ──────────────────────────────────────────────────────────────────────────────

# ─── TIME SLOTS ───────────────────────────────────────────────────────────────
TIME_SLOTS = [
    "8:30-10:00",
    "10:00-11:30",
    "11:30-13:15",
    "13:35-15:00",
    "15:00-16:30"
]

# ─── PATTERNS ─────────────────────────────────────────────────────────────────

# Semester pattern e.g. BS(CS)-I, BS(BA)-III, BS(EE)-VIII
SEMESTER_PATTERN = re.compile(
    r"BS\s*\(?\s*(CS|SE|AI|EE|CE|BA|A&F|English|BDA|Maths)\s*\)?\s*[-–]\s*(I{1,3}V?|V?I{0,3}|IV|VIII|VII|VI|V|IV|III|II|I)\b",
    re.IGNORECASE
)

# Also match BA(BA)-VII style
SEMESTER_PATTERN2 = re.compile(
    r"BA\s*\(?\s*(BA|CS|SE|AI|EE|CE|A&F|English|BDA|Maths)\s*\)?\s*[-–]\s*(I{1,3}V?|V?I{0,3}|IV|VIII|VII|VI|V|IV|III|II|I)\b",
    re.IGNORECASE
)

ROOM_PATTERN    = re.compile(
    r"\b("
    # Specific room codes (highest priority)
    r"CR\s*\d+|LH\s*\d+|LT\s*\d+|"
    # Lab rooms: "CS Lab 1", "CS C. Lab 2", "EE C.Lab 3", etc.
    r"(?:CS|EE|CE|SE|AI|Maths|English|BDA)\s+(?:C\.?\s*)?Lab\s*\d+|"
    # Other named rooms
    r"EE\s*Hall|ECA\s*Lab|CS\s*DLD\s*Lab|Machine\s*Lab|EE\s*Com\s*Lab|RT\s*Lab|"
    r"Con\s*Sys\s*Lab|WorkS\s*Lab|APL"
    r")\b",
    re.IGNORECASE
)
TEACHER_PATTERN = re.compile(
    r"\b(Mr\.|Ms\.|Mrs\.|Dr\.|Prof\.)\s+[A-Z][a-zA-Z\s\(\)]+(?:Visiting)?"
)
REPEATER_PATTERN = re.compile(r"\bRepeater\b", re.IGNORECASE)
LAB_GROUP_PATTERN = re.compile(r"\bLab\s*Group\s*(\d)\b", re.IGNORECASE)
GROUP_PATTERN = re.compile(r"\bGroup\s*(\d)\b", re.IGNORECASE)
AS_PATTERN = re.compile(r"^\s*AS\s*$")

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def detect_semester_from_pdfplumber(pdf_text):
    """Extract semester from pdfplumber-extracted text (much more reliable)"""
    # Try full pattern
    m = SEMESTER_PATTERN.search(pdf_text)
    if m:
        return m.group(0).strip()
    m = SEMESTER_PATTERN2.search(pdf_text)
    if m:
        return m.group(0).strip()
    return None

def clean_teacher(raw):
    """Clean teacher name"""
    raw = raw.strip()
    # Remove trailing junk
    raw = re.sub(r'\s+', ' ', raw)
    return raw

def is_lab_subject(subject):
    return bool(re.search(r'\(Lab\)', subject, re.IGNORECASE))

# ─── CORE PARSER ──────────────────────────────────────────────────────────────

def parse_table_cell(cell_text):
    """
    Parse a single table cell containing subject, teacher, and room info.
    Returns dict with parsed components or None if empty.
    """
    if not cell_text or cell_text.strip() == "" or cell_text.strip().upper() == "AS":
        return None

    # First pass: Extract room from entire cell_text before line splitting
    # This ensures we catch room info that might be on any line
    room = None
    room_m = ROOM_PATTERN.search(cell_text)
    if room_m:
        room = room_m.group().strip()

    lines = [line.strip() for line in cell_text.split('\n') if line.strip()]

    # Initialize components
    subject_lines = []
    teacher = None
    is_repeater = False
    is_lab = False
    lab_group = None

    i = 0
    while i < len(lines):
        line = lines[i]

        # Check for repeater
        if REPEATER_PATTERN.search(line):
            is_repeater = True
            i += 1
            continue

        # Check for lab group
        lg_m = LAB_GROUP_PATTERN.search(line)
        if not lg_m:
            lg_m = GROUP_PATTERN.search(line)
        if lg_m:
            lab_group = f"Group {lg_m.group(1)}"
            i += 1
            continue

        # Check for teacher (starts with title)
        teacher_m = TEACHER_PATTERN.search(line)
        if teacher_m:
            teacher = clean_teacher(teacher_m.group())
            i += 1
            continue

        # Check for room on this line
        room_m = ROOM_PATTERN.search(line)
        if room_m:
            # Skip this line if it's primarily a room (already extracted in first pass)
            i += 1
            continue

        # Everything else is subject
        subject_lines.append(line)
        i += 1

    # Combine subject lines
    subject = " ".join(subject_lines).strip()

    # Check if it's a lab
    is_lab = is_lab_subject(subject)

    if subject and teacher:  # Only return if we have both subject and teacher
        return {
            "subject": subject,
            "teacher": teacher,
            "room": room or "",
            "is_repeater": is_repeater,
            "is_lab": is_lab,
            "lab_group": lab_group
        }

    return None

def parse_page_table(table, semester, page_num):
    """Parse a pdfplumber extracted table into timetable entries"""
    entries = []

    # Map day abbreviations to full names
    day_map = {
        'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
        'Thu': 'Thursday', 'Fri': 'Friday'
    }
    
    current_day = None  # Track the current day for rowspan continuation rows

    # Skip header row (row 0)
    for row_idx in range(1, len(table)):
        row = table[row_idx]

        # First column should be the day
        day_cell = row[0].strip() if row[0] else ""
        
        # If this row has a day label, update current_day
        if day_cell:
            current_day = day_map.get(day_cell, day_cell)
        
        # Skip if no current day (no previous day label and no current one)
        if not current_day:
            continue

        # Process each time slot column (1-5)
        for col_idx in range(1, min(len(row), len(TIME_SLOTS) + 1)):
            cell_text = row[col_idx] if col_idx < len(row) else ""
            time_slot = TIME_SLOTS[col_idx - 1]

            if cell_text and cell_text.strip():
                entry = parse_table_cell(cell_text)
                if entry:
                    full_entry = {
                        "semester": semester,
                        "day": current_day,
                        "time_slot": time_slot,
                        **entry
                    }
                    entries.append(full_entry)

    return entries

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  PDF Timetable Extractor - Table-Based")
    print("=" * 55)

    if not os.path.exists(PDF_PATH):
        print(f"ERROR: PDF not found at {PDF_PATH}")
        return

    # Step 1: Use pdfplumber to extract semester from each page
    print("\n[1/3] Extracting semester info from PDF...")
    page_semesters = {}

    with pdfplumber.open(PDF_PATH) as pdf:
        for i, page in enumerate(pdf.pages):
            page_num = i + 1
            text = page.extract_text()
            semester = detect_semester_from_pdfplumber(text)
            if semester:
                page_semesters[page_num] = semester

    print(f"      Found {len(page_semesters)} pages with semesters")

    # Step 2: Extract tables from each page
    print("\n[2/3] Extracting tables from PDF...")
    all_entries = []

    with pdfplumber.open(PDF_PATH) as pdf:
        for i, page in enumerate(pdf.pages):
            page_num = i + 1

            if page_num not in page_semesters:
                print(f"      Page {page_num:2d}: No semester detected, skipping")
                continue

            semester = page_semesters[page_num]

            try:
                tables = page.extract_tables()
                if not tables:
                    print(f"      Page {page_num:2d}: No tables found")
                    continue

                # Process the main timetable table (usually the first/largest one)
                main_table = max(tables, key=lambda t: len(t) * len(t[0]) if t else 0)

                entries = parse_page_table(main_table, semester, page_num)
                print(f"      Page {page_num:2d} ({semester:20s}): {len(entries):3d} entries")
                all_entries.extend(entries)

            except Exception as e:
                print(f"      Page {page_num:2d}: Table extraction error: {e}")
                continue

    print(f"\n{'='*55}")
    print(f"  Total entries extracted: {len(all_entries)}")

    # Count by semester
    semesters = {}
    for e in all_entries:
        s = e["semester"]
        semesters[s] = semesters.get(s, 0) + 1

    print(f"  Semesters found: {len(semesters)}")
    for s, count in sorted(semesters.items()):
        print(f"    - {s}: {count} entries")

    # Save flat JSON
    with open(OUTPUT_FLAT, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
    print(f"\n  Saved flat JSON -> timetable_flat.json")

    # Save structured JSON
    structured = {}
    for e in all_entries:
        sem = e["semester"]
        day = e["day"]
        slot = e["time_slot"]

        if sem not in structured:
            structured[sem] = {}
        if day not in structured[sem]:
            structured[sem][day] = {}
        if slot not in structured[sem][day]:
            structured[sem][day][slot] = []

        structured[sem][day][slot].append({
            "subject":      e["subject"],
            "teacher":      e["teacher"],
            "room":         e["room"],
            "time":         slot,
            "day":          day,
            "is_repeater":  e["is_repeater"],
            "is_lab":       e["is_lab"],
            "lab_group":    e["lab_group"]
        })

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(structured, f, indent=2, ensure_ascii=False)
    print(f"  Saved structured JSON -> timetable_data.json")
    print("=" * 55)

if __name__ == "__main__":
    main()