function unavailable() {
  const error = new Error('Accounts and online sessions are unavailable in the standalone local edition.');
  error.code = 'standalone/unavailable';
  return error;
}

export class GoogleAuthProvider {
  setCustomParameters() {}
}

export function getAuth() {
  return Object.freeze({ currentUser: null, languageCode: 'en' });
}

export function connectAuthEmulator() {}

export function onAuthStateChanged(_auth, next) {
  queueMicrotask(() => next?.(null));
  return () => {};
}

export const createUserWithEmailAndPassword = async () => { throw unavailable(); };
export const getRedirectResult = async () => null;
export const sendPasswordResetEmail = async () => { throw unavailable(); };
export const signInAnonymously = async () => { throw unavailable(); };
export const signInWithEmailAndPassword = async () => { throw unavailable(); };
export const signInWithPopup = async () => { throw unavailable(); };
export const signInWithRedirect = async () => { throw unavailable(); };
export const signOut = async () => undefined;
export const updateProfile = async () => { throw unavailable(); };
