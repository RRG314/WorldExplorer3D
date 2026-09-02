'use strict';

const SHARED_EXPEDITION_SCHEMA_VERSION = 1;
const SHARED_EXPEDITION_ROLES = Object.freeze([
  'command', 'navigation', 'engineering', 'medical', 'life-support', 'science'
]);
const RESOURCE_KEYS = Object.freeze([
  'foodKg', 'waterKg', 'powerMWh', 'propellantKg', 'medicalUnits',
  'maintenanceKg', 'feedstockKg', 'scienceCargoKg', 'processingResidueKg'
]);
const {
  createAuthorizedExpeditionPlan,
  executeExpeditionCommand
} = require('./generated/expedition-command-engine.cjs');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRole(value) {
  const role = text(value, 32).toLowerCase();
  return SHARED_EXPEDITION_ROLES.includes(role) ? role : '';
}

function assertPlan(plan) {
  if (!plan || plan.type !== 'InterstellarExpedition' || Number(plan.schemaVersion) !== 1) {
    throw new Error('invalid_expedition_plan');
  }
  if (!text(plan.id, 160) || !text(plan.destinationId, 160) || !text(plan.ship?.profileId, 80)) {
    throw new Error('invalid_expedition_identity');
  }
  if (!['planned', 'traveling', 'arrived', 'failed'].includes(String(plan.state || ''))) {
    throw new Error('invalid_expedition_state');
  }
  for (const key of RESOURCE_KEYS) {
    const value = finite(plan.resources?.[key], NaN);
    if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error(`invalid_resource:${key}`);
  }
  const serialized = JSON.stringify(plan);
  if (serialized.length > 700_000) throw new Error('expedition_record_too_large');
  return clone(plan);
}

function connectedParticipants(state, activeUids = null) {
  const active = activeUids ? new Set(activeUids.map(String)) : null;
  return Object.values(state.participants || {}).filter((participant) =>
    participant.connected !== false && (!active || active.has(participant.uid))
  );
}

function chooseRole(state, requestedRole = '') {
  const claimed = new Set(Object.values(state.participants || {}).map((participant) => participant.role));
  const requested = normalizeRole(requestedRole);
  if (requested && !claimed.has(requested)) return requested;
  return SHARED_EXPEDITION_ROLES.find((role) => !claimed.has(role)) || requested || 'science';
}

function createSharedExpedition({ roomCode, actor, configuration, nowMs = Date.now() }) {
  const uid = text(actor?.uid, 160);
  if (!uid) throw new Error('signed_in_actor_required');
  const expedition = assertPlan(createAuthorizedExpeditionPlan(configuration, { nowMs }));
  const role = chooseRole({ participants: {} }, actor.role || 'command');
  return Object.freeze({
    type: 'SharedInterstellarExpedition',
    schemaVersion: SHARED_EXPEDITION_SCHEMA_VERSION,
    roomCode: text(roomCode, 12).toUpperCase(),
    expeditionId: expedition.id,
    revision: 1,
    expedition,
    participants: Object.freeze({
      [uid]: Object.freeze({
        uid,
        displayName: text(actor.displayName || 'Explorer', 60),
        role,
        connected: true,
        joinedAtMs: nowMs,
        lastSeenMs: nowMs,
        readyForRevision: 0
      })
    }),
    rescueLedger: Object.freeze([]),
    createdByUid: uid,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    lastMutation: Object.freeze({ kind: 'created', actorUid: uid, atMs: nowMs })
  });
}

function requireParticipant(state, uid) {
  const participant = state?.participants?.[uid];
  if (!participant) throw new Error('expedition_participant_required');
  return participant;
}

function updateParticipants(state, uid, changes) {
  return Object.freeze({
    ...(state.participants || {}),
    [uid]: Object.freeze({ ...(state.participants?.[uid] || {}), ...changes })
  });
}

function joinSharedExpedition(state, { actor, requestedRole = '', nowMs = Date.now() }) {
  const uid = text(actor?.uid, 160);
  if (!uid) throw new Error('signed_in_actor_required');
  const existing = state.participants?.[uid];
  const role = existing?.role || chooseRole(state, requestedRole);
  return Object.freeze({
    ...state,
    participants: updateParticipants(state, uid, {
      uid,
      displayName: text(actor.displayName || existing?.displayName || 'Explorer', 60),
      role,
      connected: true,
      joinedAtMs: existing?.joinedAtMs || nowMs,
      lastSeenMs: nowMs,
      readyForRevision: existing?.readyForRevision === state.revision ? state.revision : 0
    }),
    updatedAtMs: nowMs,
    lastMutation: Object.freeze({ kind: existing ? 'reconnected' : 'joined', actorUid: uid, atMs: nowMs })
  });
}

function setParticipantConnection(state, { uid, connected, nowMs = Date.now() }) {
  const actorUid = text(uid, 160);
  requireParticipant(state, actorUid);
  return Object.freeze({
    ...state,
    participants: updateParticipants(state, actorUid, {
      connected: connected !== false,
      lastSeenMs: nowMs,
      readyForRevision: connected === false ? 0 : state.participants[actorUid].readyForRevision
    }),
    updatedAtMs: nowMs,
    lastMutation: Object.freeze({ kind: connected === false ? 'disconnected' : 'reconnected', actorUid, atMs: nowMs })
  });
}

function setParticipantReady(state, { uid, ready = true, nowMs = Date.now() }) {
  const actorUid = text(uid, 160);
  requireParticipant(state, actorUid);
  return Object.freeze({
    ...state,
    participants: updateParticipants(state, actorUid, {
      readyForRevision: ready === false ? 0 : state.revision,
      lastSeenMs: nowMs,
      connected: true
    }),
    updatedAtMs: nowMs,
    lastMutation: Object.freeze({ kind: ready === false ? 'not-ready' : 'ready', actorUid, atMs: nowMs })
  });
}

function commitSharedExpedition(state, {
  uid,
  expectedRevision,
  command,
  activeUids = null,
  nowMs = Date.now()
}) {
  const actorUid = text(uid, 160);
  requireParticipant(state, actorUid);
  if (Number(expectedRevision) !== Number(state.revision)) throw new Error('stale_expedition_revision');
  const commandType = text(command?.type, 40).toLowerCase();
  const connected = connectedParticipants(state, activeUids);
  if (commandType === 'advance') {
    if (connected.length < 2) throw new Error('two_connected_crew_required');
    if (connected.some((participant) => participant.readyForRevision !== state.revision)) {
      throw new Error('connected_crew_not_ready');
    }
  }
  const result = executeExpeditionCommand(state.expedition, command, { nowMs });
  const expedition = assertPlan(result.expedition);
  const revision = state.revision + 1;
  const participants = Object.freeze(Object.fromEntries(Object.entries(state.participants || {}).map(([key, participant]) => [
    key,
    Object.freeze({ ...participant, readyForRevision: 0 })
  ])));
  return Object.freeze({
    ...state,
    revision,
    expedition,
    participants,
    updatedAtMs: nowMs,
    lastMutation: Object.freeze({ kind: commandType, actorUid, atMs: nowMs })
  });
}

function rescueIntoSharedExpedition(state, { uid, manifestId, nowMs = Date.now() }) {
  const actorUid = text(uid, 160);
  requireParticipant(state, actorUid);
  const id = text(manifestId, 160);
  const manifest = (state.expedition?.rescueManifests || []).find((entry) => entry.id === id);
  if (!manifest) throw new Error('rescue_manifest_not_found');
  if ((state.rescueLedger || []).some((entry) => entry.manifestId === id)) throw new Error('rescue_already_completed');
  const expedition = clone(state.expedition);
  const rescuedCrew = Array.isArray(manifest.crew) ? manifest.crew.map(clone) : [];
  const existingCrewIds = new Set((expedition.crew || []).map((member) => member.id));
  if (rescuedCrew.some((member) => !member.id || existingCrewIds.has(member.id))) throw new Error('invalid_rescue_crew');
  expedition.crew = [...(expedition.crew || []), ...rescuedCrew];
  const transferred = {};
  for (const key of RESOURCE_KEYS) {
    const amount = Math.max(0, finite(manifest.resources?.[key], 0));
    transferred[key] = amount;
    expedition.resources[key] = finite(expedition.resources?.[key], 0) + amount;
  }
  expedition.rescueManifests = expedition.rescueManifests.filter((entry) => entry.id !== id);
  expedition.log = [...(expedition.log || []), {
    atMissionS: finite(expedition.strategicElapsedS, 0),
    kind: 'rescue',
    message: `${rescuedCrew.length} crew and their recorded supplies transferred aboard.`
  }];
  const revision = state.revision + 1;
  return Object.freeze({
    ...state,
    revision,
    expedition: assertPlan(expedition),
    rescueLedger: Object.freeze([...(state.rescueLedger || []), Object.freeze({
      manifestId: id,
      crewIds: Object.freeze(rescuedCrew.map((member) => member.id)),
      resources: Object.freeze(transferred),
      recoveredByUid: actorUid,
      atMs: nowMs
    })]),
    participants: Object.freeze(Object.fromEntries(Object.entries(state.participants || {}).map(([key, participant]) => [
      key, Object.freeze({ ...participant, readyForRevision: 0 })
    ]))),
    updatedAtMs: nowMs,
    lastMutation: Object.freeze({ kind: 'rescue', actorUid, atMs: nowMs })
  });
}

module.exports = {
  SHARED_EXPEDITION_ROLES,
  SHARED_EXPEDITION_SCHEMA_VERSION,
  commitSharedExpedition,
  connectedParticipants,
  createSharedExpedition,
  joinSharedExpedition,
  rescueIntoSharedExpedition,
  setParticipantConnection,
  setParticipantReady
};
