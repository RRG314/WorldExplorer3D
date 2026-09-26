import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, getDocs, doc, getDoc, setDoc, Timestamp as ClientTimestamp, serverTimestamp } from 'firebase/firestore';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { admitRoomPlayer } = require('./room-admission.js');
const hostValue = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(hostValue || '', /^(127\.0\.0\.1|localhost):\d+$/, 'A local emulator is required');
const [host, port] = hostValue.split(':');
const projectId = 'demo-we3d-room-admission';
let environment, app, db;
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
  await environment.clearFirestore();
  app = initializeApp({ projectId }, projectId);
  db = getFirestore(app);
});
after(async () => { await environment?.cleanup(); if (app) await deleteApp(app); });
async function room(code, maxPlayers = 2) {
  await db.doc(`rooms/${code}`).set({ code, ownerUid: 'owner', maxPlayers, visibility: 'private', world: { kind: 'earth', lat: 39, lon: -76 } });
}
const join = (code, uid) => admitRoomPlayer({ db, uid, roomCode: code, displayName: uid });
test('concurrent joiners cannot overfill a room; reconnect is idempotent', async () => {
  const code = 'RACE01'; await room(code); await join(code, 'owner');
  const results = await Promise.allSettled(['a', 'b', 'c'].map(uid => join(code, uid)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  for (const r of results.filter(r => r.status === 'rejected')) assert.equal(r.reason.status, 409, `${r.reason.stack}`);
  assert.equal((await db.collection(`rooms/${code}/players`).get()).size, 2);
  const before = (await db.doc(`rooms/${code}/players/owner`).get()).data();
  await join(code, 'owner');
  const after = (await db.doc(`rooms/${code}/players/owner`).get()).data();
  assert.equal(after.joinedAt.toMillis(), before.joinedAt.toMillis());
  assert.equal(after.role, 'owner');
});
test('expired memberships need readmission and cannot revive via direct writes', async () => {
  const code = 'EXPIRE'; await room(code); await join(code, 'owner'); await join(code, 'old');
  const oldRef = db.doc(`rooms/${code}/players/old`);
  await oldRef.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await join(code, 'replacement');
  await assert.rejects(join(code, 'old'), e => e.status === 409);
  const client = environment.authenticatedContext('old').firestore();
  await assertFails(setDoc(doc(client, `rooms/${code}/players/old`), {
    lastSeenAt: serverTimestamp(), expiresAt: ClientTimestamp.fromMillis(Date.now() + 90_000)
  }, { merge: true }));
  await db.doc(`rooms/${code}/players/replacement`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await join(code, 'old')).joined, true);
});
test('rules deny direct admission and lock writes, allow bounded active heartbeats', async () => {
  const code = 'RULE01'; await room(code); await join(code, 'owner');
  const record = (await db.doc(`rooms/${code}/players/owner`).get()).data();
  const attacker = environment.authenticatedContext('attacker').firestore();
  await assertFails(getDocs(collection(attacker, `rooms/${code}/players`)));
  const payload = { ...record, uid: 'attacker', joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), expiresAt: ClientTimestamp.fromMillis(Date.now() + 90_000) };
  await assertFails(setDoc(doc(attacker, `rooms/${code}/players/attacker`), payload));
  await assertFails(setDoc(doc(attacker, `rooms/${code}/admission/current`), { updatedAt: serverTimestamp() }));
  const owner = environment.authenticatedContext('owner').firestore();
  await db.doc(`rooms/${code}/players/owner`).update({ lastSeenAt: Timestamp.fromMillis(Date.now() - 10_000) });
  await assertFails(setDoc(doc(owner, `rooms/${code}/players/owner`), { expiresAt: ClientTimestamp.fromMillis(Date.now() + 86_400_000) }, { merge: true }));
  await assertSucceeds(setDoc(doc(owner, `rooms/${code}/players/owner`), { lastSeenAt: serverTimestamp(), expiresAt: ClientTimestamp.fromMillis(Date.now() + 90_000) }, { merge: true }));
  await assertSucceeds(getDoc(doc(owner, `rooms/${code}/players/owner`)));
});
test('invalid identity and missing room cannot create memberships', async () => {
  await assert.rejects(join('BAD', 'someone'), e => e.status === 400);
  await assert.rejects(join('ABSENT', ''), e => e.status === 401);
  await assert.rejects(join('ABSENT', 'someone'), e => e.status === 404);
});
