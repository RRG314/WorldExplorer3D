import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTransportSurfaceModel} from '../app/js/world/compiler/transport-surface-model.js';
import {compileTunnelSystemModel} from '../app/js/world/compiler/tunnel-system-model.js';
import {collectTunnelVisualInstances} from '../app/js/terrain/structure-tunnel-visuals.js';
import {createPortalSurfaceClipper} from '../app/js/terrain/portal-surface-clip.js';

function fixture() {
  const feature = {width: 8, pts: [{x: 0, z: 0}, {x: 0, z: 120}],
    structureSemantics: {terrainMode: 'subgrade', structureKind: 'tunnel', isTunnel: true, cutDepth: 4.6},
    transportRecord: {completeness: 'lossless', routeState: 'complete', safeForDriving: true},
    connectedFeatures: {start: [], end: [{feature: {structureSemantics: {terrainMode: 'at_grade'}}}]}};
  feature.transportSurfaceModel = compileTransportSurfaceModel(feature, () => 20);
  const floor = feature.transportSurfaceModel.centerHeights[0];
  const terrain = (x, z) => z > 98 && Math.abs(x) > 4 ? floor : 20;
  const limit = {source: 'mapped-surface-road', sourceFeatureId: 'upper-road', start: 97, end: 112, maximumSurfaceY: floor + .1};
  return {feature, floor, terrain, limit};
}

function publication(feature, terrain) {
  feature.tunnelSystemModel = compileTunnelSystemModel(feature, terrain);
  return collectTunnelVisualInstances(feature, feature.pts, 120, {
    sampleTerrainHeight: terrain,
    samplePointAlongPolyline: (_points, distance) => ({x: 0, z: distance, tangentX: 0, tangentZ: 1})
  });
}

test('a low roadside edge cannot place a tunnel portal through a protected surface crossing', () => {
  const {feature, terrain, limit} = fixture();
  const originalFloor = feature.transportSurfaceModel.centerHeights.slice();
  const street = Float32Array.from([-20, 20, 99, 20, 20, 99, -20, 20, 111, 20, 20, 111]);
  const triangles = Uint32Array.from([0, 2, 1, 1, 2, 3]);
  const before = publication(feature, terrain);
  assert.ok(feature.tunnelSystemModel.shellEnd < limit.end);
  assert.notEqual(createPortalSurfaceClipper(before.portalMasks)(street, triangles).positions, street,
    'the fixture must reproduce the former upper-street excavation');
  feature.tunnelObstructionLimits = [limit];
  const after = publication(feature, terrain);
  assert.ok(feature.tunnelSystemModel.shellEnd >= limit.end + .02);
  const retained = createPortalSurfaceClipper(after.portalMasks)(street, triangles);
  assert.equal(retained.positions, street, 'upper pavement and its collision triangles remain intact');
  assert.equal(retained.indices, triangles);
  assert.deepEqual(feature.transportSurfaceModel.centerHeights, originalFloor, 'portal publication cannot change driving grades');
  assert.ok(after.shells.length > 0 && after.portalMasks.length > 0, 'the liner and real exterior exit remain published');
});

test('invalid or infeasible roof constraints cannot extend a tunnel shell', () => {
  for (const variant of ['building', 'invalid', 'above-ceiling', 'interior-knot']) {
    const {feature, floor, terrain, limit} = fixture();
    const before = compileTunnelSystemModel(feature, terrain);
    const changed = {...limit};
    if (variant === 'building') delete changed.source;
    if (variant === 'invalid') changed.maximumSurfaceY = NaN;
    if (variant === 'above-ceiling') changed.maximumSurfaceY = floor - 1;
    if (variant === 'interior-knot') {
      const index = [...feature.transportSurfaceModel.distances].findIndex(d => d > 100 && d < 110);
      assert.ok(index > 0); feature.transportSurfaceModel.centerHeights[index] = floor + 1;
    }
    feature.tunnelObstructionLimits = [changed];
    const after = compileTunnelSystemModel(feature, terrain);
    assert.ok(after.shellEnd <= before.shellEnd + 1e-5, variant);
  }
});

test('roof ranges stay bounded and cannot create an above-ground tube without an existing covered bore', () => {
  const {feature, floor, limit} = fixture();
  feature.tunnelObstructionLimits = [limit];
  assert.equal(compileTunnelSystemModel(feature, () => 20).shellEnd, 120,
    'an internal crossing cannot shorten a naturally covered bore');
  feature.tunnelObstructionLimits = [{...limit, start: -10, end: 140}];
  const bounded = compileTunnelSystemModel(feature, () => 20);
  assert.equal(bounded.shellStart, 0); assert.equal(bounded.shellEnd, 120);
  const exposed = compileTunnelSystemModel(feature, () => floor);
  assert.deepEqual(exposed.shellRanges, []);
});
