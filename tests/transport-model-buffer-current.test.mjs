import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTransportSurfaceModel as current, attachCompiledTransportSurface,
  packCompiledTransportSurfaces, sampleTransportSurfaceAtDistance} from '../app/js/world/compiler/transport-surface-model.js';
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

function profileFeature(index, length = 30 + index % 70) {
  const feature = {id: `storage-${index}`, width: 7,
    pts: [{x: 0, z: index}, {x: length, z: index + 4}],
    structureSemantics: {terrainMode: ['at_grade', 'elevated', 'subgrade'][index % 3]}};
  return attachCompiledTransportSurface(feature, current(feature, (x, z) => 12 + x * .01 + z * .001));
}

test('final profile chunks preserve every field, sampling, aliases and older snapshots', () => {
  const features = Array.from({length: 640}, (_, index) => profileFeature(index));
  const originals = features.map(feature => feature.transportSurfaceModel);
  originals[0].leftGround[0] = -0;
  const serialized = JSON.stringify(originals);
  const stats = packCompiledTransportSurfaces(features);
  assert.equal(stats.profiles, features.length);
  assert.ok(stats.buffers < features.length / 20);
  assert.ok(stats.storageBytes >= stats.sourceBytes);
  assert.ok(stats.storageBytes < stats.sourceBytes + features.length * 8);
  for (const [index, feature] of features.entries()) {
    const next = feature.transportSurfaceModel, prior = originals[index];
    assert.notEqual(next, prior);
    assert.ok(Object.isFrozen(next));
    assert.equal(next.stats, prior.stats);
    assert.deepEqual(next, prior);
    assert.equal(feature.surfaceDistances, next.distances);
    assert.equal(feature.surfaceHeights, next.centerHeights);
    assert.equal(feature.surfaceOffsets, next.offsets);
    for (const field of Object.keys(prior).filter(key => ArrayBuffer.isView(prior[key]))) {
      assert.deepEqual(Buffer.from(next[field].buffer, next[field].byteOffset, next[field].byteLength),
        Buffer.from(prior[field].buffer, prior[field].byteOffset, prior[field].byteLength));
    }
    for (const distance of [0, 7.3, 18, 120]) for (const lateral of [-4, 0, 4]) {
      assert.equal(sampleTransportSurfaceAtDistance(next, distance, lateral), sampleTransportSurfaceAtDistance(prior, distance, lateral));
    }
    assert.ok(next.distances.buffer.byteLength <= 256 * 1024);
  }
  assert.equal(JSON.stringify(features.map(feature => feature.transportSurfaceModel)), serialized);
  const neighborBefore = Array.from(features[1].surfaceHeights);
  features[0].surfaceHeights[0] += 9;
  assert.equal(sampleTransportSurfaceAtDistance(features[0].transportSurfaceModel, 0), features[0].surfaceHeights[0]);
  assert.deepEqual(Array.from(features[1].surfaceHeights), neighborBefore);
  assert.equal(JSON.stringify(originals), serialized, 'Previously published snapshots are not detached or changed');
});

test('profile chunk publication preserves duplicate identities, foreign models and repeated calls', () => {
  const first = profileFeature(1), shared = {...first}, other = profileFeature(2);
  const foreign = {...other, transportSurfaceModel: structuredClone(other.transportSurfaceModel)};
  const priorForeign = foreign.transportSurfaceModel;
  assert.equal(packCompiledTransportSurfaces([first, first, shared, other, foreign, null]).profiles, 2);
  assert.equal(first.transportSurfaceModel, shared.transportSurfaceModel);
  assert.equal(first.surfaceHeights, shared.surfaceHeights);
  assert.equal(foreign.transportSurfaceModel, priorForeign);
  const before = first.transportSurfaceModel;
  assert.deepEqual(packCompiledTransportSurfaces([first, shared, other]), {profiles: 0, buffers: 0, sourceBytes: 0, storageBytes: 0});
  assert.equal(first.transportSurfaceModel, before);
  // A later real recompilation receives its own publication and must not
  // overwrite the prior world's still-referenced road or its neighboring view.
  const newModel = current(first, () => 28);
  attachCompiledTransportSurface(first, newModel);
  packCompiledTransportSurfaces([first, other]);
  assert.deepEqual(first.transportSurfaceModel, newModel);
  assert.equal(shared.transportSurfaceModel, before);
});

test('oversized road profiles keep exact values without retaining neighboring roads', () => {
  const features = [profileFeature(0), profileFeature(1, 50000), profileFeature(2)];
  const before = features.map(feature => feature.transportSurfaceModel);
  assert.ok(before[1].distances.buffer.byteLength > 256 * 1024);
  const stats = packCompiledTransportSurfaces(features);
  assert.equal(stats.buffers, 3);
  assert.deepEqual(features.map(feature => feature.transportSurfaceModel), before);
  assert.equal(new Set(features.map(feature => feature.surfaceDistances.buffer)).size, 3);
});
