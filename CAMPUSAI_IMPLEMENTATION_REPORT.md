# CampusAI implementation report

Date of this verification: 2026-10-29. All commands were run locally. No Firebase records, security rules, indexes, authentication settings, or Knowledge Pack files were modified. Nothing was pushed or deployed.

`CAMPUSAI_COMPLETE_SYSTEM_REPORT.md` was left unchanged. This file is the verification record for the chatbot work.

## Stage 1 — Response speed

Completed. Frontend, authentication, guest behavior, conversation history, Firebase data, and security rules were not changed.

### Where the time went

Measured inside the previous container before these edits:

| Operation | Time | What it did |
| --- | --- | --- |
| Download all 56 timetable documents | 24.78–25.45s | Firestore REST, 8 workers |
| Manifest check after the 60-second window | 5.34–5.97s | Two Firestore reads; the token matched, so the 56 documents were not downloaded again |
| `Hello` with a warm timetable | 1.52s | Groq |
| `thank you` with a warm timetable | 0.30s | Groq |
| Groq `Hello` alone | 0.58s | One short completion |
| `Hello` after the timetable window expired | 27.85s | Manifest check plus a slow Groq call |
| Isolated “What about Tuesday?” with a warm timetable | 0.00s | Static “name your class” reply, but only after routing had already called timetable detection |
| BCS-1 notifications, one collection, empty | 2.65s, then 2.68s again | No cache; the second call read Firestore again |
| Every notification path, no class | 28.30s | 10 departments × 8 semesters |

The earlier live API times (Hello 27.61s, thanks 28.89s, isolated Tuesday 37.16s, BCS-1 notifications 19.58s) match this. `route()` called teacher, room, and class detection for every question, and each of those starts with `ensure_timetable()`. A greeting therefore waited on a cold 25-second download or a 6-second manifest check, and then on Groq. Groq itself is usually under 2 seconds and sometimes stalls toward its 30-second timeout. The isolated follow-up does not need Groq or a timetable when the session has no class. The 19-second notification call was Firestore, not Groq.

### What changed

- Greetings and thanks return a fixed university-scoped sentence. They do not call Groq or Firestore.
- “What about Tuesday?” with no saved class, teacher, or room returns the existing class prompt without loading the timetable. The same follow-up still uses the saved class when the conversation has one.
- Events, announcements, lost-and-found, and class notifications are routed before timetable detection. A class code such as `BCS-1` is read from the question, so a notification query hits `notifications/cs/semesters/1/posts` instead of all 80 paths.
- Empty and non-empty Firestore record results, including notifications, are kept in memory for 5 minutes.
- A loaded timetable stays in memory for 5 minutes. After that, the manifest is compared and the 56 documents are downloaded only if the manifest changed.

`/ask` still returns `{answer, intent}`. Structured timetable answers are unchanged.

### Latency after the change

Same API, cold container, 2026-10-29:

| Question | Before | After | Result |
| --- | --- | --- | --- |
| Hello | 27.61s | 0.02s | Fixed greeting. No Groq. |
| thank you | 28.89s | 0.00s | Fixed thanks. No Groq. |
| What about Tuesday? (new session) | 37.16s | 0.00s | Asks for a class name. |
| BCS-1 notifications | 19.58s | 3.05s | “no published class notifications.” |
| Same notification again | not measured; a direct repeat was 2.68s | 0.00s | Cached empty result. |
| BCS-1 Monday, first timetable read | about 25–28s | 27.93s | Still the 56-document download. Schedule matched Firebase: AoIaCT (Lab), Muhammad Fawad, Lab. |
| What about Tuesday? (same session) | 0.00s when the cache was already warm | 0.00s | Tuesday `BS(CS)-I`: Programming Fundamentals, Umar Zia, then Fundamentals of Psychology. |

### Tests and Docker

- Full suite before this stage: 86 passed.
- Full suite after this stage, before the image rebuild: **90 passed, 2 warnings, 7.69s**. The four new tests cover greetings, the isolated follow-up, notification class detection without a timetable download, and the empty-notification cache.
- `docker compose up -d --build --no-deps backend` recreated `campusai-backend`. The running process has the small-talk shortcut and a 300-second timetable window. `/health` returned ok.

### Files in this stage

- `backend/pipeline.py`
- `backend/university_data.py`
- `backend/tests/test_routing.py`
- `backend/tests/test_university_data.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining performance issues before the loader change

- The first timetable question after a restart still downloaded 56 Firestore documents one by one and took about 28 seconds. That cost is measured again and reduced in the next section. Later questions in that process were already immediate for 5 minutes.
- The first empty notification read for one class is about 3 seconds because that Firestore list itself takes that long. Repeats inside 5 minutes are instant.
- A notification question with no class still lists every department and semester the first time. That scan measured 28.3 seconds before this change and was not run again live.
- Questions that still need Groq (campus prose, not greetings) can occasionally take tens of seconds. The client timeout is 30 seconds.
- A newly published timetable or notification can take up to 5 minutes to appear in a process that already cached the previous result.

## Stage 1 continued — timetable loading

The slow first timetable question was 56 separate Firestore document reads. One document took 2.89 seconds and contained about 8 KB. A single `batchGet` of all 56 documents, limited to `dept`, `semester`, and `displayRows`, took 3.39 seconds. Parsing was not the delay. Teacher and room scans were already under 0.01 seconds once the timetable was in memory; “who is free right now” had been scanning the whole timetable once per teacher, so that lookup now uses the teacher index built with the room index.

Reads reuse one HTTPS connection. The timetable stays cached for 5 minutes. When that window ends, the schedule mode and manifest are read again, and the 56 class documents are downloaded only if the manifest token changed. A failed read still raises an unavailable error and does not open a local timetable file.

### Live `/ask` on a cold container

Same questions, same sessions, before and after the loader change. The “before” run is the previous image restarted on 2026-10-29. The “after” run is the rebuilt image.

| Question | Before | After | Answer check |
| --- | --- | --- | --- |
| Hello | 0.01s | 0.01s | Fixed greeting, no timetable load |
| thank you | 0.00s | 0.00s | Fixed thanks |
| BCS-1 Monday (first timetable) | 26.99s | 4.10s | `BS(CS)-I` Monday, AoIaCT (Lab), Muhammad Fawad, Lab |
| What about Tuesday? (same chat) | 0.00s | 0.00s | Programming Fundamentals on Tuesday |
| What about Tuesday? (new chat) | 0.00s | 0.00s | Asks for a class name |
| Is Aamir Ali free on Monday? | 0.00s | 0.00s | `teacher_availability` |
| Is LT8 free on Monday? | 0.01s | 0.00s | `room_availability` for LT8 |
| Which teacher is free right now? | 0.01s | 0.01s | `teachers_free_now`, Thursday 13:35–15:00 |
| Which rooms are free Friday morning? | 0.00s | 0.00s | `rooms_free` |
| Upcoming events | 2.89s | 1.82s | No upcoming events; stored events labeled past |
| Latest emergency announcement | 2.85s | 1.01s | Short circuit in Lab CS3, critical |
| BCS-1 notifications | 2.82s | 1.83s | No published class notifications |
| Same notification again | 0.00s | 0.00s | Cached empty result |
| Capital of France | 0.00s | 0.01s | Off topic |

### Tests and files

Full suite before the rebuild: **93 passed, 2 warnings, 7.60s**. New tests cover the batch cache, a missing class document, Firebase failure without a local file, and teacher availability matching the class meetings. The image was rebuilt only after that run. The container’s `load_firebase_timetable` contains `_batch_get`. `/health` returned ok.

Files changed in this pass:

- `backend/university_data.py`
- `backend/timetable_service.py`
- `backend/tests/test_university_data.py`
- `backend/tests/test_routing.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Still slow or unchanged

- The first timetable read is 4.10 seconds, not instant. That is one manifest batch plus one class-document batch to Firestore.
- The first events, announcement, and notification reads are still about 1–2 seconds. Repeats inside 5 minutes are instant.
- A notification question that names no class still has to list every department and semester the first time.
- Groq is still used for campus prose that is not a greeting or a structured timetable answer, and that call can approach its 30-second timeout.
- Cached timetable and notification results can be up to 5 minutes behind a new Firestore publish.

## Stage 1 final verification

Checked on 2026-10-29 after the loader change. No Firebase documents, rules, or credentials were changed. Nothing was deployed or pushed.

### Image and source

- Running container: `campusai-backend`
- Image: `campus_ai-main-backend`
- Image id: `sha256:f6c1ee91523d95c2bf4782c9265f669941ff0170afdb16c0c8d2b8383c4d812e`
- Created: 2026-10-29T14:23:07Z
- The container copies of `university_data.py`, `timetable_service.py`, and `pipeline.py` match the workspace SHA-256 prefixes `71bf6de4c1be`, `713ff5c2a92a`, and `8ce0ee1a7d3c`.
- The running loader contains `_batch_get`, the teacher index, and a 300-second timetable window.
- Test files are not copied into the image. The suite below was run from the workspace with that source mounted in.

### Tests

Complete backend suite against the current source: **93 passed, 2 warnings, 7.37s**. The warnings are the existing FastAPI startup-handler deprecation. No test failed, so no Stage 1 code was changed after this run.

### Health

The container was restarted so the timetable cache would be empty. The image id stayed the same. `GET /health` returned `status: ok`, Groq model `openai/gpt-oss-120b`, Knowledge Pack `comsats_attock_official_seed_2026_10_24` with 34 documents, and `auth_enabled: false`.

### Live `/ask` after that restart

| Question | Time | Check |
| --- | --- | --- |
| Hello | 0.02s | Greeting only |
| thank you | 0.01s | Thanks only |
| BCS-1 Monday, cold | 4.29s | `BS(CS)-I` Monday: AoIaCT (Lab), Muhammad Fawad, Lab, 11:30–13:15; PF(Lab), Bukhari Maryam, Lab2, 13:35–15:00 and 15:00–16:30 |
| Same Monday question again | 0.00s | Same Monday schedule |
| What about Tuesday? in that chat | 0.00s | Tuesday: Programming Fundamentals, Umar Zia, LT8, 10:00–11:30; Fundamentals of Psychology, Hamid Masood, LH 4, 11:30–13:15 |
| What about Tuesday? in a new chat | 0.00s | Asks for a class name |
| Is Aamir Ali free on Monday? | 0.00s | `teacher_availability`. Free 11:30–13:15, 13:35–15:00, 15:00–16:30. Busy earlier with Ordinary Differential Equations and Calculus and Analytic Geometry |
| Is LT8 free on Monday? | 0.00s | `room_availability` for LT8. Busy 11:30–13:15, Operating Systems, Khalid Awan; 15:00–16:30, Programming Fundamentals, Tehreem Khalil |
| Which teacher is free right now? | 0.00s | `teachers_free_now`, Thursday 13:35–15:00, includes Aamir Ali |
| Which rooms are free Friday morning? | 0.00s | `rooms_free`, including APL |
| Upcoming events | 1.56s | No upcoming events; stored events labeled past |
| Latest emergency announcement | 1.25s | Short circuit in Lab CS3, priority critical |
| BCS-1 notifications | 0.57s | No published class notifications |
| Same notification again | 0.00s | Cached empty result |
| Capital of France | 0.00s | Declined as off topic |

### Remaining bottlenecks

- A cold timetable read is 4.29 seconds. The repeat is immediate. The 5-minute cache hides a new publish until the manifest is checked again.
- The first events and announcement reads are still about 1–2 seconds. Notification repeats are instant; the first one varies, 0.57 seconds in this run and 1.83 seconds in the previous cold run.
- A notification question with no class still lists every department the first time. That full scan was not repeated in this verification.
- Groq is still used for campus prose other than greetings and structured timetable answers, and that call can approach its 30-second timeout.

## Stage 2 — conversation follow-ups

The chatbot now keeps the class, day, and rooms from the current session and uses them for short follow-ups. It does not guess when more than one room or class could fit. Unrelated questions stay declined. The `/ask` shape is still `{answer, intent}`. The frontend was not changed.

### Behavior

- “What about Tuesday?” still uses the class, teacher, or room from that same conversation, and asks for a class when the conversation has none.
- “Which teacher takes that class?” answers with that class’s meetings for the day just shown, including the teacher and room. It does not switch the conversation over to one teacher, so a later day question stays on the class.
- “Is the room free then?” uses the one room from the last answer and the day just discussed. If the last answer named several rooms, it asks which one. If it named none, it asks for a room. A named room such as LT8 is not replaced by the previous room, and “then” still supplies the day.
- “Which teacher teaches that subject?” asks which subject when the last answer had more than one.
- A new session does not inherit another session’s class or room. “What is the capital of France?” stays off topic even after a timetable question.

### Tests

Full backend suite after these changes: **102 passed, 2 warnings, 7.32s**. The warnings are the existing FastAPI startup notice. No test failed.

The local backend was rebuilt after that run. Image id: `sha256:e8d2d5b2892690398230673e998046c0a48fd66e8774ace2e48bcb66384524dd`. `/health` returned ok.

### Live `/ask` in one conversation

| Question | Time | Result |
| --- | --- | --- |
| BCS-1 Monday | 5.05s | Cold timetable load. AoIaCT (Lab), Muhammad Fawad, Lab; PF(Lab), Bukhari Maryam, Lab2 twice |
| Which teacher takes that class? | 0.00s | Same Monday meetings and teachers. Tuesday was not mixed in |
| Is the room free then? | 0.00s | Asked which room: Lab or Lab2. Did not pick one |
| What about Tuesday? | 0.00s | `BS(CS)-I` Tuesday: Programming Fundamentals, Umar Zia, LT8; Fundamentals of Psychology, Hamid Masood, LH 4 |
| Is the room free then? | 0.00s | Asked which room: LT8 or LH 4 |
| Is LT8 free then? | 0.00s | LT8 on Tuesday, free only 13:35–15:00 |
| Which teacher takes that class? (new session) | 0.00s | Asked which class |
| Is the room free then? (new session) | 0.00s | Asked for a room name |
| Capital of France (same session as the timetable) | 0.00s | Declined |

### Files

- `backend/pipeline.py`
- `backend/tests/test_routing.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining issues

- Memory is still only in the running backend process, for that session id. A restart or a new chat clears it.
- “The room” cannot choose among several rooms from the last answer. The user has to name one.
- Other pronouns, such as “the other lab” or “the first teacher,” are not specially understood.
- Guest chat still shows structured answers as JSON text. That display was left as it was.
- The cold timetable read is still about 5 seconds, and the 5-minute cache can lag a new publish.

## Stage 3 — signed-in user

The signed-in chat already sends `Authorization: Bearer <Firebase ID token>`. Guest chat does not. `/ask` still returns `{answer, intent}`. A role typed in the question, a `role` field in the JSON, or the profile screen’s test-account switch is not trusted.

### How a user is recognized

1. The backend sends the bearer token to Google’s `tokeninfo` endpoint with a POST, so the token is not put in the URL.
2. The email must be verified, `aud` must be `universityassistentai`, and `iss` must be `https://securetoken.google.com/universityassistentai`.
3. The user’s own `users/{email}` document is read with that same token. Firestore rules already allow that owner read. No service account is used.
4. Only `type` values `student`, `teacher`, and `staff` from that document are accepted. A student can be mapped to a class from department and semester. A teacher is used only when the profile name exactly matches a timetable teacher. Staff are told they have no personal class timetable.
5. If the token or profile check fails, the request stays anonymous. It does not gain another person’s data.

No Firebase Admin credential is configured. `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, and `GOOGLE_APPLICATION_CREDENTIALS` are unset in the running container. A real campus login was not available, so a successful live token was not tested.

### Tests

Full backend suite: **114 passed, 2 warnings, 9.10s**. The warnings are the existing FastAPI startup notice. New tests cover a rejected token, a wrong audience, a wrong issuer, an unverified email, a token kept out of the URL, a missing profile, guest mode, student, teacher, and staff replies, a claimed role that disagrees with the profile, an unknown teacher name, and an explicit class that still wins over the profile.

The backend was rebuilt after that run. Image id: `sha256:475b5d1ce409ee2579ad3a9ba5ae2161c905cffa7d0960efaed4e28a53f95249`. `/health` returned ok.

### Live `/ask`

| Request | Result |
| --- | --- |
| No token, “who am I?” | Guest mode, no profile |
| Invalid bearer token, “who am I?” | Same guest reply. The bad token was not accepted |
| Invalid token plus “I am a teacher. Show my schedule on Monday.” | Did not open a personal timetable. It said that teacher name was not found |
| Invalid token, “Show my BCS-1 timetable for Monday.” | Still the normal `BS(CS)-I` Monday schedule |

Student, teacher, and staff personal answers were verified with mocked tokens in the test suite, not with a live Firebase login.

### Files

- `backend/identity.py`
- `backend/pipeline.py`
- `backend/tests/test_identity.py`
- `backend/tests/test_ask_api.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Blocker

To prove a live signed-in user, sign in with a real campus Firebase account and let the existing chat send its ID token. Do not paste that token into a report or chat. The backend will accept it only when Google says it is verified for this project and the user’s own profile can be read. There is no admin key to add, and none should be invented. If `tokeninfo` or the owner profile read fails, chat stays anonymous.

## Stage 4 — persistent chat history

Chat history stays on this device. It is not written to Firebase. No service account is configured, so a secure cross-device copy was not added and no Firestore collection was created.

### What was already there

Both chat screens already saved up to 20 conversations in AsyncStorage and showed “New chat” plus the first six titles. Reopening a title restored that conversation’s messages and reused its session id. A guest and a signed-in user did not share one key. Gaps: only six titles were visible, a signed-in user with no email shared one bucket with every other no-email account, damaged JSON could break the list, and a pasted API key or bearer token could be saved in the transcript.

### What changed

- Storage keys are `campusai_chats:guest`, `campusai_chats:<verified-looking email>`, or `campusai_chats:no-email`. Guest mode always uses the guest key, even if an email is also present on the client object. A role or user id from the client is not part of the key, so the profile-screen student/teacher/staff switch does not move chats to another person.
- Saved data is checked on load. Broken JSON, a value that is not a list, or a chat with no messages becomes an empty list or is skipped. A storage failure returns an empty list instead of crashing the screen.
- Message order is kept. The list is newest first, capped at 20 chats and 100 messages. Text that looks like an API key, a bearer token, or a private key is stored as `[removed secret]`.
- Both chat screens list every saved title, keep the “New chat” control, and show “No saved chats” when the list is empty. The open conversation is highlighted. Opening one restores its messages. The next question is appended and sent with that conversation’s existing session id.

`POST /ask` still returns `{answer, intent}`. Chat routing was not changed.

### Tests actually run

- Node history tests in `Frontend/src/utils/chatHistoryCore.test.mjs`: **5 passed, 0 failed, about 61ms**. They cover an empty list, corrupted data, save, reopen, switch, continue with message order, guest versus signed-in isolation, a role change that must not change the key, secret removal, and a storage throw.
- Full backend suite in `campusai-backend-test`, with no backend source changes in this stage: **114 passed, 2 warnings, 7.55s**. The warnings are the existing FastAPI `on_event` notices.
- Browser at http://localhost:19006, AI Chat: the screen showed “New chat” and previously saved titles, including more than the old six-title cap. Opening “What are BCS-1 classes on Monday?” restored that question, the Monday `BS(CS)-I` schedule (Muhammad Fawad / Lab, then PF(Lab) / Bukhari Maryam / Lab2 twice), then the later “ok” reply, in that order. “New chat” cleared those messages and showed the welcome card. Those titles were already on the device from earlier sessions, so they had survived page refresh and backend restarts. Guest mode was not clicked in the browser in this pass; it uses the same helpers and is covered by the Node isolation test.

### Files

- `Frontend/src/utils/chatHistoryCore.js`
- `Frontend/src/utils/chatHistory.js`
- `Frontend/src/utils/chatHistoryCore.test.mjs`
- `Frontend/src/screens/ChatScreen.js`
- `Frontend/src/screens/GuestModeScreen.js`

### Limitations

- History is on this browser or phone only. It does not follow the account to another device.
- Anyone who can read that browser’s local storage can read the chats stored there. This is not a boundary against the device owner.
- A signed-in user with no email shares `campusai_chats:no-email` on that device. A normal campus login has an email.
- The backend’s follow-up memory (last class, room, and day) lives in the backend process. Saved messages remain after a backend restart, but a short follow-up such as “What about Tuesday?” may ask for the class again until the timetable is requested once more in that conversation.
- At most 20 conversations are kept.

## Stage 5 — final verification

No application source was changed. No confirmed defect met the bar for a code fix. Firebase data, rules, and credentials were not touched. Nothing was deployed or pushed.

This is not a production sign-off. A real campus Firebase login is still unverified, chat history is local plaintext, and `/ask` is open when `CAMPUS_AI_API_KEY` is empty.

### Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Backend suite | `docker run --rm -v E:\Project\Campus_AI-main:/workspace campusai-backend-test` | **114 passed, 2 warnings, 7.63s**. Warnings are the existing FastAPI `on_event` notices. |
| Frontend history tests | `node --test Frontend\src\utils\chatHistoryCore.test.mjs` | **5 passed, 0 failed, about 60ms**. Node also warned that `chatHistoryCore.js` has no `"type": "module"`. |
| Frontend lint | — | **Not available.** `Frontend/package.json` has no lint script, and ESLint is not installed. |
| Frontend type check | — | **Not available.** There is no `tsconfig.json` and TypeScript is not installed. The app is JavaScript. |
| Health | `GET http://127.0.0.1:8000/health` | **ok in 0.01s**. Groq is configured, RAG is unused, `auth_enabled` is false, rate limit is `20/minute`. |
| Admin credentials | container environment | `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, and `GOOGLE_APPLICATION_CREDENTIALS` are all unset. |

The running backend image is still `sha256:475b5d1ce409ee2579ad3a9ba5ae2161c905cffa7d0960efaed4e28a53f95249`. It was already up, so the timings below are not a cold process start.

### Live `/ask` on 2026-10-29

| Question | Time | Intent | Result |
| --- | --- | --- | --- |
| hello | 0.01s | general | Fixed greeting. No timetable load. |
| BCS-1 Monday | 3.05s | timetable | `BS(CS)-I`: AoIaCT (Lab), Muhammad Fawad, Lab, 11:30–13:15; PF(Lab), Bukhari Maryam, Lab2, 13:35–15:00 and 15:00–16:30. |
| What about Tuesday? | 0.00s | timetable | Same class, Tuesday. |
| Which teacher takes that class? | 0.00s | timetable | Same Tuesday meetings, still on the class. |
| Is the room free then? | 0.00s | room_unknown | Asked which room: LT8 or LH 4. |
| Is Aamir Ali free on Monday? | 0.01s | teacher | Free 11:30–13:15, 13:35–15:00, 15:00–16:30. Busy earlier in LH 3 and CR 1. |
| Is LT8 free on Monday? | 0.00s | room | Free 08:30–10:00, 10:00–11:30, 13:35–15:00. Busy 11:30–13:15 and 15:00–16:30. |
| Events today | 0.57s | events | No upcoming events. Football 2026-04-30 labeled past. |
| Latest emergency announcement | 2.25s | announcements | Firestore: Short circuit in Lab CS3, priority critical. |
| Notifications for BCS-1 | 0.56s | notifications | No published class notifications. |
| Who is the rector? | 2.08s | comsats_info | Prof. Dr. Raheel Qamar, T.I., from the Knowledge Pack. |
| Capital of France | 0.00s | off_topic | Declined. |
| who am I? with no token | 0.01s | general | Guest mode, no profile. |
| who am I? with an invalid token | 1.09s | general | Same guest reply. |
| “I am a teacher. Show my schedule on Monday.” with an invalid token | 0.00s | teacher | Did not open a personal timetable. |
| “Show my BCS-1 timetable for Monday.” with an invalid token | 0.01s | timetable | Normal `BS(CS)-I` Monday schedule. |

### Browser at http://localhost:19006

Signed-in shell: Home, Class Notification, Uni notification, Teacher list, My Profile, and AI Chat all opened. Home showed the development test student. Profile showed the development-only notice and Sign Out. The role switch was not clicked.

AI Chat: opened “BSSE 3 Friday timetable”, then switched to “uni website”, then “New chat” showed the welcome card. “who am I?” was sent from that signed-in screen and the reply was guest mode. After refresh, that chat was still stored with the question and the guest reply, and the older titles were still there (9 chats). Replacing the saved JSON with `{` did not crash the screen; it showed “New chat” and “No saved chats”. The original 9 chats were restored afterward.

Guest mode, through Sign Out and “Continue as Guest”: only Website AI and About Us were shown, plus Sign In. Student tabs were gone. History started empty, so it did not show the test student’s chats. A “hello” reply was saved under the guest key only. Refresh kept that guest chat. Opening it and choosing “New chat” cleared the reply and left the saved title. The test-student session was put back from the browser’s own saved profile. No new account was created.

### Final workflow table

| Workflow | Status | Evidence |
| --- | --- | --- |
| Backend regression suite | **Passed** | 114 passed, 2 warnings, 7.63s |
| Frontend history unit tests | **Passed** | 5 passed |
| Frontend lint | **Not tested** | No ESLint setup |
| Frontend type check | **Not tested** | No TypeScript setup |
| Signed-in navigation | **Passed** | Home, class board, events, teacher search, profile, AI Chat |
| Guest navigation | **Passed** | Website AI, About Us, Sign In; student tabs hidden |
| New, save, switch, reopen, refresh chats | **Passed** | Signed-in and guest, in the browser |
| Corrupted saved history | **Passed** | Broken JSON showed an empty list and did not crash |
| User isolation of local history | **Passed** | Guest key and test-student key stayed separate in the browser and in the 5 Node tests |
| Timetable and follow-ups | **Passed** | Live `/ask` times above |
| Teacher and room lookup | **Passed** | Aamir Ali and LT8 |
| Events, announcements, notifications | **Passed** | Firestore replies above |
| University knowledge | **Passed** | Rector from the Knowledge Pack |
| Unrelated question | **Passed** | Capital of France declined |
| Invalid token stays anonymous | **Passed** | Live invalid token and the browser test account |
| Role taken from a verified profile | **Blocked** | No real campus login was available. Mocked tokens cover this in pytest only. |
| Client test role is not trusted | **Passed** | The profile says student, and “who am I?” still said guest mode |
| Real signed-in Firebase user | **Blocked** | No campus account or password was provided. None was created. |
| Local history encryption | **Failed** as a security property | History is plaintext in browser storage. This is intentional for Stage 4, not a crash. It is not access control. |
| Cross-device history | **Blocked** | No admin credential and no safe write path |
| Expo Go on a phone | **Not tested** | Browser only. No emulator was started. |
| Production readiness | **Not passed** | The blocked rows above are still open. |

### Security notes

- Local chat history is not encrypted and is not synced. Anyone who can read that browser’s storage can read the chats. A missing email shares `campusai_chats:no-email` on that device. This does not replace server-side access control.
- The browser session is `test-student@local.test` with `testMode: true`. The test button signs in anonymously and then stores a profile built in the client. `/ask` did not treat that profile as a student.
- `/ask` does not trust a role typed in the question. An invalid bearer token stays anonymous.
- `auth_enabled` is false because `CAMPUS_AI_API_KEY` is empty. Anyone who can reach port 8000 can call `/ask`, limited to 20 requests a minute. Do not expose that port as if it were a locked API.
- The chat screen has no client timeout. Groq calls on the server time out at 30 seconds. No hang was seen in this pass.
- Secrets that look like an API key, a bearer token, or a private key are replaced in saved chats. That filter is not a substitute for keeping secrets out of the chat box.

### Files changed

- `CAMPUSAI_IMPLEMENTATION_REPORT.md` only.

### Remaining work

1. Sign in with a real campus Firebase user and ask “who am I?” and “my schedule”. Do not paste the token into a report. Expect a student, teacher, or staff answer only when Google verifies the token and the user’s own profile can be read.
2. Keep history on the device until rules can restrict each user to their own chats.
3. Decide separately whether `/ask` should require an API key before it is reachable beyond this machine.
4. Guest mode can still ask timetable questions. The guest label says Website AI. That product mismatch was not changed.

## Stage 6 — chat history sidebar

The conversation titles that sat above both chat boxes were replaced by one shared sidebar. Storage keys, message order, and guest/signed-in separation were not changed. The backend, Firebase, and authentication were not changed.

### What changed

- `Frontend/src/components/ChatHistorySidebar.js` is used by the signed-in chat and the Guest chat. It is not on Home, notifications, the teacher list, profile, or Guest About Us.
- A **Chats** button opens the panel from the left. The same button becomes **Hide chats** and closes it. On a narrow screen the panel is a drawer over the chat, and the button stays above the drawer. On a wide screen the panel sits beside the conversation, so it does not cover the message box.
- The panel has **New chat**, **No saved chats** when the list is empty, and the saved titles. Titles are grouped into Today, Yesterday, Previous 7 Days, and Older, newest first inside each group.
- Opening a title restores that conversation’s messages and its existing session id. New Chat still starts a blank conversation with a new session id.
- A saved chat with no timestamp, or a timestamp of 0, is listed under Older. It is not labeled as today.

### Tests actually run

- `node --test Frontend\src\utils\chatHistoryCore.test.mjs`: **6 passed, 0 failed**, about 62ms. The new test checks group order and that an undated chat is not placed in Today. Node still warns that `chatHistoryCore.js` has no `"type": "module"`.
- No ESLint or TypeScript check exists in the frontend.
- Browser at http://localhost:19006, signed-in AI Chat: the old title strip was gone. Opening Chats showed New chat, Today, and the saved titles. The message box started to the right of the titles. Opening “BSSE 3 Friday timetable” restored Shahzad Faisal. New chat cleared that transcript. Switching to “who am I?” restored the guest-mode reply. Hide chats closed the list. After refresh, the titles were still there.
- An extra saved chat with `updated: 0` and the title “Undated history check” appeared under Older, not Today. That test item was removed afterward. The original titles were left in place.
- A 390px-wide browser view used the overlay drawer. Hide chats closed it and the message box was usable again. A physical Expo Go phone was not used.
- Guest mode: the sidebar showed only the guest “hello” chat, not the test student’s titles. Opening it restored the greeting. New chat cleared it. About Us did not show the sidebar. The test-student session was restored afterward. No account was created.

### Files

- `Frontend/src/components/ChatHistorySidebar.js`
- `Frontend/src/utils/chatHistoryCore.js`
- `Frontend/src/utils/chatHistoryCore.test.mjs`
- `Frontend/src/screens/ChatScreen.js`
- `Frontend/src/screens/GuestModeScreen.js`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining limits

- History is still local plaintext and is not synced across devices.
- A real signed-in Firebase user is still unverified.
- The phone drawer was checked by narrowing the browser, not on a physical phone.
- The Home floor map still logs the existing `ArcMap.js` press warning. It was not part of this change.

## Stage 7 — authentication and API protection

Guest chat still works. No API key was added to the frontend. Firebase data and rules were not changed. This is not a production sign-off: a real campus login is still unverified, and `/ask` is still open on this machine.

### What the configuration actually is

- Docker publishes the backend on `0.0.0.0:8000` and `[::]:8000`. Any device that can reach this computer’s port 8000 can call it. It was not checked for a public internet address, and no firewall rule was changed.
- `CAMPUS_AI_API_KEY` is unset, so `/health` reports `auth_enabled: false`. Setting that key would reject Guest requests unless the app sent the key. The key would then be visible in the frontend, so it was not added. CORS is open (`*`) and is not treated as protection.
- The running container has no Firebase Admin credential. `TIMETABLE_UPLOAD_DEV_MODE` is false there. Timetable upload still needs a verified token and an admin credential before it can write.
- Signed-in chat sends `Authorization: Bearer` only when the app already has a Firebase ID token. Guest chat sends no token. A `role` field in the JSON is ignored. A role typed in the question is not a profile.

### What changed

- `/ask` rejects a blank question and a question longer than 2000 characters. Session ids are trimmed to 120 characters. A missing or empty bearer token stays anonymous.
- The rate limit is still 20 requests a minute per client address. A limit response is now JSON: “Too many requests. Please wait a minute and try again.” Both chat screens show that sentence instead of a raw server error.
- Identity is unchanged: Google `tokeninfo`, verified email, this project’s audience and issuer, then the caller’s own profile. Failure stays anonymous.

### Tests actually run

- Full backend suite: **116 passed, 2 warnings, 8.35s**. The two new tests cover a blank question, a huge question, an invalid token that stays anonymous, a trimmed session id, and the 429 JSON response.
- Frontend history tests: **6 passed**. No ESLint or TypeScript check exists.
- Live `/ask` after rebuilding the local backend:
  - blank question: 400
  - 2001-character question: 400
  - no token, “who am I?”: guest mode
  - invalid token, “who am I?”: guest mode
  - invalid token plus “I am a teacher. Show my schedule on Monday.”: did not open a personal timetable
  - BCS-1 Monday, then “What about Tuesday?” in the same session: `BS(CS)-I` Monday, then Tuesday
- Browser at http://localhost:19006: AI Chat still has **Chats**, and opening it shows **New chat** and saved titles beside the message box. Guest mode was not clicked again in this pass. A real campus account was not available, so a successful signed-in profile was not tested.

The local image is `sha256:aa319b42410f9a3b6820cbe4d2402e724e2cffdd65b9470a0af518b51d1e31ff`.

### Files

- `backend/API.py`
- `backend/tests/test_ask_api.py`
- `Frontend/src/screens/ChatScreen.js`
- `Frontend/src/screens/GuestModeScreen.js`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining blockers

1. A real campus Firebase login is still required to prove “who am I?” and “my schedule” for a student, teacher, or staff profile. Do not paste that token into a report.
2. `/ask` has no shared secret. On this computer it is limited by the 20-per-minute cap and the question-size cap. Do not publish port 8000 as a locked API.
3. Local chat history is still plaintext on the device. It is not server-side access control.

## Stage 8 — Guest mode separated from signed-in modes

Guest requests stay anonymous. Verified Student, Teacher, and Staff answers were not rewritten. No Firebase data, rules, scraper, deployment, or API network setting was changed. `auth_enabled` is still false, and port 8000 is still published on all interfaces of this computer.

### Guest behavior

- A request with no verified token is a guest request. It cannot read a personal profile or continue a verified user’s server memory, even if it sends the same session id and a `role` or `user_id` field.
- “Who am I?” says there is no signed-in profile. “I am a teacher. Show my schedule” does not open a personal timetable. It asks for a class, for example BCS-1.
- A named public class still works. BCS-1 Monday returned `BS(CS)-I`, and “What about Tuesday?” in that same guest session stayed on that class.
- Public teacher, event, notification, and website-knowledge questions still use the existing sources. Aamir Ali’s Monday availability came from the timetable. Events and BCS-1 notifications came from Firestore. The rector came from the Knowledge Pack.
- Unrelated questions are still declined.
- The Guest screen no longer says it is website-only or that it has no timetable. It says it answers public campus information and cannot open a personal profile. Structured timetable and availability answers are shown as readable lines. The signed-in chat screen was not redesigned.
- Guest and signed-in chat history remain in different local storage keys.

### Signed-in modes

Student, Teacher, and Staff personal answers are unchanged in code and still come only from a verified profile. Those paths passed again in the backend suite with mocked profiles. A real campus token was not available, so they were not proven live. The test-student screen still fails closed to guest when its token is not a verified campus profile.

### Tests actually run

- Full backend suite: **119 passed, 2 warnings, 7.90s**.
- Frontend history tests: **6 passed**. No ESLint or TypeScript check exists.
- Live `/ask` with no token, after the local backend rebuild:
  - who am I: guest, no profile
  - claimed teacher schedule: guest, no personal timetable
  - BCS-1 Monday then Tuesday: `BS(CS)-I` Monday, then Tuesday
  - Aamir Ali on Monday: teacher availability
  - capital of France: declined
  - rector: Prof. Dr. Raheel Qamar, T.I.
  - events today: no upcoming events; Football 2026-04-30 labeled past
  - BCS-1 notifications: none published
  - invalid token, who am I: guest
  - departments at Attock: intent `teachers`, and the reply named only Mathematics and Computer Engineering. That list is incomplete. The routing was not changed, because the same route is used for signed-in users.
- Browser: Guest welcome text matches the public-campus wording. Guest history showed only its own “hello” chat, not the test student’s chats. “who am I?” in the Guest screen returned guest mode. The test-student session was restored and the signed-in tabs came back. Teacher and Staff screens were not opened.

The local image is `sha256:e3af221b80fa8e2c762d8a9e0b8afa310b9e295a3dad57aeb62ba347bcbfe5dd`.

### Files

- `backend/pipeline.py`
- `backend/API.py`
- `backend/tests/test_identity.py`
- `backend/tests/test_ask_api.py`
- `Frontend/src/screens/GuestModeScreen.js`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining work

1. A real campus login is still required before Student, Teacher, or Staff personalization can be called verified.
2. The Attock department question is incomplete. Fixing that route would also change signed-in answers, so it was left for a later decision.
3. API security is unchanged from Stage 7: no API key, open CORS, and port 8000 is reachable by other devices on this network.
4. Local history is still plaintext and not synced.

## Stage 9 — Student answers from a verified profile

Student answers now use only a verified student profile plus the existing timetable and event records. Guest replies were not rewritten. Teacher and Staff personalization was not added. No Firebase document, rule, account, or deployment was changed.

### What the chatbot can actually use

A student is recognized only when token verification returns `type: student` and the owner profile. The profile fields that exist in the app are email, type, name, fullName, department, dept, semester, date of birth, phone, repeater flag, and the client-only test flag. The class key is built only from `dept` and `semester`, for example `cs` and semester 1 become `BS(CS)-I`. Subjects are the subject names on that class in the published timetable. They are not a separate subject list. A missing department or semester produces a short clarification. A role typed in the question is still ignored.

The open browser session is the anonymous test account `test-student@local.test`. That is not a verified campus profile. In the browser, “Who am I?” still answered: “You are in guest mode, so there is no signed-in profile.” Real-login verification is blocked. The student examples below were run inside the backend with a synthetic profile passed straight to the answer function. That is not a login and no token was created.

### Example answers

Synthetic profile: Computer Science, department code `cs`, semester 1, name Timing Student. This is not a real student.

1. “Who am I?” — “You are Timing Student, a student in Computer Science, semester 1.”
2. “What semester am I in?” — “You are in semester 1.”
3. “What subjects am I studying?” — “For BS(CS)-I, your subjects are: AoIaCT (Lab), PF(Lab), Programming Fundamentals, Fundamentals of Psychology, Civics and Community Engagement, Pre Calculus I, Application of Information and Communcation Technologies, Functional English.” The spelling “Communcation” is the stored timetable text.
4. “Show me my timetable.” — structured schedule for `BS(CS)-I`, the whole week, 17 meetings. The first meeting is AoIaCT (Lab).
5. “What is my next class?” — “Your next class is Functional English on Friday at 08:30-10:00 with Tasneem Fiza in CR 4.” This used the server clock on Thursday, October 29, 2026.
6. “Who teaches that class?” — “Tasneem Fiza teaches Functional English on Friday in CR 4.”
7. “What about Tuesday?” — structured `BS(CS)-I` Tuesday schedule. The first meeting is Programming Fundamentals.
8. “What university events are happening today, October 29, 2026?” — “I checked the published events and nothing is listed on October 29, 2026.”
9. “What events are on April 30, 2026?” — “Published events on April 30, 2026: Football at 01:43, BB department ground floor.” The same published records show Football on 2026-04-30, not on October 29.
10. “What is the capital of France?” — declined as off-topic. No model call.
11. A new session for the same synthetic student repeated “Who am I?” with the same profile sentence. A different synthetic student, Software Engineering semester 3, asked “What about Tuesday?” in a new session and received `BS(SE)-III` Tuesday, not the first student’s classes. A third session with no department or semester answered: “I can’t tell which class is yours from your profile. Tell me the class, for example BCS-1.”

A profile with no semester answers: “Your profile does not include a semester, so I can’t say which semester you are in.”

### Speed

Times are wall-clock seconds from the same synthetic student, measured in the backend process. They are not a real login. Profile retrieval could not be timed because no valid campus token exists. The identity cache remains 5 minutes. “Who am I?” and the semester answer do not read Firestore and do not call the model.

Before, on the Stage 8 container:

| Question | Time | What happened |
| --- | --- | --- |
| Who am I? | 0.00s | No name. Said “signed in as a student in cs, semester 1.” |
| Semester | 5.76s | Knowledge-pack answer, not the profile. |
| Subjects | 0.00s | “I don’t have that in the current university records.” No timetable read. |
| Timetable, cold | 3.34s | Whole-week `BS(CS)-I` schedule. |
| Timetable, repeat | 0.00s | Cached. |
| Next class, then who teaches, then Tuesday | 0.00s each | Next class was a raw record. “Who teaches that class?” showed Thursday, not that meeting. Tuesday stayed on `BS(CS)-I`. |
| Events on October 29, 2026, cold | 0.56s | Ignored the date and dumped past events, including Football. No model call. |
| Events on April 30, 2026 | 0.00s | Same past dump from cache. |
| Missing class on the profile | 0.00s | Generic “I don’t have that” sentence. |
| Capital of France | 1.43s | Declined. Operation split was not recorded. |

After, on image `sha256:4a857c386a8bfed22137756b2658dfbe1118aa92db86708cce8fdeaa0795a230`:

| Question | Time | Operations |
| --- | --- | --- |
| Who am I? | 0.000s | No Firestore, no model. |
| Semester | 0.001s | No Firestore, no model. |
| Subjects, cold | 4.081s | One timetable download, 4.078s. No model. |
| Subjects, repeat | 0.000s | Cached timetable. |
| Timetable, cold | 3.328s | One timetable download, 3.324s. No model. |
| Timetable, repeat | 0.001s | Cached. |
| Next class | 0.000s | Cached timetable. |
| Who teaches that class? | 0.000s | Memory only. |
| What about Tuesday? | 0.001s | Cached timetable. |
| Events on October 29, 2026, cold | 0.549s | Event read, 0.549s. No model. |
| Events on April 30, 2026 | 0.000s | Cached events. |
| Events on October 29, 2026, repeat | 0.000s | Cached events. |
| Missing class | 0.000s | No Firestore, no model. |
| Capital of France | 0.002s | Declined. No model. The timetable cache was already warm, so this is not comparable to the 1.43s before measurement. |

The useful speed change is the semester question: 5.76s down to 0.001s, because it no longer calls the knowledge pack or the model. The first timetable or subject read is still about 3 to 4 seconds. Repeats inside 5 minutes are immediate. A new publish can stay hidden for up to 5 minutes, which is the existing cache window.

### Guest checks

Live `/ask` with no token, after the rebuild:

- “Who am I?” — guest, no profile, 0.004s.
- Events on October 29, 2026 — the old past-event dump, including Football on 2026-04-30. Cold event read 3.095s. This guest wording was left unchanged.
- Events on April 30, 2026 — the same guest dump from cache, 0.003s. It does not use the new student date sentence.
- Capital of France — declined, 3.306s. That request also caused the server’s first timetable load.
- “What about Tuesday?” with no earlier class — asks for a class name, 0.003s.
- “What are BCS-1 classes on Monday?” — `BS(CS)-I` Monday: AoIaCT (Lab) with Muhammad Fawad, then two PF(Lab) meetings with Bukhari Maryam. 0.005s from cache.
- Invalid bearer token, “Who am I?” — guest, 0.492s.

Browser at `http://localhost:19006`: the signed-in test-student shell was still open. “Who am I?” in AI Chat returned the guest sentence. The Chats toggle and signed-in tabs were still there. Guest screen was not opened again. Expo web returned HTTP 200.

### Tests

- Full backend suite: **122 passed, 2 warnings, 6.91s**.
- Frontend history tests: **6 passed**. The existing Node module-type warning remains. No ESLint or TypeScript check exists.

### Files

- `backend/pipeline.py`
- `backend/tests/test_identity.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining issues

1. Real student login is still blocked. No campus token was available, and the browser test account is anonymous. The student answers above are not a real login.
2. Teacher and Staff personalization was not started.
3. The Attock department answer is still incomplete and was not changed, because that route is shared with guests.
4. API security is unchanged: no API key, open CORS, and port 8000 is reachable on this computer’s network.
5. Local chat history is still plaintext on the device and is not synced.
6. The first timetable download is still several seconds.

## Stage 9 continued — real student login

The account `sp26-bcs-009@cuiatk.edu.pk` was signed in through Firebase. The password was not saved, printed, or put in the browser. Email verification is true. The trusted profile is student Muzammil Husnain, Computer Science, department code `cs`, semester 2. Phone and date of birth are stored and were not repeated.

The first live check still answered as a guest. Google’s old token-info address rejects Firebase login tokens. The chatbot now checks the token signature with Google’s published keys. This computer’s clock was about two and a half minutes behind Google, so a five-minute clock allowance was added. The signature, project, issuer, expiry, and verified email are still required. No service account was added.

After that fix, the same login was recognized:

- “Who am I?” — “You are Muzammil Husnain, a student in Computer Science, semester 2.” First answer 3.394s, including token and profile reads. A new conversation repeated it in 0.003s.
- “What is my name?” — “Your name is Muzammil Husnain.” 0.003s.
- “What semester am I in?” — “You are in semester 2.” 0.003s. The stored semester is the number 2, not the Fall/Spring label.
- “What is my department?” — “You are in Computer Science.” 0.002s.
- Subjects for `BS(CS)-II`: Object Oriented Programming (Lab), Pre Calculus-II, Introduction to Entrepreneurship, Discrete Structures, Applied Physics, Applied Physics (Lab), Object Oriented Programming. Cold timetable read 3.972s.
- The week timetable has 12 meetings. Tuesday is Pre Calculus-II with Adil Ihsan in LT1, then Introduction to Entrepreneurship with Narmeen Khalid in CR 2.
- Next class on Thursday, October 29, 2026: “Your next class is Discrete Structures on Friday at 08:30-10:00 with Mehreen Wahab in LT3.”
- “Who teaches that class?” — “Mehreen Wahab teaches Discrete Structures on Friday in LT3.”
- October 29, 2026 has no published event. April 30, 2026 lists Football at 01:43, BB department ground floor.
- Ordinary questions now get a normal answer for this signed-in student: Paris is the capital of France (1.543s), 15 + 27 = 42 (0.412s), and a short joke (10.987s, because the model was slow). These do not use campus records. A guest asking the capital of France is still refused.

Backend tests after the change: **123 passed, 2 warnings**. Image `sha256:b5abb604678a4a82754b6468c927668c8d9e56562ff0afbe049d8e0ab1a42806`.

### Files

- `backend/identity.py`
- `backend/pipeline.py`
- `backend/tests/test_identity.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

## Stage 10 — University-only student chatbot

Unrelated questions are refused in Guest, Student, Teacher, and Staff modes. A mixed question answers the university part and declines the rest. Student answers still come from the verified profile and published records. Teacher and Staff personal schedules were not rewritten. No Firebase data, rules, account, or deployment was changed.

The earlier student exception that answered “What is the capital of France?” and jokes has been removed.

### Student answers with the real login

Signed in again through the API as `sp26-bcs-009@cuiatk.edu.pk`. The password and token were not saved or printed. This was not a browser session. The open browser is still the anonymous test account, so the on-screen chat was not signed in as this student.

- “Who am I?” — “You are Muzammil Husnain, a student in Computer Science, semester 2. Your class is BS(CS)-II.” First call 3.577s. A new chat repeated it in 0.002s.
- “What semester am I in?” — “You are in semester 2.” 0.004s.
- “What subjects am I studying?” — the BS(CS)-II subjects listed in Stage 9, including Object Oriented Programming, Pre Calculus-II, Discrete Structures, and Applied Physics. 3.309s for the timetable download.
- “What is my next class?” — Discrete Structures on Friday at 08:30–10:00 with Mehreen Wahab in LT3. 0.013s.
- “Who teaches that class?” — “Mehreen Wahab teaches Discrete Structures on Friday in LT3.” 0.002s.
- “What about Tuesday?” — BS(CS)-II Tuesday, 2 meetings. 0.005s.
- “What university events are happening today?” — nothing is listed on October 29, 2026. 0.821s.
- “Are there any events on October 29, 2026?” — the same sentence. 0.002s from cache.
- “What announcements or notifications are published?” — “Published announcements: Short circuit in Lab CS3, priority critical. There are no published notifications for BS(CS)-II.” 1.097s. The long announcement body was not dumped.
- “Tell me a joke.” — refused. 0.003s. No model call.
- “What is the capital of France?” — refused. 0.003s.
- “What is my next class and what is the capital of France?” — the Friday class, then “I can only answer the university part of that. I won't answer the unrelated part.” 0.002s.
- A guest “Tell me a joke.” was also refused. 0.002s.

Phone number and date of birth stayed out of the answers.

### Speed

Same synthetic Computer Science semester-2 profile, measured inside the backend before and after this stage. Not a real login. The real-login numbers above are separate.

| Test | Before this stage | After |
| --- | --- | --- |
| Who am I? | 0.000s, no class named | 0.001s, includes BS(CS)-II. No Firestore and no model |
| Subjects, cold | 4.137s | 3.880s, of which the timetable download was 3.878s |
| Subjects, repeat | 0.000s | 0.000s |
| Timetable, cold | 2.260s | 2.787s, timetable download 2.782s |
| Timetable, repeat | 0.001s | 0.001s |
| Next class, teacher follow-up, Tuesday | 0.000–0.001s | 0.000–0.001s |
| Events today, cold | 0.556s | 0.559s, event read 0.558s |
| Events on October 29, 2026, repeat | 0.000s | 0.000s |
| Capital of France | 1.506s, answered Paris | 0.001s refusal, no model |
| Joke | 0.481s, told a joke | 0.000s refusal, no model |

The earlier real-login joke took 10.987s. The same joke through `/ask` is now 0.003s. The first real “Who am I?” is still about 3.6s because the token and profile are read from Google. Repeats inside 5 minutes stay under 0.01s. The first timetable download is still about 3 to 4 seconds. Nothing is cached forever.

### Tests

- Backend suite: **126 passed, 2 warnings, 9.66s**.
- Frontend history tests: **6 passed**. The existing Node module-type warning remains.
- Guest, Student, Teacher, and Staff each refuse France and a joke without calling the model.
- A mixed question keeps the university part for all four modes.
- Guest announcements still use the older Firestore record text. Student notices are the short sentences above.
- Invalid tokens, claimed roles, and a second student context remain covered by the existing tests.

Image `sha256:3996d84f94ae78ee095241f6a0cc1fc4e3412dcf6d7477c1a5e4641eb5d0fc34`.

### Files

- `backend/pipeline.py`
- `backend/tests/test_identity.py`
- `Frontend/src/screens/ChatScreen.js`
- `Frontend/src/screens/GuestModeScreen.js`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining issues

1. The browser was not signed in as this student. The open page is still the anonymous test account, so the on-screen chat was not rechecked with this login.
2. The first “Who am I?” still takes about 3.6s, and the first timetable or subject read still takes about 3 to 4 seconds.
3. Teacher and Staff still have no new personalization beyond the shared university-only rule.
4. The Attock department list, open API, and plaintext local history are unchanged.

## Stage 11 — Browser student check and speed

The student account was signed in through the open browser. The page showed Student, semester 2, Computer Science, and the name Muzammil Husnain. The password and token were not saved or printed. This replaced the earlier staff session. It was not the anonymous test account.

The backend now loads the Firebase signing keys and the timetable at startup. The timetable still expires after five minutes, and documents are downloaded again only when the manifest changes. Profile reads use the same Firestore connection and do not put the token in the address. A public BCS-1 Monday question after that prefetch, before this login, took 0.011s. A repeat took 0.006s.

### Browser questions

Times are the browser’s own measurement of `/ask`. The password and token are not included.

| Question | Time | What the page showed |
| --- | --- | --- |
| Who am I? | 3.090s | Muzammil Husnain, a student in Computer Science, semester 2. Class BS(CS)-II. |
| What semester am I in? | 0.050s | Semester 2. |
| What subjects do I have? | 3.025s | OOP and lab, Pre Calculus-II, Introduction to Entrepreneurship, Discrete Structures, Applied Physics and lab. |
| Show my timetable | 0.550s | The published BS(CS)-II week, 12 meetings. |
| What is my next class? | 0.003s | Discrete Structures, Friday 08:30–10:00, Mehreen Wahab, LT3. |
| Who teaches that class? | 0.047s | Mehreen Wahab teaches Discrete Structures on Friday in LT3. |
| What about Tuesday? | 0.048s | Pre Calculus-II with Adil Ihsan in LT1, then Introduction to Entrepreneurship with Narmeen Khalid in CR 2. |
| What events are happening today? | 0.618s | Nothing is listed on October 29, 2026. |
| Are there any events on April 30, 2026? | not captured | Football at 01:43, BB department ground floor. The timing list was already full, so no millisecond was recorded. |
| Tell me a joke. | not captured | Refused. The reply stays on timetables, teachers, rooms, and COMSATS information. |
| What announcements and notifications do I have? | 3.456s | After the fix below: Short circuit in Lab CS3, priority critical. No notifications for BS(CS)-II. |
| What is my next class and what is the capital of France? | 0.056s | The Friday class, then the note that only the university part is answered. France was not answered. |
| Who am I? in a new chat | 0.008s | The same student sentence. The new chat did not need the old conversation. |

The first announcements reply, before the fix, answered only the announcement and added the unrelated-question note. The word “cat” sits inside “notifications”, and the splitter treated that half as unrelated. Off-topic words are now matched as whole words. The same question was asked again after the backend was rebuilt. It named both the announcement and the empty notification list, with no decline note.

Reopening the saved chat from the sidebar brought back the timetable, the joke refusal, and the mixed-question note. A separate saved “Hello!” chat from yesterday was still listed. History stays on this browser only.

### Speed

Stage 10 real login, for comparison: first Who am I 3.577s, subjects 3.309s, next class 0.013s, joke refusal 0.003s. The browser first identity is 3.090s and the first subject list is 3.025s. After the timetable is loaded, the browser timetable was 0.550s and the next-class follow-ups were under 0.05s. A new chat repeated identity in 0.008s because the profile was already cached. The 3.456s notices call was the first record read after the restart. None of these answers called Groq. Nothing is cached forever.

### Tests

- Backend suite: **127 passed, 2 warnings, 8.18s**. The notices test now also asks “What announcements and notifications do I have?” and expects both halves, with no decline note.
- Frontend history tests: **6 passed**. The existing Node module-type warning remains.
- Guest, Teacher, and Staff were not given new personalization. Their university-only refusals remain covered by the suite.

Image `sha256:670701f2dca2cbfc0c9c41c8fc127dcc4c781640eea94c2f170dd0ce8008f511`.

### Files

- `backend/API.py`
- `backend/identity.py`
- `backend/university_data.py`
- `backend/pipeline.py`
- `backend/tests/test_identity.py`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

### Remaining issues

1. The first signed-in “Who am I?” is still about 3 seconds when the profile is not already cached. The first subject list is also about 3 seconds.
2. The first announcements read after a restart took 3.5 seconds.
3. The joke and the April 30 event were answered on screen, but those two calls did not leave a browser timing.
4. Teacher and Staff still have no new personalization.
5. The Attock department list, open API, and plaintext local history are unchanged.

## Phase 1 — Routing and performance

Completed and retested.

- Class tokens keep hyphens and parentheses. `BCS-1?` normalizes to `BS(CS)-I`.
- Unknown class codes, teacher names, and room codes are not fuzzy-matched to real records.
- A lab question for a class is a timetable question, not availability of the room named `Lab`.
- Timetable classification uses whole-word keywords, so unrelated questions such as “capital of France” are not timetable questions.
- A short follow-up such as “What about Tuesday?” reuses the class only inside the same session. A new session asks for the class.
- “Is there a lab for this class?” uses the day from that conversation. After Tuesday, it does not invent a Tuesday lab.
- Timetable data is cached in memory after a successful Firestore load (60-second TTL). Teacher and room scans do not reload Firestore when that cache is already filled. There is no local timetable JSON fallback on `/ask`.
- `pdf_to_json.py` can still write `timetable_data.json` if that script is run by hand. The chat path does not read it.

Verified this session:

- `test_lab_meeting_question_is_not_the_room_named_lab` and `test_lab_question_detects_the_class_before_the_room_name`: 2 passed in 0.35s.
- Full backend suite in the `campusai-backend-test` image: **86 passed, 2 warnings, 6.63s**. The warnings are the existing FastAPI `on_event` deprecation notices.
- Earlier in this implementation, before the punctuation fix, the lab routing test failed and the suite was 1 failed / 78 passed. After the routing, identity, and pack-routing fixes, the suite reached 86 passed and was run again before the Docker rebuild.

## Phase 2 — University-only answers

Completed for the supported sources.

- Live timetable, teacher, room, event, announcement, notification, and lost-and-found answers come from Firestore reads.
- Saved COMSATS website answers come from the approved Knowledge Pack (`comsats_attock_official_seed_2026_10_24`, 34 usable documents). The pack files were not edited.
- Upcoming events are separated from past events. With no upcoming events, the reply says so and labels the stored events as past, without asking Groq to invent an event.
- Emergency announcements are returned from the Firestore records directly. The latest record found was “Short circuit in Lab CS3”, priority critical.
- Off-topic questions and poems are declined. A missing semester gets a clarification instead of a guessed class.
- Groq is used for grounded prose (greetings, department summary, CU Online, CWUR, rector, lost-and-found wording). Structured timetable, teacher-free, and room-free answers stay JSON objects for the existing frontend.
- Invalid tokens fail closed. A model or network failure returns the existing error path rather than an invented schedule.

## Phase 3 — Identity, memory, and history

### Identity

Implemented and fail-closed. No Firebase Admin credential is configured, and none was added.

- `/ask` reads only an `Authorization: Bearer` header. A role or name typed in the question is not trusted.
- The ID token is checked with Google’s `tokeninfo` endpoint. It must be email-verified, `aud` must be `universityassistentai`, and `iss` must be `https://securetoken.google.com/universityassistentai`.
- The profile is then read from `users/{email with dots replaced by underscores}` using that same bearer token. Rules already allow a user to read only their own profile. This does not use a service account.
- A fake token was executed inside the running container: `resolve_identity("not-a-real-token")` returned `None`.
- If token or profile verification fails, the request continues as an anonymous university question. It does not grant another user’s data.
- Profile department and semester can fill “my schedule” only after that verification. This personalization was **not** verified with a real signed-in Firebase token. The browser session open during testing was the development account labeled “Test Student” (`test-student@local.test`), with a student/teacher/staff switcher. That switcher is client UI state. Chat authorization does not follow it.

### Memory

Process-local session memory stores the last class, day, teacher, room, and subjects. “What about Tuesday?” in session `iso` returned the Tuesday `BS(CS)-I` schedule. The same question in a new session asked for a class name. Memory is lost on backend restart and is not shared across session IDs. Maximum 500 sessions, window of 8.

### Previous chats

Local only, in `Frontend/src/utils/chatHistory.js` via AsyncStorage.

- Keys are separate for a guest and a signed-in user. At most 20 chats are kept.
- History survives a refresh on that browser only. It is not available on another device.
- It is not written to Firestore, and no chat collection was created.
- Browser check: “New chat” cleared the transcript and showed the welcome card. Reopening the saved chat restored the Monday schedule and the Tuesday follow-up in order, each user question once. Two chips can share the title “What are BCS-1 classes on Monday?” when two saved chats start with that sentence. That is the chip title, not a duplicated bubble.

Guest mode uses the same local history and does not send a bearer token. The guest screen was not retested in the browser this session. Guest `/ask` is not restricted to website-only answers; the guest screen still says “Website AI”.

## Phase 4 — Runtime verification

### Tests

| Run | Result |
| --- | --- |
| Lab routing tests, this session | 2 passed, 0.35s |
| Full suite before the final image rebuild | 86 passed, 2 warnings, 6.63s |
| Earlier failing point, before the punctuation fix | 1 failed, 78 passed |

No new test failures were introduced by the final code. The suite was not run a second time after the rebuild because no source file changed between the passing suite and the image build. The image build used cached layers that already included `identity.py` and the pipeline changes.

### Docker

`docker compose up -d --build --no-deps backend` recreated `campusai-backend` from `campus_ai-main-backend`. Inside that container:

- `memory.last_day` is present in `handle_timetable`.
- `identity` imports, and an invalid token resolves to `None`.
- `answer_question` source does not reference `timetable_data.json`.

`GET /health` returned:

- `status`: ok
- Groq model `openai/gpt-oss-120b`
- base URL `https://api.groq.com/openai/v1`
- RAG unused
- Knowledge Pack 34 documents, compiled 2026-10-24
- `auth_enabled`: false (`CAMPUS_AI_API_KEY` is empty, so `/ask` is not gated by that key)
- rate limit 20/minute

The API key was not printed.

### Live `/ask` — 24 questions

Script: `campusai_targeted_qa.py`. Every response was HTTP 200. Session `iso` was shared for questions 1–22. Question 23 used a new session. Times are client elapsed time.

| # | Intent | Time | Result |
| --- | --- | --- | --- |
| 1 | general | 27.61s | Greeting, university-only offer. Cold Groq. |
| 2 | timetable | 0.01s | `BS(CS)-I` Monday: AoIaCT (Lab), Muhammad Fawad, Lab, 11:30–13:15; PF(Lab), Bukhari Maryam, Lab2, 13:35–15:00 and 15:00–16:30. |
| 3 | timetable | 0.00s | Same class Tuesday: Programming Fundamentals, Umar Zia, LT8; Fundamentals of Psychology, Hamid Masood, LH 4. |
| 4 | teacher | 0.00s | Asked which subject: Programming Fundamentals or Fundamentals of Psychology. |
| 5 | timetable | 0.00s | No lab meeting for `BS(CS)-I` on Tuesday. No invented lab. |
| 6 | events | 2.76s | No upcoming events. Football 2026-04-30 and the other stored events labeled past. |
| 7 | comsats_info | 1.29s | Department answer from the pack. The captured preview was truncated; the unit test checks that Management Sciences and the department index are retrieved. |
| 8 | announcements | 2.82s | Firestore text: Short circuit in Lab CS3, priority critical. |
| 9 | off_topic | 0.01s | Capital of France declined. |
| 10 | off_topic | 0.00s | Poem declined. |
| 11 | general | 0.01s | Asked for program and semester. Examples included BCS-1. |
| 12 | timetable | 0.01s | `BS(XX)-IX` not matched to a real class. |
| 13 | room_unknown | 0.00s | `ZZZ-999` not matched to a real room. |
| 14 | teacher | 0.01s | `Sir Zzzzzz` not matched to a real teacher. |
| 15 | timetable | 0.01s | Monday lab question for `BCS-1` returned the Monday lab meetings, not “room Lab” availability. |
| 16 | teacher | 0.01s | `teachers_free_now` for Thursday 13:35–15:00, including Aamir Ali. Cache was already warm. |
| 17 | rooms_all | 0.01s | `rooms_free` for Friday morning. Cache was already warm. |
| 18 | comsats_info | 1.13s | CU Online from the pack. |
| 19 | comsats_info | 0.86s | CWUR 2026: No. 1 in Pakistan, global rank 635. |
| 20 | lostfound | 6.27s | Lost and found records from Firestore. |
| 21 | notifications | 19.58s | No published class notifications for BCS-1. |
| 22 | general | 28.89s | Thanks, still university-scoped. |
| 23 | timetable | 37.16s | New session: “what about Tuesday?” asked for a class name. Correct isolation. The delay is real even though the text is static. |
| 24 | comsats_info | 17.73s | Rector Prof. Dr. Raheel Qamar, T.I., with the official source URL. |

No question in this set timed out. The slowest were the cold greeting (27.61s), thanks (28.89s), the isolated Tuesday follow-up (37.16s), and class notifications (19.58s). Wide teacher and room scans were fast only because question 2 had already loaded the timetable cache.

### Browser — http://localhost:19006

Expo web was started with `npx expo start --web --port 19006`. The page title was CampusAI. The signed-in shell showed AI Chat, Class Notification, Home page, Uni notification, Teacher list, and My Profile, in REGULAR MODE.

- Sent “What are BCS-1 classes on Monday?” The page rendered the `BS(CS)-I` Monday schedule: AoIaCT (Lab) / Muhammad Fawad / Lab, and PF(Lab) / Bukhari Maryam / Lab2 twice.
- Sent “What about Tuesday?” The reply was slow to appear. Reopening the saved chat showed the Tuesday schedule: Programming Fundamentals / Umar Zia / LT8, and Fundamentals of Psychology / Hamid Masood / LH 4. The user questions were not duplicated in the transcript.
- “New chat” restored the welcome card.
- My Profile showed the development test student and the student/teacher/staff switcher. Department and semester were not saved. No Firebase write was made.

Guest, teacher, and staff chat behavior were not separately exercised in the browser. Staff and teacher upload rights were not changed and were not retested.

## Files

Created:

- `backend/identity.py`
- `Frontend/src/utils/chatHistory.js`
- `CAMPUSAI_IMPLEMENTATION_REPORT.md`

Modified for this chatbot work:

- `backend/normalizer.py`
- `backend/timetable_service.py`
- `backend/pipeline.py`
- `backend/knowledge_pack.py` (retrieval scoring only; pack JSON not changed)
- `backend/API.py`
- `backend/Dockerfile`
- `backend/tests/test_routing.py`
- `backend/tests/test_knowledge_pack.py`
- `backend/tests/test_ask_api.py`
- `Frontend/src/screens/ChatScreen.js`
- `Frontend/src/screens/GuestModeScreen.js`

Not modified: Firestore data, `firestore.rules`, indexes, Firebase Auth settings, Knowledge Pack JSON/Markdown, and extracted timetable documents. `timetable_data.json` remains absent and is not a chat fallback.

The repository still has no commits. `Frontend/`, `backend/`, and `docker-compose.yml` were already untracked. Those trees were not reverted.

## Groq configuration (no secrets)

- Provider: groq
- Model: `openai/gpt-oss-120b`
- Base URL: `https://api.groq.com/openai/v1`
- Temperature 0.2, max tokens 300, timeout 30 seconds in the chat client
- Key location: gitignored `backend/.env` only

## Firebase confirmation

No create, update, delete, or migrate of Firestore documents. No rules, indexes, or auth settings were edited. Timetable answers matched the live `text_pdf_timetables` records already known for `BS(CS)-I`. The Knowledge Pack was read, not replaced.

## Remaining limits

1. No Firebase Admin SDK credential. Token revocation and any server-side user lookup beyond the caller’s own token cannot be done. Do not add a service-account JSON to bypass this. To verify personalized “my schedule”, sign in with a real Firebase user, confirm `email_verified`, and confirm `users/{email}` contains `type`, `dept`, and `semester`. If `tokeninfo` or that owner read fails, chat stays anonymous.
2. Chat history is device-local. Stage 4 kept that limit: there is still no cross-device copy, because a secure write would need credentials and rules that are not available. See Stage 4 for the isolation keys, the Node tests, and the browser reopen check.
3. Some `/ask` replies are still slow after the cache is warm: 37.16s for an isolated static follow-up, about 28s for a short Groq greeting or thanks, and 19.58s for an empty class-notification scan. They completed; they are not instant.
4. The first timetable load after a cold container can take about 25–40s. Later timetable reads in the same process are sub-second until the 60-second cache expires.
5. Guest mode still calls the same `/ask` endpoint, so a guest can receive timetable answers. The guest label was not changed.
6. Role selection in the app is not proof of identity for `/ask`.
7. Department answers are grounded in the pack, but the live prose preview was truncated at 700 characters, so the full department list was not re-read from the API response. Retrieval of Management Sciences is covered by the unit test.
8. Browser guest mode, a real Firebase ID token, and teacher/staff authorization were not tested.

## Manual steps for the remaining blockers

1. Personalized identity: set a real Firebase ID token only in the client after sign-in. Do not put a service account in the repo. Call `/ask` with `Authorization: Bearer <that token>` and a question such as “my schedule today”. Expect a class only when that user’s own `users` document has department and semester. If it stays anonymous, check token audience, issuer, and `email_verified`.
2. Cross-device history: not possible under the no-write rule. Local history is the completed behavior.
3. Slow notification and cold-start reads: these are live Firestore scans. No index or rule change was made. A future index change would be a Firebase configuration change and needs a separate decision.
4. Guest website-only behavior: not implemented. Changing it would be a product change beyond the fail-closed routing work.

## Processes left running

- `campusai-backend` on port 8000
- Expo web at http://localhost:19006

The targeted QA script exited. No extra test sweep was left running.
