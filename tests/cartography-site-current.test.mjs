import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyCartographySite } from '../app/js/campaign/cartography-site.js';
function fixture() {
  const runtime = {
    getEnv: () => 'EARTH',
    gameStarted: true,
    worldLoading: false,
    worldPublication: { requestId: 'fixture' },
    METERS_PER_WORLD_UNIT: 1,
    LOC: { lat: 39, lon: -76 },
    SCALE: 111000,
    Walk: { state: { walker: { x: 0, y: 0, z: 0 } } },
    SurfaceQuery: {
      walkAt: (x, z) => ({ kind: 'footway', position: { x, y: 0.01 * x, z } }),
      waterAt: () => null,
    },
    buildingEntranceCatalog: {
      entrances: [
        {
          id: 'door-001',
          buildingSourceId: 'building-1',
          approachX: 5,
          approachZ: 8,
          provenance: 'inferred',
        },
      ],
    },
  };
  const feature = {
      sourceFeatureId: 'way:1',
      kind: 'footway',
      name: 'Loaded way',
      pts: [
        { x: 0, z: 0 },
        { x: 80, z: 0 },
      ],
    },
    deps = {
      features: [feature],
      collision: () => ({ collision: false }),
      route: (x, z, tx, tz) => ({
        distance: Math.hypot(tx - x, tz - z),
        points: [
          { x, z },
          { x: tx, z: tz },
        ],
        startAnchor: { feature },
        endAnchor: { feature },
      }),
    },
    input = {
      id: 'survey-fixture',
      name: 'Virtual route',
      location: { lat: 39, lon: -76 },
      variantId: 'campaign',
    };
  return { runtime, deps, input };
}
test('route admission retains actual network sources and rechecks saved points without moving them', () => {
  const { runtime, deps, input } = fixture(),
    q = qualifyCartographySite(runtime, input, deps);
  assert.equal(q.site.plan.legs[0].sources[0].id, 'way:1');
  assert.equal(q.site.plan.realAccess, 'unverified');
  assert.equal(q.site.plan.entry.provenance, 'inferred');
  const reopened = qualifyCartographySite(runtime, { ...input, existingSite: q.site }, deps);
  assert.deepEqual(reopened.site, q.site);
  runtime.SurfaceQuery.waterAt = () => ({ feature: {}, position: { y: 10 } });
  assert.throws(
    () => qualifyCartographySite(runtime, { ...input, existingSite: q.site }, deps),
    /saved route is not supported/
  );
});
test('missing network, solid obstruction and steep loaded support cannot be replaced by straight-line offers', () => {
  for (const mutate of [
    (f) => (f.deps.route = () => null),
    (f) => (f.deps.collision = () => ({ collision: true })),
    (f) =>
      (f.runtime.SurfaceQuery.walkAt = (x, z) => ({
        kind: 'terrain',
        position: { x, y: x * 2, z },
      })),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(
      () => qualifyCartographySite(f.runtime, f.input, f.deps),
      /No short connected survey/
    );
  }
});
test('an excessively long network detour cannot admit a leg beyond the bounded walking recorder', () => {
  const f = fixture(),
    feature = f.deps.features[0];
  f.deps.route = (x, z, tx, tz) => {
    const points = [
        { x, z },
        { x, z: z + 100 },
        { x: tx, z: z + 100 },
        { x: tx, z: tz },
      ],
      distance = points
        .slice(1)
        .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
    return { points, distance, startAnchor: { feature }, endAnchor: { feature } };
  };
  assert.throws(
    () => qualifyCartographySite(f.runtime, f.input, f.deps),
    /No short connected survey/
  );
});
