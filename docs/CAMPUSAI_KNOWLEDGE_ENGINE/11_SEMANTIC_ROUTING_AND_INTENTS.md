# Routing and intents

Returned intents include: `general`, `off_topic`, `comsats_info`, `teacher`, `room`/`rooms`, `timetable`, `catalog`, `announcements`, `notifications`, `unavailable`, plus structured timetable objects with `type: schedule`.

Paraphrases: courses/subjects share unique-subject counts; class sections vs meetings are distinct; “how many classes” asks for clarification.

Social and bot identity skip retrieval. Unrelated whole-word topics refuse. Mixed messages keep the campus clause.
