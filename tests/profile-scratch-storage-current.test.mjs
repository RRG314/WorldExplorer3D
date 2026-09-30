import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloat64ScratchAllocator} from '../scripts/verification/profile-scratch-experiment.mjs';

test('scratch pages preserve zero fill, values and old views across rollover and oversized profiles', () => {
  const allocate = createFloat64ScratchAllocator(16);
  const first = allocate([1, -0, NaN, Infinity]);
  const second = allocate(5);
  assert.equal(first.buffer, second.buffer);
  second.fill(29);
  const mapped = allocate([2, 3], (n, i) => n * 2 + i);
  const rollover = allocate(12);
  assert.notEqual(first.buffer, rollover.buffer);
  assert.deepEqual([...rollover], Array(12).fill(0));
  assert.deepEqual([...first], [1, -0, NaN, Infinity]);
  assert.deepEqual([...mapped], [4, 7]);
  const large = allocate(Array(40).fill(91));
  assert.equal(large.buffer.byteLength, 320);
  assert.deepEqual([...large], Array(40).fill(91));
  assert.deepEqual([...allocate(3)], [0, 0, 0]);
  assert.deepEqual([...second], Array(5).fill(29));
});
