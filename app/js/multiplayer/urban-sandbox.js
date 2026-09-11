import {
  collection,
  doc,
  limit,
  onSnapshot,
  query
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { initFirebase } from '../../../js/firebase-init.js?v=57';
import {
  claimUrbanVehicle,
  commitUrbanCivicEvent,
  commitUrbanImpacts,
  releaseUrbanVehicle,
  resolveUrbanCivicOutcome,
  updateUrbanVehicle
} from '../../../js/urban-sandbox-api.js?v=2';

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

function normalizeCivicState(snapshot, worldSeed) {
  if (!snapshot?.exists?.()) return null;
  const data = snapshot.data() || {};
  if (String(data.worldSeed || '') !== worldSeed || !String(data.eventId || '')) return null;
  return Object.freeze({
    authority: String(data.authority || ''),
    worldSeed: String(data.worldSeed || ''),
    eventId: String(data.eventId || ''),
    actorUid: String(data.actorUid || ''),
    kind: String(data.kind || ''),
    label: String(data.label || 'Incident witnessed'),
    agency: String(data.agency || 'Local civic response'),
    level: Math.max(0, Math.min(3, Math.floor(finiteNumber(data.level, 0)))),
    severity: Math.max(0, Math.min(3, Math.floor(finiteNumber(data.severity, 0)))),
    witnessCount: Math.max(0, Math.min(4, Math.floor(finiteNumber(data.witnessCount, 0)))),
    vehicleId: String(data.vehicleId || ''),
    searchCenter: Object.freeze({ x: finiteNumber(data.searchCenter?.x), z: finiteNumber(data.searchCenter?.z) }),
    searchRadius: Math.max(0, finiteNumber(data.searchRadius, 0)),
    observedAtMs: timestampMillis(data.observedAt, 0),
    reportingStartsAtMs: timestampMillis(data.reportingStartsAt, 0),
    searchStartsAtMs: timestampMillis(data.searchStartsAt, 0),
    searchEndsAtMs: timestampMillis(data.searchEndsAt, 0),
    resolved: data.resolved === true,
    outcome: data.outcome ? Object.freeze({ type: String(data.outcome.type || ''), label: String(data.outcome.label || '') }) : null,
    resolvedAtMs: timestampMillis(data.resolvedAt, 0),
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
  let civicState = null;
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
  const unsubscribeCivic = onSnapshot(
    doc(services.db, 'rooms', roomCode, 'urbanCivic', 'current'),
    (snapshot) => {
      if (disposed) return;
      civicState = normalizeCivicState(snapshot, worldSeed);
      options.onCivicState?.(civicState);
    },
    (error) => options.onError?.(error)
  );

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

  async function reportCivicEvent(event, witnesses) {
    if (disposed) return { accepted: false, reason: 'disposed' };
    return commitUrbanCivicEvent({
      roomCode,
      worldSeed,
      kind: event?.kind,
      severity: event?.severity,
      witnessCount: Array.isArray(witnesses) ? witnesses.length : 0,
      vehicleId: event?.vehicleId,
      position: event?.position
    });
  }

  async function resolveCivicOutcome() {
    if (disposed) return { accepted: false, reason: 'disposed' };
    return resolveUrbanCivicOutcome({ roomCode, worldSeed });
  }

  function civicSnapshot(nowMs = Date.now()) {
    const current = civicState;
    if (!current) return null;
    if (current.resolved) return Object.freeze({
      phase: 'clear',
      level: 0,
      agency: current.agency,
      phaseRemaining: 0,
      searchRadius: 0,
      searchCenter: null,
      witnesses: Object.freeze([]),
      lastEvent: Object.freeze({
        id: current.eventId,
        kind: current.kind,
        label: current.label,
        vehicleId: current.vehicleId,
        severity: current.severity,
        witnessCount: current.witnessCount,
        position: current.searchCenter
      }),
      lastIgnoredEvent: null,
      recentEvents: Object.freeze([]),
      shared: true,
      actorUid: current.actorUid,
      outcome: current.outcome,
      status: Object.freeze({ visible: false, title: '', detail: '' })
    });
    const coolingEndsAtMs = current.searchEndsAtMs + 8_000;
    let phase = 'clear';
    let phaseEndMs = coolingEndsAtMs;
    if (nowMs < current.reportingStartsAtMs) {
      phase = 'observed';
      phaseEndMs = current.reportingStartsAtMs;
    } else if (nowMs < current.searchStartsAtMs) {
      phase = 'reporting';
      phaseEndMs = current.searchStartsAtMs;
    } else if (nowMs < current.searchEndsAtMs) {
      phase = 'searching';
      phaseEndMs = current.searchEndsAtMs;
    } else if (nowMs < coolingEndsAtMs) {
      phase = 'cooling';
    }
    const visible = phase !== 'clear';
    const detail = phase === 'observed'
      ? `${current.witnessCount} witness${current.witnessCount === 1 ? '' : 'es'} noticed`
      : phase === 'reporting' ? current.agency
        : phase === 'searching' ? current.agency : phase === 'cooling' ? 'Keep exploring calmly' : '';
    const title = phase === 'observed' ? current.label
      : phase === 'reporting' ? 'Witness reporting'
        : phase === 'searching' ? 'Local search active' : phase === 'cooling' ? 'Attention fading' : '';
    const event = Object.freeze({
      id: current.eventId,
      kind: current.kind,
      label: current.label,
      vehicleId: current.vehicleId,
      severity: current.severity,
      witnessCount: current.witnessCount,
      position: current.searchCenter
    });
    return Object.freeze({
      phase,
      level: visible ? current.level : 0,
      agency: current.agency,
      phaseRemaining: Math.max(0, Number(((phaseEndMs - nowMs) / 1000).toFixed(2))),
      searchRadius: visible ? current.searchRadius : 0,
      searchCenter: visible ? current.searchCenter : null,
      witnesses: Object.freeze(Array.from({ length: current.witnessCount }, (_, index) => Object.freeze({ id: `shared-witness:${index + 1}`, reaction: 'reporting', distance: 0 }))),
      lastEvent: event,
      lastIgnoredEvent: null,
      recentEvents: Object.freeze([event]),
      shared: true,
      actorUid: current.actorUid,
      outcome: current.outcome,
      status: Object.freeze({ visible, title, detail })
    });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    unsubscribe?.();
    unsubscribeCivic?.();
    lastPoseWriteAt.clear();
    inFlightPoseWrites.clear();
    return true;
  }

  return Object.freeze({
    actorUid: user.uid,
    civicSnapshot,
    claimVehicle,
    commitImpacts,
    dispose,
    releaseVehicle,
    reportCivicEvent,
    resolveCivicOutcome,
    roomCode,
    updateVehicle,
    worldSeed
  });
}

export { createUrbanRoomAuthority };
