import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATTRIBUTE_CUSTOM_POINT_BUDGET,
  ATTRIBUTE_DEFINITIONS,
  BACKGROUND_DEFINITIONS,
  SPECIALTY_RANKS,
  rankForXp
} from '../app/js/character/catalog.js';
import { resolveCharacterCapability } from '../app/js/character/capability-resolver.js';
import { createCharacter, createDefaultCharacterState, validateCreationAttributes } from '../app/js/character/model.js';
import { migrateLegacyCharacterState, projectCharacterProgress } from '../app/js/character/progression.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';

function event(overrides = {}) {
  return {
    eventId: 'event:test:1',
    eventType: 'discovery-recorded',
    activityId: 'geology-inspect',
    catalogId: 'granite-field-sample',
    family: 'rock',
    regionId: 'baltimore',
    environment: 'EARTH',
    occurredAt: 1_000,
    progress: { reason: 'new-identification', points: 3 },
    ...overrides
  };
}

test('every background uses the same bounded attribute budget and leaves every basic capability reachable', () => {
  for (const background of BACKGROUND_DEFINITIONS) {
    const character = createCharacter({ backgroundId: background.id, now: 1 });
    assert.equal(Object.values(character.attributes).reduce((sum, value) => sum + value, 0), ATTRIBUTE_CUSTOM_POINT_BUDGET, background.id);
    assert.equal(Math.min(...Object.values(character.attributes)) >= 3, true, background.id);
    assert.equal(Math.max(...Object.values(character.attributes)) <= 6, true, background.id);
    assert.equal(resolveCharacterCapability(character, 'wildlife-observation').allowed, true, background.id);
    assert.equal(resolveCharacterCapability(character, 'surveying').allowed, true, background.id);
    assert.equal(resolveCharacterCapability(character, 'construction').allowed, true, background.id);
  }
});

test('Custom Start enforces one readable point budget instead of allowing broken extremes', () => {
  const balanced = Object.fromEntries(ATTRIBUTE_DEFINITIONS.map(({ id }) => [id, 4]));
  assert.deepEqual(validateCreationAttributes(balanced), balanced);
  assert.throws(() => validateCreationAttributes({ ...balanced, strength: 6 }), /requires 28 attribute points/i);
  assert.throws(() => validateCreationAttributes({ ...balanced, strength: 2, endurance: 5 }), /strength must be a whole number from 3 to 6/i);
  assert.throws(() => validateCreationAttributes({ ...balanced, strength: 4.5, endurance: 3.5 }), /strength must be a whole number/i);
});

test('one meaningful geology event advances Geology and the relevant proficiency once', () => {
  const start = createCharacter({ backgroundId: 'general-explorer', now: 1 });
  const first = projectCharacterProgress(start, event());
  const duplicate = projectCharacterProgress(first.character, event());
  assert.equal(first.changed, true);
  assert.equal(first.reward.specialtyAwards.some((award) => award.id === 'geology' && award.xp === 18), true);
  assert.equal(first.reward.proficiencyAwards.some((award) => award.id === 'survey-equipment'), true);
  assert.equal(first.character.specialties.geology.xp, 18);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.reason, 'already-rewarded');
  assert.equal(duplicate.character.specialties.geology.xp, 18);
});

test('identical practice diminishes while new subjects still build a specialty at the intended early pace', () => {
  let character = createDefaultCharacterState({ now: 1 });
  const repeatedAwards = [];
  for (let index = 0; index < 5; index += 1) {
    const result = projectCharacterProgress(character, event({ eventId: `event:repeat:${index}`, occurredAt: index + 1 }));
    if (result.changed) {
      repeatedAwards.push(result.reward.baseXp);
      character = result.character;
    }
  }
  assert.deepEqual(repeatedAwards, [18, 11, 6, 3]);

  character = createDefaultCharacterState({ now: 1 });
  for (let index = 0; index < 3; index += 1) {
    character = projectCharacterProgress(character, event({
      eventId: `event:subject:${index}`,
      catalogId: `geology-subject-${index}`,
      occurredAt: index + 1
    })).character;
  }
  assert.equal(character.specialties.geology.xp, 54);
  assert.equal(rankForXp(SPECIALTY_RANKS, character.specialties.geology.xp).rank, 1);
});

test('planetary geology advances Space and Geology without changing planetary evidence', () => {
  const result = projectCharacterProgress(createDefaultCharacterState({ now: 1 }), event({
    eventId: 'event:planetary:europa:ice',
    regionId: 'europa-chaos',
    environment: 'PLANETARY',
    catalogId: 'europa-water-ice-context',
    family: 'mineral'
  }));
  assert.equal(result.reward.specialtyAwards.some((award) => award.id === 'space'), true);
  assert.equal(result.reward.specialtyAwards.some((award) => award.id === 'geology'), true);
});

test('different starting characters receive perceptibly different assistance without changing hard world rules', () => {
  const prospector = createCharacter({ backgroundId: 'field-prospector', traits: ['methodical'], now: 1 });
  const marine = createCharacter({ backgroundId: 'marine-surveyor', traits: ['strong-swimmer'], now: 1 });
  const prospectorDig = resolveCharacterCapability(prospector, 'excavation', { equipmentIds: ['hand-trowel'] });
  const marineDig = resolveCharacterCapability(marine, 'excavation', { equipmentIds: ['hand-trowel'] });
  const prospectorDive = resolveCharacterCapability(prospector, 'dive', { equipmentIds: ['virtual-dive-kit'] });
  const marineDive = resolveCharacterCapability(marine, 'dive', { equipmentIds: ['virtual-dive-kit'] });
  assert.equal(prospectorDig.allowed, true);
  assert.equal(marineDig.allowed, true);
  assert.equal(prospectorDive.allowed, true);
  assert.equal(marineDive.allowed, true);
  assert.equal(prospectorDig.assistance.control > marineDig.assistance.control, true);
  assert.equal(marineDive.assistance.control > prospectorDive.assistance.control, true);
});

test('advanced requirements explain equipment and qualification while basic play remains open', () => {
  const character = createCharacter({ backgroundId: 'general-explorer', now: 1 });
  const missingTool = resolveCharacterCapability(character, 'detector');
  const basic = resolveCharacterCapability(character, 'detector', { equipmentIds: ['metal-detector'] });
  const advancedDive = resolveCharacterCapability(character, 'dive', {
    difficulty: 'advanced',
    equipmentIds: ['virtual-dive-kit']
  });
  assert.equal(missingTool.allowed, false);
  assert.match(missingTool.explanations.join(' '), /metal-detector/i);
  assert.equal(basic.allowed, true);
  assert.equal(advancedDive.allowed, false);
  assert.match(advancedDive.explanations.join(' '), /advanced dive ready/i);
});

test('legacy migration uses evidence conservatively and keeps a recoverable profile backup', async () => {
  const legacyProfile = {
    schemaVersion: 2,
    explorerProgress: {
      points: 45,
      specialties: {
        nature: { points: 3 },
        earth: { points: 8 },
        places: { points: 2 }
      }
    }
  };
  const store = createMemoryDiscoveryProfileStore({
    profile: legacyProfile,
    fieldGuide: [{ catalogId: 'legacy-granite', family: 'rock', regions: ['legacy-region'], firstObservedAt: 10 }],
    companions: [{ instanceId: 'companion:1', catalogId: 'trail-hound' }],
    migratedAt: 100
  });
  const profile = await store.getProfile();
  const backup = await store.getCharacterMigrationBackup();
  assert.equal(profile.explorerProgress.points, 45);
  assert.equal(profile.characterState.creationMode, 'migrated');
  assert.equal(profile.characterState.specialties.geology.xp >= 32, true);
  assert.equal(profile.characterState.specialties['companion-handling'].xp, 8);
  assert.equal(profile.characterState.specialties.marine.xp, 0);
  assert.equal(profile.characterState.specialties.space.xp, 0);
  assert.deepEqual(backup.profile, legacyProfile);
  assert.equal(await store.rollbackCharacterMigration(), true);
  assert.equal((await store.getProfile()).characterState.creationComplete, false);
});

test('the profile store records Journal, Explorer, specialty, and proficiency from one canonical claim', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const record = {
    claimId: 'claim:central:granite',
    catalogId: 'granite-field-sample',
    name: 'Granite Field Sample',
    family: 'rock',
    discipline: 'earth-science',
    activityId: 'geology-inspect',
    toolId: 'field-lens',
    regionId: 'baltimore',
    worldIdentity: 'baltimore',
    evidenceClass: 'virtual-field-record',
    collectedAt: 1_000
  };
  const first = await store.recordObservation(record);
  const duplicate = await store.recordObservation(record);
  const profile = await store.getProfile();
  assert.equal(first.recorded, true);
  assert.equal(duplicate.recorded, false);
  assert.equal((await store.listEvents()).length, 1);
  assert.equal(profile.explorerProgress.totalRecords, 1);
  assert.equal(profile.characterState.specialties.geology.xp, 18);
  assert.equal(profile.explorerProgress.specialties.earth.points, 0);
  assert.equal(first.characterReward.specialtyAwards.length > 0, true);
});

test('legacy migration can be evaluated as a pure deterministic operation', () => {
  const first = migrateLegacyCharacterState({
    profile: { schemaVersion: 2, explorerProgress: { points: 20, specialties: { earth: { points: 3 } } } },
    events: [event()],
    now: 500
  });
  const second = migrateLegacyCharacterState({
    profile: { schemaVersion: 2, explorerProgress: { points: 20, specialties: { earth: { points: 3 } } } },
    events: [event()],
    now: 500
  });
  assert.deepEqual(first, second);
});

test('a legacy Journal import is migrated once and replaces the rollback source', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const legacyProfile = {
    schemaVersion: 2,
    explorerProgress: {
      points: 20,
      specialties: { earth: { points: 4 } }
    }
  };
  await store.importData({
    profile: legacyProfile,
    items: [],
    events: [],
    fieldGuide: [{ catalogId: 'imported-basalt', family: 'rock', regions: ['imported-region'] }],
    companions: []
  });
  const profile = await store.getProfile();
  const backup = await store.getCharacterMigrationBackup();
  assert.equal(profile.characterState.creationMode, 'migrated');
  assert.equal(profile.characterState.specialties.geology.xp >= 16, true);
  assert.deepEqual(backup.profile, legacyProfile);
  assert.equal(await store.rollbackCharacterMigration(), true);
  assert.equal((await store.getProfile()).explorerProgress.points, 20);
});
