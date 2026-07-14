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

function sceneOwnershipSignature() {
  const listState = EARTH_MESH_LISTS.map((listName) => {
    const list = appCtx[listName];
    const last = Array.isArray(list) && list.length ? list[list.length - 1] : null;
    return `${listName}:${Array.isArray(list) ? list.length : 0}:${last?.uuid || ''}`;
  }).join('|');
  return `${appCtx.scene?.children?.length || 0}|${listState}`;
}

function setObjectInScene(object, visible) {
  if (!object || !appCtx.scene) return;
  object.visible = visible;
  if (visible) {
    if (object.parent !== appCtx.scene) appCtx.scene.add(object);
  } else if (object.parent === appCtx.scene) {
    appCtx.scene.remove(object);
  }
}

function earthMeshVisibility(listName, mesh, visible) {
  if (!visible) return false;
  if (listName === 'landuseMeshes') return !!(appCtx.landUseVisible || mesh?.userData?.alwaysVisible);
  if (listName === 'poiMeshes') return !!appCtx.poiMode;
  return true;
}

function setEarthSceneVisible(visible) {
  const shouldShow = !!visible;
  setObjectInScene(appCtx.terrainGroup, shouldShow);
  setObjectInScene(appCtx.cloudGroup, shouldShow);

  EARTH_MESH_LISTS.forEach((listName) => {
    const list = appCtx[listName];
    if (!Array.isArray(list)) return;
    list.forEach((mesh) => setObjectInScene(mesh, earthMeshVisibility(listName, mesh, shouldShow)));
  });

  appCtx.scene?.traverse?.((object) => {
    if (object?.userData?.isGroundPlane) object.visible = shouldShow;
  });
  appCtx.earthSceneVisible = shouldShow;
  lastOwnershipSignature = sceneOwnershipSignature();
  return shouldShow;
}

function enforceEnvironmentSceneOwnership() {
  const env = appCtx.getEnv?.();
  const earthVisible = env === appCtx.ENV?.EARTH;
  const signature = sceneOwnershipSignature();
  if (earthVisible !== appCtx.earthSceneVisible || signature !== lastOwnershipSignature) {
    setEarthSceneVisible(earthVisible);
  }
  return earthVisible;
}

Object.assign(appCtx, {
  enforceEnvironmentSceneOwnership,
  setEarthSceneVisible
});

export { EARTH_MESH_LISTS, enforceEnvironmentSceneOwnership, setEarthSceneVisible };
