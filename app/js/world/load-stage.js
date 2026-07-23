import { WORLD_COLLECTION_NAMES } from './collection-registry.js?v=1';
import { EARTH_MESH_LISTS, disposeEarthWorldObject } from '../planetary/scene-ownership.js?v=11';

const RUNTIME_STATE_NAMES = Object.freeze([
  'LOC',
  '_worldLoadNodes',
  'curatedLandmarkMetrics',
  'dynamicBudgetScale',
  'dynamicLodScale',
  'initialEarthDetailRadius',
  'initialEarthWorldReady',
  'initialEarthWorldRetired',
  'navigationRouteDistance',
  'navigationRoutePoints',
  'osmTreeNodes',
  'osmTreeRows',
  'rdtComplexity',
  'rdtLoadComplexity',
  'rdtSeed',
  'roadsNeedRebuild',
  'urbanSurfaceStats',
  'worldDetailState',
  'worldLoading',
  'worldSurfaceProfile'
]);

function snapshotActor(actor) {
  if (!actor || typeof actor !== 'object') return null;
  const values = {};
  ['x', 'y', 'z', 'vx', 'vy', 'vz', 'angle', 'yaw', 'speed', 'speedMph'].forEach((name) => {
    if (Object.hasOwn(actor, name)) values[name] = actor[name];
  });
  return { actor, values };
}

function restoreActor(snapshot) {
  if (!snapshot?.actor) return;
  Object.assign(snapshot.actor, snapshot.values);
}

function beginWorldLoadStage(appCtx, options = {}) {
  if (!appCtx || typeof appCtx !== 'object') throw new TypeError('World load stage requires application context.');
  if (typeof appCtx.replaceWorldCollection !== 'function') {
    throw new TypeError('World load stage requires replaceWorldCollection().');
  }
  if (typeof appCtx.createEarthSceneStage !== 'function') {
    throw new TypeError('World load stage requires createEarthSceneStage().');
  }

  const previousCollections = Object.fromEntries(
    WORLD_COLLECTION_NAMES.map((name) => [name, appCtx[name]])
  );
  const previousRuntimeState = Object.fromEntries(
    RUNTIME_STATE_NAMES.map((name) => [name, appCtx[name]])
  );
  const previousActors = [
    snapshotActor(appCtx.car),
    snapshotActor(appCtx.drone),
    snapshotActor(appCtx.Walk?.state?.walker)
  ].filter(Boolean);
  const sceneStage = appCtx.createEarthSceneStage(options.label || 'world-load');
  const previousTerrainGroup = appCtx.terrainGroup || null;
  let stagedTerrainGroup = null;
  if (previousTerrainGroup?.constructor && appCtx.scene?.add) {
    stagedTerrainGroup = new previousTerrainGroup.constructor();
    stagedTerrainGroup.name = 'TerrainGroup (World Load Stage)';
    stagedTerrainGroup.userData = {
      ...(stagedTerrainGroup.userData || {}),
      worldLoadStage: true
    };
    appCtx.scene.add(stagedTerrainGroup);
    appCtx.terrainGroup = stagedTerrainGroup;
  }
  WORLD_COLLECTION_NAMES.forEach((name) => appCtx.replaceWorldCollection(name, []));
  let status = 'active';

  function disposeStagedMeshes() {
    const meshes = new Set();
    EARTH_MESH_LISTS.forEach((name) => {
      appCtx[name]?.forEach?.((object) => meshes.add(object));
    });
    meshes.forEach(disposeEarthWorldObject);
    return meshes.size;
  }

  function rollback(reason = 'rolled-back') {
    if (status !== 'active') return false;
    const disposedMeshes = disposeStagedMeshes();
    WORLD_COLLECTION_NAMES.forEach((name) => {
      appCtx.replaceWorldCollection(name, previousCollections[name] || []);
    });
    stagedTerrainGroup ||= appCtx.terrainGroup !== previousTerrainGroup ? appCtx.terrainGroup : null;
    const disposedTerrainMeshes = stagedTerrainGroup?.children?.length || 0;
    [...(stagedTerrainGroup?.children || [])].forEach((mesh) => {
      stagedTerrainGroup.remove?.(mesh);
      if (typeof appCtx.disposeTerrainMesh === 'function') appCtx.disposeTerrainMesh(mesh);
      else disposeEarthWorldObject(mesh);
    });
    stagedTerrainGroup?.parent?.remove?.(stagedTerrainGroup);
    appCtx.terrainGroup = previousTerrainGroup;
    appCtx.resetTerrainStreamingState?.();
    RUNTIME_STATE_NAMES.forEach((name) => {
      appCtx[name] = previousRuntimeState[name];
    });
    previousActors.forEach(restoreActor);
    if (sceneStage.rollback() !== true) return false;
    status = 'rolled-back';
    appCtx.lastWorldLoadStage = {
      status,
      reason: String(reason || 'rolled-back'),
      disposedMeshes,
      disposedTerrainMeshes
    };
    return true;
  }

  function commit() {
    if (status !== 'active') return false;
    if (sceneStage.commit() !== true) return false;
    status = 'committed';
    appCtx.lastWorldLoadStage = {
      status,
      previousCounts: Object.fromEntries(
        WORLD_COLLECTION_NAMES.map((name) => [name, previousCollections[name]?.length || 0])
      ),
      stagedCounts: Object.fromEntries(
        WORLD_COLLECTION_NAMES.map((name) => [name, appCtx[name]?.length || 0])
      ),
      stagedTerrainMeshes: appCtx.terrainGroup?.children?.length || 0
    };
    return true;
  }

  return Object.freeze({
    commit,
    previousCollections,
    rollback,
    snapshot: () => ({
      status,
      sceneStatus: sceneStage.status(),
      stagedCounts: Object.fromEntries(
        WORLD_COLLECTION_NAMES.map((name) => [name, appCtx[name]?.length || 0])
      ),
      stagedTerrainMeshes: appCtx.terrainGroup?.children?.length || 0
    })
  });
}

export { beginWorldLoadStage };
