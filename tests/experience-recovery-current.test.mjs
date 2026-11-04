import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperienceIntent, createExperienceEntry } from '../app/js/experiences/entry.js';
const input = {
  experienceId: 'career:palaeontologist',
  place: { id: 'park', name: 'Park', lat: 39, lon: -76, environment: 'earth' }
};
test('recovery is optional in legacy intents and rejects unknown actions', () => {
  assert.equal(Object.hasOwn(createExperienceIntent(input), 'recoveryAction'), false);
  assert.equal(
    createExperienceIntent({ ...input, recoveryAction: 'relocate-course' }).recoveryAction,
    'relocate-course'
  );
  assert.throws(
    () => createExperienceIntent({ ...input, recoveryAction: 'replace-user-data' }),
    /supported/
  );
});
test('entry only dispatches recovery actions to an adapter which admits them', async () => {
  let launched = 0,
    received = null;
  let adapter = {
    start: async ({ intent }) => {
      received = intent;
      return true;
    }
  };
  const entry = createExperienceEntry({
    resolveAdapter: () => adapter,
    launchPlace: async () => {
      launched++;
      return true;
    },
    readWorldIdentity: () => 'same-world'
  });
  assert.equal(await entry.start({ ...input, recoveryAction: 'relocate-course' }), false);
  assert.equal(launched, 0);
  adapter = { ...adapter, recoveryActions: ['relocate-course'] };
  assert.equal(await entry.start({ ...input, recoveryAction: 'relocate-course' }), true);
  assert.equal(received.recoveryAction, 'relocate-course');
  assert.equal(launched, 1);
});
