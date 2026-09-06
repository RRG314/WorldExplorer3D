import assert from 'node:assert/strict';
import test from 'node:test';

import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import { validateRoadTerrainConformance } from '../app/js/terrain/debug-tools.js';

function meshFromPoints(points, userData = {}) {
  return {
    position: { x: 0, y: 0, z: 0 },
    userData,
    geometry: {
      attributes: {
        position: {
          count: points.length,
          getX: (index) => points[index][0],
          getY: (index) => points[index][1],
          getZ: (index) => points[index][2]
        }
      }
    }
  };
}

test('published batched road meshes are audited without legacy roadIdx metadata', () => {
  const previous = {
    onMoon: appCtx.onMoon,
    roadMeshes: appCtx.roadMeshes,
    roads: appCtx.roads,
    terrainEnabled: appCtx.terrainEnabled
  };
  try {
    appCtx.onMoon = false;
    appCtx.terrainEnabled = true;
    appCtx.roads = [{ id: 'mapped-road' }];
    appCtx.roadMeshes = [
      meshFromPoints([
        [0, 0.18, 0],
        [1, -0.2, 0],
        [2, 0.25, 0]
      ], { isRoadBatch: true, roadBatchIndex: 0 }),
      meshFromPoints([[0, -20, 0]], { isRoadBatch: true, isRoadMarking: true })
    ];

    const result = validateRoadTerrainConformance({
      terrainMeshHeightAt: () => 0,
      worldToLatLon: (x, z) => ({ lat: x, lon: z })
    });

    assert.equal(result.totalSamples, 3);
    assert.equal(result.issuesFound, 1);
    assert.equal(result.minimumDelta, -0.2);
    assert.equal(result.worstDeltas[0].batchIndex, 0);
  } finally {
    appCtx.onMoon = previous.onMoon;
    appCtx.roadMeshes = previous.roadMeshes;
    appCtx.roads = previous.roads;
    appCtx.terrainEnabled = previous.terrainEnabled;
  }
});
