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
    if (!object.parent) {
      const ownerParent = object.userData?.earthSceneOwnerParent;
      const parent = ownerParent?.isObject3D ? ownerParent : appCtx.scene;
      parent.add(object);
    }
  } else if (object.parent) {
    object.userData = object.userData || {};
    object.userData.earthSceneOwnerParent = object.parent;
    object.parent.remove(object);
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

function attachEarthSceneWithoutChangingLod() {
  if (!appCtx.scene) return;
  [appCtx.terrainGroup, appCtx.cloudGroup].forEach((object) => {
    if (object && !object.parent) {
      const ownerParent = object.userData?.earthSceneOwnerParent;
      (ownerParent?.isObject3D ? ownerParent : appCtx.scene).add(object);
    }
  });
  EARTH_MESH_LISTS.forEach((listName) => {
    const list = appCtx[listName];
    if (!Array.isArray(list)) return;
    list.forEach((mesh) => {
      if (mesh && !mesh.parent) {
        const ownerParent = mesh.userData?.earthSceneOwnerParent;
        (ownerParent?.isObject3D ? ownerParent : appCtx.scene).add(mesh);
      }
    });
  });
  lastOwnershipSignature = sceneOwnershipSignature();
}

function enforceEnvironmentSceneOwnership() {
  const env = appCtx.getEnv?.();
  const earthVisible = env === appCtx.ENV?.EARTH;
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
  enforceEnvironmentSceneOwnership,
  setEarthSceneVisible
});

export { EARTH_MESH_LISTS, enforceEnvironmentSceneOwnership, setEarthSceneVisible };
