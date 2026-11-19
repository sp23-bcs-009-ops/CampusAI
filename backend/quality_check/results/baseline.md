# Golden questions: baseline

Server: http://localhost:8001

## Timetable from Firebase

**Q:** Show me the timetable for BCS-1 on Monday  
*expect:* answer · *intent:* timetable · *4.3s*

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

> 📅 BS(CS)-III — Friday
> • 08:30–10:00  Calculus and Analytic Geometry — Maimoona Rafiq, LT2
> • 10:00–11:30  Fundamentals of Digital Logic Design (lab) — Fayaz Ali, Lab
> • 13:35–15:00  Data Structures — Armaghan Ali, LT4

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

> Yes, LT4 is free right now. It has no more classes today.

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
*expect:* answer · *intent:* events · *0.6s*

> There are no upcoming events right now. The most recent ones were:
> • Bzzn — 1 April 2026, 04:51–06:51, Nsns

**Q:** are there any emergency announcements?  
*expect:* answer · *intent:* announcements · *0.6s*

> ⚠️ Short circuit in Lab CS3 (critical) — 15 September 2026
> No one except the relevant authority should enter or get near to the Lab CS3. We will further send disseminate this to the whole university.

**Q:** I lost my calculator, has anyone found one?  
*expect:* answer · *intent:* lostfound · *4.2s*

> I couldn't find any open lost-and-found posts matching "calculator one". You can post it in the app's Lost & Found section so others can reply.

**Q:** show notifications for BCS-1  
*expect:* answer · *intent:* notifications · *0.6s*

> There are no published class notifications right now.

## Exams

**Q:** when are the BCS-1 exams?  
*expect:* answer · *intent:* exams · *0.0s*

> The exam datesheet isn't published in CampusAI yet, because the timetable is in Regular Mode. Exam dates will show here as soon as staff switch on Exam Mode. Until then, check your class notifications or ask your department office.

**Q:** I missed my paper yesterday, what should I do?  
*expect:* answer · *intent:* exams · *0.0s*

> The exam datesheet isn't published in CampusAI yet, because the timetable is in Regular Mode. Exam dates will show here as soon as staff switch on Exam Mode. Until then, check your class notifications or ask your department office.

**Q:** I am stressed about midterms  
*expect:* answer · *intent:* study_help · *0.0s*

> Good luck with your exams! I can't give study coaching, but I can help you plan. Ask "my exams" to see your datesheet once it's published, or "when am I free today?" to find study time between classes.

## Campus website information

**Q:** How do I apply for admission?  
*expect:* answer · *intent:* comsats_info · *5.3s*

> To apply for admission at the Attock campus, contact the admissions office.
> 
> • Contact Mr Muhammad Javed, In-Charge Admissions & Student Affairs
> • Phone: 057-9049159 or 0315-5504184
> • Email: ic_admissions@cuiatk.edu.pk – request the application form and required documents
> • Check the current Attock admissions page for the latest online form and submission instructions
> • Submit the completed form and supporting documents as directed by the admissions office
> 
> Source: https://ww2.comsats.edu.pk/ro/Prospectus/GR_Prospectus/Graduate-Guide-2025-26.pdf

**Q:** how can I get into COMSATS Attock?  
*expect:* answer · *intent:* comsats_info · *1.5s*

> To apply for admission at COMSATS University Islamabad, Attock Campus, reach out to the campus contacts for guidance.
> 
> • Call the campus main line 057-9049300 (ask for the Admissions Office)
> • Email the department of interest (e.g., Computer Science cs_atk@cuiatk.edu.pk) to request the application form
> • Obtain the latest prospectus or online application portal link from the admissions staff
> • Prepare required documents: academic transcripts, CNIC, passport-size photos, and fee receipt as instructed
> • Submit the completed form and documents in person or via the provided online portal
> 
> Source: https://ww2.comsats.edu.pk/cs_atk/default.aspx

**Q:** which departments are there at Attock campus?  
*expect:* answer · *intent:* teachers · *1.6s*

> • Mathematics Department, Attock Campus
> • EE
> • MS
> • CS
> • Computer Engineering Department, Attock Campus

**Q:** who is the rector?  
*expect:* answer · *intent:* comsats_info · *0.9s*

> The university’s chief executive is the Rector.
> 
> • Rector: Prof. Dr. Raheel Qamar, T.I. (officially listed on the COMSATS central leadership page)
> 
> Source: https://islamabad.comsats.edu.pk/Website/rector-comsats

**Q:** Where is the library?  
*expect:* answer · *intent:* comsats_info · *0.0s*

> I don't have that in the current campus website records yet. For the latest details, check the official campus website (https://attock.comsats.edu.pk/) or ask the relevant office on campus.

**Q:** what are the bus timings?  
*expect:* answer · *intent:* comsats_info · *1.0s*

> I don’t have bus-timing information in the current campus website records.
> 
> • Please visit the official Attock campus site or contact the campus administration for the latest bus schedule.
> 
> Source: https://attock.comsats.edu.pk/

**Q:** what is the fee structure?  
*expect:* answer · *intent:* comsats_info · *0.0s*

> I don't have that in the current campus website records yet. For the latest details, check the official campus website (https://attock.comsats.edu.pk/) or ask the relevant office on campus.

**Q:** what is the minimum CGPA to avoid probation?  
*expect:* answer · *intent:* private_records · *0.0s*

> I can't see personal academic records such as GPA, attendance, marks, roll number or fee challans. Please check the CUI student portal (CU Online) or ask your department office.

## Conversation and feelings

**Q:** hi  
*expect:* answer · *intent:* general · *0.0s*

> Hello. I can help with class schedules, teacher availability, rooms, events, announcements, and COMSATS campus information.

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
*expect:* answer · *intent:* timetable · *0.0s*

> Please mention your class name so I can look up the timetable, for example: BCS-I, BA-II, CS-III, CE-IV.

**Q:** thanks a lot  
*expect:* answer · *intent:* general · *0.0s*

> You're welcome. Ask anytime about a class, teacher, room, or campus information.

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
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** what's the weather today?  
*expect:* block · *intent:* off_topic · *0.0s*

> I can only help with COMSATS Attock campus questions, such as timetables, teachers, rooms, events, and official campus information.

**Q:** Show me the timetable for BCS-1 and tell me a movie name  
*expect:* answer · *intent:* timetable · *0.0s*

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
