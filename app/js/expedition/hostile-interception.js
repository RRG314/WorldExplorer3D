import { appendSystemTransitions, assessCausalFailure } from './failure-authority.js?v=3';
import { withExpeditionChanges } from './model.js?v=12';

const HOSTILE_ENCOUNTER_TYPE = 'HOSTILE_INTERCEPTION';
const PIRATE_INTERCEPTION_ID = 'pirate-boarding-interception';
const PIRATE_TRIGGER_SLOT_ID = 'long-watch';

const INTERCEPTION_PHASE = Object.freeze({
  INACTIVE: 'INACTIVE',
  CONTACT_DETECTED: 'CONTACT_DETECTED',
  HOSTILITY_CONFIRMED: 'HOSTILITY_CONFIRMED',
  DEFENSE_PREPARATION: 'DEFENSE_PREPARATION',
  COMBAT_ACTIVE: 'COMBAT_ACTIVE',
  BOARDING_THREAT: 'BOARDING_THREAT',
  COMBAT_RESOLVING: 'COMBAT_RESOLVING',
  AFTERMATH: 'AFTERMATH',
  COMPLETE: 'COMPLETE'
});

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash >>> 0;
}

function conditionStatus(condition) {
  const value = clamp01(condition);
  return value < 0.25 ? 'critical' : value < 0.55 ? 'degraded' : value < 0.85 ? 'operational' : 'optimal';
}

function encounterDifficulty(expedition) {
  const severe = expedition?.survival === 'severe';
  const seed = hashText(`${expedition?.id}:${PIRATE_INTERCEPTION_ID}`);
  return Object.freeze({
    enemyCount: severe ? 6 : 4 + (seed % 2),
    boardingDurationS: severe ? 22 : 34,
    enemyAccuracy: severe ? 0.72 : 0.48,
    enemyDamage: severe ? 1.35 : 0.78,
    aimAssist: severe ? 0.42 : 0.72
  });
}

function pirateInterceptionEligible(expedition, slot = null) {
  if (!expedition || expedition.state !== 'traveling') return false;
  if (slot && slot.id !== PIRATE_TRIGGER_SLOT_ID) return false;
  if (expedition.pendingEvent || expedition.activeLocalContactId || expedition.failureReport) return false;
  if (expedition.eventFlags?.[PIRATE_INTERCEPTION_ID]) return false;
  if (expedition.activeEncounter && expedition.activeEncounter.phase !== INTERCEPTION_PHASE.COMPLETE) return false;
  if (Number(expedition.progress || 0) < 0.45 || Number(expedition.progress || 0) > 0.78) return false;
  const survivable = ['hull', 'power', 'propulsion'].every((id) => Number(expedition.systems?.[id]?.condition ?? 1) >= 0.32);
  return survivable && !['departure', 'arrival', 'approach', 'surface', 'docking', 'mission-loss'].includes(expedition.voyagePhase);
}

function createPirateInterception(expedition, slot) {
  if (!pirateInterceptionEligible(expedition, slot)) return null;
  const director = expedition.voyageDirector || {};
  const seed = hashText(`${director.seed || expedition.id}:${PIRATE_INTERCEPTION_ID}:${director.step || 0}`);
  const encounter = Object.freeze({
    id: `${expedition.id}:${PIRATE_INTERCEPTION_ID}`,
    type: HOSTILE_ENCOUNTER_TYPE,
    scenarioId: PIRATE_INTERCEPTION_ID,
    phase: INTERCEPTION_PHASE.CONTACT_DETECTED,
    slotId: slot.id,
    seed,
    attempt: 0,
    checkpointPolicy: 'restart-combat-from-precombat-state',
    startedAtMissionS: Number(expedition.strategicElapsedS || 0),
    difficulty: encounterDifficulty(expedition),
    objective: 'Repel the attackers and stop the boarding craft from reaching Solis Reach.',
    phaseHistory: Object.freeze([INTERCEPTION_PHASE.CONTACT_DETECTED]),
    result: null
  });
  return withExpeditionChanges(expedition, {
    activeEncounter: encounter,
    eventFlags: Object.freeze({ ...(expedition.eventFlags || {}), [PIRATE_INTERCEPTION_ID]: true }),
    voyagePhase: 'hostile-interception',
    voyageDirector: Object.freeze({
      ...director,
      nextSlotIndex: Number(director.nextSlotIndex || 0) + 1
    }),
    log: Object.freeze([...(expedition.log || []), Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS || 0),
      kind: 'contact',
      message: 'Long-range sensors detected unidentified craft altering course toward Solis Reach.'
    })])
  });
}

function transitionPirateInterception(expedition, event) {
  const encounter = expedition?.activeEncounter;
  if (!encounter || encounter.type !== HOSTILE_ENCOUNTER_TYPE || encounter.phase === INTERCEPTION_PHASE.COMPLETE) return expedition;
  const transitions = {
    confirm_hostility: [INTERCEPTION_PHASE.CONTACT_DETECTED, INTERCEPTION_PHASE.HOSTILITY_CONFIRMED],
    prepare_defense: [INTERCEPTION_PHASE.HOSTILITY_CONFIRMED, INTERCEPTION_PHASE.DEFENSE_PREPARATION],
    begin_combat: [INTERCEPTION_PHASE.DEFENSE_PREPARATION, INTERCEPTION_PHASE.COMBAT_ACTIVE],
    boarding_threat: [INTERCEPTION_PHASE.COMBAT_ACTIVE, INTERCEPTION_PHASE.BOARDING_THREAT]
  };
  const [from, to] = transitions[event] || [];
  if (encounter.phase !== from || !to) return expedition;
  return withExpeditionChanges(expedition, {
    activeEncounter: Object.freeze({
      ...encounter,
      phase: to,
      attempt: to === INTERCEPTION_PHASE.COMBAT_ACTIVE ? Number(encounter.attempt || 0) + 1 : encounter.attempt,
      phaseHistory: Object.freeze([...(encounter.phaseHistory || []), to])
    })
  });
}

function normalizedCombatResult(result = {}) {
  const outcome = ['repelled', 'boarded', 'defensive-craft-disabled'].includes(result.outcome)
    ? result.outcome
    : 'defensive-craft-disabled';
  return Object.freeze({
    outcome,
    enemiesRepelled: Math.max(0, Math.min(6, Math.round(Number(result.enemiesRepelled) || 0))),
    enemiesDestroyed: Math.max(0, Math.min(6, Math.round(Number(result.enemiesDestroyed) || 0))),
    boardingPrevented: result.boardingPrevented === true,
    boardingProgress: clamp01(result.boardingProgress),
    pathfinderCondition: clamp01(result.pathfinderCondition),
    solisReachHitCount: Math.max(0, Math.min(30, Math.round(Number(result.solisReachHitCount) || 0))),
    elapsedS: Math.max(1, Math.min(600, Number(result.elapsedS) || 1))
  });
}

function resolvePirateInterception(expedition, input = {}) {
  const encounter = expedition?.activeEncounter;
  if (!encounter || ![INTERCEPTION_PHASE.COMBAT_ACTIVE, INTERCEPTION_PHASE.BOARDING_THREAT].includes(encounter.phase)) return expedition;
  const result = normalizedCombatResult(input);
  const boarded = result.outcome === 'boarded' || result.boardingPrevented === false;
  const disabled = result.outcome === 'defensive-craft-disabled';
  const severe = expedition.survival === 'severe';
  const hitPressure = Math.min(1, result.solisReachHitCount / (severe ? 9 : 13));
  const consequence = boarded ? 1 : disabled ? 0.72 : 0.32 + hitPressure * 0.32;
  const systems = clone(expedition.systems || {});
  const damage = {
    hull: 0.035 + consequence * 0.12,
    power: 0.018 + consequence * 0.07,
    sensors: 0.025 + consequence * 0.08,
    propulsion: boarded ? 0.095 : consequence * 0.035
  };
  for (const [id, amount] of Object.entries(damage)) {
    if (!systems[id]) continue;
    systems[id].condition = clamp01(Number(systems[id].condition ?? 1) - amount * (severe ? 1.18 : 1));
    systems[id].status = conditionStatus(systems[id].condition);
  }
  const resources = clone(expedition.resources || {});
  resources.powerMWh = Math.max(0, Number(resources.powerMWh || 0) - (boarded ? 1.1 : 0.45 + hitPressure * 0.35));
  resources.maintenanceKg = Math.max(0, Number(resources.maintenanceKg || 0) - (boarded ? 34 : disabled ? 22 : 8 + hitPressure * 12));
  resources.medicalUnits = Math.max(0, Number(resources.medicalUnits || 0) - (boarded ? 3 : disabled ? 1 : 0));
  const crew = clone(expedition.crew || []).map((member, index) => {
    const affected = boarded ? index > 0 && index <= 2 : disabled ? index === 6 : false;
    return Object.freeze({
      ...member,
      health: clamp01(Number(member.health ?? 1) - (affected ? (severe ? 0.12 : 0.07) : 0)),
      fatigue: clamp01(Number(member.fatigue || 0) + (boarded ? 0.08 : 0.035)),
      status: affected ? 'injured' : member.status
    });
  });
  const summary = boarded
    ? 'Pirates breached an outer service lock before ship security contained the boarding party.'
    : disabled
      ? 'Pathfinder was disabled; Solis Reach security forced the attackers to disengage after taking damage.'
      : 'Pathfinder broke the attack formation and forced the surviving pirate craft to retreat.';
  let next = withExpeditionChanges(expedition, {
    systems: Object.freeze(systems),
    resources: Object.freeze(resources),
    crew: Object.freeze(crew),
    failureChain: appendSystemTransitions(expedition.failureChain, expedition.systems, systems, expedition.strategicElapsedS),
    voyagePhase: 'combat-aftermath',
    activeEncounter: Object.freeze({
      ...encounter,
      phase: INTERCEPTION_PHASE.AFTERMATH,
      phaseHistory: Object.freeze([...(encounter.phaseHistory || []), INTERCEPTION_PHASE.COMBAT_RESOLVING, INTERCEPTION_PHASE.AFTERMATH]),
      result: Object.freeze({ ...result, summary, boarded, systemsDamaged: Object.freeze(Object.keys(damage)) })
    }),
    log: Object.freeze([...(expedition.log || []), Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS || 0),
      kind: 'hostile-interception',
      message: `${summary} ${result.enemiesDestroyed} hostile craft destroyed; ${result.enemiesRepelled} total repelled.`
    })])
  });
  const failure = assessCausalFailure(next);
  if (failure) next = withExpeditionChanges(next, {
    state: 'failed',
    voyagePhase: 'mission-loss',
    failureReport: failure,
    log: Object.freeze([...(next.log || []), Object.freeze({ atMissionS: next.strategicElapsedS, kind: 'mission-loss', message: failure.summary })])
  });
  return next;
}

function completePirateAftermath(expedition) {
  const encounter = expedition?.activeEncounter;
  if (!encounter || encounter.phase !== INTERCEPTION_PHASE.AFTERMATH) return expedition;
  const director = expedition.voyageDirector || {};
  const historyEntry = Object.freeze({
    eventId: encounter.id,
    familyId: encounter.scenarioId,
    slotId: encounter.slotId,
    choiceId: 'direct-defense',
    outcome: encounter.result?.outcome || 'resolved',
    atMissionS: Number(expedition.strategicElapsedS || 0),
    tagsAdded: Object.freeze(['hostile-interception-resolved'])
  });
  return withExpeditionChanges(expedition, {
    activeEncounter: Object.freeze({
      ...encounter,
      phase: INTERCEPTION_PHASE.COMPLETE,
      completedAtMissionS: Number(expedition.strategicElapsedS || 0),
      phaseHistory: Object.freeze([...(encounter.phaseHistory || []), INTERCEPTION_PHASE.COMPLETE])
    }),
    encounterHistory: Object.freeze([...(expedition.encounterHistory || []), Object.freeze({
      id: encounter.id,
      scenarioId: encounter.scenarioId,
      type: encounter.type,
      result: encounter.result,
      completedAtMissionS: Number(expedition.strategicElapsedS || 0)
    })]),
    voyageDirector: Object.freeze({
      ...director,
      step: Number(director.step || 0) + 1,
      encounteredIds: Object.freeze([...new Set([...(director.encounteredIds || []), encounter.scenarioId])]),
      tags: Object.freeze({ ...(director.tags || {}), hostileInterceptionResolved: true }),
      history: Object.freeze([...(director.history || []), historyEntry])
    }),
    voyagePhase: expedition.state === 'failed' ? 'mission-loss' : 'long-watch-recovery',
    log: Object.freeze([...(expedition.log || []), Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS || 0),
      kind: 'course-restored',
      message: expedition.state === 'failed'
        ? 'The hostile-interception record was sealed in the Captain’s Log.'
        : 'Damage control stabilized Solis Reach and the Expedition resumed its original course.'
    })])
  });
}

export {
  completePirateAftermath,
  createPirateInterception,
  encounterDifficulty,
  HOSTILE_ENCOUNTER_TYPE,
  INTERCEPTION_PHASE,
  PIRATE_INTERCEPTION_ID,
  PIRATE_TRIGGER_SLOT_ID,
  pirateInterceptionEligible,
  resolvePirateInterception,
  transitionPirateInterception
};
