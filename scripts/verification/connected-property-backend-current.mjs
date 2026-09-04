import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');
const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const authOrigin = 'http://127.0.0.1:9099';
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/us-central1`;
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const now = Date.now();

async function createUser(label) {
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${label.toLowerCase()}-${now}@example.test`, password: 'WorldExplorer3D-Test-Only-93!', returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await admin.auth().updateUser(body.localId, { displayName: label });
  return { uid: body.localId, token: body.idToken, displayName: label };
}

async function post(user, body) {
  const response = await fetch(`${functionsOrigin}/commitWorldPropertyAction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${user.token}` },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const owner = await createUser('Owner Rowan');
const buyer = await createUser('Buyer Vale');
const roomCode = 'PR0P55';
const worldSeed = `property-loop:${now}`;
const property = {
  propertyId: 'world:osm:way:424242',
  sourceBuildingId: 'osm:way:424242',
  sourceAuthority: 'openstreetmap',
  locationId: 'baltimore:39.2904:-76.6122',
  locationLabel: 'Baltimore',
  label: 'Mapped house in Baltimore',
  kind: 'House',
  buildingType: 'house',
  area: 256,
  levels: 2,
  x: 0,
  z: 0
};

await db.collection('rooms').doc(roomCode).set({
  code: roomCode,
  ownerUid: owner.uid,
  visibility: 'private',
  world: { kind: 'earth', seed: worldSeed, lat: 39.2904, lon: -76.6122 },
  createdAt: admin.firestore.Timestamp.fromMillis(now)
});

async function setPresence(user, x, z) {
  await db.collection('rooms').doc(roomCode).collection('players').doc(user.uid).set({
    uid: user.uid,
    displayName: user.displayName,
    lastSeenAt: admin.firestore.Timestamp.fromMillis(Date.now()),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 120_000),
    pose: { x, y: 0, z, yaw: 0 }
  }, { merge: true });
}

await Promise.all([setPresence(owner, 100, 0), setPresence(buyer, 0, 0)]);
const common = { roomCode, worldSeed, property };
const far = await post(owner, { ...common, action: 'starter_claim', requestId: `far-${now}` });
assert.equal(far.status, 422, JSON.stringify(far.body));
assert.equal(far.body.reason, 'property_too_far');

await setPresence(owner, 0, 0);
const claimed = await post(owner, { ...common, action: 'starter_claim', requestId: `claim-${now}` });
assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
assert.equal(claimed.body.accepted, true);
assert.equal(claimed.body.credits, 500);

const listed = await post(owner, { ...common, action: 'list_sale', requestId: `list-${now}`, salePrice: 140 });
assert.equal(listed.status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.property.status, 'listed_for_sale');

const mutated = await post(owner, {
  ...common,
  property: { ...property, x: 20, area: 800 },
  action: 'cancel_listing',
  requestId: `mutate-${now}`
});
assert.equal(mutated.status, 400, JSON.stringify(mutated.body));

const purchased = await post(buyer, { ...common, action: 'buy_listing', requestId: `buy-${now}` });
assert.equal(purchased.status, 200, JSON.stringify(purchased.body));
assert.equal(purchased.body.accepted, true);
assert.equal(purchased.body.property.ownerUid, buyer.uid);
assert.equal(purchased.body.credits, 360);

const propertyDocs = await db.collection('worldProperties').where('propertyId', '==', property.propertyId).get();
assert.equal(propertyDocs.size, 1);
const finalProperty = propertyDocs.docs[0].data();
const documentId = propertyDocs.docs[0].id;
const [catalog, ownerWallet, buyerWallet, ownerBoard, buyerBoard] = await Promise.all([
  db.collection('worldPropertyCatalog').doc(documentId).get(),
  db.collection('users').doc(owner.uid).collection('economy').doc('wallet').get(),
  db.collection('users').doc(buyer.uid).collection('economy').doc('wallet').get(),
  db.collection('propertyLeaderboard').doc(owner.uid).get(),
  db.collection('propertyLeaderboard').doc(buyer.uid).get()
]);
assert.equal(finalProperty.ownerUid, buyer.uid);
assert.equal(finalProperty.status, 'owned');
assert.equal(catalog.data().x, 0);
assert.equal(catalog.data().area, 256);
assert.equal(ownerWallet.data().credits, 640);
assert.equal(buyerWallet.data().credits, 360);
assert.equal(ownerBoard.data().propertiesOwned, 0);
assert.equal(ownerBoard.data().propertiesSold, 1);
assert.equal(buyerBoard.data().propertiesOwned, 1);

console.log(JSON.stringify({
  ok: true,
  roomCode,
  checks: {
    twoAuthenticatedUsers: true,
    authoritativeRoomPresence: true,
    farActionRejected: true,
    freeFirstClaim: true,
    saleListing: true,
    mappedCatalogImmutable: true,
    secondPlayerPurchase: true,
    walletsConserved: true,
    communityBoardUpdated: true
  },
  final: {
    ownerUid: finalProperty.ownerUid,
    ownerCredits: ownerWallet.data().credits,
    buyerCredits: buyerWallet.data().credits
  }
}, null, 2));

await Promise.all([admin.auth().deleteUser(owner.uid), admin.auth().deleteUser(buyer.uid)]).catch(() => {});
await admin.app().delete();
