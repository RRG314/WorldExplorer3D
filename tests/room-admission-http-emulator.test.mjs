import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(localhost|127\.0\.0\.1):\d+$/);
assert.ok(projectId && projectId !== 'worldexplorer3d', 'Explicit emulator project required');
const origin = `http://127.0.0.1:5001/${projectId}/us-central1`;
test('HTTP admission verifies auth and uses token identity for membership', async () => {
  const app = initializeApp({ projectId }, 'room-admission-http');
  const db = getFirestore(app);
  let uid;
  const code = 'HTTP01';
  const endpoint = (body, token) => fetch(`${origin}/joinRoom`, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
  }, body: JSON.stringify(body) });
  try {
    assert.equal((await endpoint({ roomCode: code })).status, 401);
    const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
    });
    assert.equal(signup.status, 200);
    const { localId, idToken } = await signup.json(); uid = localId;
    await db.doc(`rooms/${code}`).set({ code, ownerUid: uid, maxPlayers: 2, visibility: 'private', world: { kind: 'earth', lat: 0, lon: 0 } });
    const joined = await endpoint({ roomCode: code, uid: 'forged-user', role: 'mod', displayName: 'HTTP Explorer' }, idToken);
    assert.equal(joined.status, 200, await joined.clone().text());
    assert.equal((await joined.json()).joined, true);
    assert.equal((await db.doc(`rooms/${code}/players/${uid}`).get()).data().role, 'owner');
    assert.equal((await db.doc(`rooms/${code}/players/forged-user`).get()).exists, false);
    assert.equal((await endpoint({ roomCode: code }, 'invalid-token')).status, 401);
    assert.equal((await endpoint({ roomCode: 'BAD' }, idToken)).status, 400);
    assert.equal((await endpoint({ roomCode: 'ABSENT' }, idToken)).status, 404);
  } finally {
    await db.recursiveDelete(db.doc(`rooms/${code}`));
    if (uid) await getAuth(app).deleteUser(uid);
    await deleteApp(app);
  }
});
