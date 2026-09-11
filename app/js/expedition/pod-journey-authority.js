const POD_JOURNEY_SCHEMA_VERSION = 2;

const POD_ROUTE_KIND = Object.freeze({
  SHIP_SURFACE_ROUND_TRIP: 'ship-surface-round-trip',
  EARTH_SHUTTLE: 'earth-shuttle'
});

const POD_PHASE = Object.freeze({
  ABOARD: 'aboard',
  SHIP_LAUNCH: 'ship_launch',
  LOCAL_FLIGHT: 'local_flight',
  DESCENT: 'descent',
  SURFACE: 'surface',
  SURFACE_LAUNCH: 'surface_launch',
  RENDEZVOUS: 'rendezvous',
  RECOVERED: 'recovered',
  FAILED: 'failed'
});

const TRANSITIONS = Object.freeze({
  [POD_PHASE.ABOARD]: Object.freeze({ launch: POD_PHASE.SHIP_LAUNCH, fail: POD_PHASE.FAILED }),
  [POD_PHASE.SHIP_LAUNCH]: Object.freeze({ course_acquired: POD_PHASE.LOCAL_FLIGHT, fail: POD_PHASE.FAILED }),
  [POD_PHASE.LOCAL_FLIGHT]: Object.freeze({ begin_descent: POD_PHASE.DESCENT, fail: POD_PHASE.FAILED }),
  [POD_PHASE.DESCENT]: Object.freeze({ surface_ready: POD_PHASE.SURFACE, fail: POD_PHASE.FAILED }),
  [POD_PHASE.SURFACE]: Object.freeze({ launch: POD_PHASE.SURFACE_LAUNCH, fail: POD_PHASE.FAILED }),
  [POD_PHASE.SURFACE_LAUNCH]: Object.freeze({ rendezvous: POD_PHASE.RENDEZVOUS, fail: POD_PHASE.FAILED }),
  [POD_PHASE.RENDEZVOUS]: Object.freeze({ recover: POD_PHASE.RECOVERED, fail: POD_PHASE.FAILED }),
  [POD_PHASE.RECOVERED]: Object.freeze({}),
  [POD_PHASE.FAILED]: Object.freeze({})
});

function frozenRecord(value) {
  return Object.freeze({ ...value });
}

function createPodJourney(input = {}) {
  const expeditionId = String(input.expeditionId || '').trim();
  const contactId = String(input.contactId || '').trim();
  const bodyId = String(input.bodyId || '').trim();
  const returnFrameId = String(input.returnFrameId || '').trim();
  const routeKind = Object.values(POD_ROUTE_KIND).includes(input.routeKind)
    ? input.routeKind
    : POD_ROUTE_KIND.SHIP_SURFACE_ROUND_TRIP;
  const initialPhase = input.initialPhase === POD_PHASE.SURFACE ? POD_PHASE.SURFACE : POD_PHASE.ABOARD;
  if (!expeditionId || !contactId || !bodyId || !returnFrameId) {
    throw new TypeError('Pod journey requires expedition, contact, body, and return-frame identities.');
  }
  const now = Number(input.atMs ?? Date.now());
  return frozenRecord({
    type: 'ExpeditionPodJourney',
    schemaVersion: POD_JOURNEY_SCHEMA_VERSION,
    id: `${expeditionId}:pod:${contactId}:${now}`,
    expeditionId,
    contactId,
    bodyId,
    returnFrameId,
    routeKind,
    phase: initialPhase,
    startedAtMs: now,
    updatedAtMs: now,
    failureReason: null
  });
}

function transitionPodJourney(journey, event, details = {}) {
  if (journey?.type !== 'ExpeditionPodJourney') return frozenRecord({ accepted: false, reason: 'pod-journey-required', journey: null });
  const nextPhase = TRANSITIONS[journey.phase]?.[event];
  if (!nextPhase) return frozenRecord({ accepted: false, reason: `pod-transition-not-allowed:${journey.phase}:${event}`, journey });
  const atMs = Math.max(Number(journey.updatedAtMs || 0), Number(details.atMs ?? Date.now()));
  const next = frozenRecord({
    ...journey,
    phase: nextPhase,
    updatedAtMs: atMs,
    failureReason: nextPhase === POD_PHASE.FAILED ? String(details.reason || 'pod-journey-failed') : journey.failureReason
  });
  return frozenRecord({ accepted: true, reason: null, journey: next });
}

export {
  createPodJourney,
  POD_JOURNEY_SCHEMA_VERSION,
  POD_PHASE,
  POD_ROUTE_KIND,
  transitionPodJourney
};
