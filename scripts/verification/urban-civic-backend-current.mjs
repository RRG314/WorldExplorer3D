import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');
const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const authOrigin = `http://${String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099')}`;
const functionsOrigin = `http://${String(process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001')}/${projectId}/us-central1`;
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const runId = Date.now();

async function createUser(label) {
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label.toLowerCase().replace(/\s+/g, '-')}-${runId}@example.test`,
      password: 'WorldExplorer3D-Test-Only-93!',
      returnSecureToken: true
    })
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return { uid: payload.localId, token: payload.idToken, label };
}

async function post(path, user, body) {
  const response = await fetch(`${functionsOrigin}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(user?.token ? { authorization: `Bearer ${user.token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const owner = await createUser('Civic Owner');
const observer = await createUser('Civic Observer');
const roomCode = 'CV1C55';
const worldSeed = `civic-loop:${runId}`;
const now = Date.now();
const roomRef = db.collection('rooms').doc(roomCode);
await roomRef.set({
  code: roomCode,
  ownerUid: owner.uid,
  name: 'Baltimore Civic Check',
  visibility: 'private',
  world: { kind: 'earth', seed: worldSeed, name: 'Baltimore, Maryland' },
  createdAt: admin.firestore.Timestamp.fromMillis(now)
});

async function setPresence(user, x = 0, z = 0) {
  await roomRef.collection('players').doc(user.uid).set({
    uid: user.uid,
    displayName: user.label,
    lastSeenAt: admin.firestore.Timestamp.fromMillis(Date.now()),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 120_000),
    pose: { x, y: 0, z, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 }
  });
}
await Promise.all([setPresence(owner), setPresence(observer)]);

const common = { roomCode, worldSeed };
const unauthenticated = await post('/commitUrbanCivicEvent', null, {
  ...common, kind: 'collision', severity: 1, witnessCount: 1, position: { x: 0, z: 0 }
});
assert.equal(unauthenticated.status, 401, JSON.stringify(unauthenticated.body));

const far = await post('/commitUrbanCivicEvent', owner, {
  ...common, kind: 'collision', severity: 1, witnessCount: 1, position: { x: 100, z: 0 }
});
assert.equal(far.status, 422, JSON.stringify(far.body));

const committed = await post('/commitUrbanCivicEvent', owner, {
  ...common,
  kind: 'collision',
  severity: 1,
  witnessCount: 2,
  vehicleId: 'traffic:sedan:verification',
  position: { x: 4, y: 0, z: 3 }
});
assert.equal(committed.status, 200, JSON.stringify(committed.body));
assert.equal(committed.body.accepted, true);
assert.equal(committed.body.state.authority, 'urban-civic-transaction-v1');
assert.match(committed.body.state.agency, /Baltimore civic response/);

const cooldown = await post('/commitUrbanCivicEvent', owner, {
  ...common, kind: 'collision', severity: 2, witnessCount: 1, position: { x: 2, z: 2 }
});
assert.equal(cooldown.status, 200, JSON.stringify(cooldown.body));
assert.equal(cooldown.body.accepted, false);
assert.equal(cooldown.body.reason, 'cooldown');

const civicRef = roomRef.collection('urbanCivic').doc('current');
await civicRef.update({
  searchStartsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3_000),
  searchEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15_000)
});

const wrongActor = await post('/resolveUrbanCivicOutcome', observer, common);
assert.equal(wrongActor.status, 200, JSON.stringify(wrongActor.body));
assert.equal(wrongActor.body.accepted, false);
assert.equal(wrongActor.body.reason, 'not_actor');

const resolved = await post('/resolveUrbanCivicOutcome', owner, common);
assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
assert.equal(resolved.body.accepted, true);
assert.equal(resolved.body.outcome.type, 'warning');

const stored = (await civicRef.get()).data();
assert.equal(stored.resolved, true);
assert.equal(stored.actorUid, owner.uid);
assert.equal(stored.outcome.type, 'warning');

console.log(JSON.stringify({
  ok: true,
  roomCode,
  checks: {
    authenticationRequired: true,
    currentRoomPresenceRequired: true,
    eventRangeEnforced: true,
    cooldownEnforced: true,
    oneSharedRoomState: true,
    onlyEventActorCanResolve: true,
    outcomePersisted: true
  }
}, null, 2));

await Promise.all([admin.auth().deleteUser(owner.uid), admin.auth().deleteUser(observer.uid)]).catch(() => {});
await admin.app().delete();
