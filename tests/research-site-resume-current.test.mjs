import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyResearchSite } from '../app/js/campaign/research-site.js';
import { earthCoordinateFrame } from '../app/js/earth-core/coordinate-frame.js?v=1';
function course() {
  const LOC = { lat: 39.3189, lon: -76.6363 },
    SCALE = 100000,
    frame = earthCoordinateFrame(LOC, SCALE),
    points = { bed: frame.toGeographic(0, 0), bench: frame.toGeographic(9, 5) },
    site = {
      id: 'saved-portable-course',
      name: 'Portable training course',
      truthType: 'virtual-training-site',
      location: frame.toGeographic(0, 0),
      points
    };
  const runtime = {
    LOC,
    SCALE,
    METERS_PER_WORLD_UNIT: 1,
    gameStarted: true,
    worldLoading: false,
    getEnv: () => 'EARTH',
    worldPublication: { requestId: 'test-world' },
    Walk: { state: { walker: { x: 0, z: 0 } } },
    SurfaceQuery: {
      driveAt: () => ({ kind: 'terrain', position: { y: 0 }, provenance: { confidence: 1 } }),
      waterAt: () => null
    },
    buildings: [],
    dynamicBuildingColliders: [],
    roads: [],
    linearFeatures: []
  };
  return {
    runtime,
    site,
    descriptor: {
      id: site.id,
      name: site.name,
      existingSite: site,
      offsets: { bed: { x: 0, z: 0 }, bench: { x: 9, z: 5 } }
    }
  };
}
const solid = (x, z) => ({
  sourceBuildingId: 'real-solid',
  minX: x - 0.2,
  maxX: x + 0.2,
  minZ: z - 0.2,
  maxZ: z + 0.2,
  minY: 0,
  maxY: 2,
  collisionKind: 'solid',
  isInteriorCollider: true
});
test('saved course re-entry preserves conservative clearing and solid-object gates', () => {
  const c = course();
  assert.equal(qualifyResearchSite(c.runtime, c.descriptor).site, c.site);
  c.runtime.buildings = [solid(-12, 0)];
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /solid object/);
  c.runtime.buildings = [solid(0, 0)];
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /solid object/);
  c.runtime.buildings = [solid(9, 5)];
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /solid object/);
});
test('saved course retains road/path/water and unsupported-ground admission gates', () => {
  const c = course();
  c.runtime.roads = [
    {
      pts: [
        { x: -20, z: 12 },
        { x: 20, z: 12 }
      ],
      width: 4
    }
  ];
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /mapped road/);
  c.runtime.roads = [];
  c.runtime.linearFeatures = [
    {
      kind: 'path',
      pts: [
        { x: -5, z: 0 },
        { x: 15, z: 0 }
      ],
      width: 1
    }
  ];
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /walking path/);
  c.runtime.linearFeatures = [];
  c.runtime.SurfaceQuery.waterAt = () => ({ feature: {}, position: { y: 1 } });
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /Water/);
  c.runtime.SurfaceQuery.waterAt = () => null;
  c.runtime.SurfaceQuery.driveAt = () => ({
    kind: 'terrain',
    position: { y: 0 },
    provenance: { confidence: 0.1 }
  });
  assert.throws(() => qualifyResearchSite(c.runtime, c.descriptor), /enough detail/);
});
