let authPromise = null;

function sanitizeText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function testIdentityFromToken(token) {
  const match = /^test:([a-zA-Z0-9._-]{3,80})(?::(.{1,80}))?$/.exec(String(token || ''));
  if (!match) throw new Error('Invalid local test identity.');
  return Object.freeze({
    uid: match[1],
    displayName: sanitizeText(match[2] || match[1], 48),
    provider: 'local-test'
  });
}

function identityFromFirebaseToken(decoded = {}) {
  const uid = String(decoded.uid || '').trim();
  if (!uid) throw new Error('Verified authentication token has no account identity.');
  return Object.freeze({
    uid,
    displayName: sanitizeText(decoded.name || 'Explorer', 48),
    provider: String(decoded.firebase?.sign_in_provider || 'firebase')
  });
}

function firebaseAuth() {
  if (!authPromise) {
    authPromise = Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth')
    ]).then(([appModule, authModule]) => {
      if (!appModule.getApps().length) {
        appModule.initializeApp({ credential: appModule.applicationDefault() });
      }
      return authModule.getAuth();
    });
  }
  return authPromise;
}

function createIdentityVerifier(options = {}) {
  const allowTestAuth = options.allowTestAuth === true && process.env.NODE_ENV !== 'production';
  return async function verifyIdentity(tokenInput) {
    const token = String(tokenInput || '').trim();
    if (!token) throw new Error('Authentication is required.');
    if (token.startsWith('test:')) {
      if (!allowTestAuth) throw new Error('Local test authentication is disabled.');
      return testIdentityFromToken(token);
    }
    const auth = await firebaseAuth();
    const decoded = await auth.verifyIdToken(token, true);
    return identityFromFirebaseToken(decoded);
  };
}

export { createIdentityVerifier, identityFromFirebaseToken, testIdentityFromToken };
