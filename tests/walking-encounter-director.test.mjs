import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkingEncounterDirector } from '../app/js/discovery/encounter-director.js';

const slot = (id, activityId, catalogId, x, z) => Object.freeze({
  id,
  claimId: `claim:${id}`,
  activityId,
  activityLabel: activityId === 'photograph' ? 'Photograph Nature' : 'Inspect Area',
  catalogId,
  position: Object.freeze({ x, z })
});

const plan = Object.freeze({
  type: 'FieldActivityPlan',
  slots: Object.freeze([
    slot('generic', 'inspect', 'area-survey-note', 8, 0),
    slot('wildlife', 'photograph', 'urban-nature-photo', 28, 0),
    slot('plant', 'forage', 'common-plant-record', -34, 0)
  ])
});

function tick(director, seconds, input = {}) {
  let snapshot;
  for (let index = 0; index < seconds * 4; index += 1) {
    snapshot = director.update({ dt: 0.25, position: { x: 0, z: 0 }, walking: true, earth: true, ...input });
  }
  return snapshot;
}

test('a rich nearby encounter is promoted without opening the Journal first', () => {
  const director = createWalkingEncounterDirector({ plan, initialDelaySeconds: 1, fallbackDelaySeconds: 2 });
  const lead = tick(director, 3);
  assert.equal(lead.available, true);
  assert.equal(lead.slotId, 'wildlife');
  assert.equal(lead.kind, 'wildlife');
  assert.equal(lead.mode, 'free-roam');
});

test('the same authority labels an opportunity as Live GPS without changing its stable slot', () => {
  const director = createWalkingEncounterDirector({ plan, initialDelaySeconds: 1, fallbackDelaySeconds: 2 });
  const lead = tick(director, 3, { liveGpsActive: true });
  assert.equal(lead.mode, 'live-gps');
  assert.equal(lead.slotId, 'wildlife');
});

test('encounters are suppressed outside walking play and while an operation owns the screen', () => {
  const director = createWalkingEncounterDirector({ plan, initialDelaySeconds: 1, fallbackDelaySeconds: 2 });
  assert.equal(tick(director, 3, { walking: false }).available, false);
  assert.equal(tick(director, 3, { operationActive: true }).available, false);
});

test('vehicle movement cannot preload walking encounter cadence', () => {
  const director = createWalkingEncounterDirector({ plan, initialDelaySeconds: 1, fallbackDelaySeconds: 2 });
  for (let index = 0; index < 20; index += 1) {
    director.update({ dt: 0.25, position: { x: index * 3, z: 0 }, walking: false, earth: true });
  }
  const firstWalkingFrame = director.update({ dt: 0.25, position: { x: 60, z: 0 }, walking: true, earth: true });
  assert.equal(firstWalkingFrame.available, false);
  assert.equal(firstWalkingFrame.walkedMeters, 3);
});

test('accepting a lead prevents immediate repetition and claimed slots never return', () => {
  const claimed = new Set();
  const director = createWalkingEncounterDirector({ plan, claimedIds: claimed, initialDelaySeconds: 1, fallbackDelaySeconds: 2, cooldownSeconds: 1 });
  const first = tick(director, 3);
  const accepted = director.accept({ x: 0, z: 0 });
  assert.equal(accepted.slotId, first.slotId);
  claimed.add(first.claimId);
  const next = tick(director, 4);
  assert.equal(next.available, true);
  assert.notEqual(next.slotId, first.slotId);
});
