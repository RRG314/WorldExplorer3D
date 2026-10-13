import test from 'node:test';
import assert from 'node:assert/strict';
import { readReturnPlace, requestGuidedJourney, consumeGuidedJourney } from '../app/js/tutorial/entry-journey.js';

const places = { baltimore: { lat: 39.29, lon: -76.61, name: 'Baltimore' } };
const storage = value => ({ getItem: () => JSON.stringify(value) });
test('return action uses a valid existing location without changing its stored record', () => {
  const value = { selLoc: 'baltimore', launchMode: 'earth', ts: 42 };
  const saved = storage(value);
  assert.deepEqual(readReturnPlace(saved, 'key', places), { record: value, name: 'Baltimore' });
  assert.equal(saved.getItem(), JSON.stringify(value));
  assert.equal(readReturnPlace(storage({ ...value, launchMode: 'moon' }), 'key', places).name, 'the Moon');
});
test('missing, damaged, out-of-range and unknown saved locations never create a return action', () => {
  for (const value of [null, {}, { selLoc: 'missing', launchMode: 'earth' },
    { selLoc: 'custom', launchMode: 'earth', customLoc: { lat: 100, lon: 0 } },
    { selLoc: 'custom', launchMode: 'earth', customLoc: { lat: '', lon: null } },
    { selLoc: 'baltimore', launchMode: 'invalid' }]) {
    assert.equal(readReturnPlace(storage(value), 'key', places), null);
  }
  assert.equal(readReturnPlace({ getItem: () => '{broken' }, 'key', places), null);
  assert.equal(readReturnPlace({ getItem: () => { throw Error('Storage unavailable'); } }, 'key', places), null);
});
test('custom places keep their saved coordinates and bounded display name locally', () => {
  const value = { selLoc: 'custom', launchMode: 'ocean', customLoc: { lat: -18.2861, lon: 147.7, name: 'Coral Shelf' } };
  assert.deepEqual(readReturnPlace(storage(value), 'key', places), { name: 'Coral Shelf', record: value });
});
test('guided teaching requires a deliberate request and is consumed once', () => {
  consumeGuidedJourney(); assert.equal(consumeGuidedJourney(), false);
  requestGuidedJourney(); assert.equal(consumeGuidedJourney(), true);
  assert.equal(consumeGuidedJourney(), false);
});
