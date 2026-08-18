import {
  collection,
  limit,
  onSnapshot,
  query
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import {
  claimUrbanVehicle,
  commitUrbanImpacts,
  releaseUrbanVehicle,
  updateUrbanVehicle
} from '../../../js/urban-sandbox-api.js?v=1';

const URBAN_ENTITY_LIMIT = 96;
const VEHICLE_POSE_WRITE_INTERVAL_MS = 1000;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampMillis(value, fallback = 0) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return fallback;
}

function normalizeEntity(snapshot) {
  const data = snapshot?.data?.() || {};
  const entityId = String(data.entityId || '').slice(0, 220);
  if (!entityId || !['vehicle', 'npc', 'furniture'].includes(data.kind)) return null;
  return Object.freeze({
    documentId: snapshot.id,
    entityId,
    authority: String(data.authority || ''),
    kind: data.kind,
    worldSeed: String(data.worldSeed || ''),
    label: String(data.label || ''),
    style: String(data.style || ''),
    color: Math.max(0, Math.min(0xffffff, Math.floor(finiteNumber(data.color, 0)))),
    pose: Object.freeze({
      x: finiteNumber(data.pose?.x),
      y: finiteNumber(data.pose?.y),
      z: finiteNumber(data.pose?.z),
      yaw: finiteNumber(data.pose?.yaw)
    }),
    condition: Math.max(0, Math.min(1, finiteNumber(data.condition, 1))),
    leaseOwnerUid: String(data.leaseOwnerUid || ''),
    leaseExpiresMs: timestampMillis(data.leaseExpiresAt, 0),
    revision: Math.max(0, Math.floor(finiteNumber(data.revision, 0)))
  });
}

function createUrbanRoomAuthority(options = {}) {
  const room = options.room;
  const roomCode = String(room?.code || room?.id || '').trim().toUpperCase();
  const worldSeed = String(room?.world?.seed || '').trim();
  const user = getCurrentUser();
  const services = initFirebase();
  if (!roomCode || !worldSeed || !user?.uid || !services?.db) return null;
  let disposed = false;
  const lastPoseWriteAt = new Map();
  const inFlightPoseWrites = new Map();
  const entityQuery = query(
    collection(services.db, 'rooms', roomCode, 'urbanEntities'),
    limit(URBAN_ENTITY_LIMIT)
  );
  const unsubscribe = onSnapshot(entityQuery, (snapshot) => {
    if (disposed) return;
    const entities = snapshot.docs.map(normalizeEntity).filter((entity) => entity?.worldSeed === worldSeed);
    options.onEntities?.(entities);
  }, (error) => options.onError?.(error));

  function vehicleInput(vehicle, pose) {
    return {
      roomCode,
      worldSeed,
      entityId: vehicle.id,
      label: vehicle.variant?.label || vehicle.label || 'Vehicle',
      style: vehicle.variant?.bodyStyle || vehicle.style || 'sedan',
      color: vehicle.color,
      pose
    };
  }

  async function claimVehicle(vehicle, pose) {
    if (disposed) return { accepted: false, reason: 'disposed' };
    return claimUrbanVehicle(vehicleInput(vehicle, pose));
  }

  async function updateVehicle(vehicle, pose, force = false) {
    if (disposed) return { accepted: false, reason: 'disposed' };
    const entityId = String(vehicle?.id || '');
    const nowMs = Date.now();
    if (!force && nowMs - (lastPoseWriteAt.get(entityId) || 0) < VEHICLE_POSE_WRITE_INTERVAL_MS) {
      return { accepted: true, deferred: true };
    }
    if (inFlightPoseWrites.has(entityId)) return inFlightPoseWrites.get(entityId);
    const pending = updateUrbanVehicle(vehicleInput(vehicle, pose)).finally(() => {
      inFlightPoseWrites.delete(entityId);
    });
    inFlightPoseWrites.set(entityId, pending);
    const result = await pending;
    if (result?.accepted) lastPoseWriteAt.set(entityId, nowMs);
    return result;
  }

  async function releaseVehicle(vehicle, pose) {
    if (disposed) return { accepted: false, reason: 'disposed' };
    lastPoseWriteAt.delete(String(vehicle?.id || ''));
    return releaseUrbanVehicle(vehicleInput(vehicle, pose));
  }

  async function commitImpacts(equipment, impactPosition, targets) {
    if (disposed) return { accepted: false, reason: 'disposed' };
    return commitUrbanImpacts({
      roomCode,
      worldSeed,
      equipmentId: equipment?.id,
      impactPosition,
      targets
    });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    unsubscribe?.();
    lastPoseWriteAt.clear();
    inFlightPoseWrites.clear();
    return true;
  }

  return Object.freeze({
    actorUid: user.uid,
    claimVehicle,
    commitImpacts,
    dispose,
    releaseVehicle,
    roomCode,
    updateVehicle,
    worldSeed
  });
}

export { createUrbanRoomAuthority };
