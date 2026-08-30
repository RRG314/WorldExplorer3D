import assert from 'node:assert/strict';
import test from 'node:test';
import { createResponderResponseModel } from '../app/js/urban-sandbox/responder-model.js';

function activeIncident(eventId = 'incident:1') {
  return {
    phase: 'searching',
    level: 2,
    lastEvent: { id: eventId }
  };
}

function holdForResolution(model, eventId) {
  let latest = null;
  for (let index = 0; index < 16; index += 1) {
    latest = model.update(.25, {
      civic: activeIncident(eventId),
      activeCount: 2,
      nearestDistance: 2,
      actorMoving: false,
      actorWithinSearch: true
    });
    if (latest.resolution) break;
  }
  return latest;
}

test('clearing a completed responder incident cannot replay its arrest outcome', () => {
  const model = createResponderResponseModel();
  const resolved = holdForResolution(model, 'incident:1');
  assert.equal(resolved.resolution?.type, 'arrest');
  assert.equal(resolved.resolution?.eventId, 'incident:1');

  const cleared = model.clear();
  assert.equal(cleared.phase, 'idle');
  assert.equal(cleared.eventId, '');
  assert.equal(cleared.lastOutcome, null);

  for (let index = 0; index < 24; index += 1) {
    const afterRelease = model.update(.25, {
      civic: { phase: 'clear', level: 0, lastEvent: null },
      activeCount: 0,
      nearestDistance: Infinity,
      actorMoving: true,
      actorWithinSearch: true
    });
    assert.equal(afterRelease.phase, 'idle');
    assert.equal(afterRelease.resolution, null);
    assert.equal(afterRelease.eventId, '');
  }

  const next = holdForResolution(model, 'incident:2');
  assert.equal(next.resolution?.type, 'arrest');
  assert.equal(next.resolution?.eventId, 'incident:2');
});
