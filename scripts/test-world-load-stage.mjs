import assert from 'node:assert/strict';
import { WORLD_COLLECTION_NAMES } from '../app/js/world/collection-registry.js';
import { beginWorldLoadStage } from '../app/js/world/load-stage.js';
import { restoreWorldRuntimeAfterRollback } from '../app/js/world/load-rollback.js';

function disposableMesh(name) {
  const state = { disposedGeometry: 0, disposedMaterial: 0, removed: 0 };
  return {
    name,
    state,
    parent: {
      remove() {
        state.removed += 1;
      }
    },
    traverse(visitor) {
      visitor({
        geometry: { dispose: () => { state.disposedGeometry += 1; } },
        material: { dispose: () => { state.disposedMaterial += 1; } },
        userData: {}
      });
    }
  };
}

function createHarness() {
  const context = {};
  const previousCollections = {};
  WORLD_COLLECTION_NAMES.forEach((name) => {
    previousCollections[name] = [`previous:${name}`];
    context[name] = previousCollections[name];
  });
  const sceneStages = [];
  context.replaceWorldCollection = (name, next = []) => {
    context[name] = next;
    return next;
  };
  context.createEarthSceneStage = () => {
    let status = 'active';
    const stage = {
      commit() {
        if (status !== 'active') return false;
        status = 'committed';
        return true;
      },
      rollback() {
        if (status !== 'active') return false;
        status = 'rolled-back';
        return true;
      },
      status: () => status
    };
    sceneStages.push(stage);
    return stage;
  };
  return { context, previousCollections, sceneStages };
}

class FakeTerrainGroup {
  constructor() {
    this.children = [];
    this.parent = null;
    this.userData = {};
  }

  add(child) {
    child.parent?.remove?.(child);
    this.children.push(child);
    child.parent = this;
  }

  remove(child) {
    this.children = this.children.filter((entry) => entry !== child);
    if (child?.parent === this) child.parent = null;
  }
}

const rollbackHarness = createHarness();
const rollbackStage = beginWorldLoadStage(rollbackHarness.context, { label: 'rollback-test' });
WORLD_COLLECTION_NAMES.forEach((name) => {
  assert.notEqual(rollbackHarness.context[name], rollbackHarness.previousCollections[name]);
  assert.deepEqual(rollbackHarness.context[name], []);
});
const stagedRoadMesh = disposableMesh('staged-road');
rollbackHarness.context.roadMeshes.push(stagedRoadMesh);
assert.equal(rollbackStage.rollback('provider-failed'), true);
assert.equal(rollbackStage.rollback('duplicate'), false);
WORLD_COLLECTION_NAMES.forEach((name) => {
  assert.equal(rollbackHarness.context[name], rollbackHarness.previousCollections[name]);
});
assert.equal(stagedRoadMesh.state.disposedGeometry, 1);
assert.equal(stagedRoadMesh.state.disposedMaterial, 1);
assert.equal(rollbackHarness.sceneStages[0].status(), 'rolled-back');
assert.equal(rollbackHarness.context.lastWorldLoadStage.status, 'rolled-back');
assert.equal(rollbackHarness.context.lastWorldLoadStage.reason, 'provider-failed');

const terrainHarness = createHarness();
const priorTerrainGroup = new FakeTerrainGroup();
const priorTerrainMesh = { name: 'prior-terrain' };
priorTerrainGroup.add(priorTerrainMesh);
const scene = new FakeTerrainGroup();
scene.add(priorTerrainGroup);
let terrainResetCalls = 0;
const disposedTerrain = [];
Object.assign(terrainHarness.context, {
  LOC: { lat: 39.2904, lon: -76.6122 },
  car: { x: 18, y: 2, z: -14, vx: 1, vy: 0, vz: 2 },
  disposeTerrainMesh: (mesh) => disposedTerrain.push(mesh),
  resetTerrainStreamingState: () => { terrainResetCalls += 1; },
  scene,
  terrainGroup: priorTerrainGroup
});
const terrainStage = beginWorldLoadStage(terrainHarness.context, { label: 'terrain-rollback-test' });
const stagedTerrainGroup = terrainHarness.context.terrainGroup;
const priorLocation = terrainHarness.context.LOC;
const stagedTerrainMesh = { name: 'staged-terrain' };
stagedTerrainGroup.add(stagedTerrainMesh);
terrainHarness.context.LOC = { lat: 40.7128, lon: -74.006 };
Object.assign(terrainHarness.context.car, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
assert.notEqual(stagedTerrainGroup, priorTerrainGroup);
assert.equal(terrainStage.rollback('terrain-provider-failed'), true);
assert.equal(terrainHarness.context.terrainGroup, priorTerrainGroup);
assert.equal(terrainHarness.context.LOC, priorLocation);
assert.deepEqual(terrainHarness.context.car, { x: 18, y: 2, z: -14, vx: 1, vy: 0, vz: 2 });
assert.equal(priorTerrainGroup.children[0], priorTerrainMesh);
assert.deepEqual(disposedTerrain, [stagedTerrainMesh]);
assert.equal(terrainResetCalls, 1);

const commitHarness = createHarness();
const commitStage = beginWorldLoadStage(commitHarness.context, { label: 'commit-test' });
commitHarness.context.roads.push({ id: 'staged-road-data' });
assert.equal(commitStage.commit(), true);
assert.equal(commitStage.commit(), false);
assert.equal(commitHarness.context.roads.length, 1);
assert.notEqual(commitHarness.context.roads, commitHarness.previousCollections.roads);
assert.equal(commitHarness.sceneStages[0].status(), 'committed');
assert.equal(commitHarness.context.lastWorldLoadStage.status, 'committed');
assert.equal(commitHarness.context.lastWorldLoadStage.stagedCounts.roads, 1);

const restoredBuildings = [];
const runtimeRecoveryCalls = [];
const runtimeRecoveryContext = {
  buildings: [{ id: 'one' }, { id: 'two' }],
  invalidateRoadCache: () => runtimeRecoveryCalls.push('road-cache'),
  refreshAstronomicalSky: () => runtimeRecoveryCalls.push('sky'),
  refreshBlockBuilderForCurrentLocation: () => runtimeRecoveryCalls.push('blocks'),
  refreshLiveWeather: () => runtimeRecoveryCalls.push('weather'),
  refreshMemoryMarkersForCurrentLocation: () => runtimeRecoveryCalls.push('memories')
};
assert.equal(restoreWorldRuntimeAfterRollback(runtimeRecoveryContext, {
  addBuildingToSpatialIndex: (building) => restoredBuildings.push(building.id),
  clearBuildingSpatialIndex: () => runtimeRecoveryCalls.push('building-index'),
  invalidateTraversalNetworks: () => runtimeRecoveryCalls.push('traversal'),
  reason: 'provider-failed'
}), true);
assert.deepEqual(restoredBuildings, ['one', 'two']);
assert.deepEqual(runtimeRecoveryCalls, [
  'building-index',
  'traversal',
  'road-cache',
  'memories',
  'blocks',
  'sky',
  'weather'
]);
assert.equal(restoreWorldRuntimeAfterRollback(runtimeRecoveryContext, {
  reason: 'superseded'
}), false);

console.log(JSON.stringify({
  ok: true,
  exactPreviousReferencesRestored: true,
  stagedMeshesDisposedOnRollback: true,
  stagedTerrainRestoredOnRollback: true,
  runtimeStateRestoredOnRollback: true,
  runtimeIndexesRestoredOnRollback: true,
  stagedCollectionsRetainedOnCommit: true
}, null, 2));
