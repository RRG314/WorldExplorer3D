import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTransportSurfaceModel as current} from '../app/js/world/compiler/transport-surface-model.js';
import {compileTransportSurfaceModel as reference} from './fixtures/transport-model-before-buffer-packing.js';

test('packed model buffers preserve all profiles, metadata and independent field writes', () => {
  for (const mode of ['at_grade', 'elevated', 'subgrade']) for (let trial = 0; trial < 24; trial++) {
    const feature = {
      sourceFeatureId: `parity-${mode}-${trial}`, width: 5 + trial % 8,
      pts: Array.from({length: 2 + trial % 11}, (_, i) => ({x: i * 9, z: Math.sin(i * .7) * 3})),
      structureSemantics: {terrainMode: mode, isTunnel: mode === 'subgrade'},
      structureTransitionAnchors: []
    };
    const ground = (x, z) => 15 + .02 * x + .04 * z + Math.sin(x * .09 + trial) * .5;
    const actual = current(feature, ground), expected = reference(feature, ground);
    assert.deepEqual(actual, expected);
    const fields = ['distances','pathDistances','groundHeights','offsets','leftGround','rightGround','centerHeights','leftHeights','rightHeights'];
    const before = Object.fromEntries(fields.map(key => [key, Array.from(actual[key])]));
    actual.groundHeights[0] += 10;
    for (const key of fields.filter(key => key !== 'groundHeights')) assert.deepEqual(Array.from(actual[key]), before[key]);
    assert.equal(actual.groundHeights.buffer, actual.offsets.buffer);
    assert.equal(actual.leftHeights.buffer, actual.rightHeights.buffer);
    assert.equal(new Set(fields.map(key => actual[key].buffer)).size, 1);
    assert.ok(actual.distances instanceof Float64Array);
    for (const key of fields.filter(key => key !== 'distances')) assert.ok(actual[key] instanceof Float32Array);
    const ranges=fields.map(key=>[actual[key].byteOffset,actual[key].byteOffset+actual[key].byteLength]).sort((a,b)=>a[0]-b[0]);
    for(let i=1;i<ranges.length;i++)assert.equal(ranges[i][0],ranges[i-1][1],'Fields occupy disjoint contiguous storage');
    assert.deepEqual(structuredClone(actual).rightHeights, actual.rightHeights);
  }
});
