import assert from 'node:assert/strict';
import test from 'node:test';
import { setBuildingPresentationSuppressed } from '../app/js/editable-world/runtime.js';
import { applyCaptureAlignment, captureBuildingContext } from '../app/js/reality-capture/alignment.js';

test('review and runtime share origin-relative placement, not model recentering', () => {
  const vector = () => ({ set(...values) { this.values = values; }, setScalar(value) { this.values = [value, value, value]; } });
  const root = { position: vector(), scale: vector(), rotation: { y: 0 } };
  applyCaptureAlignment(root, { positionOffset: { x: 2, y: 3, z: -1 }, scale: 2, rotationYDegrees: 90 }, { x: 100, y: 5, z: 200 });
  assert.deepEqual(root.position.values, [102, 8, 199]);
  assert.deepEqual(root.scale.values, [2, 2, 2]);
  assert.equal(root.rotation.y, Math.PI / 2);
  const context = captureBuildingContext({ centerX: 100, centerZ: 200,
    pts: [{ x: 98, z: 198 }, { x: 102, z: 198 }, { x: 102, z: 202 }],
    buildingProvenance: { fields: { heightMeters: { value: 9, status: 'inferred' } } }
  }, { x: 100, z: 198 });
  assert.deepEqual(context.footprint[0], { x: -2, z: -2 });
  assert.deepEqual(context.entrance, { x: 0, z: -2 });
  assert.equal(context.height.evidence, 'inferred');
});

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
