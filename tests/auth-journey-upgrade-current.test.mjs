import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
async function fixture() {
  const auth = { currentUser: { uid: 'guest-owned-uid', isAnonymous: true } },
    calls = [];
  const context = vm.createContext({ console });
  class GoogleAuthProvider {
    setCustomParameters() {}
    static credentialFromError() {
      return { provider: 'google' };
    }
  }
  const sdk = {
    GoogleAuthProvider,
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
  };
  for (const key of [
    'browserPopupRedirectResolver',
    'createUserWithEmailAndPassword',
    'getRedirectResult',
    'onAuthStateChanged',
    'linkWithCredential',
    'linkWithPopup',
    'linkWithRedirect',
    'sendPasswordResetEmail',
    'signInAnonymously',
    'signInWithEmailAndPassword',
    'signInWithCredential',
    'signInWithPopup',
    'signInWithRedirect',
    'signOut',
    'updateProfile',
  ])
    sdk[key] = async (...args) => {
      calls.push({ key, args });
      if (['linkWithCredential', 'linkWithPopup'].includes(key)) {
        auth.currentUser = { ...args[0], isAnonymous: false };
        return { user: auth.currentUser };
      }
      return { user: { uid: 'created-or-existing-account' } };
    };
  const module = new vm.SourceTextModule(
    await fs.readFile(new URL('../js/auth-ui.js', import.meta.url), 'utf8'),
    { context }
  );
  await module.link((spec) => {
    const values = spec.startsWith('https:')
      ? sdk
      : { initFirebase: () => ({ auth }), setAuthRedirectPending: () => {} };
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context }
    );
  });
  await module.evaluate();
  return { auth, calls, api: module.namespace };
}
test('email signup links an anonymous owner without changing the vehicles/property UID', async () => {
  const f = await fixture();
  const user = await f.api.signUpWithEmailPassword(' river@example.test ', 'password', 'River');
  assert.equal(user.uid, 'guest-owned-uid');
  assert.equal(user.isAnonymous, false);
  assert.deepEqual(
    f.calls.map((c) => c.key),
    ['linkWithCredential', 'updateProfile']
  );
});
test('Google signup links anonymous ownership; an existing signed-in account remains selected', async () => {
  const f = await fixture();
  assert.equal((await f.api.signInWithGoogle()).uid, 'guest-owned-uid');
  assert.equal(f.calls[0].key, 'linkWithPopup');
  f.calls.length = 0;
  assert.equal((await f.api.signInWithGoogle()).uid, 'guest-owned-uid');
  assert.equal(f.calls.length, 0);
});
