import { deterministicUnit } from '../discovery/model.js?v=1';
import { cellAtPosition, evaluateArEligibility } from './eligibility.js?v=2';

const FIELD_CHALLENGE_VERSION = 'waterfowl-photo-v1';

function compileWaterfowlChallenge(options = {}) {
  const environment = options.environment;
  if (environment?.type !== 'EnvironmentContextPublication') throw new TypeError('AR Field Challenge requires an EnvironmentContextPublication.');
  const position = options.position || { x: 0, z: 0 };
  const eligibility = evaluateArEligibility({ type: 'field-challenge' }, {
    environment,
    position,
    environmentName: options.environmentName || 'EARTH',
    liveGpsSnapshot: options.liveGpsSnapshot,
    travelMode: options.travelMode || 'walk'
  });
  const cell = environment.cells.find((entry) => entry.cellId === eligibility.cellId) || cellAtPosition(environment, position);
  const seed = `${environment.worldIdentity.id}|${cell?.cellId || 'none'}|${FIELD_CHALLENGE_VERSION}`;
  const actors = eligibility.allowed ? Array.from({ length: 4 }, (_, index) => {
    const actorSeed = `${seed}|mallard:${index}`;
    return Object.freeze({
      id: `ar-waterfowl:${cell.cellId}:${index}`,
      speciesId: 'mallard',
      label: 'Virtual mallard',
      phase: deterministicUnit(`${actorSeed}:phase`) * Math.PI * 2,
      lane: index,
      height: 0.05 + deterministicUnit(`${actorSeed}:height`) * 0.45,
      speed: 0.16 + deterministicUnit(`${actorSeed}:speed`) * 0.09,
      direction: deterministicUnit(`${actorSeed}:direction`) > 0.5 ? 1 : -1,
      evidenceClass: 'guided-field-encounter'
    });
  }) : [];
  return Object.freeze({
    type: 'ArFieldChallengePlan',
    schemaVersion: 1,
    version: FIELD_CHALLENGE_VERSION,
    requestId: environment.requestId,
    sequence: environment.sequence,
    worldIdentity: environment.worldIdentity,
    cellId: cell?.cellId || null,
    habitat: eligibility.habitat || null,
    habitatDistanceMeters: eligibility.habitatDistanceMeters,
    contexts: Object.freeze([...(cell?.contexts || [])]),
    eligible: eligibility.allowed,
    reason: eligibility.reason,
    interactionMode: 'touch-photo-survey',
    realAnimalImpact: false,
    virtualTargetsOnly: true,
    occurrenceClaim: false,
    actors: Object.freeze(actors),
    seed
  });
}

function createWaterfowlChallengeSession(plan) {
  if (plan?.type !== 'ArFieldChallengePlan' || !plan.virtualTargetsOnly || plan.realAnimalImpact !== false) {
    throw new TypeError('A conservation-safe AR Field Challenge plan is required.');
  }
  const photographed = new Set();
  const startedAt = Date.now();
  let attempts = 0;
  let completedAt = null;
  function photograph(actorId) {
    attempts++;
    const actor = plan.actors.find((entry) => entry.id === String(actorId));
    if (!actor || photographed.has(actor.id)) return false;
    photographed.add(actor.id);
    if (photographed.size === plan.actors.length) completedAt = Date.now();
    return true;
  }
  function snapshot() {
    return Object.freeze({
      type: 'ArFieldChallengeSession',
      active: completedAt === null,
      photographed: photographed.size,
      total: plan.actors.length,
      attempts,
      completed: completedAt !== null,
      startedAt,
      completedAt,
      virtualTargetsOnly: true,
      realAnimalImpact: false
    });
  }
  return Object.freeze({ photograph, snapshot });
}

export { FIELD_CHALLENGE_VERSION, compileWaterfowlChallenge, createWaterfowlChallengeSession };
