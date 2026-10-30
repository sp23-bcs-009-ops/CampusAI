// ─── Firebase project credentials ────────────────────────────────────────
// TODO: Replace all placeholder values with your actual Firebase project keys.
// These are available in the Firebase Console → Project Settings → Your apps.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB04Cgl5eIUQb_x85qrI7l6OLDEA45y-WI",
  authDomain: "universityassistentai.firebaseapp.com",
  projectId: "universityassistentai",
  storageBucket: "universityassistentai.firebasestorage.app",
  messagingSenderId: "245229034731",
  appId: "1:245229034731:web:fa5d97937229ac4ec5b2ae",
};

// ─── Derived service base URLs ────────────────────────────────────────────
export const FS_BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

export const STORAGE_BASE =
  `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_CONFIG.storageBucket}/o`;

export const isFirebaseConfigured =
  FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';