import { RESOURCE_KEYS, withExpeditionChanges } from './model.js?v=2';
import { JULIAN_YEAR_S } from './travel-calculator.js?v=1';

const MAINTENANCE_EVENT_PROGRESS = 0.12;
const DISCOVERY_EVENT_PROGRESS = 0.56;

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function appendLog(log, entry) {
  return Object.freeze([...(log || []), Object.freeze(entry)]);
}

function startExpedition(expedition, atMs = Date.now()) {
  if (!expedition || expedition.state !== 'planned') return expedition;
  if (expedition.readiness.status === 'insufficient') throw new Error('The Expedition is not ready to depart.');
  return withExpeditionChanges(expedition, {
    state: 'traveling',
    departedAtMs: atMs,
    updatedAtMs: atMs,
    log: appendLog(expedition.log, { atMissionS: 0, kind: 'departure', message: 'Surveyor departed the Solar System.' })
  });
}

function consumeResources(resources, expectedResources, deltaS, totalS) {
  const next = clone(resources);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  for (const key of RESOURCE_KEYS) {
    if (key === 'scienceCargoKg') continue;
    next[key] = Math.max(0, Number(next[key] || 0) - Number(expectedResources?.[key] || 0) * fraction);
  }
  return Object.freeze(next);
}

function degradeSystems(systems, deltaS, totalS) {
  const next = clone(systems);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  for (const [id, system] of Object.entries(next)) {
    const wearRate = id === 'hull' ? 0.08 : id === 'life-support' ? 0.12 : 0.1;
    system.condition = Math.max(0, Number(system.condition || 0) - wearRate * fraction);
    system.status = system.condition < 0.25 ? 'critical' : system.condition < 0.55 ? 'degraded' : system.condition < 0.85 ? 'operational' : 'optimal';
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

function applyCrewEventOutcome(crew, eventKind, choice) {
  return Object.freeze((crew || []).map((member) => {
    const roles = new Set(member.roles || []);
    const repaired = eventKind === 'maintenance' && roles.has('engineering');
    const observed = eventKind === 'discovery' && choice === 'observe' && roles.has('science');
    if (!repaired && !observed) return member;
    return Object.freeze({
      ...member,
      experienceYears: Number(member.experienceYears || 0) + (repaired ? 0.03 : 0.02),
      fatigue: Math.min(1, Number(member.fatigue || 0) + (repaired ? 0.035 : 0.015))
    });
  }));
}

function maintenanceEvent(expedition) {
  const systems = clone(expedition.systems);
  systems.thermal = { condition: Math.min(Number(systems.thermal?.condition || 1), 0.58), status: 'degraded' };
  return withExpeditionChanges(expedition, {
    systems: Object.freeze(systems),
    pendingEvent: Object.freeze({
      id: `${expedition.id}-thermal-pump`,
      kind: 'maintenance',
      title: 'Coolant pump wear',
      message: 'The thermal loop is losing efficiency. Engineering can replace the pump now.',
      choices: Object.freeze(['replace', 'reduce-load'])
    }),
    eventFlags: Object.freeze({ ...expedition.eventFlags, maintenance: true }),
    log: appendLog(expedition.log, {
      atMissionS: expedition.strategicElapsedS,
      kind: 'system-warning',
      message: 'Thermal control degraded after coolant pump wear was detected.'
    })
  });
}

function discoveryEvent(expedition) {
  const discovery = Object.freeze({
    id: `${expedition.id}-object-01`,
    designation: 'WE3D-IS-01',
    classification: 'modeled interstellar object candidate',
    truthClass: 'procedural-game-object',
    stableSeed: 5100821
  });
  return withExpeditionChanges(expedition, {
    pendingEvent: Object.freeze({
      id: `${expedition.id}-discovery`,
      kind: 'discovery',
      title: 'Uncataloged object detected',
      message: 'Long-range sensors found a stable object candidate outside the current catalog.',
      choices: Object.freeze(['observe', 'continue'])
    }),
    discoveries: Object.freeze([...(expedition.discoveries || []), discovery]),
    eventFlags: Object.freeze({ ...expedition.eventFlags, discovery: true }),
    log: appendLog(expedition.log, {
      atMissionS: expedition.strategicElapsedS,
      kind: 'discovery',
      message: 'Sensors detected WE3D-IS-01, a game-generated interstellar object candidate.'
    })
  });
}

function advanceExpedition(expedition, requestedDeltaS) {
  if (!expedition || expedition.state !== 'traveling' || expedition.pendingEvent) return expedition;
  const totalS = expedition.calculation.properElapsedS;
  const remainingS = Math.max(0, totalS - expedition.strategicElapsedS);
  let deltaS = Math.max(0, Math.min(Number(requestedDeltaS) || 0, remainingS));
  const maintenanceAt = totalS * MAINTENANCE_EVENT_PROGRESS;
  const discoveryAt = totalS * DISCOVERY_EVENT_PROGRESS;
  if (!expedition.eventFlags.maintenance && expedition.strategicElapsedS < maintenanceAt) {
    deltaS = Math.min(deltaS, maintenanceAt - expedition.strategicElapsedS);
  } else if (!expedition.eventFlags.discovery && expedition.strategicElapsedS < discoveryAt) {
    deltaS = Math.min(deltaS, discoveryAt - expedition.strategicElapsedS);
  }
  const elapsed = expedition.strategicElapsedS + deltaS;
  let next = withExpeditionChanges(expedition, {
    strategicElapsedS: elapsed,
    progress: totalS > 0 ? Math.min(1, elapsed / totalS) : 0,
    resources: consumeResources(expedition.resources, expedition.calculation.expectedResources, deltaS, totalS),
    systems: degradeSystems(expedition.systems, deltaS, totalS),
    crew: advanceCrew(expedition.crew, deltaS, expedition.systems)
  });
  if (!next.eventFlags.maintenance && elapsed + 1 >= maintenanceAt) return maintenanceEvent(next);
  if (!next.eventFlags.discovery && elapsed + 1 >= discoveryAt) return discoveryEvent(next);
  if (elapsed + 1 >= totalS) {
    return withExpeditionChanges(next, {
      state: 'arrived',
      progress: 1,
      log: appendLog(next.log, { atMissionS: totalS, kind: 'arrival', message: `Surveyor arrived at ${next.destinationId}.` })
    });
  }
  return next;
}

function advanceToNextMilestone(expedition) {
  if (!expedition || expedition.state !== 'traveling' || expedition.pendingEvent) return expedition;
  return advanceExpedition(expedition, expedition.calculation.properElapsedS);
}

function resolveExpeditionEvent(expedition, choice) {
  const event = expedition?.pendingEvent;
  if (!event) return expedition;
  if (event.kind === 'maintenance') {
    const systems = clone(expedition.systems);
    const resources = clone(expedition.resources);
    if (choice === 'replace') {
      const repairCost = 180;
      if (resources.maintenanceKg < repairCost) throw new Error('The ship does not have enough maintenance material.');
      resources.maintenanceKg -= repairCost;
      systems.thermal = { condition: 0.94, status: 'optimal' };
    } else if (choice === 'reduce-load') {
      systems.thermal = { condition: 0.68, status: 'operational' };
      resources.powerMWh *= 0.98;
    } else {
      throw new Error('Choose a valid maintenance response.');
    }
    return withExpeditionChanges(expedition, {
      pendingEvent: null,
      systems: Object.freeze(systems),
      resources: Object.freeze(resources),
      crew: applyCrewEventOutcome(expedition.crew, event.kind, choice),
      log: appendLog(expedition.log, {
        atMissionS: expedition.strategicElapsedS,
        kind: 'repair',
        message: choice === 'replace' ? 'Engineering replaced the coolant pump.' : 'The crew reduced thermal load and stabilized the loop.'
      })
    });
  }
  if (event.kind === 'discovery') {
    return withExpeditionChanges(expedition, {
      pendingEvent: null,
      crew: applyCrewEventOutcome(expedition.crew, event.kind, choice),
      log: appendLog(expedition.log, {
        atMissionS: expedition.strategicElapsedS,
        kind: choice === 'observe' ? 'science' : 'course',
        message: choice === 'observe' ? 'The science team completed a bounded observation of WE3D-IS-01.' : 'The ship retained the detection and continued on course.'
      })
    });
  }
  return withExpeditionChanges(expedition, { pendingEvent: null });
}

export {
  advanceExpedition,
  advanceToNextMilestone,
  resolveExpeditionEvent,
  startExpedition
};
