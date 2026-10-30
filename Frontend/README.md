# CampusAI — COMSATS University Islamabad, Attock Campus

React Native (Expo) mobile app for campus management.

---

## 📁 Project Structure

```
CampusAI/
├── App.js                          # Root navigation + state
├── app.json                        # Expo config
├── babel.config.js
├── package.json
├── assets/
└── src/
    ├── constants/
    │   ├── colors.js               # Brand colours + room status palette
    │   └── config.js               # All app-wide config, permissions, floor map data
    │
    ├── firebase/
    │   ├── config.js               # Firebase SDK keys (fill in YOUR_* values)
    │   └── firestore.js            # fsGet / fsSet / fsAdd / fsUpdate / fsDelete / fsList / storageUpload
    │
    ├── utils/
    │   └── helpers.js              # Auth helpers, time utils, room status, sort, event status
    │
    ├── hooks/
    │   ├── useTimetable.js         # Loads active timetable from Firestore on mount
    │   └── useNotifs.js            # Class notifications: load, post, edit, delete
    │
    ├── components/
    │   ├── ui/
    │   │   └── index.js            # COMSATSLogo, PrimaryButton, InputField, ErrBanner, Chip, etc.
    │   ├── map/
    │   │   └── ArcMap.js           # SVG floor map (3 floors, scrollable)
    │   ├── class/
    │   │   ├── PostModal.js        # Teacher-only: type → dept/sem → form
    │   │   └── NotifCard.js        # Notification card with pin/edit/delete (teacher only)
    │   ├── events/
    │   │   ├── EventPostModal.js   # Teacher/Staff: 2-step warning + form + image picker
    │   │   └── EventCard.js        # Event card with edit/delete (teacher/staff only)
    │   └── lostfound/
    │       ├── LFPostModal.js      # All users: 2-step warning + form + image picker
    │       └── LFCard.js           # L&F card with resolve/edit/delete (staff only)
    │
    └── screens/
        ├── LoginScreen.js          # Sign in / Sign up (role select → form)
        ├── HomeScreen.js           # Floor map + TT button + Admin PDF upload
        ├── ClassScreen.js          # Class Board (type + subject filter)
        ├── UniNewsScreen.js        # Events + Lost & Found (sub-tabs)
        └── ProfileScreen.js        # My Page (edit name/dob/phone, portal link)
```

---

## 🔐 Permission Matrix

| Feature                  | Student | Teacher | Staff | Guest |
|--------------------------|:-------:|:-------:|:-----:|:-----:|
| View Class Notifications | ✓       | ✓       | ✓     | —     |
| Post / Edit / Delete Notif | —     | ✓       | —     | —     |
| View Events              | ✓       | ✓       | ✓     | —     |
| Post / Edit / Delete Event | —     | ✓       | ✓     | —     |
| View Lost & Found        | ✓       | ✓       | ✓     | —     |
| Post Lost & Found        | ✓       | ✓       | ✓     | —     |
| Edit / Delete / Resolve LF | —     | —       | ✓     | —     |
| Upload Timetable PDF     | —       | ✓       | ✓     | —     |

All permissions are defined in `src/constants/config.js` → `can` object.

---

## 🔥 Firebase Design

### Collections

```
/text_pdf_timetables/{dept}_sem{n} ← Converted Text PDF timetable document
/text_pdf_timetables/current      ← Regular manifest: documentIds, sourceHash
/text_pdf_timetables/exam         ← Converted exam timetable document
/text_pdf_timetables/exam_current ← Exam manifest: documentIds, sourceHash

Converted timetable document fields:
  version:       "TT2"
  effectiveDate: "2026-04-20"
  uploadedBy:    "admin@cuiatk.edu.pk"
  uploadedAt:    ISO timestamp
  pdfUrl:        Storage download URL
  pdfPath:       Storage path
  status:        "active"
  lectureSlots:  { "1": {label, start, end}, ... }   ← parsed from PDF lecture headers
  roomMap:       { "LT9": [{day,start,end,subject,prof,isMine}] }
  displayRows:   [ {day, slots:[{n,subject,prof,room,mine}]} ]
  subjectsList:  ["Information Security", ...]

/timetables/*                    ← Legacy data; Text PDF UI does not read or write here

/notifications/{dept}/{semester}/posts/{docId}
  type:       "arrange" | "cancel" | "assignment" | "quiz" | "other"
  dept:       "cs" | "se" | "ai"
  semester:   1-8
  subject:    string
  lectureNum: number | null
  date:       "YYYY-MM-DD" | null
  deadline:   "YYYY-MM-DDTHH:MM" | null
  room:       string | null
  body:       string
  postedBy:   string
  pinned:     boolean
  title:      string

/events/{docId}                 ← University Events
  cat, title, date, time, endTime, venue,
  deadline, contact, body, images[], postedBy, createdAt

/lostfound/{docId}              ← Lost & Found
  type, cat, title, location, date, time,
  contact, body, images[], resolved, postedBy, createdAt
```

### Text PDF upload

The admin upload calls the FastAPI `/upload-timetable` endpoint. The backend accepts
PDFs with a usable embedded text layer, extracts page geometry with PyMuPDF, and
uses Python rules to split timetable cells into the existing schema. It writes
converted documents and the current manifest to `text_pdf_timetables`.
Image/scan PDFs are rejected with `TEXT_PDF_REQUIRED`; there is no OCR fallback.
View Timetable and the floor map read only the active documents identified by the
manifests in `text_pdf_timetables`. The legacy Node upload endpoint on port 3000 is
disabled for PDF processing and returns an endpoint-moved response.

---

## 🚀 Setup & Run

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (iOS/Android)

### Steps

```bash
# 1. Install dependencies
cd CampusAI
npm install

# 2. Add Firebase credentials
# Open src/firebase/config.js and replace all YOUR_* placeholders

# 3. Start dev server
npx expo start

# 4. Scan QR code with Expo Go on your phone
```

### Android (USB)
```bash
npx expo start --android
```

### iOS (Simulator)
```bash
npx expo start --ios
```

---

## 📝 Notes for Backend Team

- All Firestore calls use REST API (no Firebase SDK dependency)
- `src/firebase/firestore.js` exports: `fsGet`, `fsSet`, `fsAdd`, `fsUpdate`, `fsDelete`, `fsList`, `storageUpload`
- PDF upload: frontend sends the PDF to FastAPI; Text PDF data is isolated in `text_pdf_timetables`
- Image/scan PDFs are unsupported and are not sent to Vision OCR
- No auth token implementation yet — add Firebase Auth Bearer token to fetch headers in `firestore.js` when ready
