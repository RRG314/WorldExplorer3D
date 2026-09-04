import { JULIAN_YEAR_S } from './travel-calculator.js?v=2';

const CRYOGENIC_RESERVE = Object.freeze([
  Object.freeze({ id: 'reserve-engineer', name: 'Samira Holt', ageYears: 37, experienceYears: 12, health: 0.97, fatigue: 0, assignment: 'cryogenic-reserve', roles: Object.freeze(['engineering', 'fabrication']), status: 'cryogenic' }),
  Object.freeze({ id: 'reserve-medical', name: 'Leon Ibarra', ageYears: 40, experienceYears: 15, health: 0.98, fatigue: 0, assignment: 'cryogenic-reserve', roles: Object.freeze(['medical', 'life-support']), status: 'cryogenic' }),
  Object.freeze({ id: 'reserve-navigation', name: 'Rin Okoye', ageYears: 35, experienceYears: 10, health: 0.99, fatigue: 0, assignment: 'cryogenic-reserve', roles: Object.freeze(['navigation', 'command']), status: 'cryogenic' })
]);

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function createLongDurationState(shipProfileId) {
  if (shipProfileId === 'cryogenic-expedition-vessel') return Object.freeze({
    kind: 'cryogenic',
    truthClass: 'speculative-human-torpor',
    reserveCrew: CRYOGENIC_RESERVE,
    wakeCost: Object.freeze({ medicalUnits: 3, powerMWh: 2, recoveryDays: 3 }),
    wakeHistory: Object.freeze([]),
    suspendedMetabolicFraction: 0.18
  });
  if (shipProfileId === 'generation-ship') return Object.freeze({
    kind: 'generation',
    truthClass: 'bounded-generation-voyage-model',
    population: 40_000,
    capacity: 40_000,
    foundingPopulation: 40_000,
    generationIndex: 0,
    cohortYears: 25,
    originalCrewStatus: 'active',
    roleContinuity: 1,
    knowledgePreservation: 1,
    trainingReserve: 1,
    transitions: Object.freeze([]),
    uncertainty: 'Population viability estimates vary widely; this game model uses a large safety population and does not store individual genetic data.'
  });
  return Object.freeze({ kind: 'standard', truthClass: 'crew-voyage-model' });
}

function crewPopulationForShip(shipProfileId, activeCrewCount) {
  if (shipProfileId === 'generation-ship') return 40_000;
  if (shipProfileId === 'cryogenic-expedition-vessel') return Math.max(1, Number(activeCrewCount) || 0) + CRYOGENIC_RESERVE.length;
  return Math.max(1, Number(activeCrewCount) || 0);
}

function successorCrew(generationIndex, previousCrew = []) {
  return Object.freeze((previousCrew || []).map((member, index) => Object.freeze({
    ...member,
    id: `successor-g${generationIndex}-${index + 1}`,
    name: `Generation ${generationIndex} ${String(member.roles?.[0] || 'crew').replaceAll('-', ' ')}`,
    ageYears: 28 + (index % 12),
    experienceYears: 8 + (index % 9),
    health: 0.96,
    fatigue: Math.min(0.18, Number(member.fatigue || 0.08)),
    assignment: member.assignment || `${member.roles?.[0] || 'general'}-watch`,
    status: 'active',
    predecessorId: member.id
  })));
}

function advanceLongDurationState(expedition, deltaS) {
  const state = expedition?.longDuration;
  if (!state || state.kind === 'standard') return Object.freeze({
    longDuration: state || createLongDurationState(expedition?.ship?.profileId),
    crew: expedition?.crew || [],
    resources: expedition?.resources || {},
    logEntries: Object.freeze([])
  });
  const years = Math.max(0, Number(deltaS) || 0) / JULIAN_YEAR_S;
  const resources = clone(expedition.resources || {});
  const logEntries = [];
  if (state.kind === 'cryogenic') {
    const next = clone(state);
    next.reserveCrew = next.reserveCrew.map((member) => member.status === 'cryogenic'
      ? { ...member, ageYears: Number(member.ageYears || 0) + years * 0.04 }
      : member);
    return Object.freeze({ longDuration: Object.freeze(next), crew: expedition.crew, resources: Object.freeze(resources), logEntries: Object.freeze(logEntries) });
  }

  const next = clone(state);
  const totalYears = Math.max(0, Number(expedition.strategicElapsedS || 0));
  const generationIndex = Math.floor((totalYears / JULIAN_YEAR_S) / next.cohortYears);
  const educationCondition = Math.max(0, Math.min(1, Number(expedition.systems?.education?.condition ?? 1)));
  const lifeSupportCondition = Math.max(0, Math.min(1, Number(expedition.systems?.['life-support']?.condition ?? 1)));
  next.knowledgePreservation = Math.max(0, Math.min(1, Number(next.knowledgePreservation || 0) - years * (1 - educationCondition) * 0.006));
  next.roleContinuity = Math.max(0, Math.min(1, next.knowledgePreservation * educationCondition));
  next.population = Math.max(0, Math.min(next.capacity, Math.round(Number(next.population || 0) * (1 - years * Math.max(0, 0.96 - lifeSupportCondition) * 0.0008))));
  let crew = expedition.crew;
  if (generationIndex > Number(next.generationIndex || 0)) {
    for (let index = Number(next.generationIndex || 0) + 1; index <= generationIndex; index += 1) {
      next.transitions.push({ generationIndex: index, atMissionS: Number(expedition.strategicElapsedS) || 0, population: next.population, knowledgePreservation: next.knowledgePreservation });
    }
    next.generationIndex = generationIndex;
    if (generationIndex >= 2 && next.originalCrewStatus === 'active') {
      next.originalCrewStatus = 'retired';
      crew = successorCrew(generationIndex, expedition.crew);
      logEntries.push(Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: 'crew-succession', message: `Generation ${generationIndex} assumed the active ship watches with ${Math.round(next.roleContinuity * 100)}% role continuity.` }));
    } else if (generationIndex >= 2) {
      crew = successorCrew(generationIndex, expedition.crew);
      logEntries.push(Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: 'crew-succession', message: `Generation ${generationIndex} completed the scheduled watch transition.` }));
    }
  }
  return Object.freeze({ longDuration: Object.freeze(next), crew, resources: Object.freeze(resources), logEntries: Object.freeze(logEntries) });
}

function wakeReserveSpecialist(expedition, reserveId = null) {
  const state = expedition?.longDuration;
  if (state?.kind !== 'cryogenic') return Object.freeze({ expedition, changed: false, message: 'This ship has no cryogenic reserve crew.' });
  const resources = clone(expedition.resources || {});
  const cryogenicCondition = Number(expedition.systems?.cryogenic?.condition ?? 0);
  if (cryogenicCondition < 0.25) return Object.freeze({ expedition, changed: false, message: 'Cryogenic support is not stable enough for a controlled wake cycle.' });
  if (Number(resources.medicalUnits || 0) < state.wakeCost.medicalUnits || Number(resources.powerMWh || 0) < state.wakeCost.powerMWh) {
    return Object.freeze({ expedition, changed: false, message: `Wake cycle requires ${state.wakeCost.medicalUnits} medical units and ${state.wakeCost.powerMWh} MWh.` });
  }
  const missingRoles = new Set();
  const activeRoles = new Set((expedition.crew || []).filter((member) => member.status !== 'dead').flatMap((member) => member.roles || []));
  ['engineering', 'medical', 'life-support', 'navigation', 'command'].forEach((role) => { if (!activeRoles.has(role)) missingRoles.add(role); });
  const reserve = state.reserveCrew.find((member) => member.status === 'cryogenic' && (reserveId ? member.id === reserveId : (member.roles || []).some((role) => missingRoles.has(role))))
    || state.reserveCrew.find((member) => member.status === 'cryogenic' && (!reserveId || member.id === reserveId));
  if (!reserve) return Object.freeze({ expedition, changed: false, message: 'No matching reserve specialist remains in cryogenic suspension.' });
  resources.medicalUnits -= state.wakeCost.medicalUnits;
  resources.powerMWh -= state.wakeCost.powerMWh;
  const awakened = Object.freeze({ ...reserve, status: 'active', assignment: `${reserve.roles[0]}-recovery`, fatigue: 0.3, health: Math.max(0.75, Number(reserve.health || 1) - 0.04) });
  const nextState = Object.freeze({
    ...state,
    reserveCrew: Object.freeze(state.reserveCrew.map((member) => Object.freeze(member.id === reserve.id ? { ...member, status: 'awakened' } : { ...member }))),
    wakeHistory: Object.freeze([...(state.wakeHistory || []), Object.freeze({ crewId: reserve.id, atMissionS: Number(expedition.strategicElapsedS) || 0, medicalUnits: state.wakeCost.medicalUnits, powerMWh: state.wakeCost.powerMWh })])
  });
  const message = `${reserve.name} completed a controlled wake cycle and joined the ${reserve.roles[0].replaceAll('-', ' ')} watch.`;
  return Object.freeze({
    expedition: Object.freeze({
      ...expedition,
      crew: Object.freeze([...(expedition.crew || []), awakened]),
      resources: Object.freeze(resources),
      longDuration: nextState,
      log: Object.freeze([...(expedition.log || []), Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: 'cryogenic-wake', message })])
    }),
    changed: true,
    message
  });
}

function reinforceGenerationTraining(expedition) {
  const state = expedition?.longDuration;
  if (state?.kind !== 'generation') return Object.freeze({ expedition, changed: false, message: 'This is not a generation voyage.' });
  if (Number(expedition.resources?.powerMWh || 0) < 0.4) return Object.freeze({ expedition, changed: false, message: 'Training archive session requires 0.4 MWh.' });
  const resources = Object.freeze({ ...expedition.resources, powerMWh: Number(expedition.resources.powerMWh) - 0.4 });
  const longDuration = Object.freeze({ ...state, knowledgePreservation: Math.min(1, Number(state.knowledgePreservation || 0) + 0.025), trainingReserve: Math.min(1, Number(state.trainingReserve || 0) + 0.015) });
  const message = 'The next watch completed a cross-role training and archive validation session.';
  return Object.freeze({ expedition: Object.freeze({ ...expedition, resources, longDuration, log: Object.freeze([...(expedition.log || []), Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: 'crew-training', message })]) }), changed: true, message });
}

export { advanceLongDurationState, createLongDurationState, crewPopulationForShip, CRYOGENIC_RESERVE, reinforceGenerationTraining, wakeReserveSpecialist };
