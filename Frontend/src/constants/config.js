// ─── App-wide config ──────────────────────────────────────────────────────
export const ALLOWED_DOMAIN = '@cuiatk.edu.pk';

export const DEPT_MAP = {
  cs:   'Computer Science',
  se:   'Software Engineering',
  ai:   'Artificial Intelligence',
  math: 'Mathematics',
  ee:   'Electrical Engineering',
};

// Student academic departments are separate from legacy department labels and
// the building/floor-map department definitions below.
export const STUDENT_DEPARTMENTS = [
  { code: 'ai', label: 'AI — Artificial Intelligence' },
  { code: 'a_f', label: 'A_F' },
  { code: 'ba', label: 'BA' },
  { code: 'bda', label: 'BDA' },
  { code: 'ce', label: 'CE' },
  { code: 'cs', label: 'CS — Computer Science' },
  { code: 'ee', label: 'EE — Electrical/Electronic Engineering' },
  { code: 'english', label: 'English' },
  { code: 'math', label: 'Math' },
  { code: 'se', label: 'SE — Software Engineering' },
];

// Max semesters per department
export const DEPT_MAX_SEM = { cs: 8, se: 8, ai: 4, math: 8, ee: 8 };

export const SEM_LABELS = ['','1st','2nd','3rd','4th','5th','6th','7th','8th'];

export const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── User roles & permissions ─────────────────────────────────────────────
export const ROLES = {
  student: 'student',
  teacher: 'teacher',
  staff:   'staff',
  guest:   'guest',
};

/**
 * Centralised permission checks.
 * Pass the user object (must have .type property).
 */
export const can = {
  // Class Notifications
  postClassNotif:   (u) => u?.type === ROLES.teacher,
  editClassNotif:   (u) => u?.type === ROLES.teacher,
  deleteClassNotif: (u) => u?.type === ROLES.teacher,
  postRoomReservation: (u) => u?.type === ROLES.staff,
  editRoomReservation: (u) => u?.type === ROLES.staff,
  deleteRoomReservation: (u) => u?.type === ROLES.staff,

  // University Events
  postEvent:   (u) => u?.type === ROLES.teacher || u?.type === ROLES.staff,
  editEvent:   (u) => u?.type === ROLES.teacher || u?.type === ROLES.staff,
  deleteEvent: (u) => u?.type === ROLES.teacher || u?.type === ROLES.staff,

  // Lost & Found
  postLF:   (u) => !!u && u.type !== ROLES.guest,   // all logged-in users
  editLF:   (u) => u?.type === ROLES.staff,
  deleteLF: (u) => u?.type === ROLES.staff,
  resolveLF:(u) => u?.type === ROLES.staff,

  // Timetable upload (Admin panel)
  uploadTimetable: (u) => u?.type === ROLES.staff || u?.type === ROLES.teacher,
};

// ─── Navigation tabs ──────────────────────────────────────────────────────
export const NAV_TABS = [
  { key: 'chat',      label: 'AI Chat',             icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' },
  { key: 'class',     label: 'Class Notification',  icon: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z', badge: true },
  { key: 'home',      label: 'Home page',           icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { key: 'uninews',   label: 'Uni notification',    icon: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  { key: 'directory', label: 'Teacher list',        icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.98 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { key: 'profile',   label: 'My Profile',          icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
];

// Guest mode is restricted to these two destinations only (Website AI + About Us).
export const GUEST_NAV_TABS = [
  { key: 'chat',  label: 'Website AI', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1.9-2 2-2z' },
  { key: 'about', label: 'About Us',   icon: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' },
];

export const USER_TYPES = [
  { id: 'student', label: 'Student', sub: 'Enrolled student · @cuiatk.edu.pk' },
  { id: 'teacher', label: 'Teacher', sub: 'Faculty member · @cuiatk.edu.pk' },
  { id: 'staff',   label: 'Staff',   sub: 'Admin / support · @cuiatk.edu.pk' },
];

// ─── Notification types ───────────────────────────────────────────────────
export const NOTIF_TYPES = {
  arrange:    { label: 'Arrange Class',  l:{bg:'#DCFCE7',bd:'#16A34A',tx:'#166534'}, d:{bg:'#052E16',bd:'#22C55E',tx:'#86EFAC'} },
  room_reservation: { label: 'Room Reserved', l:{bg:'#DBEAFE',bd:'#2563EB',tx:'#1D4ED8'}, d:{bg:'#172554',bd:'#60A5FA',tx:'#BFDBFE'} },
  cancel:     { label: 'Cancel Class',   l:{bg:'#FEE2E2',bd:'#EF4444',tx:'#B91C1C'}, d:{bg:'#450A0A',bd:'#F87171',tx:'#FCA5A5'} },
  assignment: { label: 'Assignment',     l:{bg:'#FEF9C3',bd:'#CA8A04',tx:'#854D0E'}, d:{bg:'#422006',bd:'#FCD34D',tx:'#FDE047'} },
  quiz:       { label: 'Quiz',           l:{bg:'#EDE9FF',bd:'#6C47D4',tx:'#3D2B8E'}, d:{bg:'#2A1C6B',bd:'#A78BFA',tx:'#C4B5FD'} },
  other:      { label: 'Other',          l:{bg:'#F3F4F6',bd:'#6B7280',tx:'#374151'}, d:{bg:'#1F2937',bd:'#9CA3AF',tx:'#D1D5DB'} },
};

// ─── Event categories ─────────────────────────────────────────────────────
export const EVENT_CATS = [
  { key: 'academic',  label: 'Academic',  color: '#4F46E5' },
  { key: 'sports',    label: 'Sports',    color: '#16A34A' },
  { key: 'cultural',  label: 'Cultural',  color: '#D97706' },
  { key: 'career',    label: 'Career',    color: '#0891B2' },
  { key: 'other',     label: 'Other',     color: '#6B7280' },
];

// ─── Lost & Found categories ──────────────────────────────────────────────
export const LF_CATS = [
  { key: 'wallet',     label: 'Wallet / ID' },
  { key: 'phone',      label: 'Phone' },
  { key: 'bag',        label: 'Bag / Laptop' },
  { key: 'stationery', label: 'Stationery' },
  { key: 'clothing',   label: 'Clothing' },
  { key: 'other',      label: 'Other' },
];

export const ISSUE_CATEGORIES = {
  room: [
    { key: 'air_conditioning', label: 'Air Conditioning' },
    { key: 'projector', label: 'Projector' },
    { key: 'chairs', label: 'Chairs' },
    { key: 'lights', label: 'Lights' },
    { key: 'other', label: 'Others' },
  ],
  lab: [
    { key: 'air_conditioning', label: 'Air Conditioning' },
    { key: 'projector', label: 'Projector' },
    { key: 'chairs', label: 'Chairs' },
    { key: 'lights', label: 'Lights' },
    { key: 'computer', label: 'Computer / PC' },
    { key: 'electric_port', label: 'Electric Port' },
    { key: 'other', label: 'Others' },
  ],
};

// ─── Fallback lecture slots (used before Firebase loads) ──────────────────
export const FALLBACK_LECTURE_SLOTS = {
  1: { label: 'Lecture 1', start: '08:30', end: '09:45' },
  2: { label: 'Lecture 2', start: '09:45', end: '11:00' },
  3: { label: 'Lecture 3', start: '11:00', end: '12:30' },
  4: { label: 'Lecture 4', start: '12:30', end: '13:45' },
  5: { label: 'Lecture 5', start: '14:00', end: '15:15' },
  6: { label: 'Lecture 6', start: '15:15', end: '16:30' },
};

// ─── Department-specific floor map layouts ───────────────────────────────
export const CS_FLOORS = {
  1: {
    outerR: 200, innerR: 70,
    arcRooms: [
      { id:'LT3', cx:270, cy:315, w:74, h:46, type:'lt' },
      { id:'LT2', cx:380, cy:298, w:78, h:52, type:'lt' },
      { id:'LT1', cx:490, cy:315, w:74, h:46, type:'lt' },
    ],
    leftWing: [
      { id:'OffL1', cx:188, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL2', cx:113, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL3', cx:38,  cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL4', cx:188, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL5', cx:113, cy:396, w:68, h:32, type:'office', label:'MS Lab' },
      { id:'OffL6', cx:38,  cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
    rightWing: [
      { id:'OffR1', cx:572, cy:358, w:68, h:32, type:'office', label:'Dept Staff' },
      { id:'OffR2', cx:647, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR3', cx:722, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR4', cx:572, cy:396, w:68, h:32, type:'office', label:'PS Office' },
      { id:'OffR5', cx:647, cy:396, w:68, h:32, type:'office', label:'HOD Office' },
      { id:'OffR6', cx:722, cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
  },
  2: {
    outerR: 200, innerR: 70,
    arcRooms: [
      { id:'LT6', cx:270, cy:315, w:74, h:46, type:'lt' },
      { id:'LT5', cx:380, cy:298, w:78, h:52, type:'lt' },
      { id:'LT4', cx:490, cy:315, w:74, h:46, type:'lt' },
    ],
    leftWing: [
      { id:'Lab2',  cx:188, cy:358, w:68, h:32, type:'lab', label:'Computer Lab 2' },
      { id:'Lab1',  cx:188, cy:396, w:68, h:32, type:'lab', label:'Computer Lab 1' },
      { id:'OffL7', cx:113, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL8', cx:113, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL9', cx:38,  cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL10',cx:38,  cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
    rightWing: [
      { id:'OffR7', cx:572, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR8', cx:572, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR9', cx:647, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR10',cx:647, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR11',cx:722, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR12',cx:722, cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
  },
  3: {
    outerR: 200, innerR: 88,
    arcRooms: [
      { id:'LT9', cx:312, cy:306, w:90, h:52, type:'lt' },
      { id:'LT8', cx:448, cy:306, w:90, h:52, type:'lt' },
    ],
    leftWing: [
      { id:'Lab4',  cx:188, cy:358, w:68, h:32, type:'lab', label:'Electric Lab 4' },
      { id:'Lab3',  cx:188, cy:396, w:68, h:32, type:'lab', label:'Electric Lab 3' },
      { id:'OffL13',cx:113, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL14',cx:113, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL15',cx:38,  cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL16',cx:38,  cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
    rightWing: [
      { id:'OffR13',cx:572, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR14',cx:572, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR15',cx:647, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR16',cx:647, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR17',cx:722, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR18',cx:722, cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
  },
};

export const MATH_FLOORS = {
  1: {
    layout: 'courtyard',
    label: 'Ground Floor',
    courtyard: { x:150, y:292, w:460, h:100 },
    building: { x:60, y:220, w:640, h:240 },
    rooms: [
      { id:'Computer & Network Lab', cx:180, cy:250, w:110, h:40, type:'lab', label:'Computer & Network Lab' },
      { id:'Lecture Hall 06', cx:290, cy:250, w:110, h:40, type:'lt'  },
      { id:'Lecture Hall 05', cx:470, cy:250, w:110, h:40, type:'lt' },
      { id:'Lecture Hall 04', cx:580, cy:250, w:110, h:40, type:'lt' },
      { id:'Lecture Hall 03', cx:180, cy:430, w:110, h:40, type:'lt' },
      { id:'Lecture Hall 07', cx:290, cy:430, w:110, h:40, type:'lt' },
      { id:'Lecture Hall 02', cx:470, cy:430, w:110, h:40, type:'lt' },
      { id:'Lecture Hall 01', cx:580, cy:430, w:110, h:40, type:'lt' },
      { id:'Faculty Office G6', cx:95, cy:310, w:60, h:40, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G7', cx:95, cy:340, w:60, h:20, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G8', cx:95, cy:370, w:60, h:40, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G1', cx:668, cy:280, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G2', cx:668, cy:310, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G3', cx:668, cy:340, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G4', cx:668, cy:370, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office G5', cx:668, cy:400, w:60, h:30, type:'office', label:'Faculty Office' },
    ],
  },
  2: {
    layout: 'courtyard',
    label: 'First Floor',
    courtyard: { x:150, y:292, w:460, h:100 },
    building: { x:60, y:220, w:640, h:240 },
    rooms: [
      { id:'Class Room IV', cx:180, cy:250, w:110, h:40, type:'lt'},
      { id:'Class Room III', cx:290, cy:250, w:110, h:40, type:'lt'},
      { id:'Class Room II', cx:470, cy:250, w:110, h:40, type:'lt' },
      { id:'Class Room I', cx:580, cy:250, w:110, h:40, type:'lt' },
      { id:'Electronics Lab', cx:180, cy:430, w:110, h:40, type:'lab', label:'Electronics Lab' },
      { id:'Class Room V', cx:290, cy:430, w:110, h:40, type:'lt' },
      { id:'Class Room VI', cx:470, cy:430, w:110, h:40, type:'lt' },
      { id:'Class Room VII', cx:580, cy:430, w:110, h:40, type:'lt' },
      { id:'Faculty Office F1', cx:668, cy:280, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F2', cx:668, cy:310, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F3', cx:668, cy:340, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F4', cx:668, cy:370, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F5', cx:668, cy:400, w:60, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F6', cx:380, cy:430, w:60, h:40, type:'office', label:'Faculty Office' },
      { id:'Computer Lab1', cx:87, cy:261, w:50, h:80, type:'office', label:'Computer Lab' },
      { id:'Computer Lab2', cx:87, cy:341, w:50, h:80, type:'office', label:'Computer Lab' },
      { id:'Computer Lab3', cx:87, cy:420, w:50, h:78, type:'office', label:'Computer Lab' },

    ],
  },
};

export const EE_FLOORS = {
  1: {
    layout: 'courtyard',
    label: 'Ground Floor',
    courtyard: { x:150, y:292, w:460, h:100 },
    building: { x:60, y:220, w:645, h:240 },
    rooms: [
      { id:'Electric Machine Lab', cx:260, cy:255, w:120, h:50, type:'lab', label:'Electric Machine Lab' },
      { id:'Computer Lab', cx:420, cy:255, w:120, h:50, type:'lab', label:'Computer Lab' },
      { id:'DLD/MP Lab', cx:540, cy:255, w:120, h:50, type:'lab', label:'DLD/MP Lab' },
      { id:'Communication Lab', cx:260, cy:425, w:120, h:50, type:'lab', label:'Communication Lab' },
      { id:'Electronics/ECA Lab', cx:420, cy:425, w:120, h:50, type:'lab', label:'Electronics/ECA Lab' },
      { id:'Physics Lab', cx:540, cy:425, w:120, h:50, type:'lab', label:'Physics Lab' },
      { id:'Faculty Office G1', cx:170, cy:255, w:42, h:50, type:'office', label:'Faculty Office' },
      { id:'Office1', cx:100, cy:320, w:60, h:42, type:'office', label:'Office' },
      { id:'HOD Office', cx:100, cy:370, w:60, h:42, type:'office', label:'HOD Office' },
      { id:'Faculty Office G2', cx:170, cy:425, w:42, h:50, type:'office', label:'Faculty Office' },
      { id:'Office2', cx:666, cy:239, w:75, h:35, type:'office', label:'Office' },
      { id:'Control System Lab', cx:666, cy:343, w:75, h:100, type:'lab', label:'Control System Lab' },
      { id:'Office3', cx:666, cy:440, w:75, h:35, type:'office', label:'Office' },
    ],
  },
  2: {
    layout: 'courtyard',
    label: 'First Floor',
    courtyard: { x:150, y:292, w:460, h:100 },
    building: { x:60, y:220, w:645, h:240 },
    rooms: [
      { id:'Embedded System Lab', cx:260, cy:255, w:120, h:50, type:'lab', label:'Embedded System Lab' },
      { id:'Industrial Electronics Lab', cx:420, cy:255, w:120, h:50, type:'lab', label:'Industrial Electronics Lab' },
      { id:'Conference Room', cx:540, cy:255, w:120, h:50, type:'office', label:'Conference Room' },
      { id:'Research Lab', cx:260, cy:425, w:120, h:50, type:'lab', label:'Research Lab' },
      { id:'Faculty Office F1', cx:340, cy:425, w:38, h:50, type:'office', label:'Faculty Office' },
      { id:'Final Year Project Lab', cx:420, cy:425, w:120, h:50, type:'lab', label:'Final Year Project Lab' },
      { id:'Faculty Office F2', cx:510, cy:425, w:60, h:50, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F3', cx:570, cy:425, w:60, h:50, type:'office', label:'Faculty Office' },
      { id:'Faculty Common Room', cx:663 , cy:430, w:80, h:46, type:'office', label:'Faculty Common Room' },
      { id:'Seminar Hall', cx:658, cy:307, w:90, h:170, type:'lt', label:'Seminar Hall' },
      { id:'Faculty Office F4', cx:170, cy:255, w:42, h:50, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F5', cx:170, cy:425, w:42, h:50, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F6', cx:100, cy:280, w:70, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F7', cx:100, cy:310, w:70, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F8', cx:100, cy:340, w:70, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F9', cx:100, cy:370, w:70, h:30, type:'office', label:'Faculty Office' },
      { id:'Faculty Office F10', cx:100, cy:400, w:70, h:30, type:'office', label:'Faculty Office' },
    ],
  },
};

export const DEPT_FLOORS = {
  cs: CS_FLOORS,
  math: MATH_FLOORS,
  ee: EE_FLOORS,
};

export const FLOOR_ROOMS = {
  1: ['LT1','LT2','LT3'],
  2: ['LT4','LT5','LT6','Lab1','Lab2'],
  3: ['LT8','LT9','Lab3','Lab4'],
};

export const DEPT_FLOOR_ROOMS = {
  cs: {
    1: ['LT1','LT2','LT3'],
    2: ['LT4','LT5','LT6','Lab1','Lab2'],
    3: ['LT8','LT9','Lab3','Lab4'],
  },
  math: {
    1: ['Lecture Hall 04','Lecture Hall 05','Lecture Hall 06'],
    2: ['Class Room I','Class Room II','Class Room III','Class Room IV','Class Room V','Class Room VI','Class Room VII'],
  },
  ee: {
    1: ['Electric Machine Lab','Computer Lab','DLD/MP Lab','Communication Lab','Electronics/ECA Lab','Physics Lab','Control System Lab'],
    2: ['Embedded System Lab','Industrial Electronics Lab','Research Lab','Final Year Project Lab','Seminar Hall'],
  },
};

export const FLOOR_LABELS = { 1:'Ground Floor', 2:'First Floor', 3:'Second Floor' };
export const DEPT_FLOOR_LABELS = {
  cs: { 1:'Ground Floor', 2:'First Floor', 3:'Second Floor' },
  math: { 1:'Ground Floor', 2:'First Floor' },
  ee: { 1:'Ground Floor', 2:'First Floor' },
};
