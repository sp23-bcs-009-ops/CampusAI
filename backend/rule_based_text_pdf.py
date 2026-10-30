"""Python-only timetable parsing over PyMuPDF text and page geometry."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pymupdf

# Load backend/.env for the optional Firestore write. No key values are printed.
if __package__:
    from . import config as _backend_config  # noqa: F401
    from .teacher_matching import match_teacher_list_name, teacher_match_form
    from .text_pdf_layout import (
        DAY_ALIASES, WEEKDAYS, TextPdfValidationError, _lecture_column_bounds,
        _page_cell_inputs, _weekday_label_positions, _weekday_row_bounds,
        aggregate_timetable_pages, extract_pdf_layout, validate_page_result,
    )
    from .timetable_upload import (
        TimetableConversionError, convert_ocr_to_documents,
        normalize_department_semester, save_text_pdf_timetable_documents,
    )
else:
    import config as _backend_config  # noqa: F401
    from teacher_matching import match_teacher_list_name, teacher_match_form
    from text_pdf_layout import (
        DAY_ALIASES, WEEKDAYS, TextPdfValidationError, _lecture_column_bounds,
        _page_cell_inputs, _weekday_label_positions, _weekday_row_bounds,
        aggregate_timetable_pages, extract_pdf_layout, validate_page_result,
    )
    from timetable_upload import (
        TimetableConversionError, convert_ocr_to_documents,
        normalize_department_semester, save_text_pdf_timetable_documents,
    )


TEACHER_SEED = Path(__file__).resolve().parents[1] / "Frontend" / "src" / "data" / "teachers_seed.json"
ROOM_PATTERN = re.compile(
    r"(?<![A-Z0-9])((?:EE\s+)?C\.?\s*LAB(?:ORATORY)?|"
    r"LT|CR|LH|LAB|LECTURE\s+HALL|CLASS\s*ROOM|CLASSROOM)"
    r"\s*#?\s*(\d+[A-Z]?|\([A-Z0-9]{1,4}\))?",
    re.IGNORECASE,
)
GROUP_SUFFIX = re.compile(r"\(([A-Z0-9]{1,4})\)\s*$", re.IGNORECASE)
GROUP_WORD = re.compile(r"^(?:GROUP|GRP|G)[-:]?[A-Z0-9]{1,4}$", re.IGNORECASE)
IGNORED_CELL_TEXT = {"AS"}
TEACHER_TITLES = {"MR", "MRS", "MS", "MISS", "DR", "PROF", "PROFESSOR"}

# 固定仕様。表現を要約・翻訳・変更せず、解析条件の原文として保持する。
CELL_PATTERN_SPEC = """まず各コマには４パターンあって：
１．１つ目が普通のコマ。セル１個まるまる埋まってて、中には上から以下の順番で書かれてる：
&#x3000;　Subject name（真ん中上）←科目名。
&#x3000;　Teacher name（真ん中）←先生の名前。先生リストに記載されてる同名の名前が書いてある
&#x3000;　Class name（真ん中下）←授業が行われる教室の名前。

２．２つ目がセルが上半分か下半分、または上下に半々で別々のコマがある場合、配置は以下の通り：
Subject name（左上）
&#x3000;　　　　Teacher name（真ん中）
Group name（左下）　　Class name（右下）

３．３つ目が２つ目と似ているが、セル１個の中に細長いスプリットセルがあり、配置が：
Subject（左上）　　　Teacher（右上）
&#x3000;　　　　Class （下真ん中）

４．コマが２セル分使ってる場合、例えば月曜日のL1とL2で同じクラスの場合、L1とL2の間に線が入ってない場合。配置は：
&#x3000;　　　　L1　　　　　L2
&#x3000;　　Subject name（真ん中）
Class（左下）　　　　　Teacher（右下）

法則性としては太字が基本Subject name、その他の普通字がClass,Teacher,Groupのいずれか。
それ以外にも例えばASとしか書かれてないセルもあるがそれは無視で大丈夫。"""


def _normalise_text(value: str) -> str:
    return " ".join(re.findall(r"[A-Z0-9]+", str(value).upper()))


def _load_teacher_names(path: Path = TEACHER_SEED) -> list[str]:
    if not path.exists():
        # The directory is only an optional matching aid. PDF text and
        # positional layout remain sufficient for the AI-free parser.
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TextPdfValidationError("Local teacher list is not valid JSON.") from exc
    if not isinstance(payload, list):
        raise TextPdfValidationError("Local teacher list must be a JSON array.")
    names = [str(item.get("name", "")).strip() for item in payload if isinstance(item, dict)]
    unique_names = {}
    for name in names:
        key = teacher_match_form(name)
        if key:
            unique_names.setdefault(key, name)
    return sorted(unique_names.values(), key=lambda name: len(_normalise_text(name)), reverse=True)


def _font_spans(pdf_path: str) -> list[list[dict]]:
    """Read font attributes separately so the existing layout/split functions stay untouched."""
    output = []
    with pymupdf.open(pdf_path) as pdf:
        for page in pdf:
            spans = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = str(span.get("text", "")).strip()
                        if not text:
                            continue
                        font = str(span.get("font", ""))
                        flags = int(span.get("flags", 0))
                        spans.append({
                            "text": text,
                            "bbox": [float(value) for value in span["bbox"]],
                            "font": font,
                            "size": float(span.get("size", 0)),
                            "flags": flags,
                            "bold": bool(flags & 16 or re.search(r"bold|semibold|demi|black", font, re.I)),
                        })
            output.append(spans)
    return output


def _intersection_area(left: list[float], right: list[float]) -> float:
    return max(0.0, min(left[2], right[2]) - max(left[0], right[0])) * max(
        0.0, min(left[3], right[3]) - max(left[1], right[1])
    )


def _layout_cell_bounds(page: dict) -> dict[tuple[str, int], tuple[float, float, float, float]]:
    labels = _weekday_label_positions(page)
    row_bounds = _weekday_row_bounds(page, labels)
    day_centers = {day: (box[1] + box[3]) / 2 for day, box in labels.items()}
    headers = sorted(page["lecture_headers"], key=lambda item: item["x_center"])
    bounds = {}
    for day, (top, bottom) in row_bounds.items():
        columns = _lecture_column_bounds(page, headers, (top, bottom), day_centers[day])
        for lecture_num, left, right in columns:
            bounds[(day, lecture_num)] = (left, top, right, bottom)
    return bounds


def _cell_tokens(page: dict, page_spans: list[dict], cell_words: list[list]) -> list[dict]:
    tokens = []
    source_words = page.get("words", [])
    for text, x, y in cell_words:
        matching_words = [word for word in source_words if word["text"] == text]
        source_word = min(
            matching_words,
            key=lambda word: abs((word["bbox"][0] + word["bbox"][2]) / 2 - x)
            + abs((word["bbox"][1] + word["bbox"][3]) / 2 - y),
            default=None,
        )
        if source_word is None:
            bbox = [x - 1, y - 1, x + 1, y + 1]
        else:
            bbox = source_word["bbox"]
        span = max(page_spans, key=lambda item: _intersection_area(bbox, item["bbox"]), default=None)
        tokens.append({
            "text": text, "x": float(x), "y": float(y), "bbox": bbox,
            "font": span["font"] if span else "", "font_size": span["size"] if span else 0,
            "font_flags": span["flags"] if span else 0, "bold": bool(span and span["bold"]),
        })
    return sorted(tokens, key=lambda item: (item["y"], item["x"]))


def _group_lines(tokens: list[dict]) -> list[list[dict]]:
    lines: list[list[dict]] = []
    for token in sorted(tokens, key=lambda item: (item["y"], item["x"])):
        if not lines or abs(token["y"] - sum(word["y"] for word in lines[-1]) / len(lines[-1])) > 2.2:
            lines.append([token])
        else:
            lines[-1].append(token)
    return [sorted(line, key=lambda item: item["x"]) for line in lines]


def _subject_regions(tokens: list[dict], bounds: tuple[float, float, float, float], page: dict) -> list[list[dict]]:
    bold_tokens = [token for token in tokens if token["bold"]]
    if not bold_tokens:
        return []
    internal_rules = []
    left, top, right, bottom = bounds
    for rule in page.get("rules", []):
        if rule.get("type") != "line":
            continue
        x0, y0, x1, y1 = rule["coordinates"]
        if abs(y0 - y1) <= 1 and top < y0 < bottom:
            span_left, span_right = sorted((x0, x1))
            if span_left <= left + 2 and span_right >= right - 2:
                if min(token["y"] for token in tokens) < y0 < max(token["y"] for token in tokens):
                    internal_rules.append(y0)
    if internal_rules:
        cuts = sorted(set(internal_rules))
        segments = []
        edges = [min(token["y"] for token in tokens) - 1, *cuts, max(token["y"] for token in tokens) + 1]
        for upper, lower in zip(edges, edges[1:]):
            segment = [token for token in tokens if upper < token["y"] <= lower]
            if any(token["bold"] for token in segment):
                segments.append(segment)
        return segments

    bold_lines = _group_lines(bold_tokens)
    max_gap = max(5.5, 1.7 * max((token["font_size"] for token in bold_tokens), default=0))
    groups: list[list[dict]] = []
    for line in bold_lines:
        if not groups or min(token["y"] for token in line) - max(token["y"] for token in groups[-1]) > max_gap:
            groups.append(list(line))
        else:
            groups[-1].extend(line)
    if len(groups) <= 1:
        return [tokens]
    centers = [sum(token["y"] for token in group) / len(group) for group in groups]
    cuts = [(upper + lower) / 2 for upper, lower in zip(centers, centers[1:])]
    edges = [min(token["y"] for token in tokens) - 1, *cuts, max(token["y"] for token in tokens) + 1]
    return [
        [token for token in tokens if upper < token["y"] <= lower]
        for upper, lower in zip(edges, edges[1:])
    ]


def _parse_one_pattern(tokens: list[dict], bounds: tuple[float, float, float, float], teacher_names: list[str], *, split: bool = False) -> dict:
    left, top, right, bottom = bounds
    midpoint = (left + right) / 2
    subject_tokens = [token for token in tokens if token["bold"]]
    if not subject_tokens:
        raise TextPdfValidationError("A non-AS timetable cell has no bold Subject name.")
    subject = " ".join(token["text"] for token in sorted(subject_tokens, key=lambda item: (item["y"], item["x"]))).strip()
    subject_x = sum(token["x"] for token in subject_tokens) / len(subject_tokens)
    subject_y = sum(token["y"] for token in subject_tokens) / len(subject_tokens)

    width = right - left
    center_tolerance = max(10.0, width * 0.28)
    regular = [
        token for token in tokens
        if not token["bold"]
        and _normalise_text(token["text"]).replace(" ", "") not in TEACHER_TITLES
    ]
    lines = _group_lines(regular)

    def line_y(line: list[dict]) -> float:
        return sum(token["y"] for token in line) / len(line)

    def line_x(line: list[dict]) -> float:
        return sum(token["x"] for token in line) / len(line)

    def text_of(items: list[dict]) -> str:
        return " ".join(token["text"] for token in sorted(items, key=lambda item: (item["y"], item["x"]))).strip()

    def recognized_room(items: list[dict]) -> tuple[str, str]:
        # Apply room vocabulary only after the pattern has selected the Class
        # position. Unknown room text remains intact.
        match = ROOM_PATTERN.search(text_of(items))
        if not match:
            return text_of(items), ""
        value = " ".join(match.group(0).split())
        group_match = GROUP_SUFFIX.search(value)
        group_value = group_match.group(1) if group_match else ""
        if group_match:
            value = value[:group_match.start()].strip()
        return value, group_value

    def raw_teacher(items: list[dict]) -> str:
        value = text_of(items)
        return " ".join(
            piece for piece in value.split()
            if _normalise_text(piece).replace(" ", "") not in TEACHER_TITLES
        )

    same_row_tolerance = max(3.5, (subject_tokens[0]["font_size"] or 8) * 0.65)
    pattern_three = subject_x < midpoint and any(
        token["x"] > midpoint
        and abs(token["y"] - subject_y) <= same_row_tolerance
        for token in regular
    ) and any(
        line_y(line) > subject_y + same_row_tolerance
        and abs(line_x(line) - midpoint) <= center_tolerance
        for line in lines
    )

    teacher = ""
    room = ""
    group = ""
    lab_group = ""
    if pattern_three:
        # Pattern 3: Teacher is upper-right on the Subject row; Class is lower-center.
        teacher_tokens = [
            token for token in regular
            if token["x"] > midpoint and abs(token["y"] - subject_y) <= same_row_tolerance
        ]
        class_lines = [
            line for line in lines
            if line_y(line) > subject_y + same_row_tolerance
            and abs(line_x(line) - midpoint) <= center_tolerance
        ]
        class_line = max(class_lines, key=line_y, default=[])
        room, lab_group = recognized_room(class_line)
        teacher = match_teacher_list_name(raw_teacher(teacher_tokens), teacher_names)
        pattern_name = 3
    elif abs(subject_x - midpoint) <= max(8.0, width * 0.22):
        # Pattern 1: Subject upper-center, Teacher middle-center, Class lower-center.
        class_lines = [
            line for line in lines
            if line_y(line) > subject_y
            and abs(line_x(line) - midpoint) <= center_tolerance
        ]
        class_line = max(class_lines, key=line_y, default=[])
        room, lab_group = recognized_room(class_line)
        teacher_lines = [
            line for line in lines
            if line_y(line) > subject_y
            and (not class_line or line_y(line) < line_y(class_line) - 2.2)
            and abs(line_x(line) - midpoint) <= center_tolerance
        ]
        if teacher_lines and class_line:
            teacher_line = min(
                teacher_lines,
                key=lambda line: abs(line_y(line) - (subject_y + line_y(class_line)) / 2),
            )
            teacher = match_teacher_list_name(raw_teacher(teacher_line), teacher_names)
        pattern_name = 1
    elif subject_x < midpoint:
        # Pattern 2: Subject upper-left, Teacher middle-center, Group lower-left,
        # Class lower-right. The Class coordinate is selected before room-name matching.
        right_lines = [
            line for line in lines
            if line_y(line) > subject_y and any(token["x"] >= midpoint for token in line)
        ]
        class_line = max(
            right_lines,
            key=lambda line: max(token["y"] for token in line if token["x"] >= midpoint),
            default=[],
        )
        class_tokens = [token for token in class_line if token["x"] >= midpoint]
        class_y = sum(token["y"] for token in class_tokens) / len(class_tokens) if class_tokens else bottom
        teacher_lines = [
            line for line in lines
            if subject_y < line_y(line) < class_y - 2.2
            and abs(line_x(line) - midpoint) <= center_tolerance
        ]
        group_tokens = [
            token for token in regular
            if token["x"] < midpoint and token["y"] > subject_y
            and abs(token["y"] - class_y) <= max(3.5, (token["font_size"] or 8) * 0.65)
        ]
        if not class_tokens or not teacher_lines or not group_tokens:
            raise TextPdfValidationError("Cell does not match the fixed Cell pattern 2 positions.")
        room, lab_group = recognized_room(class_tokens)
        if teacher_lines:
            teacher_line = min(
                teacher_lines,
                key=lambda line: abs(line_y(line) - (subject_y + class_y) / 2),
            )
            teacher = match_teacher_list_name(raw_teacher(teacher_line), teacher_names)
            group = text_of(group_tokens)
        pattern_name = 2
    else:
        raise TextPdfValidationError("Cell does not match any of the fixed Cell pattern positions.")

    if not teacher or not room:
        raise TextPdfValidationError(f"Cell does not contain all positional fields required by fixed Cell pattern {pattern_name}.")
    if pattern_name == 2 and not group:
        raise TextPdfValidationError("Cell does not contain the lower-left Group position required by fixed Cell pattern 2.")

    return {
        "subject": subject,
        "teacher": teacher,
        "room": room,
        "is_lab": bool(re.search(r"lab", room, re.I)),
        "lab_group": group,
    }


def _has_vertical_divider(page: dict, day: str, x: float, bounds: tuple[float, float, float, float]) -> bool:
    _, top, _, bottom = bounds
    return any(
        rule.get("type") == "line"
        and abs(rule["coordinates"][0] - rule["coordinates"][2]) <= 1
        and abs(rule["coordinates"][0] - x) <= 2
        and min(rule["coordinates"][1], rule["coordinates"][3]) <= top + 1
        and max(rule["coordinates"][1], rule["coordinates"][3]) >= bottom - 1
        for rule in page.get("rules", [])
    )


def _parse_spanning_pair(left_tokens: list[dict], right_tokens: list[dict], left_bounds, right_bounds, teacher_names):
    tokens = sorted(left_tokens + right_tokens, key=lambda item: (item["y"], item["x"]))
    bold = [token for token in tokens if token["bold"]]
    if not bold:
        return None
    union_bounds = (left_bounds[0], left_bounds[1], right_bounds[2], max(left_bounds[3], right_bounds[3]))
    midpoint = (union_bounds[0] + union_bounds[2]) / 2
    subject_x = sum(token["x"] for token in bold) / len(bold)
    if abs(subject_x - midpoint) > (union_bounds[2] - union_bounds[0]) * 0.16:
        return None
    subject_bottom = max(token["y"] for token in bold)
    regular = [token for token in tokens if not token["bold"] and token["y"] > subject_bottom]
    # Pattern 4 assigns roles by its fixed lower-left/lower-right positions
    # before checking any known room or teacher vocabulary.
    class_tokens = [token for token in regular if token["x"] < midpoint]
    teacher_tokens = [token for token in regular if token["x"] > midpoint]
    if not class_tokens or not teacher_tokens:
        return None
    room_text = " ".join(token["text"] for token in sorted(class_tokens, key=lambda item: (item["y"], item["x"])))
    room_match = ROOM_PATTERN.search(room_text)
    room = " ".join(room_match.group(0).split()) if room_match else room_text.strip()
    lab_group = ""
    group_match = GROUP_SUFFIX.search(room)
    if group_match:
        lab_group = group_match.group(1)
        room = room[:group_match.start()].strip()
    teacher_text = " ".join(token["text"] for token in sorted(teacher_tokens, key=lambda item: (item["y"], item["x"])))
    teacher = " ".join(
        piece for piece in teacher_text.split()
        if _normalise_text(piece).replace(" ", "") not in TEACHER_TITLES
    )
    teacher = match_teacher_list_name(teacher, teacher_names)
    assigned_ids = {id(token) for token in class_tokens + teacher_tokens + bold}
    assigned_ids.update(
        id(token) for token in tokens
        if _normalise_text(token["text"]).replace(" ", "") in TEACHER_TITLES
    )
    if any(id(token) not in assigned_ids for token in tokens):
        return None
    subject = " ".join(token["text"] for token in bold)
    entry = {
        "subject": subject,
        "teacher": teacher,
        "room": room,
        "is_lab": bool(re.search(r"lab", room, re.I)),
        "lab_group": lab_group or "",
    }
    return entry


def _ignore_as_cells(layout_page: dict) -> dict:
    """Create a validation-only view with AS-only cells removed after splitting."""
    result = copy.deepcopy(layout_page)
    for line in result.get("lines", []):
        line["words"] = [word for word in line.get("words", []) if _normalise_text(word["text"]) not in IGNORED_CELL_TEXT]
        line["text"] = " ".join(word["text"] for word in line["words"])
        if line["words"]:
            line["bbox"] = [
                min(word["bbox"][0] for word in line["words"]),
                min(word["bbox"][1] for word in line["words"]),
                max(word["bbox"][2] for word in line["words"]),
                max(word["bbox"][3] for word in line["words"]),
            ]
    result["text"] = "\n".join(line["text"] for line in result.get("lines", []))
    result["weekday_labels"] = [day for day in WEEKDAYS if re.search(
        rf"(?<![A-Za-z])(?:{ '|'.join(alias for alias, canonical in DAY_ALIASES.items() if canonical == day) })(?![A-Za-z])",
        result["text"], re.I,
    )]
    return result


def _department_semester(layout_page: dict, context_words: list) -> tuple[str, str]:
    y_groups: list[list[list]] = []
    for word in sorted(context_words, key=lambda item: item[2]):
        if not y_groups or abs(word[2] - sum(item[2] for item in y_groups[-1]) / len(y_groups[-1])) > 3:
            y_groups.append([word])
        else:
            y_groups[-1].append(word)
    candidates = []
    for line in y_groups:
        text = " ".join(item[0] for item in sorted(line, key=lambda item: item[1]))
        # Parse complete extracted layout lines. Enumerating every substring
        # can manufacture several plausible labels from a single PDF header.
        parsed = normalize_department_semester({"semester": text.strip(" ,:;|")})
        if parsed:
            candidates.append(parsed)
    candidates = sorted(set(candidates))
    if len(candidates) != 1:
        raise TextPdfValidationError(
            f"Page {layout_page['page']} must contain exactly one explicit department/semester label; found {len(candidates)}."
        )
    department, semester = candidates[0]
    return department.upper(), str(semester)


def _lecture_slots(layout_page: dict) -> list[dict]:
    slots = []
    for header in layout_page["lecture_headers"]:
        ranges = {
            (str(item["start_time"]).strip(), str(item["end_time"]).strip())
            for item in header.get("time_ranges", [])
        }
        if len(ranges) != 1:
            raise TextPdfValidationError(
                f"Page {layout_page['page']} Lecture {header['lecture_num']} needs one explicit PDF time range."
            )
        start, end = next(iter(ranges))
        slots.append({"lecture_num": header["lecture_num"], "start_time": start, "end_time": end})
    return slots


def _python_page_result(layout_page: dict, page_spans: list[dict], teacher_names: list[str]) -> dict:
    validation_page = _ignore_as_cells(layout_page)
    base_cells, _ = _page_cell_inputs(validation_page)
    original_cells, _ = _page_cell_inputs(layout_page)
    original_tokens_by_position = {
        (day, lecture): _cell_tokens(layout_page, page_spans, words)
        for _, (day, lecture, words) in original_cells.items()
        if not all(_normalise_text(item[0]) in IGNORED_CELL_TEXT for item in words)
    }
    base_by_position = {(day, lecture): cell_id for cell_id, (day, lecture, _) in base_cells.items()}
    base_tokens_by_position = {}
    for position, cell_id in base_by_position.items():
        words = base_cells[cell_id][2]
        if not all(_normalise_text(item[0]) in IGNORED_CELL_TEXT for item in words):
            base_tokens_by_position[position] = _cell_tokens(validation_page, page_spans, words)
    bounds = _layout_cell_bounds(layout_page)
    headers = sorted(layout_page["lecture_headers"], key=lambda item: item["x_center"])
    spanning_entries: dict[tuple[str, int], dict] = {}
    synthetic_dividers = []

    # Fixed Cell pattern 4: recognize it from the untouched split output. When
    # the existing splitter's geometric ranges overlap because the divider is
    # absent, add that already-implied boundary only to the validation copy.
    for day in validation_page["weekday_labels"]:
        for left_header, right_header in zip(headers, headers[1:]):
            left_key = (day, left_header["lecture_num"])
            right_key = (day, right_header["lecture_num"])
            if left_key in spanning_entries or right_key in spanning_entries:
                continue
            left_bounds, right_bounds = bounds.get(left_key), bounds.get(right_key)
            if not left_bounds or not right_bounds:
                continue
            divider_x = (left_header["x_center"] + right_header["x_center"]) / 2
            if _has_vertical_divider(layout_page, day, divider_x, left_bounds):
                continue
            all_tokens = base_tokens_by_position.get(left_key, []) + base_tokens_by_position.get(right_key, [])
            left_tokens = [token for token in all_tokens if token["x"] <= divider_x]
            right_tokens = [token for token in all_tokens if token["x"] > divider_x]
            entry = _parse_spanning_pair(
                left_tokens, right_tokens,
                left_bounds, right_bounds, teacher_names,
            )
            if entry:
                spanning_entries[left_key] = entry
                spanning_entries[right_key] = dict(entry)
                top, bottom = left_bounds[1], left_bounds[3]
                synthetic_dividers.append({
                    "type": "line",
                    "coordinates": [divider_x, top, divider_x, bottom],
                    "rule_parser_synthetic": True,
                })

    validation_page["rules"].extend(synthetic_dividers)
    cells, context_words = _page_cell_inputs(validation_page)
    bounds = _layout_cell_bounds(validation_page)
    cells_by_position = {(day, lecture): cell_id for cell_id, (day, lecture, _) in cells.items()}
    tokens_by_id = {
        cell_id: _cell_tokens(validation_page, page_spans, words)
        for cell_id, (_, _, words) in cells.items()
    }
    cell_results: dict[str, list[dict]] = {cell_id: [] for cell_id in cells}
    pending_edit_cells = []

    def mark_pending(cell_id: str, day: str, lecture_num: int, tokens: list[dict], reason: str) -> None:
        pending_edit_cells.append({
            "page": layout_page["page"],
            "day": day,
            "lecture_num": lecture_num,
            "cell_id": cell_id,
            "status": "pending_edit",
            "reason": reason,
            "source_text": " ".join(token["text"] for token in tokens).strip(),
            "source_words": [token["text"] for token in tokens],
            "bbox": [
                min(token["bbox"][0] for token in tokens),
                min(token["bbox"][1] for token in tokens),
                max(token["bbox"][2] for token in tokens),
                max(token["bbox"][3] for token in tokens),
            ] if tokens else None,
        })

    for cell_id, (day, lecture_num, _) in cells.items():
        position = (day, lecture_num)
        if position in spanning_entries:
            cell_results[cell_id].append(dict(spanning_entries[position]))
            continue
        tokens = tokens_by_id.get(cell_id, [])
        if not tokens:
            continue
        cell_bounds = bounds.get((day, lecture_num))
        if not cell_bounds:
            raise TextPdfValidationError(f"Page {layout_page['page']} {day} Lecture {lecture_num} has no layout bounds.")
        regions = _subject_regions(tokens, cell_bounds, layout_page)
        if not regions or len(regions) > 2:
            reason = "Cell has no recognized fixed-pattern split." if not regions else (
                f"Cell contains {len(regions)} split parts; existing schema supports at most two entries per cell."
            )
            mark_pending(cell_id, day, lecture_num, tokens, reason)
            cell_results[cell_id] = [{
                "subject": " ".join(token["text"] for token in tokens).strip(),
                "teacher": "",
                "room": "",
                "is_lab": False,
                "lab_group": "",
            }]
            continue
        split = len(regions) == 2
        try:
            parsed = [_parse_one_pattern(region, cell_bounds, teacher_names, split=split) for region in regions]
        except TextPdfValidationError as exc:
            mark_pending(cell_id, day, lecture_num, tokens, str(exc))
            cell_results[cell_id] = [{
                "subject": " ".join(token["text"] for token in tokens).strip(),
                "teacher": "",
                "room": "",
                "is_lab": False,
                "lab_group": "",
            }]
            continue
        if split and len(parsed) != 2:
            raise TextPdfValidationError("Split cell must produce two separate entries.")
        cell_results[cell_id].extend(parsed)

    department, semester = _department_semester(layout_page, context_words)
    raw = {
        "schema_version": 2,
        "page": layout_page["page"],
        "department": department,
        "semester": semester,
        "lecture_slots": _lecture_slots(layout_page),
        "cell_results": [
            {"cell_id": cell_id, "entries": entries}
            for cell_id, entries in cell_results.items()
        ],
    }
    validated = validate_page_result(raw, validation_page)
    # The temporary source-text entries above exist only to satisfy the legacy
    # source-cell structural validator. They are removed before conversion;
    # pending cells remain blank until a staff member edits them.
    cell_positions = {
        cell_id: (day, lecture)
        for cell_id, (day, lecture, _) in cells.items()
    }
    for pending in pending_edit_cells:
        day, lecture = cell_positions[pending["cell_id"]]
        row = next(item for item in validated["rows"] if item["day"] == day)
        column = next(item for item in row["columns"] if item["lecture_num"] == lecture)
        column["entries"] = []
        pending["department"] = validated["department"]
        pending["semester"] = validated["semester"]
    validated["pending_edit_cells"] = pending_edit_cells
    return validated


def process_rule_based_pdf(
    pdf_path: str,
    teacher_list_path: str | Path = TEACHER_SEED,
    *,
    version: str = "current",
    effective_date: str = "",
    uploaded_by: str = "local-upload",
    schedule_mode: str = "regular",
) -> tuple[dict, dict, list[str], str]:
    source = Path(pdf_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"PDF path does not exist: {source}")
    payload_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    layout_pages = extract_pdf_layout(str(source))
    span_pages = _font_spans(str(source))
    if len(layout_pages) != len(span_pages):
        raise TextPdfValidationError("PyMuPDF layout/font page counts differ.")

    process_indices = []
    for index, page in enumerate(layout_pages):
        has_timetable_labels = bool(page.get("weekday_labels") or page.get("lecture_headers"))
        if has_timetable_labels:
            if not page.get("useful_timetable_text"):
                raise TextPdfValidationError(
                    f"Page {page['page']} contains timetable labels but does not meet the existing useful-text checks."
                )
            process_indices.append(index)
    if not process_indices:
        raise TextPdfValidationError("PDF contains no timetable pages with weekday and lecture headers.")

    teachers = _load_teacher_names(Path(teacher_list_path))
    validated_pages = [
        _python_page_result(layout_pages[index], span_pages[index], teachers)
        for index in process_indices
    ]
    aggregated = aggregate_timetable_pages(validated_pages)
    pending_edit_cells = [
        pending
        for page in validated_pages
        for pending in page.get("pending_edit_cells", [])
    ]
    aggregated["pending_edit_cells"] = pending_edit_cells
    documents, warnings = convert_ocr_to_documents(
        aggregated,
        version=version,
        effective_date=effective_date,
        uploaded_by=uploaded_by,
        schedule_mode=schedule_mode,
        teacher_names=teachers,
    )
    for document in documents.values():
        document_group = (
            str(document.get("dept", "")).casefold(),
            str(document.get("semester", "")),
        )
        document["pendingEditCells"] = json.dumps([
            pending for pending in pending_edit_cells
            if (str(pending.get("department", "")).casefold(), str(pending.get("semester", ""))) == document_group
        ], ensure_ascii=False)
    return aggregated, documents, warnings, payload_hash


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parse a Text PDF timetable using Python layout rules.")
    parser.add_argument("pdf_path", help="Path to an existing text-layer timetable PDF")
    parser.add_argument("--teacher-list", default=str(TEACHER_SEED), help="Local JSON array of teacher records with a name field")
    parser.add_argument("--version", default="current")
    parser.add_argument("--effective-date", default="")
    parser.add_argument("--uploaded-by", default="local-upload")
    parser.add_argument("--schedule-mode", choices=("regular", "exam"), default="regular")
    parser.add_argument("--save-firestore", action="store_true", help="Write to text_pdf_timetables")
    parser.add_argument("--output", help="Optional path for the generated schema JSON")
    args = parser.parse_args(argv)
    try:
        timetable, documents, warnings, source_hash = process_rule_based_pdf(
            args.pdf_path,
            args.teacher_list,
            version=args.version,
            effective_date=args.effective_date,
            uploaded_by=args.uploaded_by,
            schedule_mode=args.schedule_mode,
        )
        if args.output:
            Path(args.output).expanduser().resolve().write_text(
                json.dumps(timetable, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        if args.save_firestore:
            save_text_pdf_timetable_documents(
                documents,
                active_document_ids=list(documents),
                source_hash=source_hash,
                schedule_mode=args.schedule_mode,
            )
        print(json.dumps({
            "success": True,
            "ai_used": False,
            "firestore_saved": bool(args.save_firestore),
            "collection": "text_pdf_timetables" if args.save_firestore else None,
            "document_ids": sorted(documents),
            "warnings": warnings,
            "output": str(Path(args.output).expanduser().resolve()) if args.output else None,
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
