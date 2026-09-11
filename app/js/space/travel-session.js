import { SPACE_CRAFT_IDENTITY } from './craft-identity.js?v=1';

const SPACE_TRAVEL_SESSION_VERSION = 1;

const SPACE_TRAVEL_LOCATION = Object.freeze({
  SURFACE: 'surface',
  LOCAL_SPACE: 'local-space',
  STARSHIP: 'starship',
  DEEP_SPACE: 'deep-space'
});

const SPACE_TRAVEL_PHASE = Object.freeze({
  INACTIVE: 'inactive',
  SURFACE_READY: 'surface-ready',
  LAUNCH: 'launch',
  ASCENT: 'ascent',
  RENDEZVOUS: 'rendezvous',
  DOCKED: 'docked',
  FREE_FLIGHT: 'free-flight',
  PARKING_ORBIT: 'parking-orbit',
  TRANSFER: 'transfer',
  APPROACH: 'approach',
  DESCENT: 'descent',
  LANDED: 'landed',
  INTERIOR: 'interior'
});

const SPACE_GUIDANCE_MODE = Object.freeze({
  MANUAL: 'manual',
  ASSISTED: 'assisted'
});

const ACTIVE_CRAFT_IDS = Object.freeze([
  SPACE_CRAFT_IDENTITY.starship.id,
  SPACE_CRAFT_IDENTITY.pod.id
]);

function oneOf(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

function text(value) {
  return String(value || '').trim();
}

function destinationRecord(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const id = text(input.id);
  if (!id) return null;
  return Object.freeze({
    id,
    kind: oneOf(text(input.kind), ['body', 'starship', 'system', 'contact'], 'body'),
    name: text(input.name) || id
  });
}

function createInactiveSession(sequence = 0, reason = 'not-started') {
  return Object.freeze({
    type: 'SpaceTravelSession',
    version: SPACE_TRAVEL_SESSION_VERSION,
    sequence,
    active: false,
    location: SPACE_TRAVEL_LOCATION.SURFACE,
    phase: SPACE_TRAVEL_PHASE.INACTIVE,
    activeCraftId: null,
    sourceBodyId: null,
    destination: null,
    guidance: SPACE_GUIDANCE_MODE.MANUAL,
    reason,
    updatedAtMs: Date.now()
  });
}

function installSpaceTravelSession(appContext) {
  let current = createInactiveSession();

  const publish = (next) => {
    current = Object.freeze(next);
    appContext.spaceTravelSession = current;
    globalThis.dispatchEvent?.(new CustomEvent('we3d:space-travel-session', { detail: current }));
    return current;
  };

  const begin = (input = {}) => {
    const activeCraftId = oneOf(text(input.activeCraftId), ACTIVE_CRAFT_IDS, SPACE_CRAFT_IDENTITY.starship.id);
    const location = oneOf(text(input.location), Object.values(SPACE_TRAVEL_LOCATION), SPACE_TRAVEL_LOCATION.LOCAL_SPACE);
    const phase = oneOf(text(input.phase), Object.values(SPACE_TRAVEL_PHASE), SPACE_TRAVEL_PHASE.FREE_FLIGHT);
    return publish({
      type: 'SpaceTravelSession',
      version: SPACE_TRAVEL_SESSION_VERSION,
      sequence: current.sequence + 1,
      active: true,
      location,
      phase,
      activeCraftId,
      sourceBodyId: text(input.sourceBodyId) || null,
      destination: destinationRecord(input.destination),
      guidance: oneOf(text(input.guidance), Object.values(SPACE_GUIDANCE_MODE), SPACE_GUIDANCE_MODE.MANUAL),
      reason: text(input.reason) || 'space-flight-started',
      updatedAtMs: Date.now()
    });
  };

  const update = (patch = {}) => {
    if (!current.active) return current;
    const next = {
      ...current,
      updatedAtMs: Date.now(),
      reason: text(patch.reason) || current.reason
    };
    if (Object.hasOwn(patch, 'activeCraftId')) {
      next.activeCraftId = oneOf(text(patch.activeCraftId), ACTIVE_CRAFT_IDS, current.activeCraftId);
    }
    if (Object.hasOwn(patch, 'location')) {
      next.location = oneOf(text(patch.location), Object.values(SPACE_TRAVEL_LOCATION), current.location);
    }
    if (Object.hasOwn(patch, 'phase')) {
      next.phase = oneOf(text(patch.phase), Object.values(SPACE_TRAVEL_PHASE), current.phase);
    }
    if (Object.hasOwn(patch, 'sourceBodyId')) next.sourceBodyId = text(patch.sourceBodyId) || null;
    if (Object.hasOwn(patch, 'destination')) next.destination = destinationRecord(patch.destination);
    if (Object.hasOwn(patch, 'guidance')) {
      next.guidance = oneOf(text(patch.guidance), Object.values(SPACE_GUIDANCE_MODE), current.guidance);
    }
    const sameDestination = next.destination?.id === current.destination?.id
      && next.destination?.kind === current.destination?.kind
      && next.destination?.name === current.destination?.name;
    if (
      next.activeCraftId === current.activeCraftId
      && next.location === current.location
      && next.phase === current.phase
      && next.sourceBodyId === current.sourceBodyId
      && next.guidance === current.guidance
      && next.reason === current.reason
      && sameDestination
    ) return current;
    return publish(next);
  };

  const end = (reason = 'space-flight-ended') => publish(createInactiveSession(current.sequence + 1, text(reason) || 'space-flight-ended'));
  const snapshot = () => current;
  const activeCraftId = () => current.active ? current.activeCraftId : null;

  Object.assign(appContext, {
    beginSpaceTravelSession: begin,
    endSpaceTravelSession: end,
    getActiveSpaceCraftId: activeCraftId,
    getSpaceTravelSession: snapshot,
    updateSpaceTravelSession: update
  });
  appContext.spaceTravelSession = current;

  return Object.freeze({ begin, end, activeCraftId, snapshot, update });
}

export {
  installSpaceTravelSession,
  SPACE_GUIDANCE_MODE,
  SPACE_TRAVEL_LOCATION,
  SPACE_TRAVEL_PHASE,
  SPACE_TRAVEL_SESSION_VERSION
};
