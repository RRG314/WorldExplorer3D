import assert from 'node:assert/strict';
import { WORLD_COLLECTION_NAMES } from '../app/js/world/collection-registry.js';
import { beginWorldLoadStage } from '../app/js/world/load-stage.js';

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

console.log(JSON.stringify({
  ok: true,
  exactPreviousReferencesRestored: true,
  stagedMeshesDisposedOnRollback: true,
  stagedCollectionsRetainedOnCommit: true
}, null, 2));
