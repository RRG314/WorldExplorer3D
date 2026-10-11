import { LUNAR_STRATEGIES } from '../planetary/lunar-survey.js';

const DESTINATION_MISSION_STATE_VERSION = 2;
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
    preparation: value.preparation ? Object.freeze({ ...value.preparation }) : null,
    outcomeId: value.outcomeId || null,
    crewLeadId: value.crewLeadId || null,
    returnConsequence: value.returnConsequence || null,
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
    outcomeId: null,
    crewLeadId: null,
    returnConsequence: null,
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
    outcomeId: nextPhase === PHASE.COMPLETE ? String(details.outcomeId || state.outcomeId || 'cautious-baseline') : state.outcomeId,
    crewLeadId: nextPhase === PHASE.COMPLETE ? String(details.crewLeadId || state.crewLeadId || '') || null : state.crewLeadId,
    returnConsequence: nextPhase === PHASE.COMPLETE ? String(details.returnConsequence || state.returnConsequence || '') || null : state.returnConsequence,
    history: [...state.history, Object.freeze({ event, phase: nextPhase, atMs, evidenceId: details.evidenceId || null })]
  });
  return Object.freeze({ accepted: true, reason: null, state: next });
}

function normalizeLedger(input = {}) {
  const missions = {};
  for (const [id, value] of Object.entries(input.missions || {})) {
    if (value?.type !== 'DestinationMissionState' || ![1, DESTINATION_MISSION_STATE_VERSION].includes(Number(value.version))) continue;
    missions[id] = freezeMissionState({
      ...value,
      version: DESTINATION_MISSION_STATE_VERSION,
      outcomeId: value.outcomeId || null,
      crewLeadId: value.crewLeadId || null,
      returnConsequence: value.returnConsequence || null
    });
  }
  return Object.freeze({
    type: 'DestinationMissionLedger',
    version: DESTINATION_MISSION_STATE_VERSION,
    activeMissionId: typeof input.activeMissionId === 'string' ? input.activeMissionId : null,
    missions: Object.freeze(missions),
    updatedAtMs: Number(input.updatedAtMs || 0)
  });
}

function validStoredLedger(value){
  if(value?.type!=='DestinationMissionLedger'||![1,2].includes(value.version)
    ||!value.missions||typeof value.missions!=='object'||Array.isArray(value.missions)
    ||!(value.activeMissionId===null||typeof value.activeMissionId==='string')||!Number.isFinite(value.updatedAtMs))return false;
  return Object.entries(value.missions).every(([id,state])=>
    state?.type==='DestinationMissionState'&&[1,2].includes(state.version)&&state.missionId===id
    &&id===`mission:${state.destinationId}`&&Object.values(PHASE).includes(state.phase)
    &&Number.isFinite(state.updatedAtMs)&&Array.isArray(state.evidence)&&state.evidence.every(v=>typeof v==='string')
    &&Array.isArray(state.history)&&state.history.every(v=>v&&typeof v.event==='string'&&Number.isFinite(v.atMs))
    &&(state.preparation==null || state.preparation.version===1 && LUNAR_STRATEGIES.some(entry=>entry.id===state.preparation.strategy)
      &&typeof state.preparation.expeditionId==='string' && Number.isFinite(state.preparation.calibratedAtMs) && state.preparation.returnBriefed===true));
}

function createDestinationMissionStore(storage = globalThis.localStorage) {
  let ledger = normalizeLedger();
  let expectedRaw=null,protectedRecord=false,conflicted=false;
  try {
    expectedRaw=storage?.getItem?.(DESTINATION_MISSION_STORAGE_KEY)||null;
    if(expectedRaw){
      const parsed=expectedRaw.length<=2_000_000?JSON.parse(expectedRaw):null;
      if(validStoredLedger(parsed))ledger=normalizeLedger(parsed);else protectedRecord=true;
    }
  } catch {
    protectedRecord=true;
  }
  const persist = (next) => {
    if(protectedRecord)throw new Error('Existing mission progress is unreadable or newer and has been retained.');
    if(typeof storage?.setItem!=='function'||typeof storage?.getItem!=='function')throw new Error('Mission storage unavailable.');
    if((storage.getItem(DESTINATION_MISSION_STORAGE_KEY)||null)!==expectedRaw){conflicted=true;throw new Error('Another tab changed mission progress. Reload to resume it.');}
    const candidate = normalizeLedger(next);
    const raw=JSON.stringify(candidate);
    storage.setItem(DESTINATION_MISSION_STORAGE_KEY, raw);
    expectedRaw=raw;
    ledger = candidate;
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
        activeMissionId: ledger.activeMissionId,
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
        activeMissionId: ledger.activeMissionId,
        missions: { ...ledger.missions, [definition.id]: state },
        updatedAtMs: atMs
      });
      return Object.freeze({ accepted: true, duplicate: false, state, ledger: nextLedger });
    },
    prepareLunar(definition, preparation) {
      const current = stateFor(definition);
      if (definition.destinationId !== 'moon' || current.phase !== PHASE.APPROACH || current.evidence.length
        || !LUNAR_STRATEGIES.some(entry => entry.id === preparation?.strategy)
        || typeof preparation.expeditionId !== 'string' || !preparation.expeditionId
        || preparation.returnBriefed !== true || !Number.isFinite(preparation.calibratedAtMs) || preparation.calibratedAtMs <= 0) return false;
      const prepared = Object.freeze({ version: 1, strategy: preparation.strategy, expeditionId: preparation.expeditionId,
        returnBriefed: true, calibratedAtMs: preparation.calibratedAtMs });
      const state = freezeMissionState({ ...current, preparation: prepared, updatedAtMs: Math.max(current.updatedAtMs, prepared.calibratedAtMs) });
      persist({ ...ledger, missions: { ...ledger.missions, [definition.id]: state }, updatedAtMs: state.updatedAtMs });
      return true;
    },
    get(definition) { return stateFor(definition); },
    load() { return ledger; },
    get status(){return protectedRecord?'protected':conflicted?'conflict':typeof storage?.setItem!=='function'?'unavailable':'ready';},
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
