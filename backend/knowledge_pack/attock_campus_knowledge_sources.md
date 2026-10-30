# Attock Campus Knowledge Pack — Source Notes

Compiled: 2026-10-24

## Important limitation

This is a **curated seed knowledge pack**, not a complete live scrape. The requested site `https://attock.comsats.edu.pk/` returned HTTP 403 in the available crawler environment. The pack uses publicly indexed pages on official COMSATS domains, especially Attock-specific legacy pages under `ww2.comsats.edu.pk/*_atk/`, plus official CUI publications. Refresh it when the official homepage is accessible.

## Recommended use

- Import the JSON `documents` array into the existing CampusAI knowledge pipeline after checking the current `comsats_knowledge.json` schema.
- Keep source URLs and freshness metadata with every chunk.
- Do not mix this static web pack with live Firestore timetable, teacher records, events, notices, emergencies, lost-and-found or schedule-mode records. Firestore remains the live source for those.
- Archived events are historical; they are not upcoming events.
- Confirm campus-specific availability before stating a university-wide program is offered in Attock.

## Source list

### Attock Campus overview and published statistics
- Category: `campus_overview`
- Scope: Attock Campus
- Source: [Undergraduate Prospectus 2025–26](https://ww2.comsats.edu.pk/ro/Prospectus/UG_Prospectus/Undergraduate-Prospectus-2025-26.pdf)
- Checked/indexed: 2026-10-24
- Freshness: `official_guide_2025_26`
- Note: Period-specific statistics; do not present as real-time data.

### Attock Campus location and general department contact
- Category: `contact`
- Scope: Attock Campus
- Source: [Department of Computer Science — Attock Campus](https://ww2.comsats.edu.pk/cs_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`
- Note: A different official contact directory lists 057-9049300 for the Computer Science HoD: https://ww2.comsats.edu.pk/LifeSkills/Contact. Contact details can change.

### University identity, recognition and semester system
- Category: `university_faq`
- Scope: CUI-wide
- Source: [CUI Admissions — Frequently Asked Questions](https://ww2.comsats.edu.pk/admissionoffice/faqs.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faq_page`
- Note: General university information, not Attock-specific. Verify calendar dates from a current official notice.

### CUI campus list
- Category: `university_faq`
- Scope: CUI-wide
- Source: [CUI Admissions — Frequently Asked Questions](https://ww2.comsats.edu.pk/admissionoffice/faqs.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faq_page`

### Rector of COMSATS University Islamabad
- Category: `leadership`
- Scope: CUI-wide
- Source: [Rector — COMSATS University Islamabad](https://islamabad.comsats.edu.pk/Website/rector-comsats)
- Checked/indexed: 2026-10-24
- Freshness: `official_central_leadership_page`
- Note: CUI-wide leadership page. This does not establish who holds any distinct Chancellor or President role.

### Departments listed on Attock campus department site
- Category: `departments`
- Scope: Attock Campus
- Source: [Department of Management Sciences — Attock Campus](https://ww2.comsats.edu.pk/ms_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`
- Note: The legacy departmental website links back to https://attock.comsats.edu.pk/. The new homepage returned 403 to the crawler, so this dataset uses accessible official legacy pages.

### Department of Computer Science: overview, programs and contact
- Category: `department`
- Scope: Attock Campus
- Source: [Department of Computer Science — Attock Campus](https://ww2.comsats.edu.pk/cs_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### Computer Science programs at Attock
- Category: `programs`
- Scope: Attock Campus
- Source: [Computer Science — Academic Programs, Attock](https://ww2.comsats.edu.pk/cs_atk/academic-programs.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_programs_page`

### Computer Science research groups
- Category: `research`
- Scope: Attock Campus
- Source: [Computer Science — Research Groups, Attock](https://ww2.comsats.edu.pk/cs_atk/research-groups.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_research_page`

### Department of Computer Engineering
- Category: `department`
- Scope: Attock Campus
- Source: [Department of Computer Engineering — Attock Campus](https://ww2.comsats.edu.pk/ce_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### Computer Engineering programs at Attock
- Category: `programs`
- Scope: Attock Campus
- Source: [Computer Engineering — Academic Programs, Attock](https://ww2.comsats.edu.pk/ce_atk/academic-programs.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_programs_page`

### Department of Electrical Engineering
- Category: `department`
- Scope: Attock Campus
- Source: [Department of Electrical Engineering — Attock Campus](https://ww2.comsats.edu.pk/ee_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`
- Note: Some address text on the source page appears inconsistent with the department heading; verify address before presenting it.

### Electrical Engineering programs at Attock
- Category: `programs`
- Scope: Attock Campus
- Source: [Electrical Engineering — Academic Programs, Attock](https://ww2.comsats.edu.pk/ee_atk/academic-programs.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_programs_page`

### Department of Mathematics overview and programs
- Category: `department`
- Scope: Attock Campus
- Source: [Department of Mathematics — Attock Campus](https://ww2.comsats.edu.pk/math_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### Mathematics research and subject areas
- Category: `research`
- Scope: Attock Campus
- Source: [Mathematics — About Us, Attock](https://ww2.comsats.edu.pk/math_atk/about-us.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### Department of Management Sciences overview and programs
- Category: `department`
- Scope: Attock Campus
- Source: [Department of Management Sciences — Attock Campus](https://ww2.comsats.edu.pk/ms_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`
- Note: The BS English listing under this page should be confirmed with admissions before giving definitive department ownership or admission advice.

### Management Sciences Attock contact
- Category: `contact`
- Scope: Attock Campus
- Source: [Management Sciences — Attock Campus contact](https://ww2.comsats.edu.pk/ms_atk/default.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### Humanities Department campus scope
- Category: `department`
- Scope: CUI-wide; Attock is included
- Source: [Humanities Department — Chairperson message](https://ww2.comsats.edu.pk/hum_vhr/message_from_chairperson.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_university_department_page`
- Note: The page is campus-wide and not an Attock-specific program availability list.

### Attock graduate admissions contact (Guide 2025–26)
- Category: `admissions_contact`
- Scope: Attock Campus
- Source: [Graduate Programs Admission Guide 2025–26](https://ww2.comsats.edu.pk/ro/Prospectus/GR_Prospectus/Graduate-Guide-2025-26.pdf)
- Checked/indexed: 2026-10-24
- Freshness: `official_guide_2025_26`
- Note: Published in the 2025–26 guide; verify before treating as current.

### Academic resources and CU Online
- Category: `student_resources`
- Scope: Attock Campus
- Source: [Management Sciences — Academic Resources, Attock](https://ww2.comsats.edu.pk/ms_atk/academic-resources.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### Humanities subject areas and programs (campus availability must be checked)
- Category: `programs`
- Scope: CUI-wide; Attock availability not established here
- Source: [Undergraduate Guide 2024–25](https://ww2.comsats.edu.pk/ro/Prospectus/UG_Prospectus/Undergraduate-Guide-2024-25.pdf)
- Checked/indexed: 2026-10-24
- Freshness: `official_guide_2024_25`
- Note: Older 2024–25 guide; not authoritative for current admissions.

### Historical event: Silver Jubilee at CUI Attock
- Category: `event_archive`
- Scope: Attock Campus
- Source: [CUI Events / Photo Gallery](https://ww2.comsats.edu.pk/photogallery/Events.aspx?page=3)
- Checked/indexed: 2026-10-24
- Freshness: `official_event_archive`
- Note: Archived historical event; not upcoming.

### Historical events listed by the Attock Mathematics department
- Category: `event_archive`
- Scope: Attock Campus
- Source: [Mathematics — Latest Events archive, Attock](https://ww2.comsats.edu.pk/math_atk/events.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_event_archive`
- Note: Archive entries from 2023–2024; do not present as upcoming.

### CUI-wide news: CWUR 2026 ranking announcement
- Category: `university_news`
- Scope: CUI-wide
- Source: [Quality Enhancement Cell — News](https://ww2.comsats.edu.pk/qec/news.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_university_news`
- Note: University-wide announcement; source is CUI QEC.

### CUI-wide news: Quality Enhancement Cell campus visits in May 2026
- Category: `university_news`
- Scope: CUI-wide including Attock
- Source: [Quality Enhancement Cell — News](https://ww2.comsats.edu.pk/qec/news.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_university_news`
- Note: Past activity; not an upcoming event.

### CUI-wide admissions notice: Fall 2026
- Category: `admissions_news`
- Scope: CUI-wide; Attock program availability requires confirmation
- Source: [COMSATS University Islamabad — News](https://islamabad.comsats.edu.pk/Website/comsats-news)
- Checked/indexed: 2026-10-24
- Freshness: `official_central_news_page`
- Note: University-wide page; verify Attock-specific program/intake before giving advice.

### Computer Engineering program accreditation statement
- Category: `accreditation`
- Scope: Attock Campus
- Source: [Computer Engineering — About Us, Attock](https://ww2.comsats.edu.pk/ce_atk/about-us.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`
- Note: Batch-specific accreditation details are not included in the retrieved text; verify current validity before advising.

### Computer Science head and research summary
- Category: `leadership`
- Scope: Attock Campus
- Source: [Computer Science — Head of Department message](https://ww2.comsats.edu.pk/cs_atk/head-of-the-department-message.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_department_page`

### How to answer questions about university leadership titles
- Category: `answering_guidance`
- Scope: CUI-wide
- Source: [Rector — COMSATS University Islamabad](https://islamabad.comsats.edu.pk/Website/rector-comsats)
- Checked/indexed: 2026-10-24
- Freshness: `official_central_leadership_page`

### Official Attock homepage access limitation for this collection
- Category: `source_access_note`
- Scope: Attock Campus
- Source: [Official Attock Campus website](https://attock.comsats.edu.pk/)
- Checked/indexed: 2026-10-24
- Freshness: `access_limitation`
- Note: Do not use this record as factual university content. It describes the dataset limitation.

## Additional faculty-directory source snapshots

### Computer Science faculty directory snapshot
- Category: `faculty_directory`
- Scope: Attock Campus
- Source: [Faculty Members — Computer Science, Attock](https://ww2.comsats.edu.pk/cs_atk/Faculty.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faculty_directory_snapshot`
- Note: Public staff directory snapshot checked/indexed 2026-10-24. Do not present as a guaranteed complete or current personnel list.

### Computer Engineering faculty directory snapshot
- Category: `faculty_directory`
- Scope: Attock Campus
- Source: [Faculty — Computer Engineering, Attock](https://ww2.comsats.edu.pk/ce_atk/Faculty.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faculty_directory_snapshot`
- Note: Public staff directory snapshot; verify current status from the official page.

### Electrical Engineering faculty directory snapshot
- Category: `faculty_directory`
- Scope: Attock Campus
- Source: [Faculty Members — Electrical Engineering, Attock](https://ww2.comsats.edu.pk/ee_atk/Faculty.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faculty_directory_snapshot`
- Note: Directory was indexed during 2026-10; faculty status can change. Only entries shown as On Duty were included.

### Mathematics faculty directory snapshot
- Category: `faculty_directory`
- Scope: Attock Campus
- Source: [Faculty Members — Mathematics, Attock](https://ww2.comsats.edu.pk/math_atk/Faculty.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faculty_directory_snapshot`
- Note: Public directory snapshot checked/indexed 2026-10-24; current timetables must come from Firebase.

### Management Sciences faculty directory snapshot
- Category: `faculty_directory`
- Scope: Attock Campus
- Source: [Faculty Members — Management Sciences, Attock](https://ww2.comsats.edu.pk/ms_atk/Faculty.aspx)
- Checked/indexed: 2026-10-24
- Freshness: `official_faculty_directory_snapshot`
- Note: Faculty directory result was older than the current department homepage. The HOD spelling differs between official pages; verify before answering definitively.

