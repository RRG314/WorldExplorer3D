import { LUNAR_STRATEGIES, lunarStudyMissionId, lunarFieldPlan } from '../planetary/lunar-survey.js';
import {lunarStudyReport} from '../planetary/lunar-study-records.js';

const DESTINATION_MISSION_STATE_VERSION = 3;
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

function freezeRestoredReport(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))freezeRestoredReport(child);
  return Object.freeze(value);
}
function freezeMissionState(value) {
  return Object.freeze({
    ...value,
    preparation: value.preparation ? Object.freeze({ ...value.preparation }) : null,
    ...(value.siteARecovery ? {siteARecovery:Object.freeze({...value.siteARecovery})} : {}),
    ...(value.restoredReport?{restoredReport:freezeRestoredReport(value.restoredReport)}:{}),
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
    if (value?.type !== 'DestinationMissionState' || ![1, 2, DESTINATION_MISSION_STATE_VERSION].includes(Number(value.version))) continue;
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

function validSiteARecovery(state){
  const r=state.siteARecovery;
  return !r || state.surveyVariantId==='planned-return'&&typeof r.podId==='string'&&r.podId===state.siteACompletedPodId&&r.expeditionId===state.preparation?.expeditionId&&Number.isFinite(r.atMs)&&r.atMs>0;
}
const originalLunarStrategy=state=>state?.preparation?.strategy||state?.restoredReport?.metadata?.strategy;
function validStoredLedger(value){
  if(value?.type!=='DestinationMissionLedger'||![1,2,3].includes(value.version)
    ||!value.missions||typeof value.missions!=='object'||Array.isArray(value.missions)
    ||!(value.activeMissionId===null||typeof value.activeMissionId==='string')||!Number.isFinite(value.updatedAtMs))return false;
  return Object.entries(value.missions).every(([id,state])=>
    state?.type==='DestinationMissionState'&&[1,2,3].includes(state.version)&&state.missionId===id
    &&(id===`mission:${state.destinationId}`&&!state.surveyVariantId || state.destinationId==='moon' && ['alternate-method','planned-return'].includes(state.surveyVariantId) && id===lunarStudyMissionId(state.surveyVariantId))&&Object.values(PHASE).includes(state.phase)&&validSiteARecovery(state)
    &&Number.isFinite(state.updatedAtMs)&&Array.isArray(state.evidence)&&state.evidence.every(v=>typeof v==='string')
    &&Array.isArray(state.history)&&state.history.every(v=>v&&typeof v.event==='string'&&Number.isFinite(v.atMs))
    &&(!state.restoredReport||state.destinationId==='moon'&&!state.surveyVariantId&&lunarStudyReport(state.restoredReport)?.eventId==='event:destination-mission:moon')
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
  const stateFor = (definition,variantId) => {
    const selected=ledger.missions[ledger.activeMissionId];
    const id=variantId!==undefined
      ? definition.destinationId==='moon'?lunarStudyMissionId(variantId):definition.id
      : selected?.destinationId===definition.destinationId?selected.missionId:definition.id;
    return ledger.missions[id] || (id===definition.id?createDestinationMissionState(definition):freezeMissionState({...createDestinationMissionState(definition),missionId:id,surveyVariantId:variantId}));
  };
  const fieldAllowed=(state,evidenceId)=>state.destinationId!=='moon'||state.surveyVariantId!=='planned-return'||!String(evidenceId).startsWith('fragment-')||!!state.siteARecovery;
  return Object.freeze({
    activate(definition,{variantId}={}) {
      if(variantId!==undefined&&definition.destinationId!=='moon'&&variantId!=='campaign')throw Error('This destination has no repeat study.');
      const state = stateFor(definition,variantId);
      if(definition.destinationId==='moon'){
        const unfinished=Object.values(ledger.missions).find(s=>s.destinationId==='moon'&&![PHASE.AVAILABLE,PHASE.COMPLETE].includes(s.phase)&&s.missionId!==state.missionId);
        if(unfinished)throw Error('Continue the unfinished lunar study first.');
        if(state.surveyVariantId&&ledger.missions[definition.id]?.phase!==PHASE.COMPLETE)throw Error('Complete the original lunar study before another assignment.');
        if(state.surveyVariantId==='alternate-method'&&!LUNAR_STRATEGIES.some(s=>s.id===originalLunarStrategy(ledger.missions[definition.id])))throw Error('The original lunar method is unavailable; its record has been retained.');
      }
      return persist({ ...ledger, activeMissionId: state.missionId, missions: { ...ledger.missions, [state.missionId]: state }, updatedAtMs: Date.now() });
    },
    advance(definition, event, details = {}) {
      const current = stateFor(definition);
      if(event==='complete_fieldwork'&&current.surveyVariantId==='planned-return'&&!current.siteARecovery)return Object.freeze({accepted:false,reason:'site-a-recovery-required',state:current,ledger});
      if(event==='complete_fieldwork'&&current.surveyVariantId&&!lunarFieldPlan(current.preparation?.strategy).every(e=>current.evidence.includes(e.evidenceId)))return Object.freeze({accepted:false,reason:'complete-both-lunar-sites',state:current,ledger});
      const result = advanceDestinationMission(current, event, details);
      if (!result.accepted) return Object.freeze({ ...result, ledger });
      const nextLedger = persist({
        ...ledger,
        activeMissionId: ledger.activeMissionId,
        missions: { ...ledger.missions, [current.missionId]: result.state },
        updatedAtMs: result.state.updatedAtMs
      });
      return Object.freeze({ ...result, ledger: nextLedger });
    },
    recordEvidence(definition, evidenceId, details = {}) {
      const id = String(evidenceId || '').trim();
      const current = stateFor(definition);
      if(!fieldAllowed(current,id))return Object.freeze({accepted:false,reason:'site-a-recovery-required',state:current,ledger});
      if (!id) return Object.freeze({ accepted: false, reason: 'evidence-id-required', state: current, ledger });
      if (![PHASE.FIELDWORK, PHASE.ANALYSIS].includes(current.phase)) {
        return Object.freeze({ accepted: false, reason: `mission-evidence-not-allowed:${current.phase}`, state: current, ledger });
      }
      if (current.evidence.includes(id)) return Object.freeze({ accepted: true, duplicate: true, state: current, ledger });
      const completedA=current.surveyVariantId==='planned-return'&&id.startsWith('mare-')&&lunarFieldPlan(current.preparation?.strategy).filter(e=>e.evidenceId.startsWith('mare-')).every(e=>e.evidenceId===id||current.evidence.includes(e.evidenceId));
      if(completedA&&(typeof details.podId!=='string'||!details.podId))return Object.freeze({accepted:false,reason:'site-a-pod-identity-required',state:current,ledger});
      const atMs = Math.max(Number(current.updatedAtMs || 0), Number(details.atMs ?? Date.now()));
      const state = freezeMissionState({
        ...current,
        ...(completedA?{siteACompletedPodId:details.podId}:{}),
        updatedAtMs: atMs,
        evidence: [...current.evidence, id],
        history: [...current.history, Object.freeze({ event: 'record_evidence', phase: current.phase, atMs, evidenceId: id })]
      });
      const nextLedger = persist({
        ...ledger,
        activeMissionId: ledger.activeMissionId,
        missions: { ...ledger.missions, [current.missionId]: state },
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
      if(current.surveyVariantId==='alternate-method'&&preparation.strategy===originalLunarStrategy(ledger.missions[definition.id]))return false;
      const prepared = Object.freeze({ version: 1, strategy: preparation.strategy, expeditionId: preparation.expeditionId,
        returnBriefed: true, calibratedAtMs: preparation.calibratedAtMs });
      const state = freezeMissionState({ ...current, preparation: prepared, updatedAtMs: Math.max(current.updatedAtMs, prepared.calibratedAtMs) });
      persist({ ...ledger, missions: { ...ledger.missions, [current.missionId]: state }, updatedAtMs: state.updatedAtMs });
      return true;
    },
    recordLunarRecovery(definition, journey, atMs = Date.now()) {
      const current = stateFor(definition),
        plan = lunarFieldPlan(current.preparation?.strategy);
      if (
        current.surveyVariantId !== 'planned-return' ||
        current.phase !== PHASE.FIELDWORK ||
        !plan
          .filter((e) => e.evidenceId.startsWith('mare-'))
          .every((e) => current.evidence.includes(e.evidenceId)) ||
        current.evidence.some((e) => e.startsWith('fragment-')) ||
        journey?.phase !== 'recovered' ||
        journey.bodyId !== 'moon' ||
        journey.returnFrameId !== 'sol' ||
        journey.contactId !== 'destination-mission:moon' ||
        journey.expeditionId !== current.preparation?.expeditionId ||
        typeof journey.id !== 'string' ||
        journey.id !== current.siteACompletedPodId ||
        !Number.isFinite(atMs) ||
        atMs <= 0
      )
        return { accepted: false, reason: 'recover-original-site-a-pod', state: current, ledger };
      if (current.siteARecovery) return { accepted: true, duplicate: true, state: current, ledger };
      const recovery = Object.freeze({
          podId: journey.id,
          expeditionId: journey.expeditionId,
          atMs: Math.max(current.updatedAtMs, atMs),
        }),
        state = freezeMissionState({
          ...current,
          siteARecovery: recovery,
          updatedAtMs: recovery.atMs,
          history: [
            ...current.history,
            {
              event: 'recover_lunar_site_a',
              phase: current.phase,
              atMs: recovery.atMs,
              evidenceId: journey.id,
            },
          ],
        });
      persist({
        ...ledger,
        missions: { ...ledger.missions, [current.missionId]: state },
        updatedAtMs: state.updatedAtMs,
      });
      return { accepted: true, duplicate: false, state, ledger };
    },
    canRecordFieldEvidence(definition,evidenceId){return fieldAllowed(stateFor(definition),evidenceId);},
    restoreOriginalLunarReport(definition, report) {
      if (
        definition.destinationId !== 'moon' ||
        lunarStudyReport(report)?.eventId !== 'event:destination-mission:moon'
      )
        throw Error('Use the original saved lunar report.');
      const current = stateFor(definition, 'campaign');
      if (current.phase === PHASE.COMPLETE) return { restored: false, state: current, ledger };
      if (current.phase !== PHASE.AVAILABLE || current.evidence.length || current.history.length)
        throw Error('Finish or recover the current lunar record first.');
      // Restore a proven result, never invent a preparation/calibration event.
      const state = freezeMissionState({
        ...current,
        phase: PHASE.COMPLETE,
        startedAtMs: null,
        completedAtMs: report.occurredAt,
        updatedAtMs: report.occurredAt,
        outcomeId: report.metadata.outcomeId || null,
        evidence: [...report.metadata.fieldEvidence],
        history: [],
        restoredReport: JSON.parse(JSON.stringify(report)),
      });
      persist({
        ...ledger,
        missions: { ...ledger.missions, [definition.id]: state },
        updatedAtMs: Math.max(ledger.updatedAtMs, report.occurredAt),
      });
      return { restored: true, state, ledger };
    },
    get(definition,options={}) { return stateFor(definition,options.variantId); },
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
