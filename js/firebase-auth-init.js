import { getApp, getApps, initializeApp } from '../app/js/platform/firebase/app.js';
import { getAuth } from '../app/js/platform/firebase/auth.js';
import { readFirebaseConfig } from './firebase-config.js';

let cachedAuthServices = null;

function initFirebaseAuth() {
  if (cachedAuthServices) return cachedAuthServices;
  const config = readFirebaseConfig();
  if (!config) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  cachedAuthServices = { app, auth, config };
  return cachedAuthServices;
}

function resetFirebaseAuth() {
  cachedAuthServices = null;
}

export { initFirebaseAuth, resetFirebaseAuth };
