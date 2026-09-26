import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkingEncounterDirector } from '../app/js/discovery/encounter-director.js';

function fixture(options = {}) {
  const slot = { id: 'lead-1', claimId: 'claim-1', activityId: 'photograph', activityLabel: 'Photograph', catalogId: 'area-survey-note', position: { x: 20, z: 0 } };
  const director = createWalkingEncounterDirector({ plan: { type: 'FieldActivityPlan', slots: [slot] }, ...options });
  const tick = (input = {}) => director.update({ dt: 1, walking: true, earth: true, position: { x: 0, z: 0 }, ...input });
  const offer = () => { for (let i = 0; i < 10; i++) tick(); return director.snapshot(); };
  return { director, slot, tick, offer };
}

test('opening a menu retains the offered lead and lets the player accept it once', () => {
  const { director, tick, offer } = fixture();
  const before = offer();
  assert.equal(before.available, true);
  for (let i = 0; i < 30; i++) {
    const reading = tick({ blocked: true });
    assert.equal(reading.slotId, before.slotId);
    assert.equal(reading.revision, before.revision);
  }
  assert.equal(director.accept().slotId, before.slotId);
  assert.equal(director.accept(), null);
  assert.equal(tick({ blocked: true }).available, false);
});

test('a blocked menu does not generate a new lead or count movement toward one', () => {
  const { director, tick } = fixture();
  for (let i = 0; i < 30; i++) assert.equal(tick({ blocked: true, position: { x: i, z: 0 } }).available, false);
  assert.equal(director.snapshot().walkedMeters, 0);
  assert.equal(tick({ position: { x: 29, z: 0 } }).available, false);
});

test('retained leads still expire when claimed, unusable, or out of range', () => {
  for (const reason of ['claimed', 'unusable', 'distance']) {
    const claimedIds = new Set();
    let usable = true;
    const { slot, offer, tick } = fixture({ claimedIds, canUseSlot: () => usable });
    assert.equal(offer().available, true);
    assert.equal(tick({ blocked: true }).available, true);
    if (reason === 'claimed') claimedIds.add(slot.claimId);
    if (reason === 'unusable') usable = false;
    assert.equal(tick({ blocked: true, position: { x: reason === 'distance' ? 1000 : 0, z: 0 } }).available, false, reason);
  }
});

test('starting another task or leaving Earth walking still clears a lead', () => {
  for (const input of [{ operationActive: true }, { walking: false }, { earth: false }]) {
    const { offer, tick } = fixture();
    assert.equal(offer().available, true);
    assert.equal(tick({ blocked: true, ...input }).available, false);
  }
});
