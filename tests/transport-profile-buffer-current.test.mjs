import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothSignedCutFillProfile as current} from '../app/js/world/compiler/transport-surface-profile.js';
import {smoothSignedCutFillProfile as reference} from './fixtures/signed-profile-before-buffer-reuse.js';

test('rolling smoothing preserves every Float32 result across constrained, irregular profiles', () => {
  let seed = 78131;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let trial = 0; trial < 600; trial++) {
    const n = trial % 81, heights = [], lower = [], upper = [], distances = [];
    let distance = 0;
    for (let i = 0; i < n; i++) {
      const y = random() * 200 - 100;
      heights.push(y); lower.push(y - random() * 8); upper.push(y + random() * 8);
      distance += random() * 12; distances.push(distance);
    }
    const args = [heights, lower, upper, distances, random() * .5, random() * 40];
    const before = structuredClone(args), expected = reference(...args);
    assert.deepEqual(current(...args), expected, `profile ${trial}`);
    assert.deepEqual(args, before);
  }
});

test('smoothing allocates one Float64 backing buffer rather than one for every pass', () => {
  const Native = globalThis.Float64Array;
  let count = 0;
  globalThis.Float64Array = new Proxy(Native, { construct(target, args, newTarget) {
    if (!(args[0] instanceof ArrayBuffer)) count++; return Reflect.construct(target, args, newTarget);
  }});
  try {
    const args = [[1, 4, 2, 7], [0, 0, 0, 0], [9, 9, 9, 9], [0, 3, 4, 10], .1, 12];
    reference(...args); assert.equal(count, 9);
    count = 0; current(...args); assert.equal(count, 1);
  } finally { globalThis.Float64Array = Native; }
});
