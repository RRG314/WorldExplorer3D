import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CREW } from '../app/js/expedition/catalog.js';
import { createExpeditionPlan, withExpeditionChanges } from '../app/js/expedition/model.js';
import { createExpeditionStore } from '../app/js/expedition/store.js';
import {
  completePirateAftermath,
  createPirateInterception,
  HOSTILE_ENCOUNTER_TYPE,
  INTERCEPTION_PHASE,
  PIRATE_INTERCEPTION_ID,
  pirateInterceptionEligible,
  resolvePirateInterception,
  transitionPirateInterception
} from '../app/js/expedition/hostile-interception.js';
import { getModelAsset } from '../app/js/assets/model-asset-catalog.js';
import { executeExpeditionCommand } from '../app/js/expedition/command-authority.js';

function cruisingPlan(survival = 'forgiving') {
  const plan = createExpeditionPlan({
    destinationId: 'proxima-centauri',
    crew: DEFAULT_CREW,
    survival,
    createdAtMs: 1700000000000,
    id: `pirate-test-${survival}`
  });
  return withExpeditionChanges(plan, {
    state: 'traveling',
    progress: 0.57,
    strategicElapsedS: plan.calculation.properElapsedS * 0.57,
    voyagePhase: 'long-watch',
    voyageDirector: Object.freeze({ ...plan.voyageDirector, nextSlotIndex: 7, step: 7 })
  });
}

function beginCombat(expedition) {
  let next = transitionPirateInterception(expedition, 'confirm_hostility');
  next = transitionPirateInterception(next, 'prepare_defense');
  return transitionPirateInterception(next, 'begin_combat');
}

test('the middle-voyage slot creates one reusable hostile interception checkpoint', () => {
  const expedition = cruisingPlan();
  assert.equal(pirateInterceptionEligible(expedition, { id: 'long-watch' }), true);
  const triggered = createPirateInterception(expedition, { id: 'long-watch' });
  assert.equal(triggered.activeEncounter.type, HOSTILE_ENCOUNTER_TYPE);
  assert.equal(triggered.activeEncounter.phase, INTERCEPTION_PHASE.CONTACT_DETECTED);
  assert.equal(triggered.activeEncounter.checkpointPolicy, 'restart-combat-from-precombat-state');
  assert.equal(triggered.eventFlags[PIRATE_INTERCEPTION_ID], true);
  assert.equal(triggered.voyageDirector.nextSlotIndex, 8);
  assert.equal(pirateInterceptionEligible(triggered, { id: 'long-watch' }), false);
});

test('combat success damages the real ship and resources, logs the encounter, then resumes the voyage', () => {
  const triggered = createPirateInterception(cruisingPlan(), { id: 'long-watch' });
  const combat = beginCombat(triggered);
  assert.equal(combat.activeEncounter.phase, INTERCEPTION_PHASE.COMBAT_ACTIVE);
  const resolved = resolvePirateInterception(combat, {
    outcome: 'repelled', enemiesDestroyed: 3, enemiesRepelled: 4,
    boardingPrevented: true, boardingProgress: 0.43,
    pathfinderCondition: 0.71, solisReachHitCount: 3, elapsedS: 84
  });
  assert.equal(resolved.activeEncounter.phase, INTERCEPTION_PHASE.AFTERMATH);
  assert.ok(resolved.systems.hull.condition < combat.systems.hull.condition);
  assert.ok(resolved.resources.maintenanceKg < combat.resources.maintenanceKg);
  assert.match(resolved.log.at(-1).message, /forced the surviving pirate craft to retreat/i);
  const complete = completePirateAftermath(resolved);
  assert.equal(complete.activeEncounter.phase, INTERCEPTION_PHASE.COMPLETE);
  assert.equal(complete.state, 'traveling');
  assert.equal(complete.encounterHistory.length, 1);
  assert.match(complete.log.at(-1).message, /resumed its original course/i);
});

test('a successful boarding resolves through real crew, ship, resources, and forgiving failure rules', () => {
  const combat = beginCombat(createPirateInterception(cruisingPlan('severe'), { id: 'long-watch' }));
  const resolved = resolvePirateInterception(combat, {
    outcome: 'boarded', enemiesDestroyed: 1, enemiesRepelled: 2,
    boardingPrevented: false, boardingProgress: 1,
    pathfinderCondition: 0.24, solisReachHitCount: 12, elapsedS: 112
  });
  assert.equal(resolved.activeEncounter.result.boarded, true);
  assert.ok(resolved.crew.some((member) => member.status === 'injured'));
  assert.ok(resolved.resources.medicalUnits < combat.resources.medicalUnits);
  assert.ok(resolved.systems.propulsion.condition < combat.systems.propulsion.condition);
  assert.ok(['traveling', 'failed'].includes(resolved.state));
  assert.equal(completePirateAftermath(resolved).activeEncounter.phase, INTERCEPTION_PHASE.COMPLETE);
});

test('the combat checkpoint and completed outcome survive reload without retriggering', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
  const store = createExpeditionStore(storage);
  const checkpoint = beginCombat(createPirateInterception(cruisingPlan(), { id: 'long-watch' }));
  store.save(checkpoint);
  const reloadedCheckpoint = store.load();
  assert.equal(reloadedCheckpoint.activeEncounter.phase, INTERCEPTION_PHASE.COMBAT_ACTIVE);
  const resolved = resolvePirateInterception(reloadedCheckpoint, {
    outcome: 'repelled', enemiesDestroyed: 4, enemiesRepelled: 4,
    boardingPrevented: true, pathfinderCondition: 0.82, elapsedS: 70
  });
  store.save(completePirateAftermath(resolved));
  const reloadedComplete = store.load();
  assert.equal(reloadedComplete.activeEncounter.phase, INTERCEPTION_PHASE.COMPLETE);
  assert.equal(pirateInterceptionEligible(reloadedComplete, { id: 'long-watch' }), false);
});

test('shared-room commands use the same phase, outcome, and continuation authority', () => {
  let expedition = createPirateInterception(cruisingPlan(), { id: 'long-watch' });
  for (const encounterEvent of ['confirm_hostility', 'prepare_defense', 'begin_combat']) {
    expedition = executeExpeditionCommand(expedition, { type: 'encounter-transition', encounterEvent }).expedition;
  }
  assert.equal(expedition.activeEncounter.phase, INTERCEPTION_PHASE.COMBAT_ACTIVE);
  expedition = executeExpeditionCommand(expedition, {
    type: 'encounter-resolve',
    encounterResult: {
      outcome: 'repelled', enemiesDestroyed: 3, enemiesRepelled: 4,
      boardingPrevented: true, boardingProgress: 0.25,
      pathfinderCondition: 0.8, solisReachHitCount: 2, elapsedS: 72
    }
  }).expedition;
  assert.equal(expedition.activeEncounter.phase, INTERCEPTION_PHASE.AFTERMATH);
  expedition = executeExpeditionCommand(expedition, { type: 'encounter-complete' }).expedition;
  assert.equal(expedition.activeEncounter.phase, INTERCEPTION_PHASE.COMPLETE);
  assert.equal(expedition.encounterHistory.length, 1);
});

test('the hostile family is a bounded locally bundled CC0 model', () => {
  const asset = getModelAsset('space-pirate-insurgent-raider-v1');
  assert.equal(asset.license, 'CC0-1.0');
  assert.equal(asset.roles.includes('hostile-interception-spacecraft'), true);
  assert.equal(asset.budgets.maxInstances, 6);
  assert.ok(asset.budgets.triangles <= 10_000);
  assert.ok(asset.budgets.textureEdgePixels <= 512);
  assert.match(asset.url, /^\/app\/assets\/models\/space\/.+\.glb$/);
});
