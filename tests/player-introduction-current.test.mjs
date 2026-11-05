import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacterState } from '../app/js/character/model.js?v=1';
import {
  applyPlayerIntroduction,
  applyCareerFocus,
} from '../app/js/character/journey-preferences.js';
import {
  CAREER_EXPERIENCES,
  filterExperiences,
  experienceById,
} from '../app/js/experiences/catalog.js';
import {
  careerAvailability,
  continuableExperienceId,
} from '../app/js/experiences/career-availability.js';
import { createExperienceEntry, experienceOffer } from '../app/js/experiences/entry.js';

const input = {
  name: 'River',
  gender: 'woman',
  careerId: 'career:geologist',
  vehicleId: 'bmw_e34',
};
test('first introduction uses the original character identity and no game grants', () => {
  const base = {
    id: 'local-explorer',
    characterState: createDefaultCharacterState({ now: 1 }),
    items: ['owned-item'],
    balance: 42,
    activeExperience: { experienceId: 'career:botanist' },
    unknown: { future: true },
  };
  const next = applyPlayerIntroduction(base, input, { now: 50 });
  assert.equal(next.characterState.characterId, base.characterState.characterId);
  assert.equal(next.characterState.creationComplete, true);
  assert.equal(next.journeyPreferences.explorerName, 'River');
  for (const key of ['items', 'balance', 'activeExperience', 'unknown'])
    assert.deepEqual(next[key], base[key]);
  assert.equal(base.characterState.creationComplete, false);
});
test('returning introduction preserves all progression and the original starting interest', () => {
  const first = applyPlayerIntroduction({ characterState: createDefaultCharacterState() }, input, {
    now: 50,
  });
  first.characterState.attributes.strength = 8;
  first.characterState.rewardLedger = ['accepted'];
  first.characterState.unspentAttributePoints = 3;
  const next = applyPlayerIntroduction(first, { ...input, careerId: 'career:racer' }, { now: 100 });
  assert.equal(next.characterState.attributes.strength, 8);
  assert.deepEqual(next.characterState.rewardLedger, ['accepted']);
  assert.equal(next.characterState.unspentAttributePoints, 3);
  assert.equal(next.journeyPreferences.introCompletedAt, 50);
  assert.equal(next.journeyPreferences.startingCareerId, 'career:geologist');
  assert.equal(next.journeyPreferences.activeFocusId, 'career:racer');
});
test('focus is independent of an active task and unknown preference versions are preserved by refusal', () => {
  const base = {
    characterState: createDefaultCharacterState(),
    activeExperience: { experienceId: 'career:botanist' },
    journeyPreferences: { schemaVersion: 1, opaque: 'keep' },
  };
  const next = applyCareerFocus(base, 'career:racer', 100);
  assert.deepEqual(next.activeExperience, base.activeExperience);
  assert.deepEqual(next.characterState, base.characterState);
  assert.equal(next.journeyPreferences.opaque, 'keep');
  const future = { ...base, journeyPreferences: { schemaVersion: 99, future: true } };
  assert.throws(() => applyCareerFocus(future, null), /newer version/);
  assert.throws(() => applyPlayerIntroduction(future, input), /newer version/);
  assert.equal(future.journeyPreferences.future, true);
});
test('unowned cars and unfinished careers cannot be granted by introduction or focus', () => {
  const base = { characterState: createDefaultCharacterState() };
  assert.throws(
    () => applyPlayerIntroduction(base, { ...input, vehicleId: 'porsche_carrera_4s' }),
    /owned car/
  );
  assert.throws(
    () => applyPlayerIntroduction(base, { ...input, careerId: 'career:expedition-pilot' }),
    /ready career/
  );
  assert.throws(() => applyCareerFocus(base, 'career:expedition-pilot'), /ready career/);
});
test('nineteen released courses precede the disabled aviation career and future entries fail closed', async () => {
  assert.equal(CAREER_EXPERIENCES.filter((c) => c.releaseStatus === 'ready').length, 19);
  assert.equal(filterExperiences().at(-1).id, 'career:expedition-pilot');
  assert.equal(careerAvailability('new-unaccepted-career').releaseStatus, 'coming-soon');
  const pilot = experienceById('career:expedition-pilot');
  let traveled = 0;
  assert.equal(experienceOffer(pilot, { adapter: {} }).enabled, false);
  const entry = createExperienceEntry({
    resolveAdapter: () => ({ start: () => true }),
    launchPlace: () => {
      traveled++;
      return true;
    },
    readWorldIdentity: () => 'earth',
  });
  assert.equal(await entry.start({ experienceId: pilot.id, place: { lat: 1, lon: 2 } }), false);
  assert.equal(traveled, 0);
  const id = continuableExperienceId(pilot.id);
  assert.equal(id, 'activity:harbor-run');
  assert.equal(experienceById(id).adapterId, 'pilot');
  assert.equal(await entry.start({ experienceId: id, place: { lat: 1, lon: 2 } }), true);
});
