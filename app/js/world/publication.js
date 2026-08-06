import { ctx as appCtx } from '../shared-context.js?v=55';

function setSceneObjectVisible(object, visible) {
  if (!object) return;
  object.visible = visible;
  if (visible && object.parent !== appCtx.scene) appCtx.scene.add(object);
  if (!visible && object.parent === appCtx.scene) appCtx.scene.remove(object);
}

function setListVisible(objects, resolveVisibility = () => true) {
  if (!Array.isArray(objects)) return 0;
  let visibleCount = 0;
  objects.forEach((object) => {
    if (!object) return;
    const visible = resolveVisibility(object) !== false;
    setSceneObjectVisible(object, visible);
    if (visible) visibleCount += Number(object.userData?.batchCount || 1);
  });
  return visibleCount;
}

function publishLocationWorld() {
  const earthActive = !appCtx.onMoon && !appCtx.travelingToMoon && (
    typeof appCtx.isEnv !== 'function' || !appCtx.ENV || appCtx.isEnv(appCtx.ENV.EARTH)
  );
  if (!earthActive) {
    setListVisible(appCtx.roadMeshes, () => false);
    setListVisible(appCtx.urbanSurfaceMeshes, () => false);
    setListVisible(appCtx.buildingMeshes, () => false);
    setListVisible(appCtx.landuseMeshes, () => false);
    setListVisible(appCtx.poiMeshes, () => false);
    setListVisible(appCtx.streetFurnitureMeshes, () => false);
    appCtx.setPerfLiveStat?.('lodVisible', { near: 0, mid: 0 });
    return { active: false, buildings: 0 };
  }

  setListVisible(appCtx.roadMeshes);
  setListVisible(appCtx.urbanSurfaceMeshes);
  const buildings = setListVisible(appCtx.buildingMeshes);
  setListVisible(
    appCtx.landuseMeshes,
    (mesh) => mesh.userData?.alwaysVisible || appCtx.landUseVisible === true
  );
  setListVisible(appCtx.poiMeshes, () => appCtx.poiMode === true);
  setListVisible(appCtx.streetFurnitureMeshes);

  const near = (appCtx.buildingMeshes || []).reduce((count, mesh) => (
    mesh?.userData?.lodTier === 'mid' ? count : count + Number(mesh?.userData?.batchCount || 1)
  ), 0);
  const mid = Math.max(0, buildings - near);
  appCtx.setPerfLiveStat?.('lodVisible', { near, mid });
  appCtx.setPerfLiveStat?.('lodBuildingMeshes', {
    budget: buildings,
    eligible: buildings,
    visible: (appCtx.buildingMeshes || []).length,
    visibleNearMeshes: (appCtx.buildingMeshes || []).filter((mesh) => mesh?.userData?.lodTier !== 'mid').length,
    visibleMidMeshes: (appCtx.buildingMeshes || []).filter((mesh) => mesh?.userData?.lodTier === 'mid').length
  });
  return { active: true, buildings };
}

export { publishLocationWorld };
