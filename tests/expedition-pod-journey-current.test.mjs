import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPodJourney,
  POD_PHASE,
  POD_ROUTE_KIND,
  transitionPodJourney
} from '../app/js/expedition/pod-journey-authority.js';

test('expedition pod journey has one ordered ship-to-surface-to-ship state chain', () => {
  let journey = createPodJourney({
    expeditionId: 'expedition-1',
    contactId: 'contact-1',
    bodyId: 'contact-1-i',
    returnFrameId: 'sol',
    atMs: 100
  });
  assert.equal(journey.phase, POD_PHASE.ABOARD);
  for (const [event, expected] of [
    ['launch', POD_PHASE.SHIP_LAUNCH],
    ['course_acquired', POD_PHASE.LOCAL_FLIGHT],
    ['begin_descent', POD_PHASE.DESCENT],
    ['surface_ready', POD_PHASE.SURFACE],
    ['launch', POD_PHASE.SURFACE_LAUNCH],
    ['rendezvous', POD_PHASE.RENDEZVOUS],
    ['recover', POD_PHASE.RECOVERED]
  ]) {
    const result = transitionPodJourney(journey, event, { atMs: journey.updatedAtMs + 10 });
    assert.equal(result.accepted, true);
    assert.equal(result.journey.phase, expected);
    journey = result.journey;
  }
  assert.equal(Object.isFrozen(journey), true);
  assert.equal(transitionPodJourney(journey, 'launch').accepted, false);
});

test('Earth shuttle starts on the loaded surface and reuses the return half of the pod chain', () => {
  let journey = createPodJourney({
    expeditionId: 'expedition-earth',
    contactId: 'earth-current-location',
    bodyId: 'earth',
    returnFrameId: 'sol',
    routeKind: POD_ROUTE_KIND.EARTH_SHUTTLE,
    initialPhase: POD_PHASE.SURFACE,
    atMs: 300
  });
  assert.equal(journey.schemaVersion, 2);
  assert.equal(journey.routeKind, POD_ROUTE_KIND.EARTH_SHUTTLE);
  assert.equal(journey.phase, POD_PHASE.SURFACE);
  for (const [event, expected] of [
    ['launch', POD_PHASE.SURFACE_LAUNCH],
    ['rendezvous', POD_PHASE.RENDEZVOUS],
    ['recover', POD_PHASE.RECOVERED]
  ]) {
    const result = transitionPodJourney(journey, event, { atMs: journey.updatedAtMs + 10 });
    assert.equal(result.accepted, true);
    assert.equal(result.journey.phase, expected);
    journey = result.journey;
  }
});

test('pod journey rejects skipped descent and records terminal failure', () => {
  const aboard = createPodJourney({
    expeditionId: 'expedition-2',
    contactId: 'contact-2',
    bodyId: 'contact-2-i',
    returnFrameId: 'tau-ceti',
    atMs: 200
  });
  assert.equal(transitionPodJourney(aboard, 'surface_ready').accepted, false);
  const failed = transitionPodJourney(aboard, 'fail', { atMs: 210, reason: 'bay-door-interlock' });
  assert.equal(failed.accepted, true);
  assert.equal(failed.journey.phase, POD_PHASE.FAILED);
  assert.equal(failed.journey.failureReason, 'bay-door-interlock');
  assert.equal(transitionPodJourney(failed.journey, 'launch').accepted, false);
});
