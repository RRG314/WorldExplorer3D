import { ctx as appCtx } from "../shared-context.js?v=55";

const runtime = {
  getPerfModeValue: () => 'full',
  getRuntimeDynamicBudget: () => ({ lodScale: 1 }),
  getWorldLodThresholds: () => ({ mid: 900, farVisible: 1600 })
};

let lastLodRefX = 0;
let lastLodRefZ = 0;
let lastLodReady = false;

export function initWorldLod(deps = {}) {
  if (typeof deps.getPerfModeValue === 'function') runtime.getPerfModeValue = deps.getPerfModeValue;
  if (typeof deps.getRuntimeDynamicBudget === 'function') runtime.getRuntimeDynamicBudget = deps.getRuntimeDynamicBudget;
  if (typeof deps.getWorldLodThresholds === 'function') runtime.getWorldLodThresholds = deps.getWorldLodThresholds;
}

function getMeshLodCenter(mesh) {
  if (!mesh) return null;
  const cached = mesh.userData?.lodCenter;
  if (cached && Number.isFinite(cached.x) && Number.isFinite(cached.z)) return cached;

  const poiPos = mesh.userData?.poiPosition;
  if (poiPos && Number.isFinite(poiPos.x) && Number.isFinite(poiPos.z)) {
    return poiPos;
  }

  const footprint = mesh.userData?.buildingFootprint || mesh.userData?.landuseFootprint;
  if (Array.isArray(footprint) && footprint.length > 0) {
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < footprint.length; i++) {
      sumX += footprint[i].x;
      sumZ += footprint[i].z;
    }
    const center = { x: sumX / footprint.length, z: sumZ / footprint.length };
    mesh.userData.lodCenter = center;
    return center;
  }

  if (mesh.geometry) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere;
    if (sphere && Number.isFinite(sphere.center.x) && Number.isFinite(sphere.center.z)) {
      const px = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
      const pz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
      const center = { x: sphere.center.x + px, z: sphere.center.z + pz };
      mesh.userData.lodCenter = center;
      return center;
    }
  }

  if (mesh.position && Number.isFinite(mesh.position.x) && Number.isFinite(mesh.position.z)) {
    return { x: mesh.position.x, z: mesh.position.z };
  }
  return null;
}

function hideMeshList(meshes) {
  if (!Array.isArray(meshes)) return;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (!mesh) continue;
    mesh.visible = false;
    if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
  }
}

function lodReferenceActor() {
  if (appCtx.boatMode?.active && appCtx.boat) return appCtx.boat;
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) return appCtx.Walk.state.walker;
  return appCtx.droneMode ? appCtx.drone : appCtx.car;
}

function visibleBuildingMeshBudget() {
  const quality = String(appCtx.renderQualityLevel || 'med').toLowerCase();
  const baseBudget = quality === 'low' ? 480 : quality === 'high' ? 1200 : 820;
  const modeScale = appCtx.droneMode ? 0.72 : appCtx.camMode === 2 ? 0.82 : 1;
  return Math.max(280, Math.floor(baseBudget * modeScale));
}

export function updateWorldLod(force = false) {
  if (appCtx.onMoon || appCtx.travelingToMoon || (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH))) {
    hideMeshList(appCtx.roadMeshes);
    hideMeshList(appCtx.urbanSurfaceMeshes);
    hideMeshList(appCtx.buildingMeshes);
    hideMeshList(appCtx.landuseMeshes);
    hideMeshList(appCtx.poiMeshes);
    hideMeshList(appCtx.streetFurnitureMeshes);
    if (typeof appCtx.setPerfLiveStat === 'function') {
      appCtx.setPerfLiveStat('lodVisible', { near: 0, mid: 0 });
    }
    return;
  }

  if ((!appCtx.buildingMeshes || appCtx.buildingMeshes.length === 0) &&
      (!appCtx.poiMeshes || appCtx.poiMeshes.length === 0) &&
      (!appCtx.landuseMeshes || appCtx.landuseMeshes.length === 0)) {
    return;
  }

  const ref = lodReferenceActor();
  const refX = Number.isFinite(ref?.x) ? ref.x : 0;
  const refZ = Number.isFinite(ref?.z) ? ref.z : 0;

  if (!force && lastLodReady) {
    const moved = Math.hypot(refX - lastLodRefX, refZ - lastLodRefZ);
    const minMoveForLodUpdate = appCtx.droneMode ? 4 : appCtx.boatMode?.active ? 14 : 8;
    if (moved < minMoveForLodUpdate) return;
  }
  lastLodRefX = refX;
  lastLodRefZ = refZ;
  lastLodReady = true;

  const mode = runtime.getPerfModeValue();
  const dynamicBudgetState = runtime.getRuntimeDynamicBudget(mode);
  const depthForLod = typeof appCtx.rdtLoadComplexity === 'number' ? appCtx.rdtLoadComplexity :
    typeof appCtx.rdtComplexity === 'number' ? appCtx.rdtComplexity : 0;
  const boatLodScale = appCtx.boatMode?.active ? Math.max(0.34, Math.min(1, Number(appCtx.boatMode.detailBias) || 1)) : 1;
  const lodThresholds = runtime.getWorldLodThresholds(depthForLod, mode, dynamicBudgetState.lodScale * boatLodScale);
  const poiMidSq = lodThresholds.mid * lodThresholds.mid;

  let nearVisible = 0;
  let midVisible = 0;

  if (mode === 'baseline') {
    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
      mesh.visible = true;
      const tier = mesh.userData?.lodTier || 'near';
      const isBatch = !!mesh.userData?.isBuildingBatch;
      const count = isBatch ? Math.max(1, mesh.userData?.batchCount || 1) : 1;
      if (tier === 'mid') midVisible += count;
      else nearVisible += count;
    }

    for (let i = 0; i < appCtx.poiMeshes.length; i++) {
      const mesh = appCtx.poiMeshes[i];
      if (mesh) mesh.visible = !!appCtx.poiMode;
    }

    for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
      const mesh = appCtx.landuseMeshes[i];
      if (!mesh) continue;
      if (mesh.userData?.boatSuppressed) {
        mesh.visible = false;
        continue;
      }
      const alwaysVisible = !!mesh.userData?.alwaysVisible;
      mesh.visible = alwaysVisible || !!appCtx.landUseVisible;
    }

    if (typeof appCtx.setPerfLiveStat === 'function') {
      appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
    }
    return;
  }

  const nearBuildingCandidates = [];
  const midBuildingCandidates = [];
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (!mesh) continue;

    const center = getMeshLodCenter(mesh);
    if (!center) continue;

    const tier = mesh.userData?.lodTier || 'near';
    const isBatch = !!mesh.userData?.isBuildingBatch;
    const radius = Number.isFinite(mesh.userData?.lodRadius) ? mesh.userData.lodRadius : 0;
    let visibleDist;
    if (tier === 'mid') {
      const batchBoost = isBatch ? Math.min(900, radius * 0.65) : Math.min(450, radius);
      visibleDist = lodThresholds.mid + batchBoost;
    } else {
      const batchBoost = isBatch ? Math.min(1300, radius) : Math.min(800, radius);
      visibleDist = lodThresholds.farVisible + batchBoost;
    }
    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    const hysteresis = tier === 'mid' ?
      appCtx.droneMode ? 460 : 280 :
      appCtx.droneMode ? 380 : 220;
    const limitDist = mesh.visible ? visibleDist + hysteresis : visibleDist;
    const withinDistance = distSq <= limitDist * limitDist;
    mesh.visible = false;
    if (!withinDistance) continue;
    const count = isBatch ? Math.max(1, mesh.userData?.batchCount || 1) : 1;
    const candidate = { count, distSq, mesh, tier };
    if (tier === 'mid') midBuildingCandidates.push(candidate);
    else nearBuildingCandidates.push(candidate);
  }

  nearBuildingCandidates.sort((a, b) => a.distSq - b.distSq);
  midBuildingCandidates.sort((a, b) => a.distSq - b.distSq);
  const buildingMeshBudget = visibleBuildingMeshBudget();
  const nearShare = appCtx.droneMode ? 0.38 : appCtx.camMode === 2 ? 0.5 : 0.62;
  const nearTarget = Math.floor(buildingMeshBudget * nearShare);
  const nearCount = Math.min(nearTarget, nearBuildingCandidates.length);
  const midCount = Math.min(buildingMeshBudget - nearCount, midBuildingCandidates.length);
  const nearSpillCount = Math.min(
    nearBuildingCandidates.length,
    nearCount + Math.max(0, buildingMeshBudget - nearCount - midCount)
  );

  for (let i = 0; i < nearSpillCount; i++) {
    const candidate = nearBuildingCandidates[i];
    candidate.mesh.visible = true;
    nearVisible += candidate.count;
  }
  for (let i = 0; i < midCount; i++) {
    const candidate = midBuildingCandidates[i];
    candidate.mesh.visible = true;
    midVisible += candidate.count;
  }

  for (let i = 0; i < appCtx.poiMeshes.length; i++) {
    const mesh = appCtx.poiMeshes[i];
    if (!mesh) continue;
    const center = getMeshLodCenter(mesh);
    if (!center) continue;

    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    const tier = mesh.userData?.lodTier || 'near';
    const radius = Number.isFinite(mesh.userData?.lodRadius) ? mesh.userData.lodRadius : 0;
    const nearDist = lodThresholds.farVisible + Math.min(600, radius);
    const withinLod = tier === 'mid' ? distSq <= poiMidSq : distSq <= nearDist * nearDist;
    mesh.visible = !!appCtx.poiMode && withinLod;
  }

  const landuseVisibleDist = lodThresholds.mid + 120;
  const landuseSq = landuseVisibleDist * landuseVisibleDist;
  for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
    const mesh = appCtx.landuseMeshes[i];
    if (!mesh) continue;
    if (mesh.userData?.boatSuppressed) {
      mesh.visible = false;
      continue;
    }

    const alwaysVisible = !!mesh.userData?.alwaysVisible;
    if (!appCtx.landUseVisible && !alwaysVisible) {
      mesh.visible = false;
      continue;
    }
    if (alwaysVisible) {
      mesh.visible = true;
      continue;
    }

    if (mesh.userData?.isLanduseBatch) {
      mesh.visible = !!appCtx.landUseVisible;
      continue;
    }

    const center = getMeshLodCenter(mesh);
    if (!center) {
      mesh.visible = appCtx.landUseVisible;
      continue;
    }

    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    mesh.visible = distSq <= landuseSq;
  }

  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
    appCtx.setPerfLiveStat('lodBuildingMeshes', {
      budget: buildingMeshBudget,
      eligible: nearBuildingCandidates.length + midBuildingCandidates.length,
      visible: nearSpillCount + midCount,
      visibleNearMeshes: nearSpillCount,
      visibleMidMeshes: midCount
    });
  }

  if (Array.isArray(appCtx.streetFurnitureMeshes) && appCtx.streetFurnitureMeshes.length > 0) {
    const furnitureDist = (appCtx.boatMode?.active ? lodThresholds.mid * 0.6 : lodThresholds.mid) + 80;
    const furnitureSq = furnitureDist * furnitureDist;
    for (let i = 0; i < appCtx.streetFurnitureMeshes.length; i++) {
      const mesh = appCtx.streetFurnitureMeshes[i];
      if (!mesh) continue;
      if (mesh.userData?.boatSuppressed) {
        mesh.visible = false;
        continue;
      }
      const center = getMeshLodCenter(mesh) || mesh.userData?.furniturePos || mesh.position;
      if (!center) continue;
      const dx = center.x - refX;
      const dz = center.z - refZ;
      mesh.visible = dx * dx + dz * dz <= furnitureSq;
    }
  }
}
