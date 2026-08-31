export const FIREBASE_CONFIG_STORAGE_KEY = 'worldExplorer3D.firebaseConfig';

const standaloneServices = Object.freeze({
  app: null,
  auth: null,
  db: null,
  config: null,
  environment: 'standalone',
  emulators: null
});

export function readFirebaseConfig() {
  return null;
}

export function hasFirebaseConfig() {
  return false;
}

export function setFirebaseConfig() {
  throw new Error('Firebase services are disabled in the standalone local edition.');
}

export function initFirebase() {
  return null;
}

export async function initFirebaseAnalytics() {
  return null;
}

globalThis.WorldExplorerFirebase = Object.freeze({
  FIREBASE_CONFIG_STORAGE_KEY,
  readFirebaseConfig,
  hasFirebaseConfig,
  setFirebaseConfig,
  initFirebase,
  initFirebaseAnalytics,
  services: standaloneServices
});
