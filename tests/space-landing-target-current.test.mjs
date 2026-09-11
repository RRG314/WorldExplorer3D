import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCompletedLandingTarget } from '../app/js/space/landing-target.js';

test('verified journey destination overrides a stale landing animation target', () => {
  assert.equal(resolveCompletedLandingTarget({
    destination: 'mercury',
    _landingTarget: 'Earth'
  }, {
    phase: 'surface',
    destinationBodyId: 'mercury'
  }), 'mercury');
});

test('legacy landing target remains available when no verified journey has completed', () => {
  assert.equal(resolveCompletedLandingTarget({
    destination: 'moon',
    _landingTarget: 'Mars'
  }, null), 'mars');
});
