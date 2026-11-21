"""Spot COMSATS / campus-information questions.

The old website scraper and its cached JSON were removed: campus answers now
come from the approved knowledge pack (knowledge_pack.py). Only the question
check below is still used, by pipeline.py and timetable_service.py.
"""
import re

COMSATS_KEYWORDS = [
    "comsats", "cui", "university", "campus", "campuses", "admission",
    "admissions", "program", "programs", "fee", "fees", "faculty",
    "faculties", "department", "departments", "research", "oric",
    "rector", "registrar", "islamabad", "attock", "lahore", "wah",
    "abbottabad", "sahiwal", "vehari", "virtual", "notice", "notices",
    "job", "jobs", "hiring", "auction",
]


def is_comsats_question(text):
    t = (text or "").lower()
    words = set(re.findall(r"[a-z0-9]+", t))
    if "comsats" in words or "cui" in words:
        return True
    return any(k in words for k in COMSATS_KEYWORDS if " " not in k)
