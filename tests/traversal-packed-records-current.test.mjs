import test from 'node:test';
import assert from 'node:assert/strict';
import {packTraversalNodes, packTraversalSegments, readTraversalSegment, materializeTraversalSegments} from '../app/js/world/traversal-graph-storage.js';
import {createTraversalSegmentIndex} from '../app/js/world/traversal-segment-index.js';
import {findNearestTraversalFeature, invalidateTraversalNetworks} from '../app/js/world/traversal.js';
import {compilePedestrianGraph, compileTrafficGraph} from '../app/js/living-world/navigation-graphs.js';
import {ctx} from '../app/js/shared-context.js?v=55';

function network(count) {
  let seed = 149;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({length: count}, (_, i) => {
    const p1 = {x: (i % 64) * 64 + random(), z: Math.floor(i / 64) * 64 + random()};
    const p2 = {x: p1.x + 40 + random() * 25, z: p1.z + (random() - .5) * 40};
    const feature = {kind: 'road', networkKind: 'road', type: 'residential', highway: 'residential',
      sourceFeatureId: `fixture:road:${i}`, width: 12, driveable: true, pts: [p1, p2]};
    return {feature, direction: ['both', 'forward', 'reverse'][i % 3], segIndex: i % 7,
      sourceTStart: i % 11 ? random() * .2 : -0, sourceTEnd: .8 + random() * .2,
      fromId: i * 2, toId: i * 2 + 1, p1, p2, length: Math.hypot(p2.x - p1.x, p2.z - p1.z),
      penalty: i % 2 ? .92 : 1.08};
  });
}

test('packed navigation retains exact numeric facts and original endpoint/feature ownership', () => {
  const rows = network(4096), packed = packTraversalSegments(rows), scratch = {};
  assert.equal(packed.length, rows.length);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(readTraversalSegment(packed, i, scratch), scratch);
    assert.deepEqual(scratch, rows[i]);
    assert.equal(scratch.p1, rows[i].p1);
    assert.equal(scratch.p2, rows[i].p2);
    assert.equal(scratch.feature, rows[i].feature);
  }
  const first = readTraversalSegment(packed, 0), second = readTraversalSegment(packed, 1);
  assert.notEqual(first, second);
  assert.deepEqual(first, rows[0]);
  rows[0].p1.y = 13.5; rows[0].feature.name = 'Updated road';
  assert.equal(first.p1.y, 13.5);
  assert.equal(first.feature.name, 'Updated road');
  assert.deepEqual(materializeTraversalSegments(packed), rows);
  const points = rows.flatMap(row => [row.p1, row.p2]);
  points.push({x: -0, z: Math.PI});
  const coordinates = packTraversalNodes(points);
  assert.deepEqual(Array.from(coordinates), points.flatMap(point => [point.x, point.z]));
  assert.equal(readTraversalSegment(packed, -1), undefined);
  assert.equal(readTraversalSegment(packed, packed.length), undefined);
  assert.throws(() => packTraversalSegments([{...rows[0], fromId: 2 ** 32}]), /invalid traversal/);
});

test('packed regional lookup preserves every candidate, exact selection, ties and road exclusion', () => {
  const previous = ctx.traversalNetworks;
  const rows = network(3000), packed = packTraversalSegments(rows);
  const a = createTraversalSegmentIndex(rows), b = createTraversalSegmentIndex(packed);
  const queries = [[64, 64, 0], [-64, -64, 0], [0, 0, 1e6], ...Array.from({length: 200}, (_, i) => [(i * 131) % 4000, (i * 257) % 3000, 4 + (i % 30)])];
  try {
    for (const [x, z, radius] of queries) {
      assert.deepEqual(b.query(x, z, radius), a.query(x, z, radius));
      for (const mode of ['walk', 'drive']) {
        const options = {mode, maxDistance: radius, excludeRoads: radius === 0};
        ctx.traversalNetworks = {walk: {segments: rows}, drive: {segments: rows}};
        const expected = findNearestTraversalFeature(x, z, options);
        ctx.traversalNetworks = {walk: {segments: packed}, drive: {segments: packed}};
        assert.deepEqual(findNearestTraversalFeature(x, z, options), expected);
      }
    }
  } finally {
    invalidateTraversalNetworks(); ctx.traversalNetworks = previous;
  }
});

test('pedestrians and traffic receive the same routes and source references from packed regional data', () => {
  const rows = network(160), packed = packTraversalSegments(rows);
  for (const compile of [compilePedestrianGraph, compileTrafficGraph]) {
    const options = {tier: 'balanced', sampleSurface: () => 4, activityAnchors: []};
    const expected = compile({...options, traversal: {segments: rows}});
    const actual = compile({...options, traversal: {segments: packed}});
    assert.ok(expected.publication.edges.length > 0);
    assert.deepEqual(actual.publication, expected.publication);
    assert.deepEqual([...actual.runtimeFeatureByEdge], [...expected.runtimeFeatureByEdge]);
  }
});
