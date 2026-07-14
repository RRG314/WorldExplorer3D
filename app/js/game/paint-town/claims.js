import { ctx as appCtx } from "../../shared-context.js?v=55";
import { PAINT_TOWN_DEFAULT_COLOR } from "./constants.js?v=1";
import {
  ensurePaintTownState,
  getPaintTownPlayerUid,
  normalizePaintColorHex,
  normalizePaintMethod,
  paintColorHexToInt,
  paintColorNameFromHex,
  updatePaintTownHud
} from "./core.js?v=1";

function getBuildingKey(building, index = 0) {
  if (!building) return `building-${index}`;
  if (building.sourceBuildingId) return String(building.sourceBuildingId);
  if (building._paintTownKey) return building._paintTownKey;
  const cx = Number.isFinite(building.centerX) ? Math.round(building.centerX * 10) : index;
  const cz = Number.isFinite(building.centerZ) ? Math.round(building.centerZ * 10) : index;
  const height = Number.isFinite(building.height) ? Math.round(building.height * 10) : 0;
  building._paintTownKey = `building-${cx}-${cz}-${height}-${index}`;
  return building._paintTownKey;
}

function footprintSignature(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return "";
  return pts.map((pt) => `${Math.round(Number(pt.x || 0) * 10)},${Math.round(Number(pt.z || 0) * 10)}`).join(";");
}

export function buildPaintTownBuildingIndex() {
  const state = ensurePaintTownState();
  state.buildingByKey.clear();
  state.sourceIdToKey.clear();
  state.footprintToKey.clear();

  const buildings = Array.isArray(appCtx.buildings) ? appCtx.buildings : [];
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building) continue;
    const key = getBuildingKey(building, i);
    state.buildingByKey.set(key, building);
    if (building.sourceBuildingId) {
      state.sourceIdToKey.set(String(building.sourceBuildingId), key);
    }
    const signature = footprintSignature(building.pts);
    if (signature) state.footprintToKey.set(signature, key);
  }
}

function buildingContainsPoint(building, x, z) {
  if (!building) return false;
  if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
  if (Array.isArray(building.pts) && building.pts.length >= 3 && typeof appCtx.pointInPolygon === "function") {
    return appCtx.pointInPolygon(x, z, building.pts);
  }
  return true;
}

function getBuildingRoofY(building, x, z) {
  if (Number.isFinite(building?.maxY)) return building.maxY;
  let baseY = Number.isFinite(building?.baseY) ? building.baseY : NaN;
  if (!Number.isFinite(baseY) && typeof appCtx.terrainMeshHeightAt === "function") {
    baseY = appCtx.terrainMeshHeightAt(x, z);
  }
  if (!Number.isFinite(baseY) && typeof appCtx.elevationWorldYAtWorldXZ === "function") {
    baseY = appCtx.elevationWorldYAtWorldXZ(x, z);
  }
  if (!Number.isFinite(baseY) && Number.isFinite(building?.minY)) {
    baseY = building.minY;
  }
  if (!Number.isFinite(baseY)) baseY = 0;
  return baseY + (Number.isFinite(building?.height) ? building.height : 0);
}

function footprintsMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 0.05 || Math.abs(a[i].z - b[i].z) > 0.05) return false;
  }
  return true;
}

export function findPaintableRoofBuilding(actor) {
  const mode = actor?.mode === "drone" ? "drone" : "ground";
  const preferredMin = mode === "drone" ? -2.5 : -1.5;
  const preferredMax = mode === "drone" ? 9.5 : 4.0;
  const fallbackAbsDelta = mode === "drone" ? 14 : 6;

  function pickCandidate(best, candidate) {
    if (!best) return candidate;
    if (candidate.absDelta < best.absDelta - 0.02) return candidate;
    if (Math.abs(candidate.absDelta - best.absDelta) <= 0.02 && candidate.roofY > best.roofY) return candidate;
    return best;
  }

  function scanCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    let bestPreferred = null;
    let bestFallback = null;

    for (let i = 0; i < candidates.length; i++) {
      const building = candidates[i];
      if (!buildingContainsPoint(building, actor.x, actor.z)) continue;
      const roofY = getBuildingRoofY(building, actor.x, actor.z);
      const verticalDelta = actor.feetY - roofY;
      if (!Number.isFinite(verticalDelta)) continue;
      const absDelta = Math.abs(verticalDelta);
      const candidate = { building, roofY, key: getBuildingKey(building, i), absDelta };

      if (verticalDelta >= preferredMin && verticalDelta <= preferredMax) {
        bestPreferred = pickCandidate(bestPreferred, candidate);
        continue;
      }
      if (absDelta <= fallbackAbsDelta) bestFallback = pickCandidate(bestFallback, candidate);
    }

    return bestPreferred || bestFallback;
  }

  const nearby = typeof appCtx.getNearbyBuildings === "function"
    ? appCtx.getNearbyBuildings(actor.x, actor.z, 14)
    : appCtx.buildings;
  const nearbyHit = scanCandidates(nearby);
  if (nearbyHit) return nearbyHit;
  return nearby !== appCtx.buildings ? scanCandidates(appCtx.buildings) : null;
}

function getBuildingMeshesForKey(key, building = null) {
  if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length === 0) return [];
  const out = [];
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (!mesh || mesh.userData?.isBuildingBatch) continue;
    const meshKey = mesh.userData?.sourceBuildingId ? String(mesh.userData.sourceBuildingId) : null;
    if (meshKey && meshKey === key) {
      out.push(mesh);
      continue;
    }
    if (!building || !Array.isArray(building.pts)) continue;
    const footprint = mesh.userData?.buildingFootprint;
    if (!Array.isArray(footprint) || footprint.length === 0) continue;
    if (footprint === building.pts || footprintsMatch(footprint, building.pts)) out.push(mesh);
  }
  return out;
}

export function resolveBuildingKeyFromMesh(meshLike, fallbackPoint = null) {
  const state = ensurePaintTownState();
  let cursor = meshLike || null;
  while (cursor) {
    const sourceId = cursor.userData?.sourceBuildingId;
    if (sourceId && state.sourceIdToKey.has(String(sourceId))) {
      return state.sourceIdToKey.get(String(sourceId));
    }
    const signature = footprintSignature(cursor.userData?.buildingFootprint);
    if (signature && state.footprintToKey.has(signature)) {
      return state.footprintToKey.get(signature);
    }
    cursor = cursor.parent || null;
  }

  if (fallbackPoint && Number.isFinite(fallbackPoint.x) && Number.isFinite(fallbackPoint.z)) {
    const nearby = typeof appCtx.getNearbyBuildings === "function"
      ? appCtx.getNearbyBuildings(fallbackPoint.x, fallbackPoint.z, 22) || []
      : (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);
    for (let i = 0; i < nearby.length; i++) {
      const building = nearby[i];
      if (!buildingContainsPoint(building, fallbackPoint.x, fallbackPoint.z)) continue;
      return getBuildingKey(building, i);
    }
  }

  return "";
}

function createPaintTownMaterial(baseMaterial, colorHex) {
  const material = baseMaterial?.isMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.08 });
  const paintColorInt = paintColorHexToInt(colorHex);
  if (material.color && typeof material.color.setHex === "function") material.color.setHex(paintColorInt);
  if ("map" in material) material.map = null;
  if ("normalMap" in material) material.normalMap = null;
  if ("roughnessMap" in material) material.roughnessMap = null;
  if ("metalnessMap" in material) material.metalnessMap = null;
  if ("aoMap" in material) material.aoMap = null;
  if ("bumpMap" in material) material.bumpMap = null;
  if ("emissive" in material && material.emissive && typeof material.emissive.setHex === "function") {
    material.emissive.setHex(0x220000);
    material.emissiveIntensity = 0.24;
  }
  if ("roughness" in material && Number.isFinite(material.roughness)) material.roughness = Math.max(0.62, material.roughness);
  if ("metalness" in material && Number.isFinite(material.metalness)) material.metalness = Math.min(0.2, material.metalness);
  material.needsUpdate = true;
  return material;
}

function disposePaintTownMaterials(paintMaterials) {
  if (Array.isArray(paintMaterials)) {
    paintMaterials.forEach((mat) => mat?.dispose && mat.dispose());
  } else if (paintMaterials?.dispose) {
    paintMaterials.dispose();
  }
}

function applyPaintToBuildingMesh(mesh, colorHex = PAINT_TOWN_DEFAULT_COLOR.hex) {
  if (!mesh) return;
  const normalizedColor = normalizePaintColorHex(colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);

  if (!mesh.userData?.paintTownPainted) {
    mesh.userData.paintTownOriginalMaterial = mesh.material;
    const detailVisibility = [];
    mesh.children.forEach((child) => {
      if (child?.userData?.photorealBuildingDetail) {
        detailVisibility.push({ child, visible: child.visible });
        child.visible = false;
      }
    });
    mesh.userData.paintTownDetailVisibility = detailVisibility;
    mesh.userData.paintTownPainted = true;
  } else if (mesh.userData.paintTownColorHex === normalizedColor) {
    return;
  } else {
    disposePaintTownMaterials(mesh.userData.paintTownPaintMaterials);
  }

  const sourceMaterial = mesh.userData.paintTownOriginalMaterial || mesh.material;
  const paintMaterials = Array.isArray(sourceMaterial)
    ? sourceMaterial.map((mat) => createPaintTownMaterial(mat, normalizedColor))
    : createPaintTownMaterial(sourceMaterial, normalizedColor);
  mesh.material = paintMaterials;
  mesh.userData.paintTownPaintMaterials = paintMaterials;
  mesh.userData.paintTownColorHex = normalizedColor;
}

export function restorePaintTownMesh(mesh) {
  if (!mesh || !mesh.userData?.paintTownPainted) return;
  if (mesh.userData.paintTownOriginalMaterial) mesh.material = mesh.userData.paintTownOriginalMaterial;
  disposePaintTownMaterials(mesh.userData.paintTownPaintMaterials);

  if (Array.isArray(mesh.userData.paintTownDetailVisibility)) {
    mesh.userData.paintTownDetailVisibility.forEach((entry) => {
      if (entry?.child) entry.child.visible = !!entry.visible;
    });
  }

  delete mesh.userData.paintTownOriginalMaterial;
  delete mesh.userData.paintTownPaintMaterials;
  delete mesh.userData.paintTownDetailVisibility;
  delete mesh.userData.paintTownColorHex;
  delete mesh.userData.paintTownPainted;
}

function normalizePaintClaimPayload(raw = {}) {
  const key = String(raw.key || "").trim().slice(0, 120);
  if (!key) return null;
  const colorHex = normalizePaintColorHex(raw.colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const colorName = String(raw.colorName || paintColorNameFromHex(colorHex)).trim().slice(0, 24) || paintColorNameFromHex(colorHex);
  const uid = String(raw.uid || getPaintTownPlayerUid()).trim() || "local-player";
  const method = normalizePaintMethod(raw.method);
  return { key, colorHex, colorName, uid, method };
}

export function recomputePaintTownCounters() {
  const state = ensurePaintTownState();
  const totals = Object.create(null);
  const playerUid = String(state.multiplayerUid || getPaintTownPlayerUid()).trim() || "local-player";
  let playerCount = 0;

  state.claimsByKey.forEach((claim) => {
    if (!claim) return;
    const hex = normalizePaintColorHex(claim.colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
    totals[hex] = (totals[hex] || 0) + 1;
    if (String(claim.uid || "") === playerUid) playerCount += 1;
  });

  state.colorCounts = totals;
  state.paintedBuildings = playerCount;
  state.paintedKeys = new Set(
    [...state.claimsByKey.entries()]
      .filter(([, claim]) => String(claim?.uid || "") === playerUid)
      .map(([key]) => key)
  );
}

export function paintBuildingFromClaim(rawClaim = {}, options = {}) {
  const state = ensurePaintTownState();
  const claim = normalizePaintClaimPayload(rawClaim);
  if (!claim) return false;

  const previous = state.claimsByKey.get(claim.key);
  if (
    previous &&
    previous.colorHex === claim.colorHex &&
    previous.uid === claim.uid &&
    previous.method === claim.method
  ) {
    return false;
  }

  state.claimsByKey.set(claim.key, claim);
  const building = state.buildingByKey.get(claim.key) || null;
  const meshes = getBuildingMeshesForKey(claim.key, building);
  meshes.forEach((mesh) => applyPaintToBuildingMesh(mesh, claim.colorHex));
  recomputePaintTownCounters();

  if (options.publish !== false && typeof appCtx.publishPaintTownClaim === "function") {
    Promise.resolve(appCtx.publishPaintTownClaim({
      key: claim.key,
      colorHex: claim.colorHex,
      colorName: claim.colorName,
      method: claim.method
    })).catch((err) => {
      console.warn("[painttown] publish claim failed:", err);
    });
  }

  return true;
}

export function applyRemotePaintTownClaims(claims = [], roomId = "") {
  const state = ensurePaintTownState();
  const safeRoomId = String(roomId || "").trim();
  if (safeRoomId && state.multiplayerRoomId && safeRoomId !== state.multiplayerRoomId) return;
  state.latestRemoteClaims = Array.isArray(claims) ? claims.slice(0, 5000) : [];
  if (!Array.isArray(claims) || claims.length === 0) {
    recomputePaintTownCounters();
    return;
  }
  for (let i = 0; i < claims.length; i++) {
    paintBuildingFromClaim(claims[i], { publish: false });
  }
  state.remoteSyncRevision += 1;
  updatePaintTownHud();
}
