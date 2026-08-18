'use strict';

const crypto = require('node:crypto');

const VEHICLE_LEASE_MS = 15_000;
const VEHICLE_MOVE_MAX_METERS_PER_SECOND = 90;
const ACTION_CLOCK_SKEW_MS = 250;
const DIRECT_HIT_TOLERANCE_METERS = 3.5;
const URBAN_EQUIPMENT = Object.freeze({
  hands: Object.freeze({ force: 12, range: 2.4, cooldownMs: 520, blastRadius: 0 }),
  baton: Object.freeze({ force: 28, range: 2.7, cooldownMs: 620, blastRadius: 0 }),
  'pulse-sidearm': Object.freeze({ force: 34, range: 42, cooldownMs: 310, blastRadius: 0 }),
  'concussion-charge': Object.freeze({ force: 78, range: 19, cooldownMs: 1100, blastRadius: 7.5 })
});
const TARGET_RESISTANCE = Object.freeze({ vehicle: 160, npc: 95, furniture: 72 });

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finiteNumber(value, min)));
}

function normalizePose(input = {}) {
  return Object.freeze({
    x: clamp(input.x, -25_000, 25_000),
    y: clamp(input.y, -2_000, 20_000),
    z: clamp(input.z, -25_000, 25_000),
    yaw: clamp(input.yaw, -Math.PI * 4, Math.PI * 4)
  });
}

function normalizeUrbanEntityId(value) {
  const next = String(value || '').trim();
  if (!next || next.length > 220 || !/^[A-Za-z0-9:._-]+$/.test(next)) return '';
  return next;
}

function urbanEntityDocumentId(entityId) {
  const normalized = normalizeUrbanEntityId(entityId);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 40);
}

function timestampMillis(value, fallback = 0) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function poseDistance(a, b) {
  return Math.hypot(
    finiteNumber(a?.x) - finiteNumber(b?.x),
    finiteNumber(a?.y) - finiteNumber(b?.y),
    finiteNumber(a?.z) - finiteNumber(b?.z)
  );
}

function snapshotData(snapshot) {
  if (!snapshot) return null;
  const exists = typeof snapshot.exists === 'function' ? snapshot.exists() : snapshot.exists === true;
  return exists ? (snapshot.data() || {}) : null;
}

function conditionAfterImpact(condition, resistance, force) {
  const before = clamp(condition, 0, 1);
  const damage = clamp(force, 0, 500) / Math.max(1, finiteNumber(resistance, 100));
  const after = clamp(before - damage, 0, 1);
  return Object.freeze({ before, after, destroyed: after <= 0.001 });
}

function forceForTarget(equipment, impactPosition, targetPosition) {
  const distance = poseDistance(impactPosition, targetPosition);
  if (!equipment.blastRadius) return distance <= DIRECT_HIT_TOLERANCE_METERS ? equipment.force : 0;
  if (distance > equipment.blastRadius) return 0;
  const falloff = 1 - distance / equipment.blastRadius;
  return equipment.force * (0.18 + 0.82 * falloff);
}

async function claimUrbanVehicleLease(options = {}) {
  const { runTransaction, entityRef, uid, input, nowMs, timestampFromMs } = options;
  if (typeof runTransaction !== 'function' || !entityRef || !uid || !input) throw new TypeError('Vehicle claim transaction inputs are required.');
  const entityId = normalizeUrbanEntityId(input.entityId);
  if (!entityId) throw new Error('invalid_entity');
  const pose = normalizePose(input.pose);
  return runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entityRef);
    const current = snapshotData(snapshot);
    const leaseExpiresMs = timestampMillis(current?.leaseExpiresAt, 0);
    if (current && current.kind !== 'vehicle') throw new Error('entity_kind_conflict');
    if (current && current.worldSeed !== input.worldSeed) throw new Error('world_conflict');
    if (current?.leaseOwnerUid && current.leaseOwnerUid !== uid && leaseExpiresMs > nowMs) {
      return Object.freeze({ accepted: false, reason: 'occupied', ownerUid: current.leaseOwnerUid, leaseExpiresMs });
    }
    const revision = Math.max(0, Math.floor(finiteNumber(current?.revision, 0))) + 1;
    const leaseExpiresAt = timestampFromMs(nowMs + VEHICLE_LEASE_MS);
    const state = {
      authority: 'urban-room-transaction-v1',
      entityId,
      kind: 'vehicle',
      worldSeed: String(input.worldSeed || '').slice(0, 180),
      label: String(input.label || 'Vehicle').slice(0, 80),
      style: String(input.style || 'sedan').slice(0, 40),
      color: Math.max(0, Math.min(0xffffff, Math.floor(finiteNumber(input.color, 0x51667a)))),
      pose,
      condition: clamp(current?.condition ?? 1, 0, 1),
      resistance: TARGET_RESISTANCE.vehicle,
      leaseOwnerUid: uid,
      leaseExpiresAt,
      revision,
      updatedAt: timestampFromMs(nowMs)
    };
    transaction.set(entityRef, state, { merge: false });
    return Object.freeze({ accepted: true, state: Object.freeze({ ...state, leaseExpiresMs: nowMs + VEHICLE_LEASE_MS }) });
  });
}

async function updateUrbanVehicleLease(options = {}) {
  const { runTransaction, entityRef, uid, input, nowMs, timestampFromMs, release = false } = options;
  if (typeof runTransaction !== 'function' || !entityRef || !uid) throw new TypeError('Vehicle update transaction inputs are required.');
  return runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entityRef);
    const current = snapshotData(snapshot);
    if (!current || current.kind !== 'vehicle') return Object.freeze({ accepted: false, reason: 'missing' });
    const leaseExpiresMs = timestampMillis(current.leaseExpiresAt, 0);
    if (current.leaseOwnerUid !== uid || leaseExpiresMs <= nowMs) return Object.freeze({ accepted: false, reason: 'not_owner' });
    const nextPose = normalizePose(input?.pose || current.pose);
    const updatedAtMs = timestampMillis(current.updatedAt, nowMs - 1000);
    const elapsedSeconds = Math.max(0.05, (nowMs - updatedAtMs) / 1000);
    const maximumDistance = 6 + VEHICLE_MOVE_MAX_METERS_PER_SECOND * elapsedSeconds;
    if (poseDistance(current.pose, nextPose) > maximumDistance) return Object.freeze({ accepted: false, reason: 'implausible_motion' });
    const nextLeaseExpiresMs = release ? nowMs : nowMs + VEHICLE_LEASE_MS;
    const patch = {
      pose: nextPose,
      leaseOwnerUid: release ? '' : uid,
      leaseExpiresAt: timestampFromMs(nextLeaseExpiresMs),
      revision: Math.max(0, Math.floor(finiteNumber(current.revision, 0))) + 1,
      updatedAt: timestampFromMs(nowMs)
    };
    transaction.update(entityRef, patch);
    return Object.freeze({ accepted: true, released: release, state: Object.freeze({ ...current, ...patch, leaseExpiresMs: nextLeaseExpiresMs }) });
  });
}

async function commitUrbanImpacts(options = {}) {
  const { runTransaction, actorRef, entityRefs, uid, input, actorPose, nowMs, timestampFromMs } = options;
  const equipment = URBAN_EQUIPMENT[String(input?.equipmentId || '')];
  const targets = Array.isArray(input?.targets) ? input.targets.slice(0, 10) : [];
  if (!equipment || !targets.length) throw new Error('invalid_impact');
  const impactPosition = normalizePose(input.impactPosition);
  if (poseDistance(actorPose, impactPosition) > equipment.range + 6) throw new Error('impact_out_of_range');
  return runTransaction(async (transaction) => {
    const actorSnapshot = await transaction.get(actorRef);
    const actorState = snapshotData(actorSnapshot) || {};
    const lastActionMs = timestampMillis(actorState.lastActionAt, 0);
    if (lastActionMs && nowMs + ACTION_CLOCK_SKEW_MS - lastActionMs < equipment.cooldownMs) {
      return Object.freeze({ accepted: false, reason: 'cooldown' });
    }
    const snapshots = [];
    for (const target of targets) {
      const ref = entityRefs.get(target.entityId);
      if (!ref) throw new Error('invalid_target');
      snapshots.push([target, ref, await transaction.get(ref)]);
    }
    const results = [];
    for (const [target, ref, snapshot] of snapshots) {
      const kind = ['vehicle', 'npc', 'furniture'].includes(target.kind) ? target.kind : '';
      if (!kind) throw new Error('invalid_target_kind');
      const current = snapshotData(snapshot);
      if (current && (current.kind !== kind || current.worldSeed !== input.worldSeed)) throw new Error('target_conflict');
      const targetPose = current?.pose ? normalizePose(current.pose) : normalizePose(target.pose);
      const force = forceForTarget(equipment, impactPosition, targetPose);
      if (force <= 0) continue;
      const resistance = TARGET_RESISTANCE[kind];
      const result = conditionAfterImpact(current?.condition ?? 1, resistance, force);
      const state = {
        authority: 'urban-room-transaction-v1',
        entityId: target.entityId,
        kind,
        worldSeed: String(input.worldSeed || '').slice(0, 180),
        pose: targetPose,
        condition: result.after,
        resistance,
        revision: Math.max(0, Math.floor(finiteNumber(current?.revision, 0))) + 1,
        updatedAt: timestampFromMs(nowMs),
        ...(kind === 'vehicle' ? {
          label: String(current?.label || target.label || 'Vehicle').slice(0, 80),
          style: String(current?.style || target.style || 'sedan').slice(0, 40),
          color: Math.max(0, Math.min(0xffffff, Math.floor(finiteNumber(current?.color ?? target.color, 0x51667a)))),
          leaseOwnerUid: String(current?.leaseOwnerUid || ''),
          leaseExpiresAt: current?.leaseExpiresAt || timestampFromMs(nowMs)
        } : {})
      };
      transaction.set(ref, state, { merge: false });
      results.push(Object.freeze({ entityId: target.entityId, kind, force, ...result, state: Object.freeze(state) }));
    }
    transaction.set(actorRef, {
      uid,
      lastEquipmentId: String(input.equipmentId),
      lastActionAt: timestampFromMs(nowMs),
      updatedAt: timestampFromMs(nowMs)
    }, { merge: true });
    return Object.freeze({ accepted: true, results: Object.freeze(results) });
  });
}

module.exports = {
  TARGET_RESISTANCE,
  URBAN_EQUIPMENT,
  DIRECT_HIT_TOLERANCE_METERS,
  VEHICLE_LEASE_MS,
  claimUrbanVehicleLease,
  commitUrbanImpacts,
  conditionAfterImpact,
  normalizePose,
  normalizeUrbanEntityId,
  poseDistance,
  updateUrbanVehicleLease,
  urbanEntityDocumentId
};
