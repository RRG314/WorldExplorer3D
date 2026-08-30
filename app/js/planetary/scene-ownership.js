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
let stagedWorldLoadSequence = null;

function disposeDetachedWorldObject(object) {
  if (!object) return;
  object.parent?.remove?.(object);
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (!child.material) return;
    const sharedMaterial = !!(
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
    earthSceneRoot.visible = stagedWorldLoadSequence === null && appCtx.worldLoading !== true;
    appCtx.scene.add(earthSceneRoot);
    appCtx.earthSceneRoot = earthSceneRoot;
  }
  return earthSceneRoot;
}

function addEarthWorldObject(object) {
  const root = ensureEarthSceneRoot();
  if (!object || !root || object === root) return object || null;
  root.add(object);
  lastOwnershipSignature = '';
  return object;
}

function beginEarthWorldSceneLoad(sequence) {
  const root = ensureEarthSceneRoot();
  const numericSequence = Number(sequence);
  stagedWorldLoadSequence = Number.isFinite(numericSequence) ? numericSequence : 0;
  if (root) root.visible = false;
  appCtx.earthSceneVisible = false;
  appCtx.earthWorldSceneStage = Object.freeze({
    sequence: stagedWorldLoadSequence,
    status: 'building'
  });
  return appCtx.earthWorldSceneStage;
}

function publishEarthWorldSceneLoad(sequence) {
  const numericSequence = Number(sequence);
  if (stagedWorldLoadSequence !== null && numericSequence !== stagedWorldLoadSequence) {
    return false;
  }
  stagedWorldLoadSequence = null;
  appCtx.earthWorldSceneStage = Object.freeze({
    sequence: Number.isFinite(numericSequence) ? numericSequence : 0,
    status: 'published'
  });
  lastOwnershipSignature = '';
  return true;
}

function discardEarthWorldSceneLoad(sequence) {
  const numericSequence = Number(sequence);
  if (stagedWorldLoadSequence !== null && numericSequence !== stagedWorldLoadSequence) {
    return false;
  }
  stagedWorldLoadSequence = null;
  appCtx.earthWorldSceneStage = Object.freeze({
    sequence: Number.isFinite(numericSequence) ? numericSequence : 0,
    status: 'discarded'
  });
  lastOwnershipSignature = '';
  return true;
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
  const shouldShow = !!visible && stagedWorldLoadSequence === null && appCtx.worldLoading !== true;
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
  [appCtx.terrainGroup, appCtx.cloudGroup, appCtx.earthAtmosphere].forEach((object) => adoptEarthObject(object, root));
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
  const persistent = new Set([appCtx.terrainGroup, appCtx.cloudGroup, appCtx.earthAtmosphere].filter(Boolean));
  const trackedObjects = new Set();
  EARTH_MESH_LISTS.forEach((listName) => {
    appCtx[listName]?.forEach?.((object) => trackedObjects.add(object));
  });

  let removed = 0;
  if (root) {
    [...root.children].forEach((object) => {
      if (persistent.has(object) || object?.userData?.isGroundPlane) return;
      disposeDetachedWorldObject(object);
      removed += 1;
    });
  }

  [...(appCtx.scene?.children || [])].forEach((object) => {
    if (object === root || persistent.has(object) || object?.userData?.isGroundPlane) return;
    if (!isDirectWorldObject(object, trackedObjects)) return;
    disposeDetachedWorldObject(object);
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

function getEarthScenePublicationState() {
  const root = appCtx.earthSceneRoot || earthSceneRoot;
  const trackedObjects = [];
  EARTH_MESH_LISTS.forEach((listName) => {
    appCtx[listName]?.forEach?.((object) => {
      if (object) trackedObjects.push(object);
    });
  });
  return Object.freeze({
    rootAttached: !!root && root.parent === appCtx.scene,
    rootVisible: root?.visible === true,
    rootChildCount: Number(root?.children?.length || 0),
    terrainAttached: !!appCtx.terrainGroup && appCtx.terrainGroup.parent === root,
    trackedMeshCount: trackedObjects.length,
    adoptedTrackedMeshCount: trackedObjects.filter((object) => object.parent === root).length,
    directSceneTrackedMeshCount: trackedObjects.filter((object) => object.parent === appCtx.scene).length,
    stage: appCtx.earthWorldSceneStage || null
  });
}

function enforceEnvironmentSceneOwnership() {
  const env = appCtx.getEnv?.();
  const earthVisible = env === appCtx.ENV?.EARTH && (
    appCtx.earthResumePending !== true || appCtx.earthResumeRenderReady === true
  ) && stagedWorldLoadSequence === null && appCtx.worldLoading !== true;
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
  addEarthWorldObject,
  beginEarthWorldSceneLoad,
  clearEarthWorldSceneObjects,
  discardEarthWorldSceneLoad,
  enforceEnvironmentSceneOwnership,
  getEarthScenePublicationState,
  publishEarthWorldSceneLoad,
  setEarthSceneVisible
});

export {
  addEarthWorldObject,
  beginEarthWorldSceneLoad,
  clearEarthWorldSceneObjects,
  discardEarthWorldSceneLoad,
  EARTH_MESH_LISTS,
  enforceEnvironmentSceneOwnership,
  getEarthScenePublicationState,
  publishEarthWorldSceneLoad,
  setEarthSceneVisible
};
