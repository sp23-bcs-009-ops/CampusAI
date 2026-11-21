// ─── Firebase project credentials ────────────────────────────────────────
// TODO: Replace all placeholder values with your actual Firebase project keys.
// These are available in the Firebase Console → Project Settings → Your apps.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB04Cgl5eIUQb_x85qrI7l6OLDEA45y-WI",
  projectId: "universityassistentai",
};

// ─── Derived service base URLs ────────────────────────────────────────────
export const FS_BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
