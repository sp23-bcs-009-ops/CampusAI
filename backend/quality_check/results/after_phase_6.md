# Golden questions: after_phase_6

Server: http://localhost:8001

## Timetable from Firebase

**Q:** Show me the timetable for BCS-1 on Monday  
*expect:* answer · *intent:* timetable · *8.9s*

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
*expect:* answer · *intent:* announcements · *1.3s*

> ⚠️ Short circuit in Lab CS3 (critical) — 15 September 2026
> No one except the relevant authority should enter or get near to the Lab CS3. We will further send disseminate this to the whole university.

**Q:** I lost my calculator, has anyone found one?  
*expect:* answer · *intent:* lostfound · *3.4s*

> I couldn't find any open lost-and-found posts matching "calculator one". You can post it in the app's Lost & Found section so others can reply.

**Q:** show notifications for BCS-1  
*expect:* answer · *intent:* notifications · *0.7s*

> There are no published class notifications right now.

## Campus website information

**Q:** How do I apply for admission?  
*expect:* answer · *intent:* comsats_info · *3.8s*

> You can apply for admission by contacting the Attock admissions office.
> • Contact Mr. Muhammad Javed, In-Charge Admissions and Student Affairs.
> • Phone: 057-9049159 or 0315-5504184.
> • Email: ic_admissions@cuiatk.edu.pk.
> • See the Graduate Admission Guide 2025-26 for details and verify the information on the current campus admission page.
> • Use the official Attock admissions source for the latest application procedures.
> 
> Source: https://ww2.comsats.edu.pk/ro/Prospectus/GR_Prospectus/Graduate-Guide-2025-26.pdf

**Q:** how can I get into COMSATS Attock?  
*expect:* answer · *intent:* comsats_info · *4.0s*

> To join COMSATS University at the Attock campus, start with the official admission process.
> • Review the admission FAQ for eligibility, required documents, and application deadlines.
> • The university runs Spring (Feb-Jun) and Fall (Sep-Jan) semesters—plan your entry accordingly.
> • Select “Attock” as your campus when completing the online application.
> • Use the contact information provided on the FAQ page for any campus-specific questions.
> • Follow the online portal instructions to submit and track your application.
> 
> Source: https://ww2.comsats.edu.pk/admissionoffice/faqs.aspx

**Q:** which departments are there at Attock campus?  
*expect:* answer · *intent:* comsats_info · *1.1s*

> The Attock campus hosts the following academic departments:
> • Computer Science
> • Electrical Engineering
> • Computer Engineering
> • Management Sciences
> • Mathematics
> 
> Source: https://ww2.comsats.edu.pk/ms_atk/default.aspx

**Q:** who is the rector?  
*expect:* answer · *intent:* comsats_info · *1.3s*

> The current Rector of COMSATS University Islamabad is Prof. Dr. Raheel Qamar, T.I.
> 
> • He serves as the university-wide Rector, overseeing all campuses.
> • This role is distinct from any campus-specific In-Charge or Chancellor positions.
> • For Attock-campus leadership, refer to the campus In-Charge contacts.
> • The information comes from the official central leadership page.
> • Check the university’s governance page for any future updates.
> 
> Source: https://islamabad.comsats.edu.pk/Website/rector-comsats

**Q:** Where is the library?  
*expect:* answer · *intent:* comsats_info · *0.0s*

> I don't have that in the current campus website records yet. For the latest details, check the official campus website (https://attock.comsats.edu.pk/) or ask the relevant office on campus.

**Q:** what are the bus timings?  
*expect:* answer · *intent:* comsats_info · *1.1s*

> I don’t have the bus-timing details in the available campus records.
> • Please check the official Attock campus website for the most up-to-date transportation information.
> • You can also contact the campus administration directly for bus schedules.
> 
> Source: https://attock.comsats.edu.pk/

**Q:** what is the fee structure?  
*expect:* answer · *intent:* comsats_info · *0.0s*

> I don't have that in the current campus website records yet. For the latest details, check the official campus website (https://attock.comsats.edu.pk/) or ask the relevant office on campus.

**Q:** what is the minimum CGPA to avoid probation?  
*expect:* answer · *intent:* general · *1.6s*

> I’m not sure of the exact CGPA requirement. It’s best to check with your department office or look at the official Attock campus website for the most up-to-date academic regulations. If you’re worried, they can also let you know what steps to take to stay on track.

## Conversation and feelings

**Q:** hi  
*expect:* answer · *intent:* general · *3.7s*

> Hey there! How can I help you with anything about life or studies at COMSATS Attock today?

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
*expect:* answer · *intent:* general · *4.7s*

> I’m really sorry you’re feeling down. It might help to talk to someone you trust—maybe a friend, a faculty member, or the counseling team at your department office. You can also check the campus website for student support resources. Take care of yourself.

**Q:** thanks a lot  
*expect:* answer · *intent:* general · *5.8s*

> You’re welcome! Let me know if there’s anything else I can help you with.

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
*expect:* block · *intent:* general · *3.0s*

> I’m sorry, but I can only help with COMSATS Attock campus-related questions such as timetables, teachers, rooms, events, and official information.

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
