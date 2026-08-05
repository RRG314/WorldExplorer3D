import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createBuildingRoadFootprintGuards } from '../app/js/world/building-road-footprint.js';

const root = process.cwd();
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');
const [buildingPass, buildingDetail, buildingBatching] = await Promise.all([
  read('app/js/world/load-building-pass.js'),
  read('app/js/world/load-building-detail.js'),
  read('app/js/world/building-batching.js')
]);

assert.ok(
  buildingPass.includes('export async function buildBuildingGeometryPass') &&
    buildingPass.includes('await createBuildingRoadFootprintGuards({') &&
    buildingPass.includes('await yieldToMainThread()'),
  'Building geometry must cooperatively yield, including road-footprint preparation.'
);
assert.ok(
  buildingDetail.includes('await options.buildBuildingGeometryPass({'),
  'Building detail publication must await complete geometry before publishing provenance.'
);
assert.ok(
  buildingBatching.includes('export async function batchNearLodBuildingMeshes') &&
    buildingBatching.includes('export async function batchMidLodBuildingMeshes') &&
    buildingBatching.includes('await yieldToMainThread()'),
  'Near and mid building batching must yield between spatial/material groups.'
);

const roads = Array.from({ length: 65 }, (_, index) => ({
  pts: [
    { x: 0, z: index * 12 },
    { x: 40, z: index * 12 }
  ],
  width: 8
}));
let observedYields = 0;
const guards = await createBuildingRoadFootprintGuards({
  roads,
  yieldEveryRoads: 32,
  yieldToMainThread: async () => { observedYields += 1; }
});
assert.equal(guards.scheduling.chunkSize, 32);
assert.equal(guards.scheduling.yieldCount, 2);
assert.equal(observedYields, 2);
assert.equal(
  guards.pointOnRoadCorridor(20, 0),
  true,
  'Chunked guard construction must retain road-corridor coverage.'
);

let longSegmentYields = 0;
const longRoadGuards = await createBuildingRoadFootprintGuards({
  roads: [{ pts: [{ x: 0, z: 0 }, { x: 2400, z: 0 }], width: 8 }],
  yieldEverySegmentSamples: 64,
  yieldToMainThread: async () => { longSegmentYields += 1; }
});
assert.ok(longRoadGuards.scheduling.segmentYieldCount > 0);
assert.equal(longRoadGuards.scheduling.segmentYieldCount, longSegmentYields);
assert.equal(longRoadGuards.pointOnRoadCore(1200, 0), true);

console.log(JSON.stringify({
  ok: true,
  roadGuardCount: roads.length,
  roadGuardYields: observedYields,
  longSegmentYields,
  message: 'Building preparation, geometry creation, and batching use awaited cooperative scheduling.'
}, null, 2));
