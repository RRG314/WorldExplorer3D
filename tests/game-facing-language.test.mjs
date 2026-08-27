import assert from 'node:assert/strict';
import test from 'node:test';

import { compileAmbientWildlifePlan } from '../app/js/discovery/wildlife-runtime.js';

test('ambient wildlife presents a field lead instead of an internal encounter term', () => {
  const plan = compileAmbientWildlifePlan({
    type: 'EnvironmentContextPublication',
    requestId: 'language-contract',
    sequence: 1,
    worldIdentity: { id: 'language-contract-world' },
    cells: [{
      cellId: 'park-cell',
      contexts: ['park'],
      center: { x: 0, z: 0 },
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }
    }]
  }, { maxActors: 1 });

  assert.equal(plan.actors.length, 1);
  assert.match(plan.actors[0].label, /field lead/i);
  assert.doesNotMatch(plan.actors[0].label, /procedural|encounter/i);
  assert.equal(plan.actors[0].evidenceClass, 'guided-wildlife-encounter');
});
