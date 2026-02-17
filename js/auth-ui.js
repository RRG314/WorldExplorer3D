import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { initFirebase } from './firebase-init.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

function getFirebaseAuth() {
  const services = initFirebase();
  return services ? services.auth : null;
}

function friendlyAuthMessage(err) {
  const code = String(err && err.code ? err.code : '');
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email format.';
    case 'auth/user-not-found':
      return 'No account found for that email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'This email is already in use.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Auth provider is disabled. Enable Google and/or Email/Password in Firebase Console -> Authentication -> Sign-in method.';
    default:
      return err && err.message ? err.message : 'Authentication failed.';
  }
}

export async function resolveRedirectSignIn() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    return result && result.user ? result.user : auth.currentUser;
  } catch (err) {
    console.warn('[auth] Redirect sign-in result failed:', err);
    return auth.currentUser;
  }
}

export function observeAuth(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => callback(user));
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Missing Firebase config. Set WORLD_EXPLORER_FIREBASE first.');
  }

  if (auth.currentUser) return auth.currentUser;

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    const code = String(err && err.code ? err.code : '');
    if (code.includes('popup-blocked') || code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw new Error(friendlyAuthMessage(err));
  }
}

export async function ensureSignedIn() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Missing Firebase config. Set WORLD_EXPLORER_FIREBASE first.');
  }

  if (auth.currentUser) return auth.currentUser;

  const redirectedUser = await resolveRedirectSignIn();
  if (redirectedUser) return redirectedUser;

  return signInWithGoogle();
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export async function getCurrentUserToken(forceRefresh = false) {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) {
    throw new Error('No signed-in user available.');
  }

  return auth.currentUser.getIdToken(forceRefresh);
}

export function getCurrentUser() {
  const auth = getFirebaseAuth();
  return auth ? auth.currentUser : null;
}

export async function signInWithEmailPassword(email, password) {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Missing Firebase config. Set WORLD_EXPLORER_FIREBASE first.');
  }

  try {
    const result = await signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
    return result.user;
  } catch (err) {
    throw new Error(friendlyAuthMessage(err));
  }
}

export async function signUpWithEmailPassword(email, password, displayName = '') {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Missing Firebase config. Set WORLD_EXPLORER_FIREBASE first.');
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
    if (result.user && displayName) {
      await updateProfile(result.user, { displayName: String(displayName).trim().slice(0, 60) });
    }
    return result.user;
  } catch (err) {
    throw new Error(friendlyAuthMessage(err));
  }
}

export async function requestPasswordReset(email) {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Missing Firebase config. Set WORLD_EXPLORER_FIREBASE first.');
  }

  try {
    await sendPasswordResetEmail(auth, String(email || '').trim());
  } catch (err) {
    throw new Error(friendlyAuthMessage(err));
  }
}
