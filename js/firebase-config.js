const FIREBASE_CONFIG_STORAGE_KEY = 'worldExplorer3D.firebaseConfig';

function normalizeFirebaseConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const config = {
    apiKey: String(raw.apiKey || '').trim(),
    authDomain: String(raw.authDomain || '').trim(),
    projectId: String(raw.projectId || '').trim(),
    storageBucket: String(raw.storageBucket || '').trim(),
    messagingSenderId: String(raw.messagingSenderId || '').trim(),
    appId: String(raw.appId || '').trim(),
    measurementId: String(raw.measurementId || '').trim()
  };

  if (!config.apiKey || !config.projectId || !config.appId) return null;
  return config;
}

function readStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    return raw ? normalizeFirebaseConfig(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

function readFirebaseConfig() {
  return normalizeFirebaseConfig(globalThis.WORLD_EXPLORER_FIREBASE) ||
    readStoredFirebaseConfig();
}

function hasFirebaseConfig() {
  return !!readFirebaseConfig();
}

function persistFirebaseConfig(config) {
  const normalized = normalizeFirebaseConfig(config);
  if (!normalized) {
    throw new Error('Invalid Firebase config. Expected apiKey, projectId, and appId.');
  }
  localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export {
  FIREBASE_CONFIG_STORAGE_KEY,
  hasFirebaseConfig,
  normalizeFirebaseConfig,
  persistFirebaseConfig,
  readFirebaseConfig
};
