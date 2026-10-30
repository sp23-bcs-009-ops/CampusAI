"""PyMuPDF timetable layout extraction and structural validation.

This module performs no OCR-model or external AI calls.
"""
from __future__ import annotations

import re
from collections import defaultdict

import pymupdf

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")

DAY_ALIASES = {
    "MON": "Monday", "MONDAY": "Monday",
    "TUE": "Tuesday", "TUES": "Tuesday", "TUESDAY": "Tuesday",
    "WED": "Wednesday", "WEDS": "Wednesday", "WEDNESDAY": "Wednesday",
    "THU": "Thursday", "THUR": "Thursday", "THURS": "Thursday", "THURSDAY": "Thursday",
    "FRI": "Friday", "FRIDAY": "Friday",
}

TEXT_PDF_REQUIRED_MESSAGE = "Text PDF is required. Image/scan PDF is not supported."

TIME_RANGE_PATTERN = re.compile(
    r"(?<!\d)(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-\u2013\u2014]\s*"
    r"(\d{1,2}:\d{2}\s*(?:AM|PM)?)(?!\d)",
    re.IGNORECASE,
)

class TextPdfRequiredError(ValueError):
    """Raised when a PDF has no usable embedded timetable text."""

class TextPdfValidationError(ValueError):
    """Raised when extracted text or parsed cell data cannot form a complete timetable."""

def _day_labels(text: str) -> list[str]:
    found = set()
    for match in re.finditer(
        r"(?<![A-Za-z])(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|MON|TUES|TUE|WEDS|WED|THURS|THUR|THU|FRI)(?![A-Za-z])",
        text,
        re.IGNORECASE,
    ):
        day = DAY_ALIASES.get(match.group(1).upper())
        if day:
            found.add(day)
    return [day for day in WEEKDAYS if day in found]

def _lecture_headers(lines: list[dict]) -> list[dict]:
    headers = []
    for line in lines:
        tokens = line.get("words", [])
        index = 0
        while index < len(tokens):
            first = tokens[index]
            match = re.fullmatch(r"(?:LECTURE|LEC|L)\s*#?\s*(\d+)", first["text"], re.IGNORECASE)
            matched_tokens = [first]
            if not match and re.fullmatch(r"(?:LECTURE|LEC|L)", first["text"], re.IGNORECASE):
                next_index = index + 1
                if next_index < len(tokens) and tokens[next_index]["text"] == "#":
                    next_index += 1
                if next_index < len(tokens):
                    match = re.fullmatch(r"#?(\d+)", tokens[next_index]["text"])
                    if match:
                        matched_tokens = tokens[index:next_index + 1]
            if match:
                number = int(match.group(1))
                if number > 0:
                    bbox = [
                        min(word["bbox"][0] for word in matched_tokens),
                        min(word["bbox"][1] for word in matched_tokens),
                        max(word["bbox"][2] for word in matched_tokens),
                        max(word["bbox"][3] for word in matched_tokens),
                    ]
                    headers.append({
                        "lecture_num": number,
                        "text": " ".join(word["text"] for word in matched_tokens),
                        "bbox": bbox,
                        "x_center": (bbox[0] + bbox[2]) / 2,
                    })
                    index += len(matched_tokens)
                    continue
            index += 1
    return sorted(headers, key=lambda header: header["x_center"])

def _extract_page(page, page_number: int) -> dict:
    words = []
    grouped_lines: dict[tuple[int, int], list[tuple]] = defaultdict(list)
    for word in page.get_text("words", sort=True):
        x0, y0, x1, y1, text, block, line, word_index = word[:8]
        text = str(text).strip()
        if not text:
            continue
        words.append({
            "text": text,
            "bbox": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
        })
        grouped_lines[(block, line)].append((word_index, text, x0, y0, x1, y1))

    lines = []
    for line_words in grouped_lines.values():
        ordered = sorted(line_words)
        lines.append({
            "text": " ".join(item[1] for item in ordered),
            "bbox": [
                round(min(item[2] for item in ordered), 2),
                round(min(item[3] for item in ordered), 2),
                round(max(item[4] for item in ordered), 2),
                round(max(item[5] for item in ordered), 2),
            ],
            "words": [
                {
                    "text": item[1],
                    "bbox": [round(item[2], 2), round(item[3], 2), round(item[4], 2), round(item[5], 2)],
                }
                for item in ordered
            ],
        })
    lines.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))
    headers = _lecture_headers(lines)
    time_ranges = []
    for line in lines:
        match = TIME_RANGE_PATTERN.search(line["text"])
        if not match:
            continue
        time_ranges.append({
            "start_time": match.group(1),
            "end_time": match.group(2),
            "bbox": line["bbox"],
            "x_center": (line["bbox"][0] + line["bbox"][2]) / 2,
            "y_center": (line["bbox"][1] + line["bbox"][3]) / 2,
        })
    if headers:
        header_centers = [header["x_center"] for header in headers]
        for time_range in time_ranges:
            nearest = min(
                range(len(headers)),
                key=lambda index: abs(header_centers[index] - time_range["x_center"]),
            )
            header = headers[nearest]
            neighbor_gaps = [
                abs(header_centers[nearest] - header_centers[index])
                for index in range(len(headers)) if index != nearest
            ]
            max_x_distance = min(neighbor_gaps) / 2 if neighbor_gaps else page.rect.width
            if (abs(header_centers[nearest] - time_range["x_center"]) <= max_x_distance
                    and abs(header["bbox"][1] - time_range["y_center"]) <= page.rect.height * 0.08):
                header.setdefault("time_ranges", []).append({
                    "start_time": time_range["start_time"],
                    "end_time": time_range["end_time"],
                    "bbox": time_range["bbox"],
                })

    rules = []
    for drawing in page.get_drawings():
        for item in drawing.get("items", []):
            if item[0] == "l":
                start, end = item[1], item[2]
                rules.append({
                    "type": "line",
                    "coordinates": [
                        round(start.x, 2), round(start.y, 2),
                        round(end.x, 2), round(end.y, 2),
                    ],
                })
            elif item[0] == "re":
                rect = item[1]
                rules.append({
                    "type": "rect",
                    "bbox": [round(rect.x0, 2), round(rect.y0, 2), round(rect.x1, 2), round(rect.y1, 2)],
                })

    text = "\n".join(line["text"] for line in lines)
    days = _day_labels(text)
    non_header_words = [
        word for word in words
        if not re.fullmatch(
            r"(?:LECTURE|LEC|L|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|MON|TUE|TUES|WED|WEDS|THU|THUR|THURS|FRI|#?\d+)",
            word["text"],
            re.IGNORECASE,
        )
    ]
    content_signal = bool(re.search(
        r"\b(?:SUBJECT|TEACHER|ROOM|CLASS|COURSE|GROUP|LAB)\b|\bLT\s*\d+\b|\b(?:C\.?\s*)?LAB\s*\d+\b|\b\d{1,2}:\d{2}\b",
        text,
        re.IGNORECASE,
    ))
    useful = bool(days and headers and len(non_header_words) >= 4 and (content_signal or len(non_header_words) >= 8))
    return {
        "page": page_number,
        "width": round(page.rect.width, 2),
        "height": round(page.rect.height, 2),
        "text": text,
        "words": words,
        "lines": lines,
        "rules": rules,
        "weekday_labels": days,
        "lecture_headers": headers,
        "time_ranges": time_ranges,
        "useful_timetable_text": useful,
    }

def extract_pdf_layout(pdf_path: str) -> list[dict]:
    """Extract text and page geometry without rendering or OCR."""
    with pymupdf.open(pdf_path) as pdf:
        if not pdf:
            raise TextPdfRequiredError(TEXT_PDF_REQUIRED_MESSAGE)
        pages = [_extract_page(page, number) for number, page in enumerate(pdf, start=1)]

    if not any(page["useful_timetable_text"] for page in pages):
        raise TextPdfRequiredError(TEXT_PDF_REQUIRED_MESSAGE)
    return pages

def _validate_layout_page(page: dict) -> None:
    headers = page["lecture_headers"]
    numbers = [header["lecture_num"] for header in headers]
    expected_numbers = list(range(1, len(headers) + 1))
    if not headers or numbers != expected_numbers:
        raise TextPdfValidationError(
            f"Page {page['page']} validation failed: lecture headers must identify consecutive columns "
            f"from Lecture 1; extracted lecture numbers={numbers}."
        )

def _word_records(page: dict) -> list[tuple[str, list[float], int]]:
    return [
        (word["text"], word["bbox"], line_index)
        for line_index, line in enumerate(page["lines"])
        for word in line["words"]
    ]

def _horizontal_table_boundaries(page: dict) -> list[float]:
    header_centers = [header["x_center"] for header in page["lecture_headers"]]
    segments = sorted(
        (
            (rule["coordinates"][1], rule["coordinates"][0], rule["coordinates"][2])
            for rule in page.get("rules", [])
            if rule["type"] == "line"
            and abs(rule["coordinates"][1] - rule["coordinates"][3]) <= 1
        ),
        key=lambda segment: segment[0],
    )
    y_groups = []
    for y, left, right in segments:
        if not y_groups or y - sum(y_groups[-1]["ys"]) / len(y_groups[-1]["ys"]) > 1:
            y_groups.append({"ys": [y], "intervals": [(min(left, right), max(left, right))]})
        else:
            group = y_groups[-1]
            group["ys"].append(y)
            group["intervals"].append((min(left, right), max(left, right)))

    boundaries = []
    for group in y_groups:
        intervals = sorted(group["intervals"])
        merged_left, merged_right = intervals[0]
        merged_intervals = []
        for left, right in intervals[1:]:
            if left <= merged_right + 1:
                merged_right = max(merged_right, right)
            else:
                merged_intervals.append((merged_left, merged_right))
                merged_left, merged_right = left, right
        merged_intervals.append((merged_left, merged_right))
        if any(
            left <= min(header_centers) and right >= max(header_centers)
            for left, right in merged_intervals
        ):
            boundaries.append(sum(group["ys"]) / len(group["ys"]))
    return boundaries

def _weekday_row_bounds(page: dict, labels: dict[str, list[float]]) -> dict[str, tuple[float, float]]:
    day_centers = {
        day: (bbox[1] + bbox[3]) / 2
        for day, bbox in labels.items()
    }
    ordered_days = sorted(day_centers, key=day_centers.get)
    boundaries = _horizontal_table_boundaries(page)
    row_bounds = {}
    if len(boundaries) >= 2:
        for day in ordered_days:
            center = day_centers[day]
            upper = [boundary for boundary in boundaries if boundary < center]
            lower = [boundary for boundary in boundaries if boundary > center]
            if upper and lower:
                row_bounds[day] = (max(upper), min(lower))
    if len(row_bounds) == len(ordered_days):
        return row_bounds

    if len(ordered_days) == 1:
        return {
            ordered_days[0]: (
                max(header["bbox"][3] for header in page["lecture_headers"]),
                page["height"],
            )
        }
    gaps = [
        day_centers[right] - day_centers[left]
        for left, right in zip(ordered_days, ordered_days[1:])
    ]
    if not all(gap > 0 for gap in gaps):
        return row_bounds
    for index, day in enumerate(ordered_days):
        center = day_centers[day]
        top = (
            (day_centers[ordered_days[index - 1]] + center) / 2
            if index
            else center - gaps[0] / 2
        )
        bottom = (
            (center + day_centers[ordered_days[index + 1]]) / 2
            if index + 1 < len(ordered_days)
            else center + gaps[-1] / 2
        )
        row_bounds[day] = (top, bottom)
    return row_bounds

def _lecture_column_bounds(
    page: dict,
    headers: list[dict],
    row_bounds: tuple[float, float],
    day_center: float,
) -> list[tuple[int, float, float]]:
    vertical_boundaries = sorted({
        round(rule["coordinates"][0], 2)
        for rule in page.get("rules", [])
        if rule["type"] == "line"
        and abs(rule["coordinates"][0] - rule["coordinates"][2]) <= 1
        and min(rule["coordinates"][1], rule["coordinates"][3]) <= day_center + 1
        and max(rule["coordinates"][1], rule["coordinates"][3]) >= day_center - 1
        and max(rule["coordinates"][1], rule["coordinates"][3]) >= row_bounds[0]
        and min(rule["coordinates"][1], rule["coordinates"][3]) <= row_bounds[1]
    })
    column_bounds = []
    for index, header in enumerate(headers):
        center = header["x_center"]
        left_rules = [boundary for boundary in vertical_boundaries if boundary < center]
        right_rules = [boundary for boundary in vertical_boundaries if boundary > center]
        left = max(left_rules) if left_rules else (
            headers[index - 1]["x_center"] + center
        ) / 2 if index else header["bbox"][0]
        right = min(right_rules) if right_rules else (
            center + headers[index + 1]["x_center"]
        ) / 2 if index + 1 < len(headers) else header["bbox"][2]
        column_bounds.append((header["lecture_num"], left, right))
    return column_bounds

def _positioned_timetable_cells(page: dict, labels: dict[str, list[float]]) -> tuple[list, list]:
    """Assign extracted words to weekday/lecture cells using only their PDF coordinates."""
    day_centers = {
        day: (bbox[1] + bbox[3]) / 2
        for day, bbox in labels.items()
    }
    ordered_days = sorted(day_centers, key=day_centers.get)
    headers = sorted(page["lecture_headers"], key=lambda header: header["x_center"])
    row_bounds = _weekday_row_bounds(page, labels)
    column_bounds_by_day = {
        day: _lecture_column_bounds(page, headers, row_bounds[day], day_centers[day])
        for day in ordered_days
        if day in row_bounds
    }

    cells_by_key = {
        (day, lecture_num): []
        for day in ordered_days
        for header in headers
        for lecture_num in (header["lecture_num"],)
    }
    context_words = []
    weekday_words = {
        re.sub(r"[^A-Z]", "", day.upper())
        for day in labels
    }
    header_bboxes = [header["bbox"] for header in headers]
    for text, bbox, _ in _word_records(page):
        normalized_text = re.sub(r"[^A-Z]", "", text.upper())
        if normalized_text in weekday_words or any(
            bbox[0] >= header_bbox[0]
            and bbox[1] >= header_bbox[1]
            and bbox[2] <= header_bbox[2]
            and bbox[3] <= header_bbox[3]
            for header_bbox in header_bboxes
        ):
            continue
        x_center = (bbox[0] + bbox[2]) / 2
        y_center = (bbox[1] + bbox[3]) / 2
        cell_key = next(
            (
                (day, lecture_num)
                for day in ordered_days
                for lecture_num, left, right in column_bounds_by_day.get(day, [])
                if day in row_bounds
                and left <= x_center <= right
                and row_bounds[day][0] <= y_center <= row_bounds[day][1]
            ),
            None,
        )
        positioned_word = [text, round(x_center, 1), round(y_center, 1)]
        if cell_key is None:
            context_words.append(positioned_word)
        else:
            cells_by_key[cell_key].append(positioned_word)

    cells = [
        [day, lecture_num, cells_by_key[(day, lecture_num)]]
        for day in ordered_days
        for header in headers
        for lecture_num in (header["lecture_num"],)
    ]
    return cells, context_words

def _weekday_label_positions(page: dict) -> dict[str, list[float]]:
    first_column_left = page["lecture_headers"][0]["bbox"][0]
    candidates: dict[str, list[list[float]]] = defaultdict(list)
    all_candidates: dict[str, list[list[float]]] = defaultdict(list)
    for text, bbox, _ in _word_records(page):
        day = DAY_ALIASES.get(re.sub(r"[^A-Z]", "", text.upper()))
        if day:
            all_candidates[day].append(bbox)
            if bbox[0] < first_column_left:
                candidates[day].append(bbox)

    positions = {}
    for day in page["weekday_labels"]:
        matches = candidates.get(day) or all_candidates.get(day, [])
        if not matches:
            raise TextPdfValidationError(
            f"Page {page['page']} validation failed: could not locate the {day} label for layout chunking."
            )
        positions[day] = min(matches, key=lambda bbox: bbox[0])

    ordered_centers = [
        (positions[day][1] + positions[day][3]) / 2
        for day in WEEKDAYS if day in positions
    ]
    return positions

def _page_cell_inputs(page: dict) -> tuple[dict[str, tuple[str, int, list]], list]:
    labels = _weekday_label_positions(page)
    cells, context_words = _positioned_timetable_cells(page, labels)
    populated_cells = {
        f"cell_{index:04d}": (day, lecture_num, words)
        for index, (day, lecture_num, words) in enumerate(
            (cell for cell in cells if cell[2]),
            start=1,
        )
    }
    return populated_cells, context_words

def _normalise_clock(value, page_number: int, field: str) -> str:
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})(?:\s*([AP]M))?\s*", str(value or ""), re.IGNORECASE)
    if not match:
        raise TextPdfValidationError(f"Page {page_number} validation failed: invalid {field} in lecture header.")
    hour, minute = int(match.group(1)), int(match.group(2))
    suffix = (match.group(3) or "").upper()
    if minute > 59:
        raise TextPdfValidationError(f"Page {page_number} validation failed: invalid {field} in lecture header.")
    if suffix:
        if not 1 <= hour <= 12:
            raise TextPdfValidationError(f"Page {page_number} validation failed: invalid {field} in lecture header.")
        hour = hour % 12 + (12 if suffix == "PM" else 0)
    elif hour > 23:
        raise TextPdfValidationError(f"Page {page_number} validation failed: invalid {field} in lecture header.")
    return f"{hour:02d}:{minute:02d}"

def _cell_text_by_key(layout_page: dict) -> dict[tuple[str, int], list[str]] | None:
    if not isinstance(layout_page.get("lines"), list):
        return None
    labels = _weekday_label_positions(layout_page)
    cells, _ = _positioned_timetable_cells(layout_page, labels)
    return {
        (day, lecture_num): [word[0] for word in words]
        for day, lecture_num, words in cells
    }

def _clean_cell_entries(
    entries: list,
    day: str,
    lecture_num: int,
    page_number: int,
    source_words: list[str] | None,
) -> list[dict]:
    if not isinstance(entries, list) or len(entries) > 2:
        raise TextPdfValidationError(
            f"Page {page_number} validation failed: {day} Lecture {lecture_num} "
            "must contain 0-2 independent entries."
        )
    source_tokens = (
        set(re.findall(r"[A-Z0-9]+", " ".join(source_words).upper()))
        if source_words is not None
        else None
    )
    clean_entries = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: {day} Lecture {lecture_num} entries must be objects."
            )
        required_fields = ("subject", "teacher", "room", "is_lab", "lab_group")
        missing_fields = [field for field in required_fields if field not in entry]
        if missing_fields:
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: {day} Lecture {lecture_num} entry is missing "
                f"required field(s) {', '.join(missing_fields)}."
            )
        if any(not isinstance(entry[field], str) for field in ("subject", "teacher", "room", "lab_group")):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: {day} Lecture {lecture_num} text fields must be strings."
            )
        clean_entry = {
            "subject": entry["subject"].strip(),
            "teacher": entry["teacher"].strip(),
            "room": entry["room"].strip(),
            "is_lab": entry["is_lab"],
            "lab_group": entry["lab_group"].strip(),
        }
        if not isinstance(clean_entry["is_lab"], bool):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: {day} Lecture {lecture_num} is_lab must be boolean."
            )
        if not any(clean_entry[field] for field in ("subject", "teacher", "room")):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: empty entries are not allowed; use an empty entries array."
            )
        if source_tokens is not None:
            entry_tokens = set(re.findall(
                r"[A-Z0-9]+",
                " ".join(clean_entry[field] for field in ("subject", "teacher", "room", "lab_group")).upper(),
            ))
            if not source_tokens or not entry_tokens.intersection(source_tokens):
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: {day} Lecture {lecture_num} parsed entry "
                    "does not match extracted PDF cell text."
                )
        clean_entries.append(clean_entry)
    return clean_entries

def validate_page_result(result: dict, layout_page: dict) -> dict:
    """Validate rule-based parser output against extracted labels and positional PDF columns."""
    page_number = layout_page["page"]
    if not isinstance(result, dict) or result.get("schema_version") != 2:
        raise TextPdfValidationError(f"Page {page_number} validation failed: expected schema_version 2 JSON.")
    result_page = result.get("page", page_number)
    if result_page != page_number:
        raise TextPdfValidationError(f"Page {page_number} validation failed: the parser produced a different page number.")
    department_value = result.get("department")
    semester_value = result.get("semester")
    if not isinstance(department_value, str) or not isinstance(semester_value, (str, int)) or isinstance(semester_value, bool):
        raise TextPdfValidationError(f"Page {page_number} validation failed: department and semester have invalid types.")
    department = department_value.strip()
    semester = str(semester_value).strip()
    if not department or not semester:
        raise TextPdfValidationError(f"Page {page_number} validation failed: department and semester are required.")

    headers = layout_page["lecture_headers"]
    slots = result.get("lecture_slots")
    if not isinstance(slots, list) or len(slots) != len(headers):
        raise TextPdfValidationError(
            f"Page {page_number} validation failed: extracted {len(headers)} Lecture headers but the parser produced "
            f"{len(slots) if isinstance(slots, list) else 'no'} lecture slots."
        )
    clean_slots = []
    for index, (slot, header) in enumerate(zip(slots, headers), start=1):
        if not isinstance(slot, dict) or slot.get("lecture_num") != header["lecture_num"] or header["lecture_num"] != index:
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: lecture column {index} does not match its PDF header position."
            )
        start = _normalise_clock(slot.get("start_time"), page_number, "start_time")
        end = _normalise_clock(slot.get("end_time"), page_number, "end_time")
        start_minutes = int(start[:2]) * 60 + int(start[3:])
        end_minutes = int(end[:2]) * 60 + int(end[3:])
        if end_minutes <= start_minutes:
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: Lecture {index} end_time must follow start_time."
            )
        source_ranges = header.get("time_ranges", [])
        if source_ranges and not any(
            (_normalise_clock(source["start_time"], page_number, "PDF header start_time"),
             _normalise_clock(source["end_time"], page_number, "PDF header end_time")) == (start, end)
            for source in source_ranges
        ):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: Lecture {index} times do not match the PDF header."
            )
        clean_slots.append({
            "lecture_num": index,
            "start_time": start,
            "end_time": end,
        })

    rows_by_day = {
        day: {
            "day": day,
            "columns": [
                {"lecture_num": header["lecture_num"], "entries": []}
                for header in headers
            ],
        }
        for day in layout_page["weekday_labels"]
    }
    if "cell_results" in result:
        cell_inputs, _ = _page_cell_inputs(layout_page)
        cell_results = result.get("cell_results")
        if not isinstance(cell_results, list):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: cell_results must be an array."
            )
        received_cells = {}
        for cell_result in cell_results:
            if not isinstance(cell_result, dict):
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: each cell result must be an object."
                )
            cell_id = cell_result.get("cell_id")
            if not isinstance(cell_id, str) or cell_id not in cell_inputs:
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: the parser produced an unknown cell ID."
                )
            if cell_id in received_cells:
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: the parser produced duplicate cell ID {cell_id}."
                )
            day, lecture_num, source_words = cell_inputs[cell_id]
            entries = _clean_cell_entries(
                cell_result.get("entries"),
                day,
                lecture_num,
                page_number,
                [word[0] for word in source_words],
            )
            if source_words and not entries:
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: {day} Lecture {lecture_num} has extracted PDF text "
                    "but the parser produced no entries."
                )
            received_cells[cell_id] = entries

        for cell_id, (day, lecture_num, _) in cell_inputs.items():
            if cell_id not in received_cells:
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: missing {day} Lecture {lecture_num} cell result; "
                    "the Python timetable cell contains extracted PDF text."
                )
            column_index = next(
                index for index, header in enumerate(headers)
                if header["lecture_num"] == lecture_num
            )
            rows_by_day[day]["columns"][column_index]["entries"] = received_cells[cell_id]

        return {
            "page": page_number,
            "department": department,
            "semester": semester,
            "lecture_slots": clean_slots,
            "rows": [
                rows_by_day[day]
                for day in WEEKDAYS
                if day in rows_by_day
            ],
            "extracted_weekdays": layout_page["weekday_labels"],
        }

    cell_text = _cell_text_by_key(layout_page)
    headers_by_number = {header["lecture_num"]: header for header in headers}
    received_columns: dict[str, dict[int, list]] = {}
    rows = result.get("rows")
    if not isinstance(rows, list):
        raise TextPdfValidationError(f"Page {page_number} validation failed: rows must be an array.")
    for row in rows:
        if not isinstance(row, dict):
            raise TextPdfValidationError(f"Page {page_number} validation failed: each weekday row must be an object.")
        day = DAY_ALIASES.get(re.sub(r"[^A-Z]", "", str(row.get("day") or "").upper()))
        if not day or day not in layout_page["weekday_labels"]:
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: returned weekday {row.get('day')!r} is not an extracted PDF label."
            )
        if day in received_columns:
            raise TextPdfValidationError(f"Page {page_number} validation failed: duplicate {day} row.")
        columns = row.get("columns")
        if not isinstance(columns, list):
            raise TextPdfValidationError(
                f"Page {page_number} validation failed: {day} columns must be an array."
            )
        row_columns = {}
        for cell in columns:
            if not isinstance(cell, dict):
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: {day} columns must be objects."
                )
            lecture_num = cell.get("lecture_num")
            if (
                not isinstance(lecture_num, int)
                or isinstance(lecture_num, bool)
                or lecture_num not in headers_by_number
                or lecture_num in row_columns
            ):
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: {day} columns contain an invalid or duplicate "
                    "lecture number."
                )
            source_words = cell_text.get((day, lecture_num), []) if cell_text is not None else None
            entries = _clean_cell_entries(
                cell.get("entries"),
                day,
                lecture_num,
                page_number,
                source_words,
            )
            if source_words and not entries:
                raise TextPdfValidationError(
                    f"Page {page_number} validation failed: {day} Lecture {lecture_num} has extracted PDF text "
                    "but the parser produced no entries."
                )
            row_columns[lecture_num] = entries
        received_columns[day] = row_columns

    for day, row_columns in received_columns.items():
        for lecture_num, entries in row_columns.items():
            column_index = next(
                index for index, header in enumerate(headers)
                if header["lecture_num"] == lecture_num
            )
            rows_by_day[day]["columns"][column_index]["entries"] = entries

    if cell_text is not None:
        for day, row in rows_by_day.items():
            received_day = received_columns.get(day, {})
            for column in row["columns"]:
                lecture_num = column["lecture_num"]
                if (
                    cell_text.get((day, lecture_num))
                    and lecture_num not in received_day
                ):
                    raise TextPdfValidationError(
                        f"Page {page_number} validation failed: missing {day} Lecture {lecture_num} "
                        "column content; the Python timetable cell contains extracted PDF text."
                    )

    return {
        "page": page_number,
        "department": department,
        "semester": semester,
        "lecture_slots": clean_slots,
        "rows": [
            rows_by_day[day]
            for day in WEEKDAYS
            if day in rows_by_day
        ],
        "extracted_weekdays": layout_page["weekday_labels"],
    }

def aggregate_timetable_pages(page_results: list[dict]) -> dict:
    """Join page fragments by department/semester while preserving cell entries."""
    groups: dict[tuple[str, str], dict] = {}
    for page in page_results:
        group_key = (
            re.sub(r"\s+", " ", page["department"]).strip().casefold(),
            re.sub(r"\s+", " ", page["semester"]).strip().casefold(),
        )
        group = groups.setdefault(group_key, {
            "department": page["department"],
            "semester": page["semester"],
            "lecture_slots": page["lecture_slots"],
            "rows": {day: [{"entries": []} for _ in page["lecture_slots"]] for day in WEEKDAYS},
            "extracted_weekdays": set(),
            "pages": [],
        })
        if len(group["lecture_slots"]) != len(page["lecture_slots"]) or any(
            (left["start_time"], left["end_time"]) != (right["start_time"], right["end_time"])
            for left, right in zip(group["lecture_slots"], page["lecture_slots"])
        ):
            raise TextPdfValidationError(
                f"Page {page['page']} validation failed: Lecture header columns/times conflict with "
                f"page(s) {', '.join(map(str, group['pages']))} for {page['department']} semester {page['semester']}."
            )
        group["pages"].append(page["page"])
        group["extracted_weekdays"].update(page["extracted_weekdays"])
        for row in page["rows"]:
            for index, cell in enumerate(row["columns"]):
                destination = group["rows"][row["day"]][index]["entries"]
                destination.extend(cell["entries"])
                if len(destination) > 2:
                    raise TextPdfValidationError(
                        f"Page {page['page']} validation failed: {row['day']} Lecture {index + 1} "
                        "contains more than two entries across pages."
                    )

    if not groups:
        raise TextPdfValidationError("Timetable validation failed: no structured timetable pages were extracted.")
    final_pages = []
    for group in groups.values():
        missing = [day for day in WEEKDAYS if day not in group["extracted_weekdays"]]
        if missing:
            extracted = [day for day in WEEKDAYS if day in group["extracted_weekdays"]]
            raise TextPdfValidationError(
                f"Pages {', '.join(map(str, group['pages']))} validation failed: missing weekday(s) "
                f"{', '.join(missing)} for {group['department']} semester {group['semester']}; "
                f"extracted weekday(s): {', '.join(extracted) or 'none'}."
            )
        final_pages.append({
            "schema_version": 2,
            "page": group["pages"][0],
            "department": group["department"],
            "semester": group["semester"],
            "lecture_slots": group["lecture_slots"],
            "rows": [
                {"day": day, "columns": group["rows"][day]}
                for day in WEEKDAYS
            ],
        })
    return {"pages": final_pages, "failed_pages": []}

