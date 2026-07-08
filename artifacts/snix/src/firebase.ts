import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCNf0irsu8Vm3rxwAKLwMS_B_847eUDSww",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "snix-2a816.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "snix-2a816",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "snix-2a816.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "860805859882",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:860805859882:web:eeb7cd7d18a296cf1ad153",
};

export const isFirebaseConfigured = true;

const app = (() => {
  try {
    return initializeApp(firebaseConfig);
  } catch (err) {
    console.error("[SNIX] initializeApp failed:", err);
    return null;
  }
})();

// Auth with IndexedDB persistence so login survives app restarts
export const auth = (() => {
  if (!app) return null as any;
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    // Already initialized
    try { return getAuth(app); } catch (e) { console.error("[SNIX] getAuth failed:", e); return null as any; }
  }
})();

// Firestore with memory cache — write errors (e.g. security-rule rejections) surface
// immediately instead of being silently swallowed by offline persistence queuing.
export const db = (() => {
  if (!app) return null as any;
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch {
    // Already initialized — fall back to basic
    try { return getFirestore(app); } catch (e) { console.error("[SNIX] getFirestore failed:", e); return null as any; }
  }
})();

import { getStorage } from "firebase/storage";
export const storage = (() => {
  if (!app) return null as any;
  try { return getStorage(app); } catch (e) { console.error("[SNIX] getStorage failed:", e); return null as any; }
})();

export default app!;
