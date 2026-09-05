import { RESOURCE_KEYS, withExpeditionChanges } from './model.js?v=11';
import { JULIAN_YEAR_S } from './travel-calculator.js?v=2';
import {
  applyDueConsequences,
  createDirectedEvent,
  nextVoyageSlot,
  resolveDirectedEvent,
  VOYAGE_SLOTS
} from './voyage-director.js?v=2';
import { appendSystemTransitions, assessCausalFailure } from './failure-authority.js?v=2';
import { advanceLongDurationState } from './long-duration.js?v=1';
import { advanceOutposts } from './outpost.js?v=1';

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function appendLog(log, entry) {
  return Object.freeze([...(log || []), Object.freeze(entry)]);
}

function appendLogs(log, entries) {
  return Object.freeze([...(log || []), ...(entries || []).map((entry) => Object.freeze(entry))]);
}

function startExpedition(expedition, atMs = Date.now()) {
  if (!expedition || expedition.state !== 'planned') return expedition;
  if (expedition.readiness.status === 'insufficient') throw new Error('The Expedition is not ready to depart.');
  return withExpeditionChanges(expedition, {
    state: 'traveling', voyagePhase: 'departure', departedAtMs: atMs, updatedAtMs: atMs,
    log: appendLog(expedition.log, { atMissionS: 0, kind: 'departure', message: `${expedition.ship?.name || 'Solis Reach'} departed the Solar System.` })
  });
}

function resourceDemandMultipliers(expedition) {
  const systems = expedition?.systems || {};
  const crew = expedition?.crew || [];
  const condition = (id) => Math.max(0.05, Math.min(1, Number(systems[id]?.condition ?? 1)));
  const averageFatigue = crew.length
    ? crew.reduce((sum, member) => sum + Number(member.fatigue || 0), 0) / crew.length
    : 0;
  const averageHealth = crew.length
    ? crew.reduce((sum, member) => sum + Number(member.health ?? 1), 0) / crew.length
    : 1;
  const survivalPressure = expedition?.survival === 'severe' ? 1.1 : 1;
  const wearPressure = Object.values(systems).length
    ? 1 + Object.values(systems).reduce((sum, system) => sum + Math.max(0, 1 - Number(system?.condition ?? 1)), 0) / Object.values(systems).length * 0.6
    : 1;
  return Object.freeze({
    foodKg: survivalPressure * (1 + averageFatigue * 0.08 + (1 - condition('food-production')) * 0.28),
    waterKg: survivalPressure * (1 + (1 - condition('life-support')) * 0.42),
    powerMWh: 1 + (1 - condition('power')) * 0.24 + (1 - condition('thermal')) * 0.16,
    propellantKg: 1 + (1 - condition('propulsion')) * 0.32 + (1 - condition('navigation')) * 0.12,
    medicalUnits: 1 + Math.max(0, 1 - averageHealth) * 0.8 + averageFatigue * 0.12,
    maintenanceKg: wearPressure,
    feedstockKg: 1 + (wearPressure - 1) * 0.45,
    processingResidueKg: 1
  });
}

function consumeResources(expedition, deltaS, totalS) {
  const resources = expedition.resources;
  const expectedResources = expedition.calculation.expectedResources;
  const next = clone(resources);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  const multipliers = resourceDemandMultipliers(expedition);
  for (const key of RESOURCE_KEYS) {
    if (key === 'scienceCargoKg') continue;
    next[key] = Math.max(0, Number(next[key] || 0) - Number(expectedResources?.[key] || 0) * fraction * Number(multipliers[key] || 1));
  }
  return Object.freeze(next);
}

function conditionStatus(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? 'critical' : value < 0.55 ? 'degraded' : value < 0.85 ? 'operational' : 'optimal';
}

function degradeSystems(systems, deltaS, totalS) {
  const next = clone(systems);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  for (const [id, system] of Object.entries(next)) {
    const wearRate = id === 'hull' ? 0.08 : id === 'life-support' ? 0.12 : 0.1;
    system.condition = Math.max(0, Number(system.condition || 0) - wearRate * fraction);
    system.status = conditionStatus(system.condition);
  }
  return Object.freeze(next);
}

function advanceCrew(crew, deltaS, systems = {}) {
  const years = Math.max(0, Number(deltaS) || 0) / JULIAN_YEAR_S;
  const lifeSupportCondition = Math.max(0, Math.min(1, Number(systems['life-support']?.condition ?? 1)));
  const medicalCondition = Math.max(0, Math.min(1, Number(systems.medical?.condition ?? 1)));
  return Object.freeze((crew || []).map((member) => Object.freeze({
    ...member,
    ageYears: Number(member.ageYears || 0) + years,
    experienceYears: Number(member.experienceYears || 0) + years,
    health: Math.max(0, Math.min(1, Number(member.health ?? 1) - years * (1 - lifeSupportCondition) * 0.004 - years * (1 - medicalCondition) * 0.002)),
    fatigue: Math.min(1, Math.max(0, Number(member.fatigue || 0)) + Math.min(0.08, years * 0.003 + (1 - lifeSupportCondition) * 0.025))
  })));
}

function incorporateDueConsequences(expedition) {
  const due = applyDueConsequences(expedition);
  if (!due) return expedition;
  return withExpeditionChanges(expedition, {
    resources: due.resources,
    systems: due.systems,
    crew: due.crew,
    voyageDirector: due.voyageDirector,
    log: appendLogs(expedition.log, due.logEntries)
  });
}

function advanceExpedition(expedition, requestedDeltaS) {
  if (!expedition || expedition.state !== 'traveling' || expedition.pendingEvent) return expedition;
  const prepared = incorporateDueConsequences(expedition);
  const totalS = prepared.calculation.properElapsedS;
  const remainingS = Math.max(0, totalS - prepared.strategicElapsedS);
  let deltaS = Math.max(0, Math.min(Number(requestedDeltaS) || 0, remainingS));
  const slot = nextVoyageSlot(prepared);
  if (slot && prepared.strategicElapsedS < totalS * slot.progress) deltaS = Math.min(deltaS, totalS * slot.progress - prepared.strategicElapsedS);
  const elapsed = prepared.strategicElapsedS + deltaS;
  let next = withExpeditionChanges(prepared, {
    strategicElapsedS: elapsed,
    progress: totalS > 0 ? Math.min(1, elapsed / totalS) : 0,
    resources: consumeResources(prepared, deltaS, totalS),
    systems: degradeSystems(prepared.systems, deltaS, totalS),
    crew: advanceCrew(prepared.crew, deltaS, prepared.systems),
    outposts: advanceOutposts(prepared, elapsed)
  });
  next = withExpeditionChanges(next, {
    failureChain: appendSystemTransitions(prepared.failureChain, prepared.systems, next.systems, elapsed)
  });
  const longDuration = advanceLongDurationState(next, deltaS);
  next = withExpeditionChanges(next, {
    longDuration: longDuration.longDuration,
    crew: longDuration.crew,
    resources: longDuration.resources,
    log: appendLogs(next.log, longDuration.logEntries)
  });
  const failure = assessCausalFailure(next);
  if (failure) return withExpeditionChanges(next, {
    state: 'failed',
    voyagePhase: 'mission-loss',
    pendingEvent: null,
    failureReport: failure,
    log: appendLog(next.log, { atMissionS: elapsed, kind: 'mission-loss', message: failure.summary })
  });
  if (slot && elapsed + 1 >= totalS * slot.progress) {
    const event = createDirectedEvent(next, slot);
    if (event) return withExpeditionChanges(next, {
      systems: event.systems,
      voyageDirector: event.voyageDirector,
      voyagePhase: event.voyagePhase,
      pendingEvent: event.pendingEvent,
      eventFlags: event.eventFlags,
      log: appendLog(next.log, event.logEntry)
    });
  }
  if (elapsed + 1 >= totalS) return withExpeditionChanges(next, {
    state: 'arrived', voyagePhase: 'arrival', progress: 1,
    log: appendLog(next.log, { atMissionS: totalS, kind: 'arrival', message: `${next.ship?.name || 'Solis Reach'} arrived at ${next.destinationId}.` })
  });
  return next;
}

function advanceToNextMilestone(expedition) {
  if (!expedition || expedition.state !== 'traveling' || expedition.pendingEvent) return expedition;
  return advanceExpedition(expedition, expedition.calculation.properElapsedS);
}

function resolveExpeditionEvent(expedition, choice) {
  const result = resolveDirectedEvent(expedition, choice);
  if (!result) return expedition;
  let next = withExpeditionChanges(expedition, {
    pendingEvent: null,
    systems: result.systems,
    resources: result.resources,
    crew: result.crew,
    routeContacts: result.routeContacts,
    voyageDirector: result.voyageDirector,
    failureChain: appendSystemTransitions(expedition.failureChain, expedition.systems, result.systems, expedition.strategicElapsedS),
    log: appendLog(expedition.log, result.logEntry)
  });
  const failure = assessCausalFailure(next);
  if (failure) next = withExpeditionChanges(next, {
    state: 'failed', voyagePhase: 'mission-loss', failureReport: failure,
    log: appendLog(next.log, { atMissionS: next.strategicElapsedS, kind: 'mission-loss', message: failure.summary })
  });
  if (!failure && expedition.pendingEvent?.slotId === 'final-approach') {
    next = advanceExpedition(next, next.calculation.properElapsedS);
  }
  return next;
}

const VOYAGE_MILESTONES = VOYAGE_SLOTS;

export { advanceExpedition, advanceToNextMilestone, resolveExpeditionEvent, resourceDemandMultipliers, startExpedition, VOYAGE_MILESTONES, VOYAGE_SLOTS };
