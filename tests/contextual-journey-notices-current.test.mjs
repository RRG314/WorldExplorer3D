import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AMBIENT_JOURNEY_RADIUS_METERS,
  deriveFieldJourney
} from '../app/js/tutorial/current-journey.js';

function context(snapshot) {
  return {
    worldDiscoveryRuntimeSnapshot: () => snapshot,
    openWorldDiscoverySection() {}
  };
}

test('ambient field suggestions stay silent when the objective is far away', () => {
  const journey = deriveFieldJourney(context({
    active: true,
    interaction: { phase: 'idle' },
    fieldExpedition: {
      completedCount: 0,
      objectiveCount: 3,
      objectives: [{ targetLabel: 'Survey stop', distanceMeters: AMBIENT_JOURNEY_RADIUS_METERS + 1, complete: false }]
    }
  }));
  assert.equal(journey, null);
});

test('a nearby untracked opportunity is brief and optional', () => {
  const journey = deriveFieldJourney(context({
    active: true,
    interaction: { phase: 'idle' },
    fieldExpedition: {
      completedCount: 0,
      objectiveCount: 3,
      objectives: [{ targetLabel: 'Creek survey', distanceMeters: 42, complete: false }]
    }
  }));
  assert.equal(journey.eyebrow, 'NEARBY');
  assert.equal(journey.transient, true);
  assert.match(journey.detail, /42 m away/);
});

test('an activity the player already started remains available regardless of distance', () => {
  const journey = deriveFieldJourney(context({
    active: true,
    activeActivityId: 'wildlife-track',
    actions: [{ id: 'wildlife-track', label: 'Track wildlife' }],
    interaction: { phase: 'seeking', distanceMeters: 1200, bearingDegrees: 91, message: 'Follow the field bearing.' },
    fieldExpedition: { objectives: [] }
  }));
  assert.equal(journey.eyebrow, 'FIELD ACTIVITY');
  assert.equal(journey.title, 'Track wildlife');
  assert.equal(journey.transient, undefined);
});
