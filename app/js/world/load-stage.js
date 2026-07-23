import { WORLD_COLLECTION_NAMES } from './collection-registry.js?v=1';
import { EARTH_MESH_LISTS, disposeEarthWorldObject } from '../planetary/scene-ownership.js?v=9';

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
  const sceneStage = appCtx.createEarthSceneStage(options.label || 'world-load');
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
    if (sceneStage.rollback() !== true) return false;
    status = 'rolled-back';
    appCtx.lastWorldLoadStage = {
      status,
      reason: String(reason || 'rolled-back'),
      disposedMeshes
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
      )
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
      )
    })
  });
}

export { beginWorldLoadStage };
