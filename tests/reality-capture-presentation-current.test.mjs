import assert from 'node:assert/strict';
import test from 'node:test';
import { setBuildingPresentationSuppressed } from '../app/js/editable-world/runtime.js';

test('community replacement and world editing share suppression ownership safely', () => {
  const direct = { visible: true, userData: { sourceBuildingId: 'osm:1' } };
  const batched = {
    userData: {
      editableBuildingIndexRanges: [{ sourceBuildingId: 'osm:1', start: 0, count: 6 }]
    },
    geometry: {
      index: { array: new Uint32Array([0, 1, 2, 3, 4, 5]), needsUpdate: false }
    }
  };
  const appCtx = { buildingMeshes: [direct, batched], landuseMeshes: [] };
  setBuildingPresentationSuppressed(appCtx, 'osm:1', true, 'editable-world');
  setBuildingPresentationSuppressed(appCtx, 'osm:1', true, 'community-reality-capture');
  assert.equal(direct.visible, false);
  assert.deepEqual([...batched.geometry.index.array], [0, 0, 0, 3, 3, 3]);
  setBuildingPresentationSuppressed(appCtx, 'osm:1', false, 'editable-world');
  assert.equal(direct.visible, false);
  assert.deepEqual([...batched.geometry.index.array], [0, 0, 0, 3, 3, 3]);
  setBuildingPresentationSuppressed(appCtx, 'osm:1', false, 'community-reality-capture');
  assert.equal(direct.visible, true);
  assert.deepEqual([...batched.geometry.index.array], [0, 1, 2, 3, 4, 5]);
});
