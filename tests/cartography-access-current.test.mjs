import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCartographyAccess } from '../app/js/campaign/cartography-access.js';
test('entrance access uses the catalog sourceBuildingId and existing entry owner, retaining unavailable distinctions', () => {
  const building = { sourceBuildingId: 'overture:building-1', id: 'different-id', pts: [] },
    entry = { id: 'entrance-1', buildingSourceId: building.sourceBuildingId },
    qualified = {
      metersPerUnit: 1,
      points: { entry: { x: 0, y: 0, z: 0 }, b: { x: 10, y: 0, z: 0 } },
    },
    active = {
      site: { id: 'route-1', plan: { entry: { ...entry, provenance: 'inferred' } } },
      runId: 'run-1',
    };
  let mode = true,
    calls = 0;
  const runtime = {
    LOC: { lat: 39, lon: -76 },
    SCALE: 111000,
    buildings: [building],
    buildingEntranceCatalog: { entrances: [entry] },
    SurfaceQuery: { walkAt: (x, z) => ({ kind: 'path', position: { x, y: x * 0.02, z } }) },
    resolveBuildingEntrySupport(b, options) {
      assert.equal(b, building);
      assert.deepEqual(options, { allowSynthetic: false });
      calls++;
      return { enterable: mode, reason: 'owner_reason' };
    },
  };
  const r = inspectCartographyAccess(runtime, qualified, active);
  assert.equal(calls, 1);
  assert.equal(r.entrySupport, 'enterable');
  assert.equal(r.resolvedBuildingId, building.sourceBuildingId);
  assert.equal(r.entranceProvenance, 'inferred');
  assert.equal(r.samples.length, 5);
  assert.ok(Math.abs(r.maxGrade - 0.02) < 1e-6);
  assert.equal(r.crossingMapped, false);
  assert.doesNotMatch(r.entryReason, /owner_reason|not established/);
  mode = false;
  assert.equal(inspectCartographyAccess(runtime, qualified, active).entrySupport, 'exterior-only');
  runtime.buildings = [];
  assert.equal(inspectCartographyAccess(runtime, qualified, active).entrySupport, 'unknown');
  assert.equal(calls, 2);
});
