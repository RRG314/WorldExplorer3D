import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  appendGeometryWithTransform,
  buildMergedGeometry
} from "./geometry-batching.js?v=6";

let pointInPolygonFn = () => false;
let distanceToPolygonEdgeXZFn = () => 0;
let signedPolygonAreaXZFn = () => 0;
let pickRoofColorFn = () => 0x6c7686;

export function initRoofDetailSupport(options = {}) {
  if (typeof options.pointInPolygon === 'function') pointInPolygonFn = options.pointInPolygon;
  if (typeof options.distanceToPolygonEdgeXZ === 'function') distanceToPolygonEdgeXZFn = options.distanceToPolygonEdgeXZ;
  if (typeof options.signedPolygonAreaXZ === 'function') signedPolygonAreaXZFn = options.signedPolygonAreaXZ;
  if (typeof options.pickRoofColor === 'function') pickRoofColorFn = options.pickRoofColor;
}

export function createRoofDetailMesh(pts, height, baseElevation, bSeed, buildingType = 'yes', lodTier = 'near') {
  if (!pts || pts.length < 3 || lodTier !== 'near') return null;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const width = Math.max(0, maxX - minX);
  const depth = Math.max(0, maxZ - minZ);
  const area = Math.abs(signedPolygonAreaXZFn(pts));
  const minSpan = Math.min(width, depth);
  const flatRoofType = ['apartments', 'commercial', 'office', 'industrial', 'warehouse', 'retail', 'supermarket', 'hospital', 'school'].includes(buildingType);
  const flatRoofLikely = flatRoofType || height >= 18;
  const detailGate = flatRoofType ? 0.0 : 0.64;
  if (!flatRoofLikely || appCtx.rand01FromInt(bSeed ^ 0x5f356495) < detailGate) return null;
  if (area < 90 || minSpan < 7 || height < 10) return null;

  const placementMargin = Math.min(1.8, Math.max(0.8, minSpan * 0.09));
  const roofW = Math.max(1.4, width - placementMargin * 2);
  const roofD = Math.max(1.4, depth - placementMargin * 2);
  if (roofW < 1.4 || roofD < 1.4) return null;

  const batch = { positions: [], normals: [], uvs: [], indices: [] };
  const matrix = new THREE.Matrix4();
  const addBox = (w, h, d, x, y, z) => {
    if (!(w > 0.05 && h > 0.05 && d > 0.05)) return false;
    const geo = new THREE.BoxGeometry(w, h, d);
    matrix.makeTranslation(x, y, z);
    const appended = appendGeometryWithTransform(batch, geo, matrix);
    geo.dispose();
    return appended > 0;
  };

  let unitCount = 0;
  if (buildingType === 'industrial' || buildingType === 'warehouse') {
    unitCount = area > 220 || height > 22 ? 2 : 1;
  } else if (buildingType === 'commercial' || buildingType === 'office' || buildingType === 'hospital' || buildingType === 'school' || buildingType === 'retail' || buildingType === 'supermarket') {
    unitCount = area > 260 || height > 30 ? 2 : area > 120 || height > 16 ? 1 : 0;
  } else if (buildingType === 'apartments') {
    unitCount = area > 190 || height > 26 ? 1 : 0;
  }

  const placedUnits = [];
  const tryPlaceUnit = (seed, unitW, unitD) => {
    const minEdgeClearance = Math.max(0.75, Math.hypot(unitW, unitD) * 0.42);
    const minSpacing = Math.max(unitW, unitD) + 0.7;
    const minXPos = minX + placementMargin;
    const maxXPos = maxX - placementMargin;
    const minZPos = minZ + placementMargin;
    const maxZPos = maxZ - placementMargin;
    if (!(maxXPos > minXPos && maxZPos > minZPos)) return null;

    for (let attempt = 0; attempt < 16; attempt++) {
      const attemptSeed = seed ^ ((attempt + 1) * 0x27d4eb2d);
      const x = minXPos + appCtx.rand01FromInt(attemptSeed ^ 0x9e3779b9) * (maxXPos - minXPos);
      const z = minZPos + appCtx.rand01FromInt(attemptSeed ^ 0x85ebca6b) * (maxZPos - minZPos);
      if (!pointInPolygonFn(x, z, pts)) continue;
      if (distanceToPolygonEdgeXZFn(x, z, pts) < minEdgeClearance) continue;
      let overlaps = false;
      for (let j = 0; j < placedUnits.length; j++) {
        const placed = placedUnits[j];
        if (Math.hypot(placed.x - x, placed.z - z) < minSpacing) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return { x, z };
    }
    return null;
  };

  for (let i = 0; i < unitCount; i++) {
    const seed = bSeed ^ ((i + 1) * 0x45d9f3b);
    const unitW = 1.1 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * Math.min(2.4, roofW * 0.14);
    const unitD = 0.95 + appCtx.rand01FromInt(seed ^ 0x165667b1) * Math.min(2.0, roofD * 0.14);
    const unitH = 0.6 + appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 0.95;
    const unitPos = tryPlaceUnit(seed, unitW, unitD);
    if (!unitPos) continue;
    const plinthH = Math.min(0.16, Math.max(0.08, unitH * 0.18));
    addBox(unitW + 0.18, plinthH, unitD + 0.18, unitPos.x, height + plinthH * 0.5 + 0.06, unitPos.z);
    addBox(unitW, unitH, unitD, unitPos.x, height + unitH * 0.5 + plinthH + 0.06, unitPos.z);
    placedUnits.push(unitPos);
  }

  const geometry = buildMergedGeometry(batch);
  if (!geometry) return null;

  const material = new THREE.MeshStandardMaterial({
    color: pickRoofColorFn(bSeed),
    roughness: 0.96,
    metalness: 0.03,
    emissive: 0x0f1114,
    emissiveIntensity: 0.05
  });
  material.userData = {
    ...(material.userData || {}),
    buildingBatchKey: `roof-detail:${String(buildingType || 'yes').toLowerCase()}`
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseElevation;
  mesh.userData.buildingFootprint = pts;
  mesh.userData.avgElevation = baseElevation;
  mesh.userData.lodTier = lodTier;
  mesh.userData.isRoofDetail = true;
  mesh.userData.buildingType = buildingType;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
