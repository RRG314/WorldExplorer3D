const DESTINATION_MISSION_STATE_VERSION = 1;
const DESTINATION_MISSION_STORAGE_KEY = 'world-explorer:destination-missions:v1';

const PHASE = Object.freeze({
  AVAILABLE: 'available',
  APPROACH: 'approach',
  FIELDWORK: 'fieldwork',
  ANALYSIS: 'analysis',
  COMPLETE: 'complete'
});

const TRANSITIONS = Object.freeze({
  [PHASE.AVAILABLE]: Object.freeze({ review_briefing: PHASE.APPROACH }),
  [PHASE.APPROACH]: Object.freeze({ arrive: PHASE.FIELDWORK }),
  [PHASE.FIELDWORK]: Object.freeze({ complete_fieldwork: PHASE.ANALYSIS }),
  [PHASE.ANALYSIS]: Object.freeze({ complete_analysis: PHASE.COMPLETE }),
  [PHASE.COMPLETE]: Object.freeze({})
});

function freezeMissionState(value) {
  return Object.freeze({
    ...value,
    evidence: Object.freeze([...(value.evidence || [])]),
    history: Object.freeze([...(value.history || [])])
  });
}

function createDestinationMissionState(definition, atMs = Date.now()) {
  if (definition?.type !== 'DestinationMissionDefinition') throw new TypeError('A destination mission definition is required.');
  return freezeMissionState({
    type: 'DestinationMissionState',
    version: DESTINATION_MISSION_STATE_VERSION,
    missionId: definition.id,
    destinationId: definition.destinationId,
    phase: PHASE.AVAILABLE,
    startedAtMs: null,
    updatedAtMs: Number(atMs),
    completedAtMs: null,
    evidence: [],
    history: []
  });
}

function advanceDestinationMission(state, event, details = {}) {
  if (state?.type !== 'DestinationMissionState') return Object.freeze({ accepted: false, reason: 'mission-state-required', state });
  const nextPhase = TRANSITIONS[state.phase]?.[event];
  if (!nextPhase) return Object.freeze({ accepted: false, reason: `mission-transition-not-allowed:${state.phase}:${event}`, state });
  const atMs = Math.max(Number(state.updatedAtMs || 0), Number(details.atMs ?? Date.now()));
  const next = freezeMissionState({
    ...state,
    phase: nextPhase,
    startedAtMs: state.startedAtMs || atMs,
    updatedAtMs: atMs,
    completedAtMs: nextPhase === PHASE.COMPLETE ? atMs : state.completedAtMs,
    history: [...state.history, Object.freeze({ event, phase: nextPhase, atMs, evidenceId: details.evidenceId || null })]
  });
  return Object.freeze({ accepted: true, reason: null, state: next });
}

function normalizeLedger(input = {}) {
  const missions = {};
  for (const [id, value] of Object.entries(input.missions || {})) {
    if (value?.type !== 'DestinationMissionState' || Number(value.version) !== DESTINATION_MISSION_STATE_VERSION) continue;
    missions[id] = freezeMissionState(value);
  }
  return Object.freeze({
    type: 'DestinationMissionLedger',
    version: DESTINATION_MISSION_STATE_VERSION,
    activeMissionId: typeof input.activeMissionId === 'string' ? input.activeMissionId : null,
    missions: Object.freeze(missions),
    updatedAtMs: Number(input.updatedAtMs || 0)
  });
}

function createDestinationMissionStore(storage = globalThis.localStorage) {
  let ledger = normalizeLedger();
  try {
    ledger = normalizeLedger(JSON.parse(storage?.getItem?.(DESTINATION_MISSION_STORAGE_KEY) || 'null') || {});
  } catch {
    ledger = normalizeLedger();
  }
  const persist = (next) => {
    ledger = normalizeLedger(next);
    storage?.setItem?.(DESTINATION_MISSION_STORAGE_KEY, JSON.stringify(ledger));
    return ledger;
  };
  const stateFor = (definition) => ledger.missions[definition.id] || createDestinationMissionState(definition);
  return Object.freeze({
    activate(definition) {
      const state = stateFor(definition);
      return persist({ ...ledger, activeMissionId: definition.id, missions: { ...ledger.missions, [definition.id]: state }, updatedAtMs: Date.now() });
    },
    advance(definition, event, details = {}) {
      const current = stateFor(definition);
      const result = advanceDestinationMission(current, event, details);
      if (!result.accepted) return Object.freeze({ ...result, ledger });
      const nextLedger = persist({
        ...ledger,
        activeMissionId: definition.id,
        missions: { ...ledger.missions, [definition.id]: result.state },
        updatedAtMs: result.state.updatedAtMs
      });
      return Object.freeze({ ...result, ledger: nextLedger });
    },
    recordEvidence(definition, evidenceId, details = {}) {
      const id = String(evidenceId || '').trim();
      const current = stateFor(definition);
      if (!id) return Object.freeze({ accepted: false, reason: 'evidence-id-required', state: current, ledger });
      if (![PHASE.FIELDWORK, PHASE.ANALYSIS].includes(current.phase)) {
        return Object.freeze({ accepted: false, reason: `mission-evidence-not-allowed:${current.phase}`, state: current, ledger });
      }
      if (current.evidence.includes(id)) return Object.freeze({ accepted: true, duplicate: true, state: current, ledger });
      const atMs = Math.max(Number(current.updatedAtMs || 0), Number(details.atMs ?? Date.now()));
      const state = freezeMissionState({
        ...current,
        updatedAtMs: atMs,
        evidence: [...current.evidence, id],
        history: [...current.history, Object.freeze({ event: 'record_evidence', phase: current.phase, atMs, evidenceId: id })]
      });
      const nextLedger = persist({
        ...ledger,
        activeMissionId: definition.id,
        missions: { ...ledger.missions, [definition.id]: state },
        updatedAtMs: atMs
      });
      return Object.freeze({ accepted: true, duplicate: false, state, ledger: nextLedger });
    },
    get(definition) { return stateFor(definition); },
    load() { return ledger; },
    storageKey: DESTINATION_MISSION_STORAGE_KEY
  });
}

export {
  advanceDestinationMission,
  createDestinationMissionState,
  createDestinationMissionStore,
  DESTINATION_MISSION_STATE_VERSION,
  DESTINATION_MISSION_STORAGE_KEY,
  PHASE as DESTINATION_MISSION_PHASE
};
