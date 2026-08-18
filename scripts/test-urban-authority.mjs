import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  VEHICLE_LEASE_MS,
  claimUrbanVehicleLease,
  commitUrbanCivicEvent,
  commitUrbanImpacts,
  normalizeUrbanEntityId,
  resolveUrbanCivicOutcome,
  updateUrbanVehicleLease,
  urbanEntityDocumentId
} = require('../functions/urban-sandbox.js');

const documents = new Map();
let queue = Promise.resolve();
const ref = (path) => ({ path });
const timestampFromMs = (value) => Number(value);

function runTransaction(callback) {
  const result = queue.then(async () => {
    const staged = new Map();
    const transaction = {
      async get(reference) {
        const value = staged.has(reference.path) ? staged.get(reference.path) : documents.get(reference.path);
        return { exists: value != null, data: () => value };
      },
      set(reference, value, options = {}) {
        const current = staged.has(reference.path) ? staged.get(reference.path) : documents.get(reference.path);
        staged.set(reference.path, options.merge ? { ...(current || {}), ...value } : value);
      },
      update(reference, value) {
        const current = staged.has(reference.path) ? staged.get(reference.path) : documents.get(reference.path);
        if (!current) throw new Error('missing update target');
        staged.set(reference.path, { ...current, ...value });
      }
    };
    const response = await callback(transaction);
    staged.forEach((value, path) => documents.set(path, value));
    return response;
  });
  queue = result.catch(() => {});
  return result;
}

const worldSeed = 'baltimore-room-world';
const entityId = 'urban-vehicle:38b950c4';
const entityRef = ref(`rooms/ABC234/urbanEntities/${urbanEntityDocumentId(entityId)}`);
const claimInput = {
  entityId,
  worldSeed,
  label: 'Parcel delivery van',
  style: 'van',
  color: 0x426255,
  pose: { x: 8, y: 1, z: 5, yaw: 0 }
};

assert.equal(normalizeUrbanEntityId(entityId), entityId);
assert.equal(normalizeUrbanEntityId('not valid / id'), '');
assert.equal(urbanEntityDocumentId(entityId).length, 40);

const [claimA, claimB] = await Promise.all([
  claimUrbanVehicleLease({ runTransaction, entityRef, uid: 'player-a', input: claimInput, nowMs: 10_000, timestampFromMs }),
  claimUrbanVehicleLease({ runTransaction, entityRef, uid: 'player-b', input: claimInput, nowMs: 10_000, timestampFromMs })
]);
assert.equal([claimA, claimB].filter((result) => result.accepted).length, 1, 'one concurrent player must own the lease');
const ownerUid = claimA.accepted ? 'player-a' : 'player-b';
const contenderUid = ownerUid === 'player-a' ? 'player-b' : 'player-a';
assert.equal(documents.get(entityRef.path).leaseOwnerUid, ownerUid);
assert.equal(documents.get(entityRef.path).leaseExpiresAt, 10_000 + VEHICLE_LEASE_MS);

const moved = await updateUrbanVehicleLease({
  runTransaction,
  entityRef,
  uid: ownerUid,
  input: { pose: { x: 28, y: 1, z: 5, yaw: .2 } },
  nowMs: 11_000,
  timestampFromMs
});
assert.equal(moved.accepted, true, 'lease owner can publish plausible vehicle motion');
const stolenUpdate = await updateUrbanVehicleLease({
  runTransaction,
  entityRef,
  uid: contenderUid,
  input: { pose: { x: 29, y: 1, z: 5, yaw: .2 } },
  nowMs: 11_100,
  timestampFromMs
});
assert.deepEqual({ accepted: stolenUpdate.accepted, reason: stolenUpdate.reason }, { accepted: false, reason: 'not_owner' });
const teleport = await updateUrbanVehicleLease({
  runTransaction,
  entityRef,
  uid: ownerUid,
  input: { pose: { x: 2_000, y: 1, z: 5, yaw: 0 } },
  nowMs: 11_200,
  timestampFromMs
});
assert.deepEqual({ accepted: teleport.accepted, reason: teleport.reason }, { accepted: false, reason: 'implausible_motion' });
const released = await updateUrbanVehicleLease({
  runTransaction,
  entityRef,
  uid: ownerUid,
  input: { pose: { x: 28, y: 1, z: 5, yaw: .2 } },
  nowMs: 12_000,
  timestampFromMs,
  release: true
});
assert.equal(released.released, true);
const reclaimed = await claimUrbanVehicleLease({
  runTransaction,
  entityRef,
  uid: contenderUid,
  input: { ...claimInput, pose: { x: 28, y: 1, z: 5, yaw: .2 } },
  nowMs: 12_001,
  timestampFromMs
});
assert.equal(reclaimed.accepted, true, 'released vehicle can be claimed by another member');

const npcId = 'urban-npc:world-1:pedestrian:4';
const npcRef = ref(`rooms/ABC234/urbanEntities/${urbanEntityDocumentId(npcId)}`);
const actorRef = ref(`rooms/ABC234/urbanActors/${contenderUid}`);
const entityRefs = new Map([[npcId, npcRef]]);
const impactInput = {
  equipmentId: 'baton',
  worldSeed,
  impactPosition: { x: 1.4, y: 0, z: 0, yaw: 0 },
  targets: [{ entityId: npcId, kind: 'npc', pose: { x: 1.6, y: 0, z: 0, yaw: 0 } }]
};
const impact = await commitUrbanImpacts({
  runTransaction,
  actorRef,
  entityRefs,
  uid: contenderUid,
  input: impactInput,
  actorPose: { x: 0, y: 0, z: 0, yaw: 0 },
  nowMs: 20_000,
  timestampFromMs
});
assert.equal(impact.accepted, true);
assert.equal(impact.results.length, 1);
assert.ok(impact.results[0].after < 1, 'server computes condition reduction');
const repeated = await commitUrbanImpacts({
  runTransaction,
  actorRef,
  entityRefs,
  uid: contenderUid,
  input: impactInput,
  actorPose: { x: 0, y: 0, z: 0, yaw: 0 },
  nowMs: 20_100,
  timestampFromMs
});
assert.deepEqual({ accepted: repeated.accepted, reason: repeated.reason }, { accepted: false, reason: 'cooldown' });
const distantNpcId = 'urban-npc:world-1:pedestrian:distant';
const distantNpcRef = ref(`rooms/ABC234/urbanEntities/${urbanEntityDocumentId(distantNpcId)}`);
documents.set(distantNpcRef.path, {
  authority: 'urban-room-transaction-v1',
  entityId: distantNpcId,
  kind: 'npc',
  worldSeed,
  pose: { x: 80, y: 0, z: 0, yaw: 0 },
  condition: 1,
  resistance: 95,
  revision: 1,
  updatedAt: 19_000
});
const forgedDistantTarget = await commitUrbanImpacts({
  runTransaction,
  actorRef,
  entityRefs: new Map([[distantNpcId, distantNpcRef]]),
  uid: contenderUid,
  input: {
    ...impactInput,
    targets: [{ entityId: distantNpcId, kind: 'npc', pose: { x: 1.6, y: 0, z: 0, yaw: 0 } }]
  },
  actorPose: { x: 0, y: 0, z: 0 },
  nowMs: 21_000,
  timestampFromMs
});
assert.equal(forgedDistantTarget.accepted, true, 'a valid swing can miss');
assert.equal(forgedDistantTarget.results.length, 0, 'authoritative target pose blocks forged distant hits');
assert.equal(documents.get(distantNpcRef.path).condition, 1);
await assert.rejects(() => commitUrbanImpacts({
  runTransaction,
  actorRef,
  entityRefs,
  uid: contenderUid,
  input: { ...impactInput, impactPosition: { x: 100, y: 0, z: 0 } },
  actorPose: { x: 0, y: 0, z: 0 },
  nowMs: 22_000,
  timestampFromMs
}), /impact_out_of_range/);

const civicRef = ref('rooms/ABC234/urbanCivic/current');
const civicEvent = await commitUrbanCivicEvent({
  runTransaction,
  civicRef,
  actorRef,
  uid: contenderUid,
  input: {
    kind: 'vehicle_taken',
    worldSeed,
    agency: 'Baltimore civic response',
    witnessCount: 2,
    severity: 1,
    vehicleId: entityId,
    position: { x: 2, y: 0, z: 1 }
  },
  actorPose: { x: 0, y: 0, z: 0 },
  nowMs: 30_000,
  timestampFromMs
});
assert.equal(civicEvent.accepted, true);
assert.equal(civicEvent.state.authority, 'urban-civic-transaction-v1');
assert.equal(civicEvent.state.level, 1);
assert.equal(civicEvent.state.witnessCount, 2);
assert.ok(civicEvent.state.searchStartsAtMs > civicEvent.state.reportingStartsAtMs);
const civicCooldown = await commitUrbanCivicEvent({
  runTransaction,
  civicRef,
  actorRef,
  uid: contenderUid,
  input: {
    kind: 'collision', worldSeed, agency: 'Baltimore civic response', witnessCount: 1,
    severity: 1, position: { x: 2, y: 0, z: 1 }
  },
  actorPose: { x: 0, y: 0, z: 0 },
  nowMs: 31_000,
  timestampFromMs
});
assert.deepEqual({ accepted: civicCooldown.accepted, reason: civicCooldown.reason }, { accepted: false, reason: 'cooldown' });
const escalatedCivic = await commitUrbanCivicEvent({
  runTransaction,
  civicRef,
  actorRef,
  uid: contenderUid,
  input: {
    kind: 'reckless_driving', worldSeed, agency: 'Baltimore civic response', witnessCount: 3,
    severity: 1, position: { x: 4, y: 0, z: 1 }
  },
  actorPose: { x: 0, y: 0, z: 0 },
  nowMs: 32_000,
  timestampFromMs
});
assert.equal(escalatedCivic.accepted, true);
assert.equal(escalatedCivic.state.level, 2, 'an active shared event escalates instead of creating divergent client state');
const contactTime = escalatedCivic.state.searchStartsAtMs + 2_500;
const otherActorResolution = await resolveUrbanCivicOutcome({
  runTransaction,
  civicRef,
  uid: ownerUid,
  actorPose: { x: 4, y: 0, z: 1 },
  actorVelocity: { vx: 0, vy: 0, vz: 0 },
  nowMs: contactTime,
  timestampFromMs
});
assert.deepEqual({ accepted: otherActorResolution.accepted, reason: otherActorResolution.reason }, { accepted: false, reason: 'not_actor' });
const movingResolution = await resolveUrbanCivicOutcome({
  runTransaction,
  civicRef,
  uid: contenderUid,
  actorPose: { x: 4, y: 0, z: 1 },
  actorVelocity: { vx: 4, vy: 0, vz: 0 },
  nowMs: contactTime,
  timestampFromMs
});
assert.deepEqual({ accepted: movingResolution.accepted, reason: movingResolution.reason }, { accepted: false, reason: 'actor_moving' });
const resolvedCivic = await resolveUrbanCivicOutcome({
  runTransaction,
  civicRef,
  uid: contenderUid,
  actorPose: { x: 4, y: 0, z: 1 },
  actorVelocity: { vx: 0, vy: 0, vz: 0 },
  nowMs: contactTime,
  timestampFromMs
});
assert.equal(resolvedCivic.accepted, true);
assert.equal(resolvedCivic.outcome.type, 'citation');
await assert.rejects(() => commitUrbanCivicEvent({
  runTransaction,
  civicRef,
  actorRef,
  uid: contenderUid,
  input: { kind: 'assault', worldSeed, witnessCount: 1, severity: 1, position: { x: 100, y: 0, z: 0 } },
  actorPose: { x: 0, y: 0, z: 0 },
  nowMs: 50_000,
  timestampFromMs
}), /civic_event_out_of_range/);

console.log(JSON.stringify({
  ok: true,
  contract: 'urban-room-transaction-v1',
  vehicleOwner: documents.get(entityRef.path).leaseOwnerUid,
  vehicleRevision: documents.get(entityRef.path).revision,
  npcCondition: documents.get(npcRef.path).condition,
  civicOutcome: documents.get(civicRef.path).outcome.type,
  directAuthorityDocuments: documents.size
}, null, 2));
