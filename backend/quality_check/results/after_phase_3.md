# Golden questions: after_phase_3

Server: http://localhost:8001

## Timetable from Firebase

**Q:** Show me the timetable for BCS-1 on Monday  
*expect:* answer · *intent:* timetable · *6.6s*

> 📅 BS(CS)-I — Monday
> • 11:30–13:15  AoIaCT (Lab) — Muhammad Fawad, Lab
> • 13:35–15:00  PF(Lab) — Bukhari Maryam, Lab2
> • 15:00–16:30  PF(Lab) — Bukhari Maryam, Lab2

**Q:** what about Tuesday?  
*expect:* answer · *intent:* timetable · *0.0s*

> 📅 BS(CS)-I — Tuesday
> • 10:00–11:30  Programming Fundamentals — Umar Zia, LT8
> • 11:30–13:15  Fundamentals of Psychology — Hamid Masood, LH 4

**Q:** who teaches the first class?  
*expect:* answer · *intent:* timetable · *0.0s*

> The first class is Programming Fundamentals at 10:00-11:30 with Umar Zia in LT8.

**Q:** bcs 3 classes tomorrow  
*expect:* answer · *intent:* timetable · *0.0s*

> BS(CS)-III has no classes on Saturday.

## Teachers and rooms from Firebase

**Q:** Is Muhammad Fawad free on Monday?  
*expect:* answer · *intent:* teacher · *0.0s*

> 👨‍🏫 Muhammad Fawad
> Monday
> Free: 08:30–10:00, 10:00–11:30, 13:35–15:00, 15:00–16:30
> Busy: 11:30–13:15 (BS(CS)-I, Lab, AoIaCT (Lab))

**Q:** which teachers are free right now?  
*expect:* answer · *intent:* teacher · *0.0s*

> There is no class slot running right now, so every teacher is free of timetabled classes.

**Q:** which rooms are free on friday morning?  
*expect:* answer · *intent:* rooms_all · *0.0s*

> 📍 Free rooms
> • APL: 11:30–13:15
> • CR 1: 08:30–10:00
> • CR 2: 08:30–10:00, 10:00–11:30
> • CR 5: 11:30–13:15
> • EE C.Lab: 11:30–13:15
> • EL: 08:30–10:00, 10:00–11:30, 11:30–13:15
> • LH 2: 08:30–10:00
> • LH 5: 08:30–10:00
> • LH 6: 10:00–11:30, 11:30–13:15
> • LT1: 10:00–11:30
> • LT3: 10:00–11:30
> • LT4: 10:00–11:30
> • LT5: 10:00–11:30
> • LT6: 08:30–10:00, 10:00–11:30
> • LT9: 08:30–10:00, 10:00–11:30
> • Lab1: 08:30–10:00, 11:30–13:15
> • Lab2: 10:00–11:30
> • Lab3: 11:30–13:15
> • Lab4: 11:30–13:15
> • Lab5: 11:30–13:15

**Q:** Is LT 4 free now?  
*expect:* answer · *intent:* room · *0.0s*

> Yes, LT4 is free right now. It's next booked at 08:30–10:00.

**Q:** Where is the location of CR 2?  
*expect:* answer · *intent:* room · *0.0s*

> 📍 Room CR 2
> 
> Monday
> Free: 08:30–10:00
> Busy: 10:00–11:30 (BS(AI)-V, Atta Ullah, Statistics and Probability Theory); 11:30–13:15 (BS(CS)-III, Atta Ur Rehman, Fundamentals of Digital Logic Design); 13:35–15:00 (BS(SE)-III, Ali Imran, Calculus and Analytic Geometry); 15:00–16:30 (BS(BA)-I, BS(BA)-II, BS(BDA)-II, Tasneem Fiza, Tasneem Fiza, Tasneem Fiza, Functional English, Functional English, Functional English)
> 
> Tuesday
> Free: 08:30–10:00, 15:00–16:30
> Busy: 10:00–11:30 (BS(SE)-VIII, Ehtisham Mujeeb, Human Resource Management); 11:30–13:15 (BS(CS)-II, Narmeen Khalid, Introduction to Entrepreneurship); 13:35–15:00 (BS(BA)-VI, Ehtisham Mujeeb, NPD)
> 
> Wednesday
> Free: 10:00–11:30, 15:00–16:30
> Busy: 08:30–10:00 (BS(CS)-VI, Atta Ullah, Statistics and Probability Theory); 11:30–13:15 (BS(AI)-I, Sameen Khalid, Civics and Community Engagement); 13:35–15:00 (BS(BA)-II, BS(BA)-VII, BS(BDA)-III, Midrar Ullah, Midrar Ullah, Midrar Ullah, Introduction to Management, Introduction to Management, Introduction to Management)
> 
> Thursday
> Free: 10:00–11:30, 15:00–16:30
> Busy: 08:30–10:00 (BS(English)-V, BS(English)-VI, BS(English)-VII, M Imran Malik, M Imran Malik, M Imran Malik, Current Affairs, Current Affairs, Current Affairs); 11:30–13:15 (BS(SE)-I, Hamid Masood, Fundamentals of Psychology); 13:35–15:00 (BS(A&F)-II, BS(BA)-II, BS(BA)-IV, Noor Muhammad, Noor Muhammad, Noor Muhammad, Tools of Quantitative Reasoning, Tools of Quantitative Reasoning, Tools of Quantitative Reasoning)
> 
> Friday
> Free: 08:30–10:00, 10:00–11:30, 13:35–15:00, 15:00–16:30
> Busy: 11:30–13:15 (BS(SE)-II, Muhammad Zeb, Applied Physics)
> 
> Saturday
> Free: 08:30–10:00, 10:00–11:30, 11:30–13:15, 13:35–15:00, 15:00–16:30

## Events, notices, lost and found from Firebase

**Q:** any events this week?  
*expect:* answer · *intent:* events · *1.9s*

> 🎉 Upcoming events
> • SHOGRAN Nature's Paradise — 28 November 2026, COMSATS University Islamabad
>   You must enjoy!
> • Visio Spark 2026 — 28 November 2026, CUI Wah Campus
>   VisioSpark 2026 | Applications Open 📅 Date: Saturday, 28 November 2026 📍 Venue: COMSATS Wah Campus ✅ Registration Fee: FREE 🚌 Transport: Wi…

**Q:** are there any emergency announcements?  
*expect:* answer · *intent:* announcements · *0.6s*

> ⚠️ Short circuit in Lab CS3 (critical) — 15 September 2026
> No one except the relevant authority should enter or get near to the Lab CS3. We will further send disseminate this to the whole university.

**Q:** I lost my calculator, has anyone found one?  
*expect:* answer · *intent:* lostfound · *3.1s*

> I couldn't find any open lost-and-found posts matching "calculator one". You can post it in the app's Lost & Found section so others can reply.

**Q:** show notifications for BCS-1  
*expect:* answer · *intent:* notifications · *0.6s*

> There are no published class notifications right now.

## Exams

**Q:** when are the BCS-1 exams?  
*expect:* answer · *intent:* exams · *0.0s*

> The exam datesheet isn't published in CampusAI yet, because the timetable is in Regular Mode. Exam dates will show here as soon as staff switch on Exam Mode. Until then, check your class notifications or ask your department office.

**Q:** I missed my paper yesterday, what should I do?  
*expect:* answer · *intent:* general · *2.6s*

> I’m sorry you missed it. The best next step is to reach out to your course instructor or the department office right away to see if a make-up or alternative arrangement is possible. You can also check any announcements on the campus portal for guidance. Good luck!

**Q:** I am stressed about midterms  
*expect:* answer · *intent:* general · *1.1s*

> I’m sorry you’re feeling stressed—midterms can be overwhelming. Try breaking your study material into small, timed chunks and take short breaks to keep your mind fresh. A quick walk, some deep breaths, or chatting with a friend can also help reset your focus. Good luck, you’ve got this!

## Campus website information

**Q:** How do I apply for admission?  
*expect:* answer · *intent:* comsats_info · *2.0s*

> You can start your application by contacting the Attock admissions office.
> 
> • Reach out to Mr Muhammad Javed, In-Charge Admissions and Student Affairs.
> • Call 057-9049159 or 0315-5504184.
> • Email ic_admissions@cuiatk.edu.pk.
> • Consult the Graduate Admission Guide 2025-26 for the step-by-step procedure.
> • Confirm the contact details and any updated requirements on the current Attock admissions page before applying.
> 
> Source: https://ww2.comsats.edu.pk/ro/Prospectus/GR_Prospectus/Graduate-Guide-2025-26.pdf

**Q:** how can I get into COMSATS Attock?  
*expect:* answer · *intent:* comsats_info · *1.9s*

> You can apply to COMSATS Attock by following the university’s admission process.
> 
> • Review the official admission FAQ for eligibility, required documents and application deadlines.
> • Note the semester system (Spring Feb-Jun, Fall Sep-Jan) to plan your start term.
> • Verify that Attock is listed as a campus and check program availability (e.g., Computer Engineering).
> • For Computer Engineering, contact the department at +92-57-9049273 for program details.
> • Submit your application through the online portal indicated in the FAQ and upload the required documents.
> 
> Source: https://ww2.comsats.edu.pk/admissionoffice/faqs.aspx

**Q:** which departments are there at Attock campus?  
*expect:* answer · *intent:* comsats_info · *1.5s*

> The Attock campus lists the following main departments:
> 
> • Computer Science
> • Electrical Engineering
> • Computer Engineering
> • Management Sciences
> • Mathematics
> 
> A university-wide Humanities department also has a presence across all CUI campuses, including Attock, but specific Attock-based programs have not been confirmed in the campus prospectus.
> 
> Source: https://ww2.comsats.edu.pk/ms_atk/default.aspx

**Q:** who is the rector?  
*expect:* answer · *intent:* comsats_info · *2.4s*

> The current Rector of COMSATS University Islamabad is Prof. Dr. Raheel Qamar, T.I.
> 
> • He serves as Rector for the entire COMSATS University system.
> • This information is shown on the official central leadership page (indexed 2026-10-24).
> • The Rector role is distinct from Chancellor or campus In-Charge positions.
> 
> Source: https://islamabad.comsats.edu.pk/Website/rector-comsats

**Q:** Where is the library?  
*expect:* answer · *intent:* comsats_info · *0.0s*

> I don't have that in the current campus website records yet. For the latest details, check the official campus website (https://attock.comsats.edu.pk/) or ask the relevant office on campus.

**Q:** what are the bus timings?  
*expect:* answer · *intent:* comsats_info · *8.0s*

> I’m sorry, the current records don’t include bus timing information.
> 
> • You can check the Attock campus website for transportation details.
> • The Management Sciences department page is the closest available link from the records.
> • If bus schedules aren’t listed there, the main campus site should have the latest updates.
> 
> Source: https://ww2.comsats.edu.pk/ms_atk/default.aspx

**Q:** what is the fee structure?  
*expect:* answer · *intent:* comsats_info · *0.0s*

> I don't have that in the current campus website records yet. For the latest details, check the official campus website (https://attock.comsats.edu.pk/) or ask the relevant office on campus.

**Q:** what is the minimum CGPA to avoid probation?  
*expect:* answer · *intent:* general · *10.1s*

> I’m not sure of the exact CGPA requirement. Please check with your department office or look at the official COMSATS Attock website for the current academic regulations.

## Conversation and feelings

**Q:** hi  
*expect:* answer · *intent:* general · *0.8s*

> Hey there! How can I help you with anything about COMSATS Attock—timetables, rooms, exams, events, or anything else on campus?

**Q:** who are you?  
*expect:* answer · *intent:* general · *0.0s*

> I'm CampusAI, the COMSATS Attock campus assistant. I can help with timetables, teachers, rooms, events, announcements, and official campus information.

**Q:** can you help me with something?  
*expect:* answer · *intent:* general · *0.0s*

> Here's what I can do:
> • Class timetables: "BCS-1 Monday"
> • Teachers: "is Aamir Ali free today?"
> • Rooms: "free rooms at 10am Wednesday"
> • Events, announcements, lost & found
> • COMSATS information: admissions, departments, programs
> Sign in with your university account to get your own timetable.

**Q:** I feel sad today  
*expect:* answer · *intent:* general · *7.2s*

> I’m really sorry you’re feeling down. It might help to take a short break, grab a cup of tea, and maybe chat with a friend or a mentor. If you’d like, you can reach out to the counseling services through your department office or check the campus website for support resources. Let me know if there’s anything specific I can do for you.

**Q:** thanks a lot  
*expect:* answer · *intent:* general · *5.0s*

> You’re welcome! If you need anything else about COMSATS Attock, just let me know.

## Personal questions as a guest

**Q:** what are my classes today?  
*expect:* answer · *intent:* general · *0.0s*

> Guest mode does not have a personal timetable. Sign in with your university account to see your own classes, or tell me the class, for example BCS-1.

**Q:** what is my CGPA?  
*expect:* answer · *intent:* private_records · *0.0s*

> I can't see personal academic records such as GPA, attendance, marks, roll number or fee challans. Please check the CUI student portal (CU Online) or ask your department office.

## Unrelated topics

**Q:** tell me a movie name  
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** who won the cricket world cup?  
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** what is the capital of France?  
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** tell me a joke  
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** write python code to reverse a string  
*expect:* block · *intent:* general · *4.9s*

> I’m sorry, but I can only help with questions related to COMSATS Attock campus matters.

**Q:** what's the weather today?  
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** Show me the timetable for BCS-1 and tell me a movie name  
*expect:* answer · *intent:* timetable · *0.1s*

> 📅 BS(CS)-I — the Whole Week
> 
> Monday
> • 11:30–13:15  AoIaCT (Lab) — Muhammad Fawad, Lab
> • 13:35–15:00  PF(Lab) — Bukhari Maryam, Lab2
> • 15:00–16:30  PF(Lab) — Bukhari Maryam, Lab2
> 
> Tuesday
> • 10:00–11:30  Programming Fundamentals — Umar Zia, LT8
> • 11:30–13:15  Fundamentals of Psychology — Hamid Masood, LH 4
> 
> Wednesday
> • 08:30–10:00  AoIaCT (Lab) — Muhammad Fawad, Lab
> • 08:30–10:00  PF(Lab) — Bukhari Maryam, Lab2
> • 11:30–13:15  Civics and Community Engagement — Sanober Tariq, CR 3
> • 13:35–15:00  Pre Calculus I — Muhammad Sulaiman, LT1
> • 15:00–16:30  Programming Fundamentals — Umar Zia, LT9
> 
> Thursday
> • 08:30–10:00  Pre Calculus I — Muhammad Sulaiman, LT1
> • 11:30–13:15  Application of Information and Communcation Technologies — Muhammad Fawad, LT9
> • 15:00–16:30  Functional English — Tasneem Fiza, LT8
> 
> Friday
> • 08:30–10:00  Functional English — Tasneem Fiza, CR 4
> • 11:30–13:15  AoIaCT (Lab) — Muhammad Fawad, Lab
> • 13:35–15:00  AoIaCT (Lab) — Muhammad Fawad, Lab
> • 13:35–15:00  PF(Lab) — Bukhari Maryam, Lab4
> 
> I can only answer the university part of that. I won't answer the unrelated part.
