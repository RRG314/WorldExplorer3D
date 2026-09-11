import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { connectAuthEmulator, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { connectStorageEmulator, getStorage } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import {
  ReCaptchaEnterpriseProvider,
  getToken as getAppCheckToken,
  initializeAppCheck
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js';
import { getAnalyticsTools } from './analytics-service.js?v=1';
import { assertFirebaseEnvironment } from './firebase-environment-policy.js';

const FIREBASE_CONFIG_STORAGE_KEY = 'worldExplorer3D.firebaseConfig';

let cachedServices = null;
let cachedAppCheck = null;

function readEmulatorConfig() {
  const raw = globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS;
  if (!raw || raw.enabled !== true) return null;
  const host = String(raw.host || '127.0.0.1').trim() || '127.0.0.1';
  const authPort = Math.max(1, Math.min(65535, Math.floor(Number(raw.authPort || 9099))));
  const firestorePort = Math.max(1, Math.min(65535, Math.floor(Number(raw.firestorePort || 8080))));
  const storagePort = Math.max(1, Math.min(65535, Math.floor(Number(raw.storagePort || 9199))));
  return { host, authPort, firestorePort, storagePort };
}

function normalizeConfig(raw) {
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

export function initFirebase() {
  if (cachedServices) return cachedServices;
  const config = readFirebaseConfig();
  if (!config) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  assertFirebaseEnvironment(app.options);
  if (app.options.projectId !== config.projectId) throw new Error('Firebase environment changed. Reload before continuing.');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  if (!cachedAppCheck && config.appCheckSiteKey) {
    cachedAppCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  }
  const emulator = readEmulatorConfig();
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    connectStorageEmulator(storage, emulator.host, emulator.storagePort);
  }

  cachedServices = { app, auth, db, storage, appCheck: cachedAppCheck, config, emulator };
  return cachedServices;
}

export async function getFirebaseAppCheckToken() {
  const services = initFirebase();
  if (!services?.appCheck) return '';
  try {
    const result = await getAppCheckToken(services.appCheck, false);
    return String(result?.token || '');
  } catch (_) {
    return '';
  }
}

export async function initFirebaseAnalytics() {
  if (typeof window === 'undefined') return null;
  return (await getAnalyticsTools(readFirebaseConfig()))?.analytics || null;
}

export function setFirebaseConfig(config) {
  const normalized = normalizeConfig(config);
  if (!normalized) {
    throw new Error('Invalid Firebase config. Expected apiKey, projectId, and appId.');
  }

  assertFirebaseEnvironment(normalized);
  localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  cachedServices = null;
  return normalized;
}

export { FIREBASE_CONFIG_STORAGE_KEY };

globalThis.WorldExplorerFirebase = {
  initFirebase,
  initFirebaseAnalytics,
  hasFirebaseConfig,
  readFirebaseConfig,
  setFirebaseConfig,
  FIREBASE_CONFIG_STORAGE_KEY
};
