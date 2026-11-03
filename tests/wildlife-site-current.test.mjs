import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyResearchSite } from '../app/js/campaign/research-site.js';
import {
  wildlifeSiteEligibility,
  wildlifeHabitatCell
} from '../app/js/campaign/wildlife-presentation.js';
import { WILDLIFE_OFFSETS } from '../app/js/campaign/wildlife-career.js';
function runtime() {
  return {
    gameStarted: true,
    worldLoading: false,
    getEnv: () => 'EARTH',
    worldPublication: { requestId: 'test' },
    LOC: { lat: 39.3189, lon: -76.6363 },
    SCALE: 100000,
    METERS_PER_WORLD_UNIT: 1.11,
    Walk: { state: { walker: { x: 0, y: 1.7, z: 0 } } },
    roads: [],
    buildings: [],
    buildingMeshes: [],
    dynamicBuildingColliders: [],
    SurfaceQuery: {
      driveAt: (x, z) => ({
        kind: 'terrain',
        position: { y: z * 0.12 },
        provenance: { confidence: 0.9 }
      }),
      waterAt: () => null
    },
    worldDiscoveryPublicationStore: {
      get: () => ({
        environment: {
          type: 'EnvironmentContextPublication',
          cells: [
            {
              cellId: 'test',
              bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
              contexts: ['park']
            }
          ]
        }
      })
    }
  };
}
test('a compatible gentle hillside admits all actual habitat footprints without flattening it', () => {
  const c = runtime(),
    result = qualifyResearchSite(c, {
      id: 'wildlife-site',
      offsets: WILDLIFE_OFFSETS,
      eligibility: wildlifeSiteEligibility
    });
  assert.ok(result.points.a);
  assert.equal(c.dynamicBuildingColliders.length, 0);
  assert.equal(result.points.a.y, result.points.a.z * 0.12);
  c.worldDiscoveryPublicationStore.get = () => ({
    environment: {
      type: 'EnvironmentContextPublication',
      cells: [
        {
          cellId: 'urban',
          bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
          contexts: ['urban-core']
        }
      ]
    }
  });
  assert.equal(wildlifeHabitatCell(c, { x: 0, z: 0 }), null);
  assert.throws(
    () =>
      qualifyResearchSite(c, {
        id: 'no-habitat',
        offsets: WILDLIFE_OFFSETS,
        eligibility: wildlifeSiteEligibility
      }),
    /mapped park/
  );
});
test('extra habitat approach space retains path, water and grade checks before acceptance', () => {
  const c = runtime(),
    reasons = [];
  c.linearFeatures = [
    {
      kind: 'footway',
      width: 2,
      pts: [
        { x: -200, z: -7 },
        { x: 200, z: -7 }
      ]
    }
  ];
  const result = qualifyResearchSite(c, {
    id: 'path-free-habitat',
    offsets: WILDLIFE_OFFSETS,
    eligibility: (runtime, input) => {
      const r = wildlifeSiteEligibility(runtime, input);
      reasons.push(r);
      return r;
    }
  });
  assert.ok(result);
  for (const id of ['a', 'b']) assert.ok(Math.abs(result.points[id].z - 7 / 1.11 + 7) * 1.11 > 2);
  const p = { a: { x: 0, z: 0, y: 0 }, b: { x: 18, z: 0, y: 0 } };
  assert.match(
    wildlifeSiteEligibility(c, { points: p, metersPerUnit: 1, ground: () => null }),
    /obstructed or wet/
  );
  assert.match(
    wildlifeSiteEligibility(c, {
      points: p,
      metersPerUnit: 1,
      ground: (x, z) => ({ x, z, y: Math.abs(z) * 2 })
    }),
    /gentler/
  );
});
