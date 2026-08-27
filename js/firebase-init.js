import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { connectAuthEmulator, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { readAnalyticsConsent } from './analytics-consent.js?v=1';

const FIREBASE_CONFIG_STORAGE_KEY = 'worldExplorer3D.firebaseConfig';

let cachedServices = null;
let cachedAnalytics = undefined;
let cachedAnalyticsPromise = null;

function readEmulatorConfig() {
  const raw = globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS;
  if (!raw || raw.enabled !== true) return null;
  const host = String(raw.host || '127.0.0.1').trim() || '127.0.0.1';
  const authPort = Math.max(1, Math.min(65535, Math.floor(Number(raw.authPort || 9099))));
  const firestorePort = Math.max(1, Math.min(65535, Math.floor(Number(raw.firestorePort || 8080))));
  return { host, authPort, firestorePort };
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
    measurementId: String(raw.measurementId || '').trim()
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
  const emulator = readEmulatorConfig();
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
  }

  cachedServices = { app, auth, db, config, emulator };
  return cachedServices;
}

export async function initFirebaseAnalytics() {
  if (cachedAnalytics !== undefined) return cachedAnalytics;
  if (cachedAnalyticsPromise) return cachedAnalyticsPromise;

  cachedAnalyticsPromise = (async () => {
    const services = initFirebase();
    const measurementId = String(services?.config?.measurementId || '').trim();
    if (!services?.app || !measurementId || typeof window === 'undefined') {
      cachedAnalytics = null;
      return cachedAnalytics;
    }

    try {
      const analyticsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js');
      const supported = typeof analyticsMod.isSupported === 'function'
        ? await analyticsMod.isSupported().catch(() => false)
        : false;
      if (!supported) {
        cachedAnalytics = null;
        return cachedAnalytics;
      }
      analyticsMod.setConsent?.({
        analytics_storage: readAnalyticsConsent() === 'granted' ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
      cachedAnalytics = analyticsMod.getAnalytics(services.app);
      return cachedAnalytics;
    } catch (_) {
      cachedAnalytics = null;
      return cachedAnalytics;
    }
  })().finally(() => {
    cachedAnalyticsPromise = null;
  });

  return cachedAnalyticsPromise;
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
  initFirebaseAnalytics,
  hasFirebaseConfig,
  readFirebaseConfig,
  setFirebaseConfig,
  FIREBASE_CONFIG_STORAGE_KEY
};
