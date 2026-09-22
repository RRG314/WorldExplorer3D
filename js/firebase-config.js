import { assertFirebaseEnvironment } from './firebase-environment-policy.js';

export const FIREBASE_CONFIG_STORAGE_KEY = 'worldExplorer3D.firebaseConfig';

export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const cfg = {
    apiKey: String(raw.apiKey || '').trim(),
    authDomain: String(raw.authDomain || '').trim(),
    projectId: String(raw.projectId || '').trim(),
    storageBucket: String(raw.storageBucket || '').trim(),
    messagingSenderId: String(raw.messagingSenderId || '').trim(),
    appId: String(raw.appId || '').trim(),
    measurementId: String(raw.measurementId || '').trim(),
    appCheckSiteKey: String(raw.appCheckSiteKey || '').trim()
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
  return assertFirebaseEnvironment(readWindowConfig() || readStoredConfig());
}

export function hasFirebaseConfig() {
  return !!readFirebaseConfig();
}

