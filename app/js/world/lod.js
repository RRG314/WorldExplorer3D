import { ctx as appCtx } from "../shared-context.js?v=55";

const runtime = {
  getPerfModeValue: () => 'full',
  getRuntimeDynamicBudget: () => ({ lodScale: 1 }),
  getWorldLodThresholds: () => ({ mid: 900, farVisible: 1600 })
};

let lastLodRefX = 0;
let lastLodRefZ = 0;
let lastLodReady = false;
let lastBuildingMeshCount = -1;

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
  if (appCtx.planeMode?.active) return appCtx.planeMode;
  if (appCtx.boatMode?.active && appCtx.boat) return appCtx.boat;
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) return appCtx.Walk.state.walker;
  return appCtx.droneMode ? appCtx.drone : appCtx.car;
}

function visibleBuildingUnitBudget(dynamicScale = 1) {
  const quality = String(appCtx.renderQualityLevel || 'med').toLowerCase();
  if (appCtx.planeMode?.active || appCtx.droneMode) {
    const aerialBudget = quality === 'low' ? 4200 : quality === 'high' ? 9000 : 6500;
    return Math.max(3200, Math.floor(aerialBudget * Math.max(0.72, Number(dynamicScale) || 1)));
  }
  const baseBudget = quality === 'low' ? 2200 : quality === 'high' ? 5600 : 3800;
  const modeScale = appCtx.camMode === 2 ? 0.82 : 1;
  return Math.max(1200, Math.floor(baseBudget * modeScale * Math.max(0.72, Number(dynamicScale) || 1)));
}

function setEarthMeshVisible(mesh, visible) {
  if (!mesh) return;
  mesh.visible = visible;
  if (visible && mesh.parent !== appCtx.scene) appCtx.scene.add(mesh);
}

function setBuildingCandidateVisible(candidate, visible) {
  const meshes = Array.isArray(candidate?.meshes) ? candidate.meshes : [candidate?.mesh];
  let changed = 0;
  for (let i = 0; i < meshes.length; i++) {
    if (!meshes[i]) continue;
    setEarthMeshVisible(meshes[i], visible);
    changed += 1;
  }
  return changed;
}

function selectBuildingCandidates(candidates, budget) {
  if (!(budget > 0)) return { units: 0, meshes: 0 };
  let units = 0;
  let meshes = 0;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.selected) continue;
    const cost = Math.max(1, Number(candidate.count) || 1);
    if (units > 0 && units + cost > budget) continue;
    candidate.selected = true;
    units += cost;
    meshes += setBuildingCandidateVisible(candidate, true);
    if (units >= budget) break;
  }
  return { units, meshes };
}

export function updateWorldLod(force = false) {
  if (appCtx.onMoon || appCtx.travelingToMoon || (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH))) {
    appCtx.updateTerrainAerialDetail?.(false, 0);
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

  const ref = lodReferenceActor();
  const refX = Number.isFinite(ref?.x) ? ref.x : 0;
  const refZ = Number.isFinite(ref?.z) ? ref.z : 0;
  const aerialMode = !!(appCtx.planeMode?.active || appCtx.droneMode);
  const aerialActor = appCtx.planeMode?.active ? appCtx.planeMode : appCtx.drone;
  const aerialGroundY = aerialMode
    ? Number(appCtx.terrainMeshHeightAt?.(refX, refZ) ?? appCtx.elevationWorldYAtWorldXZ?.(refX, refZ) ?? 0)
    : 0;
  const aerialAltitude = aerialMode ? Math.max(0, Number(aerialActor?.y) - aerialGroundY) : 0;
  appCtx.updateTerrainAerialDetail?.(aerialMode, aerialAltitude);

  if ((!appCtx.buildingMeshes || appCtx.buildingMeshes.length === 0) &&
      (!appCtx.poiMeshes || appCtx.poiMeshes.length === 0) &&
      (!appCtx.landuseMeshes || appCtx.landuseMeshes.length === 0)) {
    return;
  }

  const buildingMeshCount = appCtx.buildingMeshes.length;
  const buildingSetChanged = buildingMeshCount !== lastBuildingMeshCount;

  if (!force && lastLodReady && !buildingSetChanged) {
    const moved = Math.hypot(refX - lastLodRefX, refZ - lastLodRefZ);
    const minMoveForLodUpdate = appCtx.planeMode?.active ? 45 : appCtx.droneMode ? 6 : appCtx.boatMode?.active ? 14 : 8;
    if (moved < minMoveForLodUpdate) return;
  }
  lastLodRefX = refX;
  lastLodRefZ = refZ;
  lastLodReady = true;
  lastBuildingMeshCount = buildingMeshCount;

  const mode = runtime.getPerfModeValue();
  const dynamicBudgetState = runtime.getRuntimeDynamicBudget(mode);
  const depthForLod = typeof appCtx.rdtLoadComplexity === 'number' ? appCtx.rdtLoadComplexity :
    typeof appCtx.rdtComplexity === 'number' ? appCtx.rdtComplexity : 0;
  const boatLodScale = appCtx.boatMode?.active ? Math.max(0.34, Math.min(1, Number(appCtx.boatMode.detailBias) || 1)) : 1;
  const lodThresholds = runtime.getWorldLodThresholds(depthForLod, mode, dynamicBudgetState.lodScale * boatLodScale);
  const poiMidSq = lodThresholds.mid * lodThresholds.mid;

  for (let i = 0; i < appCtx.roadMeshes.length; i += 1) setEarthMeshVisible(appCtx.roadMeshes[i], true);
  let nearVisible = 0;
  let midVisible = 0;

  if (mode === 'baseline') {
    for (let i = 0; i < appCtx.buildingMeshes.length; i += 1) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
      setEarthMeshVisible(mesh, true);
      const count = mesh.userData?.isBuildingBatch ? Math.max(1, mesh.userData?.batchCount || 1) : 1;
      if (mesh.userData?.lodTier === 'mid') midVisible += count;
      else nearVisible += count;
    }
    for (let i = 0; i < appCtx.poiMeshes.length; i += 1) {
      setEarthMeshVisible(appCtx.poiMeshes[i], !!appCtx.poiMode);
    }
    for (let i = 0; i < appCtx.landuseMeshes.length; i += 1) {
      const mesh = appCtx.landuseMeshes[i];
      if (!mesh) continue;
      setEarthMeshVisible(mesh, !mesh.userData?.boatSuppressed && (mesh.userData?.alwaysVisible || !!appCtx.landUseVisible));
    }
    appCtx.setPerfLiveStat?.('lodVisible', { near: nearVisible, mid: midVisible });
    return;
  }

  const nearBuildingCandidates = [];
  const midBuildingCandidates = [];
  const groupedCandidates = new Map();
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
      appCtx.planeMode?.active ? 1200 : aerialMode ? 460 : 280 :
      appCtx.planeMode?.active ? 1000 : aerialMode ? 380 : 220;
    const limitDist = mesh.visible ? visibleDist + hysteresis : visibleDist;
    const withinDistance = distSq <= limitDist * limitDist;
    mesh.visible = false;
    const count = isBatch ? Math.max(1, mesh.userData?.batchCount || 1) : 1;
    const groupKey = String(mesh.userData?.lodGroupKey || '');
    if (groupKey) {
      if (!groupedCandidates.has(groupKey)) {
        groupedCandidates.set(groupKey, { count: 0, distSq, eligible: false, meshes: [], tier });
      }
      const group = groupedCandidates.get(groupKey);
      group.count += count;
      group.distSq = Math.min(group.distSq, distSq);
      group.eligible = group.eligible || withinDistance;
      group.meshes.push(mesh);
      continue;
    }
    if (!withinDistance) continue;
    const candidate = { count, distSq, mesh, tier };
    if (tier === 'mid') midBuildingCandidates.push(candidate);
    else nearBuildingCandidates.push(candidate);
  }
  groupedCandidates.forEach((candidate) => {
    if (!candidate.eligible) return;
    if (candidate.tier === 'mid') midBuildingCandidates.push(candidate);
    else nearBuildingCandidates.push(candidate);
  });

  nearBuildingCandidates.sort((a, b) => a.distSq - b.distSq);
  midBuildingCandidates.sort((a, b) => a.distSq - b.distSq);
  const buildingUnitBudget = visibleBuildingUnitBudget(dynamicBudgetState.budgetScale);
  const nearShare = appCtx.planeMode?.active ? 0.3 : appCtx.droneMode ? 0.38 : appCtx.camMode === 2 ? 0.5 : 0.62;
  const nearPrimary = selectBuildingCandidates(nearBuildingCandidates, Math.floor(buildingUnitBudget * nearShare));
  const midSelection = selectBuildingCandidates(midBuildingCandidates, Math.max(0, buildingUnitBudget - nearPrimary.units));
  const nearSpill = selectBuildingCandidates(
    nearBuildingCandidates,
    Math.max(0, buildingUnitBudget - nearPrimary.units - midSelection.units)
  );
  nearVisible = nearPrimary.units + nearSpill.units;
  midVisible = midSelection.units;
  const visibleNearMeshes = nearPrimary.meshes + nearSpill.meshes;
  const visibleMidMeshes = midSelection.meshes;

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
    setEarthMeshVisible(mesh, !!appCtx.poiMode && withinLod);
  }

  const landuseVisibleDist = lodThresholds.mid + 120;
  const landuseSq = landuseVisibleDist * landuseVisibleDist;
  for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
    const mesh = appCtx.landuseMeshes[i];
    if (!mesh) continue;
    if (mesh.userData?.boatSuppressed) {
      setEarthMeshVisible(mesh, false);
      continue;
    }

    const alwaysVisible = !!mesh.userData?.alwaysVisible;
    if (!appCtx.landUseVisible && !alwaysVisible) {
      setEarthMeshVisible(mesh, false);
      continue;
    }
    if (alwaysVisible) {
      setEarthMeshVisible(mesh, true);
      continue;
    }

    if (mesh.userData?.isLanduseBatch) {
      setEarthMeshVisible(mesh, !!appCtx.landUseVisible);
      continue;
    }

    const center = getMeshLodCenter(mesh);
    if (!center) {
      setEarthMeshVisible(mesh, appCtx.landUseVisible);
      continue;
    }

    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    setEarthMeshVisible(mesh, distSq <= landuseSq);
  }

  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
    appCtx.setPerfLiveStat('lodBuildingMeshes', {
      budget: buildingUnitBudget,
      eligible: nearBuildingCandidates.length + midBuildingCandidates.length,
      visible: visibleNearMeshes + visibleMidMeshes,
      visibleNearMeshes,
      visibleMidMeshes
    });
  }

  if (Array.isArray(appCtx.streetFurnitureMeshes) && appCtx.streetFurnitureMeshes.length > 0) {
    const furnitureDist = (appCtx.boatMode?.active ? lodThresholds.mid * 0.6 : lodThresholds.mid) + 80;
    const furnitureSq = furnitureDist * furnitureDist;
    for (let i = 0; i < appCtx.streetFurnitureMeshes.length; i++) {
      const mesh = appCtx.streetFurnitureMeshes[i];
      if (!mesh) continue;
      if (mesh.userData?.boatSuppressed) {
        setEarthMeshVisible(mesh, false);
        continue;
      }
      const center = getMeshLodCenter(mesh) || mesh.userData?.furniturePos || mesh.position;
      if (!center) continue;
      const dx = center.x - refX;
      const dz = center.z - refZ;
      setEarthMeshVisible(mesh, dx * dx + dz * dz <= furnitureSq);
    }
  }
}
