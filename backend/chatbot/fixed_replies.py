"""Fixed reply texts the chatbot sends without asking the AI.

Moved out of answer_pipeline.py; the code is unchanged.
"""
from __future__ import annotations




REFUSAL = (
    "I can only help with COMSATS Attock campus questions, such as "
    "timetables, teachers, rooms, events, and official campus information."
)

INTRO = (
    "I'm CampusAI, the COMSATS Attock campus assistant. I can help with "
    "timetables, teachers, rooms, events, announcements, and official campus information."
)

CLARIFY = (
    "I'm not sure I understood that. I can help with COMSATS Attock campus questions, "
    "for example \"BCS-1 timetable on Monday\", \"Is LT 4 free now?\", "
    "\"Who teaches Data Structures?\" or \"How do I apply for admission?\""
)

_UNRELATED_NOTE ="I can only answer the university part of that. I won't answer the unrelated part."

CAMPUS_WEBSITE = "https://attock.comsats.edu.pk/"

NOT_IN_RECORDS = (
    "I don't have that in the current campus website records yet. "
    f"For the latest details, check the official campus website ({CAMPUS_WEBSITE}) "
    "or ask the relevant office on campus."
)

EXAM_NOT_PUBLISHED = (
    "Exams are not being held right now, and the exam schedule hasn't started yet. "
    "When exams are announced, the datesheet will show here. "
    "For updates, check your class notifications or ask your department office."
)

PRIVATE_RECORDS = (
    "I can't see personal academic records such as GPA, attendance, marks, roll number or fee "
    "challans. Please check the CUI student portal (CU Online) or ask your department office."
)
