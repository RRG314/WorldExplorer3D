import { getFirestore } from '../app/js/platform/firebase/firestore.js';
import { initFirebaseAuth, resetFirebaseAuth } from './firebase-auth-init.js';
import {
  FIREBASE_CONFIG_STORAGE_KEY,
  hasFirebaseConfig,
  persistFirebaseConfig,
  readFirebaseConfig
} from './firebase-config.js';

let cachedServices = null;

export function initFirebase() {
  if (cachedServices) return cachedServices;
  const authServices = initFirebaseAuth();
  if (!authServices) return null;
  const { app, auth, config } = authServices;
  const db = getFirestore(app);

  cachedServices = { app, auth, db, config };
  return cachedServices;
}

export async function initFirebaseAnalytics() {
  const module = await import('./firebase-analytics-init.js');
  return module.initFirebaseAnalytics();
}

export function setFirebaseConfig(config) {
  const normalized = persistFirebaseConfig(config);
  cachedServices = null;
  resetFirebaseAuth();
  return normalized;
}

export {
  FIREBASE_CONFIG_STORAGE_KEY,
  hasFirebaseConfig,
  readFirebaseConfig
};

globalThis.WorldExplorerFirebase = {
  initFirebase,
  initFirebaseAnalytics,
  hasFirebaseConfig,
  readFirebaseConfig,
  setFirebaseConfig,
  FIREBASE_CONFIG_STORAGE_KEY
};
