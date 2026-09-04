import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILTIN_DISCOVERY_CATALOGS, COMPANION_CATALOG, validateDiscoveryCatalogs } from '../app/js/discovery/catalog.js';
import { createEnvironmentFixture } from '../app/js/discovery/environment-context.js';
import { compileAmbientWildlifePlan } from '../app/js/discovery/wildlife-runtime.js';

import {
  COMPANION_LEVEL_THRESHOLDS,
  awardCompanionXp,
  careForCompanion,
  companionLevelForXp,
  createCompanionInstance,
  normalizeCompanionInstance,
  resolveCompanionTravelPolicy,
  sanitizeCompanionName
} from '../app/js/discovery/companions.js';

test('the release level table is finite and matches the design contract', () => {
  assert.deepEqual(COMPANION_LEVEL_THRESHOLDS, [0, 40, 100, 180, 280, 400, 550, 730, 940, 1180, 1450, 1750]);
  assert.equal(companionLevelForXp(0), 1);
  assert.equal(companionLevelForXp(39), 1);
  assert.equal(companionLevelForXp(40), 2);
  assert.equal(companionLevelForXp(99), 2);
  assert.equal(companionLevelForXp(100), 3);
  assert.equal(companionLevelForXp(1750), 12);
  assert.equal(companionLevelForXp(999999), 12);
});

test('individual identity is stable per encounter and permits meaningful duplicates', () => {
  const first = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:a', name: ' Copper ' });
  const same = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:a', name: 'Copper' });
  const second = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:b', name: 'Scout' });
  assert.equal(first.instanceId, same.instanceId);
  assert.notEqual(first.instanceId, second.instanceId);
  assert.equal(first.name, 'Copper');
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.speciesArchetype, 'dog');
  assert.equal(first.progression.trustState, 'Comfortable');
  assert.equal(first.tradeable, false);
});

test('XP requires an allowlisted reason and stable receipt and is idempotent', () => {
  const initial = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:a' });
  const field = awardCompanionXp(initial, { receiptId: 'field:claim-1', reasonId: 'field-activity', awardedAt: 10 });
  assert.equal(field.awarded, true);
  assert.equal(field.points, 12);
  assert.equal(field.companion.progression.totalXp, 12);
  assert.equal(field.companion.progression.lastAward.label, 'Field record completed together');

  const duplicate = awardCompanionXp(field.companion, { receiptId: 'field:claim-1', reasonId: 'field-activity', awardedAt: 20 });
  assert.equal(duplicate.awarded, false);
  assert.equal(duplicate.reason, 'already-awarded');
  assert.equal(duplicate.companion.progression.totalXp, 12);

  const invalid = awardCompanionXp(field.companion, { receiptId: 'click:1', reasonId: 'clicked-pet' });
  assert.equal(invalid.awarded, false);
  assert.equal(invalid.reason, 'invalid-award');
  assert.equal(invalid.companion.progression.totalXp, 12);
});

test('bond states change only at designed level milestones', () => {
  let companion = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:a' });
  for (let index = 0; index < 9; index += 1) {
    companion = awardCompanionXp(companion, { receiptId: `field:${index}`, reasonId: 'field-activity', awardedAt: index + 1 }).companion;
  }
  assert.equal(companion.progression.totalXp, 108);
  assert.equal(companion.progression.level, 3);
  assert.equal(companion.progression.trustState, 'Trusting');

  const bonded = normalizeCompanionInstance({ ...companion, progression: { totalXp: 730, awardLedger: companion.progression.awardLedger } });
  assert.equal(bonded.progression.level, 8);
  assert.equal(bonded.progression.trustState, 'Bonded');
});

test('care is optional visible state and does not create hunger decay or click XP', () => {
  const companion = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:a' });
  const cared = careForCompanion(companion, 'pet', 1234);
  assert.deepEqual(cared.care, { lastInteraction: 'pet', lastInteractionAt: 1234, lastXpDay: null });
  assert.equal('fullness' in cared.care, false);
  assert.equal(cared.progression.totalXp, 0);
});

test('legacy records migrate without deleting owned animals', () => {
  const migrated = normalizeCompanionInstance({
    instanceId: 'companion:marsh-mallard:legacy', catalogId: 'marsh-mallard', name: 'Marsh',
    care: { fullness: 1, happiness: 2, trust: 65 }, training: { follow: 1, find: 3 },
    visualVariation: { tintIndex: 2, size: 1 }, personality: { curiosity: .7, energy: .6, sociability: .5 }
  });
  assert.equal(migrated.instanceId, 'companion:marsh-mallard:legacy');
  assert.equal(migrated.legacyContent, true);
  assert.equal(migrated.progression.level, 3);
  assert.equal(migrated.progression.trustState, 'Trusting');
  assert.deepEqual(migrated.training.learnedCommands, ['follow']);
  assert.equal('fullness' in migrated.care, false);
});

test('travel policy keeps companions safely inside enclosed vehicles instead of rendering through them', () => {
  const companion = createCompanionInstance('trail-hound', { worldIdentity: 'baltimore', discoveryId: 'encounter:a' });
  assert.deepEqual(resolveCompanionTravelPolicy(companion, 'walk', 'EARTH'), { visible: true, state: 'following' });
  assert.deepEqual(resolveCompanionTravelPolicy(companion, 'car', 'EARTH'), { visible: false, state: 'vehicle-occupant', positionMode: 'interior' });
  assert.deepEqual(resolveCompanionTravelPolicy(companion, 'boat', 'EARTH'), { visible: true, state: 'aboard', positionMode: 'aboard' });
  assert.deepEqual(resolveCompanionTravelPolicy(companion, 'plane', 'EARTH'), { visible: false, state: 'vehicle-occupant', positionMode: 'interior' });
  assert.deepEqual(resolveCompanionTravelPolicy(companion, 'walk', 'MOON'), { visible: false, state: 'waiting' });
});

test('names are bounded, normalized, and safe for display escaping', () => {
  assert.equal(sanitizeCompanionName('  Copper\n  Bell  '), 'Copper Bell');
  assert.equal(sanitizeCompanionName('', 'Trail Hound'), 'Trail Hound');
  assert.equal(sanitizeCompanionName('123456789012345678901234567890'), '123456789012345678901234');
});

test('all six livestock species are individual companions with explicit specialties', () => {
  assert.deepEqual(validateDiscoveryCatalogs(BUILTIN_DISCOVERY_CATALOGS), { ok: true, errors: [] });
  const livestockIds = ['pasture-cow', 'wool-sheep', 'hill-goat', 'yard-chicken', 'heritage-pig', 'field-horse'];
  const specialties = new Set();
  livestockIds.forEach((catalogId, index) => {
    const catalog = COMPANION_CATALOG.find((entry) => entry.id === catalogId);
    assert.equal(catalog?.family, 'livestock-companion');
    assert.deepEqual(catalog?.contexts, ['farm', 'rural']);
    const companion = createCompanionInstance(catalogId, {
      worldIdentity: 'fixture:farm', discoveryId: `livestock:${index}`, name: `Friend ${index + 1}`
    });
    assert.match(companion.speciesArchetype, /^livestock-/);
    assert.ok(companion.training.specialization);
    assert.equal(companion.tradeable, false);
    assert.equal(companion.legacyContent, false);
    assert.deepEqual(resolveCompanionTravelPolicy(companion, 'walk', 'EARTH'), { visible: true, state: 'following' });
    assert.deepEqual(resolveCompanionTravelPolicy(companion, 'car', 'EARTH'), { visible: false, state: 'waiting' });
    assert.deepEqual(resolveCompanionTravelPolicy(companion, 'boat', 'EARTH'), { visible: false, state: 'waiting' });
    specialties.add(companion.training.specialization);
  });
  assert.equal(specialties.size, livestockIds.length);
});

test('mapped farm context creates a livestock trust encounter without a live-animal claim', () => {
  const environment = createEnvironmentFixture('farm');
  const plan = compileAmbientWildlifePlan(environment, { maxActors: 2 });
  assert.ok(plan.actors.length >= 1);
  assert.ok(plan.actors.every((actor) => actor.archetype === 'livestock'));
  assert.ok(plan.actors.every((actor) => actor.companionPolicy === 'trust-sequence-required'));
  assert.ok(plan.actors.every((actor) => actor.supportingEvidence.includes('habitat-plausible')));
  assert.equal(plan.diagnostics.generatedWithAdditionalProviderQueries, false);
});
