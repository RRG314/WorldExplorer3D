import test from 'node:test';
import assert from 'node:assert/strict';
import { tunnelObstructionMaximumY } from '../app/js/world/compiler/tunnel-obstruction-limits.js';

import { tunnelObstructionMaximumY as envelopeMaximum } from '../app/js/world/compiler/tunnel-envelope.js';

test('legacy obstruction exports share the canonical envelope query', () => {
  assert.equal(tunnelObstructionMaximumY, envelopeMaximum);
});

test('tunnel roof limits preserve overlap, endpoint tolerance and unbounded gaps', () => {
  const limits = Object.freeze([
    Object.freeze({ start: 10, end: 20, maximumSurfaceY: -5 }),
    Object.freeze({ start: 15, end: 25, maximumSurfaceY: -8 })
  ]);
  for (const [distance, expected] of [[0, Infinity], [10 - 2e-5, Infinity], [10 - 1e-6, -5],
    [10, -5], [14, -5], [15, -8], [20, -8], [25 + 1e-6, -8], [25 + 2e-5, Infinity]]) {
    assert.equal(tunnelObstructionMaximumY(limits, distance), expected);
  }
  assert.equal(tunnelObstructionMaximumY(undefined, 12), Infinity);
  assert.equal(tunnelObstructionMaximumY([], 12), Infinity);
});
