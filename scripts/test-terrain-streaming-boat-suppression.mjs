import assert from 'node:assert/strict';
import { createTerrainStreamingApi } from '../app/js/terrain/streaming.js';

const originalRequestIdleCallback = globalThis.requestIdleCallback;
globalThis.requestIdleCallback = (callback) => {
  callback();
  return 1;
};

const terrainGroup = {
  children: [],
  add(mesh) {
    this.children.push(mesh);
  },
  remove(mesh) {
    const index = this.children.indexOf(mesh);
    if (index >= 0) this.children.splice(index, 1);
  }
};
let suppressionCalls = 0;
const appCtx = {
  TERRAIN_RING: 1,
  TERRAIN_ZOOM: 14,
  terrainEnabled: true,
  terrainGroup,
  roads: [],
  roadsNeedRebuild: false,
  onMoon: false,
  getPerfMode: () => 'baseline',
  syncBoatTerrainSuppression() {
    suppressionCalls += 1;
    for (const mesh of terrainGroup.children) {
      mesh.userData.boatSuppressed = true;
      mesh.visible = false;
    }
  }
};
const terrainState = {
  _lastUpdatePos: { x: 0, z: 0 },
  _cachedIntersections: null,
  _lastRoadCount: 0
};

try {
  const api = createTerrainStreamingApi({
    appCtx,
    terrainState,
    ensureTerrainGroup: () => {},
    worldToLatLon: () => ({ lat: 0, lon: 0 }),
    latLonToTileXY: () => ({ x: 100, y: 200 }),
    buildTerrainTileMesh: (z, tx, ty) => ({
      key: `${z}/${tx}/${ty}`,
      userData: {},
      visible: true
    }),
    terrainTileDeps: {},
    getTerrainMeshKey: (mesh) => mesh.key,
    terrainTileMeshKey: (z, tx, ty) => `${z}/${tx}/${ty}`,
    disposeTerrainMesh: () => {},
    getOrLoadTerrainTile: () => {},
    pruneTerrainTileCache: () => null,
    requestWorldSurfaceSync: () => {},
    clearTerrainHeightCache: () => {}
  });

  api.updateTerrainAround(0, 0);

  assert.equal(terrainGroup.children.length, 9);
  assert.equal(suppressionCalls, 9, 'every asynchronously attached terrain tile must re-enter boat visibility ownership');
  assert.ok(terrainGroup.children.every((mesh) => mesh.userData.boatSuppressed && mesh.visible === false));
  console.log(JSON.stringify({
    ok: true,
    attachedTerrainTiles: terrainGroup.children.length,
    suppressionCalls
  }, null, 2));
} finally {
  if (originalRequestIdleCallback) globalThis.requestIdleCallback = originalRequestIdleCallback;
  else delete globalThis.requestIdleCallback;
}
