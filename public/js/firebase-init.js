import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const FIREBASE_CONFIG_STORAGE_KEY = 'worldExplorer3D.firebaseConfig';

let cachedServices = null;

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const cfg = {
    apiKey: String(raw.apiKey || '').trim(),
    authDomain: String(raw.authDomain || '').trim(),
    projectId: String(raw.projectId || '').trim(),
    storageBucket: String(raw.storageBucket || '').trim(),
    messagingSenderId: String(raw.messagingSenderId || '').trim(),
    appId: String(raw.appId || '').trim()
  };

  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
  return cfg;
}

function readWindowConfig() {
  const raw = globalThis.WORLD_EXPLORER_FIREBASE;
  return normalizeConfig(raw);
}

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

export function readFirebaseConfig() {
  return readWindowConfig() || readStoredConfig();
}

export function hasFirebaseConfig() {
  return !!readFirebaseConfig();
}

export function initFirebase() {
  if (cachedServices) return cachedServices;
  const config = readFirebaseConfig();
  if (!config) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);

  cachedServices = { app, auth, db, config };
  return cachedServices;
}

export function setFirebaseConfig(config) {
  const normalized = normalizeConfig(config);
  if (!normalized) {
    throw new Error('Invalid Firebase config. Expected apiKey, projectId, and appId.');
  }

  localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  cachedServices = null;
  return normalized;
}

export { FIREBASE_CONFIG_STORAGE_KEY };

globalThis.WorldExplorerFirebase = {
  initFirebase,
  hasFirebaseConfig,
  readFirebaseConfig,
  setFirebaseConfig,
  FIREBASE_CONFIG_STORAGE_KEY
};
