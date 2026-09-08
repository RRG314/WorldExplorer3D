import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTransportSurfaceModel } from '../app/js/world/compiler/transport-surface-model.js';
import { compileTunnelSystemModels, compileTunnelSystemModel } from '../app/js/world/compiler/tunnel-system-model.js';
import { tunnelWallIsOpen } from '../app/js/world/compiler/tunnel-junction-openings.js';
import { shouldPublishTunnelShellSection, portalCopingHeight } from '../app/js/terrain/structure-visual-meshes.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import { sampleStructureAssemblyThicknessAt } from '../app/js/world/compiler/transport-structure-assembly.js';
import { buildTransportJunctionProfileAnchors } from '../app/js/world/compiler/transport-junction-profile.js';
import { sampleFeatureSurfaceY } from '../app/js/structure-semantics.js';

test('portal coping follows cross-slope locally without shrinking the clearance arch',()=>{
  assert.equal(portalCopingHeight(4.8,3),4.8);
  assert.equal(portalCopingHeight(4.8,12),12.08);
  assert.equal(portalCopingHeight(4.8,NaN),4.8);
  const terrain=[12,9,5,3,2];
  const heights=terrain.map(y=>portalCopingHeight(4.8,y));
  assert.deepEqual(heights,[12.08,9.08,5.08,4.8,4.8]);
});

function road(id, pts, layer = -1) {
  const result = { sourceFeatureId: id, width: 8, pts,
    structureSemantics: { terrainMode: 'subgrade', structureKind: 'tunnel', isTunnel: true, layer, cutDepth: 4.6 },
    transportRecord: { completeness: 'lossless', routeState: 'complete', safeForDriving: true },
    connectedFeatures: { start: [], end: [] } };
  result.transportSurfaceModel = compileTransportSurfaceModel(result, () => 20);
  return result;
}
function junction() {
  const south = road('south', [{ x: 0, z: -60 }, { x: 0, z: 0 }]);
  const north = road('north', [{ x: 0, z: 0 }, { x: 0, z: 60 }]);
  const east = road('east', [{ x: 0, z: 0 }, { x: 60, z: 0 }]);
  south.connectedFeatures.end = [north, east].map(feature => ({ feature }));
  north.connectedFeatures.start = [south, east].map(feature => ({ feature }));
  east.connectedFeatures.start = [south, north].map(feature => ({ feature }));
  compileTunnelSystemModels([south, north, east], () => 20);
  return { south, north, east };
}

test('T junction opens the branch-facing wall, not the opposite wall or a broad cutback', () => {
  const { south } = junction();
  assert.equal(tunnelWallIsOpen(south.tunnelSystemModel, -1, 59), true);
  assert.equal(tunnelWallIsOpen(south.tunnelSystemModel, 1, 59), false);
  assert.equal(tunnelWallIsOpen(south.tunnelSystemModel, -1, 50), false);
  assert.equal(shouldPublishTunnelShellSection(south.tunnelSystemModel, 0, 59), false);
  assert.equal(shouldPublishTunnelShellSection(south.tunnelSystemModel, 5, 59), true);
  const walls = compileStructureColliderDescriptors([south]);
  assert.ok(walls.some(wall => wall.maxX < 0 && wall.maxZ > -2));
  assert.equal(walls.some(wall => wall.minX > 0 && wall.maxZ > -2), false);
});

test('another layer or an unconnected crossing cannot carve an underground wall', () => {
  const { south, north, east } = junction();
  east.structureSemantics.layer = -2;
  compileTunnelSystemModels([south, north, east], () => 20);
  assert.equal(tunnelWallIsOpen(south.tunnelSystemModel, -1, 59), false);
  east.structureSemantics.layer = -1;
  south.connectedFeatures.end = [{ feature: north }];
  compileTunnelSystemModels([south, north, east], () => 20);
  assert.equal(tunnelWallIsOpen(south.tunnelSystemModel, -1, 59), false);
});

test('bridge presentation retains the compiler taper instead of restoring full deck depth', () => {
  const assembly = { baseThickness: 1, surfaceSamples: [
    { x: 0, z: 0, thickness: 0.08 }, { x: 0, z: 10, thickness: 1 }, { x: 0, z: 20, thickness: 0.08 }
  ] };
  assert.equal(sampleStructureAssemblyThicknessAt(assembly, 2, 0), 0.08);
  assert.equal(sampleStructureAssemblyThicknessAt(assembly, 2, 10), 1);
  assert.ok(Math.abs(sampleStructureAssemblyThicknessAt(assembly, 2, 5) - 0.54) < 1e-6);
});

test('a linked branch that loops back cannot open distant walls on one long segment', () => {
  const main = road('main', [{ x: 0, z: 0 }, { x: 0, z: 200 }]);
  const loop = road('loop', [{ x: 0, z: 0 }, { x: 40, z: 0 },
    { x: 40, z: 150 }, { x: -40, z: 150 }]);
  main.connectedFeatures.start = [{ feature: loop }];
  loop.connectedFeatures.start = [{ feature: main }];
  compileTunnelSystemModels([main, loop], () => 20);
  assert.equal(tunnelWallIsOpen(main.tunnelSystemModel, -1, 1), true);
  assert.equal(tunnelWallIsOpen(main.tunnelSystemModel, -1, 150), false);
  assert.equal(tunnelWallIsOpen(main.tunnelSystemModel, 1, 150), false);
});

test('an internal terrain dip cannot tear a hole in a mapped tunnel lining', () => {
  const feature = road('continuous', [{ x: 0, z: 0 }, { x: 0, z: 120 }]);
  const model = compileTunnelSystemModel(feature, (_x, z) => z > 35 && z < 65 ? 16 : 20);
  assert.deepEqual(model.shellRanges, [{ start: 0, end: 120 }]);
  assert.deepEqual(model.portalDistances, [], 'a DEM dip is not a new mapped portal');
  const uncovered = compileTunnelSystemModel(feature, () => 16);
  assert.equal(uncovered.shellRanges.length, 0, 'do not invent a tube on an entirely uncovered way');
});

test('a wholly generalized tunnel junction receives the same canonical height constraint on every branch', () => {
  const { south, north } = junction();
  south.transportRecord.completeness = north.transportRecord.completeness = 'generalized';
  south.transportGraphRef = { featureId: 'south' };
  north.transportGraphRef = { featureId: 'north' };
  for (const heights of [north.transportSurfaceModel.centerHeights, north.transportSurfaceModel.leftHeights,
    north.transportSurfaceModel.rightHeights]) for (let i = 0; i < heights.length; i++) heights[i] += 0.43;
  const graph = { connections: [{
    left: { featureId: 'south', endpoint: 'end', distanceAlong: 60, point: { x: 0, z: 0 }, segmentIndex: 0, segmentT: 1 },
    right: { featureId: 'north', endpoint: 'start', distanceAlong: 0, point: { x: 0, z: 0 }, segmentIndex: 0, segmentT: 0 }
  }] };
  const result = buildTransportJunctionProfileAnchors([south, north], graph, () => 20, sampleFeatureSurfaceY);
  assert.equal(result.constrainedFeatureCount, 2);
  assert.equal(result.anchorsByFeature.get(south)[0].targetSurfaceY, result.anchorsByFeature.get(north)[0].targetSurfaceY);
  for (const feature of [south, north]) {
    feature.structureTransitionAnchors = result.anchorsByFeature.get(feature);
    feature.transportSurfaceModel = compileTransportSurfaceModel(feature, () => 20);
  }
  assert.ok(Math.abs(sampleFeatureSurfaceY(south, 0, 0) - sampleFeatureSurfaceY(north, 0, 0)) < 0.01);
  north.transportRecord.completeness = 'lossless';
  const mixed = buildTransportJunctionProfileAnchors([south, north], graph, () => 20, sampleFeatureSurfaceY);
  assert.equal(mixed.anchorsByFeature.has(south), false, 'never carry exact elevations into a generalized duplicate');
});
