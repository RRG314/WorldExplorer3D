import { ctx as appCtx } from '../shared-context.js?v=55';

const EARTH_MESH_LISTS = Object.freeze([
  'roadMeshes',
  'urbanSurfaceMeshes',
  'structureVisualMeshes',
  'buildingMeshes',
  'landuseMeshes',
  'linearFeatureMeshes',
  'poiMeshes',
  'historicMarkers',
  'streetFurnitureMeshes',
  'vegetationMeshes'
]);
let lastOwnershipSignature = '';
let earthSceneRoot = null;

function disposeEarthWorldObject(object) {
  if (!object) return;
  object.parent?.remove?.(object);
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (!child.material) return;
    const sharedMaterial = !!(
      child.userData?.earthStreamingChunk ||
      child.userData?.streamChunkKey ||
      child.userData?.sharedRoadMaterial ||
      child.userData?.sharedUrbanSurfaceMaterial
    );
    if (sharedMaterial) return;
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material.dispose?.();
  });
}

function isDirectWorldObject(object, trackedObjects) {
  if (!object || trackedObjects.has(object)) return true;
  const data = object.userData || {};
  return !!(
    data.isRoadBatch ||
    data.isUrbanSurfaceBatch ||
    data.isBuildingBatch ||
    data.isLanduseBatch ||
    data.isRoofDetail ||
    data.isHistoricLandmark ||
    data.isStreetFurniture ||
    data.isVegetation ||
    data.structureVisual ||
    data.sourceBuildingId ||
    data.landuseType
  );
}

function ensureEarthSceneRoot() {
  if (!appCtx.scene) return null;
  if (earthSceneRoot?.parent !== appCtx.scene) {
    earthSceneRoot = new THREE.Group();
    earthSceneRoot.name = 'Earth Runtime Root';
    earthSceneRoot.userData.environmentOwner = appCtx.ENV?.EARTH || 'EARTH';
    appCtx.scene.add(earthSceneRoot);
    appCtx.earthSceneRoot = earthSceneRoot;
  }
  return earthSceneRoot;
}

function sceneOwnershipSignature() {
  const listState = EARTH_MESH_LISTS.map((listName) => {
    const list = appCtx[listName];
    const last = Array.isArray(list) && list.length ? list[list.length - 1] : null;
    return `${listName}:${Array.isArray(list) ? list.length : 0}:${last?.uuid || ''}`;
  }).join('|');
  return `${appCtx.scene?.children?.length || 0}|${listState}`;
}

function adoptEarthObject(object, root) {
  if (!object || !root || object === root || object.parent === root) return;
  if (!object.parent || object.parent === appCtx.scene) root.add(object);
}

function earthMeshVisibility(listName, mesh, visible) {
  if (!visible) return false;
  if (listName === 'landuseMeshes') return !!(appCtx.landUseVisible || mesh?.userData?.alwaysVisible);
  if (listName === 'poiMeshes') return !!appCtx.poiMode;
  return true;
}

function setEarthSceneVisible(visible) {
  const shouldShow = !!visible;
  const root = ensureEarthSceneRoot();
  if (!root) return false;
  const signature = sceneOwnershipSignature();
  if (signature !== lastOwnershipSignature) attachEarthSceneWithoutChangingLod();
  if (shouldShow) {
    ['landuseMeshes', 'poiMeshes'].forEach((listName) => {
      const list = appCtx[listName];
      if (!Array.isArray(list)) return;
      list.forEach((mesh) => { if (mesh) mesh.visible = earthMeshVisibility(listName, mesh, true); });
    });
  }
  root.visible = shouldShow;
  appCtx.earthSceneVisible = shouldShow;
  lastOwnershipSignature = sceneOwnershipSignature();
  return shouldShow;
}

function attachEarthSceneWithoutChangingLod() {
  const root = ensureEarthSceneRoot();
  if (!root) return;
  [appCtx.terrainGroup, appCtx.cloudGroup].forEach((object) => adoptEarthObject(object, root));
  EARTH_MESH_LISTS.forEach((listName) => {
    const list = appCtx[listName];
    if (!Array.isArray(list)) return;
    list.forEach((mesh) => adoptEarthObject(mesh, root));
  });
  const groundPlanes = appCtx.scene.children.filter((object) => object?.userData?.isGroundPlane);
  groundPlanes.forEach((object) => adoptEarthObject(object, root));
  lastOwnershipSignature = sceneOwnershipSignature();
}

function clearEarthWorldSceneObjects() {
  const root = appCtx.earthSceneRoot || earthSceneRoot;
  const rootChildrenBefore = root?.children?.length || 0;
  const sceneChildrenBefore = appCtx.scene?.children?.length || 0;
  const persistent = new Set([appCtx.terrainGroup, appCtx.cloudGroup].filter(Boolean));
  const trackedObjects = new Set();
  EARTH_MESH_LISTS.forEach((listName) => {
    appCtx[listName]?.forEach?.((object) => trackedObjects.add(object));
  });

  let removed = 0;
  if (root) {
    [...root.children].forEach((object) => {
      if (persistent.has(object) || object?.userData?.isGroundPlane) return;
      disposeEarthWorldObject(object);
      removed += 1;
    });
  }

  [...(appCtx.scene?.children || [])].forEach((object) => {
    if (object === root || persistent.has(object) || object?.userData?.isGroundPlane) return;
    if (!isDirectWorldObject(object, trackedObjects)) return;
    disposeEarthWorldObject(object);
    removed += 1;
  });

  lastOwnershipSignature = '';
  appCtx.lastEarthWorldSceneClear = {
    removed,
    rootChildrenBefore,
    rootChildrenAfter: root?.children?.length || 0,
    sceneChildrenBefore,
    sceneChildrenAfter: appCtx.scene?.children?.length || 0,
    loadSequence: Number(appCtx._worldLoadSequence || 0),
    location: appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.selLoc || null,
    clearedAt: Date.now()
  };
  return removed;
}

function createEarthSceneStage(label = 'world-load-stage') {
  const previousRoot = ensureEarthSceneRoot();
  const previousTerrainGroup = appCtx.terrainGroup;
  if (!previousRoot || !appCtx.scene) throw new Error('Earth scene root is unavailable.');
  const stageRoot = new THREE.Group();
  stageRoot.name = `Earth Runtime Stage: ${String(label || 'world-load-stage')}`;
  stageRoot.userData.environmentOwner = appCtx.ENV?.EARTH || 'EARTH';
  stageRoot.userData.worldLoadStage = true;
  stageRoot.visible = false;
  appCtx.scene.add(stageRoot);
  let status = 'active';

  function rollback() {
    if (status !== 'active') return false;
    [...stageRoot.children].forEach(disposeEarthWorldObject);
    stageRoot.parent?.remove?.(stageRoot);
    previousRoot.visible = appCtx.earthSceneVisible !== false;
    earthSceneRoot = previousRoot;
    appCtx.earthSceneRoot = previousRoot;
    lastOwnershipSignature = '';
    status = 'rolled-back';
    return true;
  }

  function commit() {
    if (status !== 'active') return false;
    earthSceneRoot = stageRoot;
    appCtx.earthSceneRoot = stageRoot;

    [appCtx.terrainGroup, appCtx.cloudGroup].forEach((object) => adoptEarthObject(object, stageRoot));
    [...previousRoot.children]
      .filter((object) => object?.userData?.isGroundPlane)
      .forEach((object) => stageRoot.add(object));
    attachEarthSceneWithoutChangingLod();
    stageRoot.visible = appCtx.earthSceneVisible !== false;

    if (previousTerrainGroup && previousTerrainGroup !== appCtx.terrainGroup) {
      [...(previousTerrainGroup.children || [])].forEach((mesh) => {
        previousTerrainGroup.remove?.(mesh);
        if (typeof appCtx.disposeTerrainMesh === 'function') appCtx.disposeTerrainMesh(mesh);
        else disposeEarthWorldObject(mesh);
      });
      previousTerrainGroup.parent?.remove?.(previousTerrainGroup);
    }
    [...previousRoot.children].forEach((object) => {
      if (object === previousTerrainGroup) return;
      disposeEarthWorldObject(object);
    });
    previousRoot.parent?.remove?.(previousRoot);
    lastOwnershipSignature = sceneOwnershipSignature();
    status = 'committed';
    return true;
  }

  return Object.freeze({
    commit,
    previousRoot,
    rollback,
    stageRoot,
    status: () => status
  });
}

function enforceEnvironmentSceneOwnership() {
  const env = appCtx.getEnv?.();
  const earthVisible = env === appCtx.ENV?.EARTH && (
    appCtx.earthResumePending !== true || appCtx.earthResumeRenderReady === true
  );
  const signature = sceneOwnershipSignature();
  if (earthVisible !== appCtx.earthSceneVisible) {
    setEarthSceneVisible(earthVisible);
  } else if (signature !== lastOwnershipSignature) {
    if (earthVisible) attachEarthSceneWithoutChangingLod();
    else setEarthSceneVisible(false);
  }
  return earthVisible;
}

Object.assign(appCtx, {
  clearEarthWorldSceneObjects,
  createEarthSceneStage,
  enforceEnvironmentSceneOwnership,
  setEarthSceneVisible
});

export {
  clearEarthWorldSceneObjects,
  createEarthSceneStage,
  disposeEarthWorldObject,
  EARTH_MESH_LISTS,
  enforceEnvironmentSceneOwnership,
  setEarthSceneVisible
};
