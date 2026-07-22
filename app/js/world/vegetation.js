import { ctx as appCtx } from "../shared-context.js?v=55";
import { isPointInsideWaterFootprint } from "../boat-mode/water-query.js?v=14";

const VEGETATION_ELIGIBLE_TYPES = new Set([
  'forest',
  'wood',
  'scrub',
  'park',
  'garden',
  'grass',
  'meadow',
  'orchard',
  'village_green',
  'recreation_ground',
  'cemetery',
  'allotments'
]);

const TREE_DENSITY_BY_LANDUSE = {
  forest: { spacing: 18, maxPerPolygon: 180, weight: 1.15 },
  wood: { spacing: 20, maxPerPolygon: 150, weight: 1.08 },
  scrub: { spacing: 24, maxPerPolygon: 92, weight: 0.88 },
  orchard: { spacing: 14, maxPerPolygon: 120, weight: 0.95 },
  park: { spacing: 28, maxPerPolygon: 36, weight: 0.72 },
  garden: { spacing: 22, maxPerPolygon: 28, weight: 0.78 },
  grass: { spacing: 34, maxPerPolygon: 18, weight: 0.42 },
  meadow: { spacing: 30, maxPerPolygon: 24, weight: 0.52 },
  village_green: { spacing: 24, maxPerPolygon: 18, weight: 0.56 },
  recreation_ground: { spacing: 26, maxPerPolygon: 22, weight: 0.58 },
  cemetery: { spacing: 24, maxPerPolygon: 28, weight: 0.62 },
  allotments: { spacing: 20, maxPerPolygon: 28, weight: 0.64 }
};

const TREE_ROW_SPACING = 11;
const TROPICAL_TREE_COLORS = [0x174d29, 0x1d5b2d, 0x286735, 0x337441];
export const MAX_TREE_NODES = 320;
export const MAX_TREE_ROW_WAYS = 70;
const MAX_GENERATED_TREE_INSTANCES = 950;

const runtime = {
  findNearestRoad: () => ({ road: null, dist: Infinity }),
  getNearbyBuildings: () => [],
  isRoadSurfaceReachable: () => false,
  pointInPolygon: () => false,
  sanitizeWorldPathPoints: (pts) => pts,
  signedPolygonAreaXZ: () => 0
};

export function initWorldVegetation(deps = {}) {
  if (typeof deps.findNearestRoad === 'function') runtime.findNearestRoad = deps.findNearestRoad;
  if (typeof deps.getNearbyBuildings === 'function') runtime.getNearbyBuildings = deps.getNearbyBuildings;
  if (typeof deps.isRoadSurfaceReachable === 'function') runtime.isRoadSurfaceReachable = deps.isRoadSurfaceReachable;
  if (typeof deps.pointInPolygon === 'function') runtime.pointInPolygon = deps.pointInPolygon;
  if (typeof deps.sanitizeWorldPathPoints === 'function') runtime.sanitizeWorldPathPoints = deps.sanitizeWorldPathPoints;
  if (typeof deps.signedPolygonAreaXZ === 'function') runtime.signedPolygonAreaXZ = deps.signedPolygonAreaXZ;
}

function polygonCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    sumX += point.x;
    sumZ += point.z;
    count += 1;
  }
  if (count === 0) return null;
  return { x: sumX / count, z: sumZ / count };
}

function vegetationWorldDensityScale() {
  const profile = appCtx.worldSurfaceProfile || null;
  if (!profile) return 1;
  const norm = profile?.signals?.normalized || {};
  let scale = 1;
  if (profile.terrainModeHint === 'snow' || profile.reason === 'polar_latitude') {
    scale *= 0.42;
  } else if (profile.reason === 'arid_surface') {
    scale *= 0.64;
  } else if ((Number(profile.absLat) || 0) <= 24 && (Number(norm.vegetated) || 0) >= 0.18) {
    scale *= 1.22;
  } else if ((Number(profile.absLat) || 0) <= 38 && (Number(norm.vegetated) || 0) >= 0.24) {
    scale *= 1.1;
  }
  if ((Number(norm.scrub) || 0) >= 0.1) scale *= 1.04;
  if ((Number(norm.water) || 0) >= 0.18 && (Number(norm.vegetated) || 0) >= 0.22) scale *= 1.06;
  return Math.max(0.38, Math.min(1.32, scale));
}

function vegetationLanduseDensityScale(landuseType = '') {
  const worldScale = vegetationWorldDensityScale();
  if (landuseType === 'forest' || landuseType === 'wood') return Math.min(1.4, worldScale * 1.08);
  if (landuseType === 'scrub') return Math.min(1.28, worldScale * 1.04);
  if (landuseType === 'park' || landuseType === 'garden' || landuseType === 'meadow') return Math.min(1.22, worldScale);
  return worldScale;
}

function vegetationSeed(seed) {
  let v = (seed >>> 0) ^ 0x9e3779b9;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  v ^= v >>> 16;
  return v >>> 0;
}

function samplePolylinePointAtDistance(pts, distance) {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  let remaining = Math.max(0, Number(distance) || 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (!(segLen > 0)) continue;
    if (remaining <= segLen || i === pts.length - 2) {
      const t = segLen > 0 ? Math.max(0, Math.min(1, remaining / segLen)) : 0;
      return {
        x: p1.x + (p2.x - p1.x) * t,
        z: p1.z + (p2.z - p1.z) * t
      };
    }
    remaining -= segLen;
  }
  return pts[pts.length - 1] ? { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z } : null;
}

function polylineLength(pts) {
  let total = 0;
  if (!Array.isArray(pts)) return total;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return total;
}

function isInsideBuildingCollider(x, z, building) {
  if (!building || building.collisionDisabled) return false;
  if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    return runtime.pointInPolygon(x, z, building.pts);
  }
  return true;
}

function isInsideWaterArea(x, z) {
  return isPointInsideWaterFootprint(x, z);
}

function isVegetationPlacementBlocked(x, z, options = {}) {
  if (Math.hypot(x, z) < 18) return true;
  const roadPadding = Number.isFinite(options.roadPadding) ? options.roadPadding : 4.5;
  const buildingPadding = Number.isFinite(options.buildingPadding) ? options.buildingPadding : 1.8;
  const terrainY = typeof appCtx.baseTerrainHeightAt === 'function' ?
    appCtx.baseTerrainHeightAt(x, z) :
    typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(x, z) :
      appCtx.elevationWorldYAtWorldXZ(x, z);

  const nr = runtime.findNearestRoad(x, z, {
    y: Number.isFinite(terrainY) ? terrainY + 0.4 : NaN,
    maxVerticalDelta: 4.5
  });
  if (runtime.isRoadSurfaceReachable(nr, {
    extraLateralPadding: roadPadding - 1.35,
    extraVerticalAllowance: 0.2
  })) {
    return true;
  }

  const nearbyBuildings = runtime.getNearbyBuildings(x, z, buildingPadding + 10);
  for (let i = 0; i < nearbyBuildings.length; i++) {
    const building = nearbyBuildings[i];
    if (!building || building.collisionDisabled) continue;
    if (
      x < building.minX - buildingPadding ||
      x > building.maxX + buildingPadding ||
      z < building.minZ - buildingPadding ||
      z > building.maxZ + buildingPadding
    ) {
      continue;
    }
    if (isInsideBuildingCollider(x, z, building)) return true;
  }

  if (isInsideWaterArea(x, z)) return true;
  return false;
}

function mappedLanduseAt(x, z) {
  const landuses = Array.isArray(appCtx.landuses) ? appCtx.landuses : [];
  for (let i = 0; i < landuses.length; i++) {
    const landuse = landuses[i];
    const bounds = landuse?.bounds;
    if (!bounds || x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
    if (Array.isArray(landuse.pts) && runtime.pointInPolygon(x, z, landuse.pts)) return landuse;
  }
  return null;
}

export function collectWorldVegetationPlacements() {
  const placements = [];
  const treeNodes = Array.isArray(appCtx.osmTreeNodes) ? appCtx.osmTreeNodes : [];
  const treeRows = Array.isArray(appCtx.osmTreeRows) ? appCtx.osmTreeRows : [];
  const terrainMeshes = (appCtx.terrainGroup?.children || []).filter((mesh) =>
    mesh?.userData?.worldCoverResult?.vegetationSamples?.length ||
    (mesh?.userData?.worldCoverStatus === 'neighbor-fallback' && mesh?.userData?.worldCoverSurfaceMode === 'forest')
  );
  const forestTileCount = terrainMeshes.filter((mesh) => {
    const result = mesh.userData?.worldCoverResult;
    return result?.dominantClass === 'tree' ||
      result?.dominantClass === 'mangrove' ||
      mesh.userData?.worldCoverSurfaceMode === 'forest';
  }).length;
  const tropicalForest =
    (appCtx.worldSurfaceProfile?.biomeHint === 'tropical_rainforest' || Math.abs(Number(appCtx.LOC?.lat) || 0) <= 24) &&
    forestTileCount >= Math.max(1, Math.ceil(terrainMeshes.length * 0.35));
  const worldDensityScale = vegetationWorldDensityScale();
  const budgetScale =
    appCtx.rdtComplexity >= 6 ? 0.55 :
    appCtx.rdtComplexity >= 4 ? 0.72 :
    appCtx.rdtComplexity >= 2 ? 0.88 : 1;
  const biomeDensityScale = tropicalForest ? 3.2 : 1;
  const maxTrees = Math.max(
    120,
    Math.min(3600, Math.floor(MAX_GENERATED_TREE_INSTANCES * budgetScale * worldDensityScale * biomeDensityScale))
  );
  const pushPlacement = (placement) => {
    if (!placement || placements.length >= maxTrees) return false;
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.z)) return false;
    if (isVegetationPlacementBlocked(placement.x, placement.z, placement.options || undefined)) return false;
    placements.push(placement);
    return true;
  };

  for (let i = 0; i < treeNodes.length && placements.length < maxTrees; i++) {
    const node = treeNodes[i];
    if (!node || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
    const pos = appCtx.geoToWorld(node.lat, node.lon);
    const seed = vegetationSeed((appCtx.rdtSeed ^ Number(node.id || i + 1)) >>> 0);
    pushPlacement({
      x: pos.x,
      z: pos.z,
      scale: 0.82 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.78,
      canopyStretch: 0.82 + appCtx.rand01FromInt(seed ^ 0x165667b1) * 0.32,
      rotation: appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * Math.PI * 2,
      color: [0x265f24, 0x2f7329, 0x3f7d32, 0x4d8f40][Math.floor(appCtx.rand01FromInt(seed ^ 0x85ebca6b) * 4) % 4],
      source: 'node',
      landuseType: 'tree',
      options: { roadPadding: 1.25, buildingPadding: 0.9 }
    });
  }

  for (let i = 0; i < treeRows.length && placements.length < maxTrees; i++) {
    const way = treeRows[i];
    const rawPts = way?.nodes?.map((id) => appCtx._worldLoadNodes?.[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon)) || [];
    const pts = runtime.sanitizeWorldPathPoints(rawPts);
    if (pts.length < 2) continue;
    const totalLength = polylineLength(pts);
    const rowCount = Math.min(32, Math.max(2, Math.floor(totalLength / TREE_ROW_SPACING)));
    const rowSeed = vegetationSeed((appCtx.rdtSeed ^ Number(way.id || i + 1)) >>> 0);
    for (let p = 0; p < rowCount && placements.length < maxTrees; p++) {
      const spacingNoise = 0.65 + appCtx.rand01FromInt(rowSeed ^ p ^ 0x9e3779b9) * 0.7;
      const point = samplePolylinePointAtDistance(pts, p * TREE_ROW_SPACING * spacingNoise);
      if (!point) continue;
      const seed = vegetationSeed(rowSeed ^ p ^ 0x85ebca6b);
      const clusterCount = tropicalForest ? 2 + Math.floor(appCtx.rand01FromInt(seed ^ 0x243f6a88) * 3) : 1;
      for (let clusterIndex = 0; clusterIndex < clusterCount && placements.length < maxTrees; clusterIndex++) {
        const clusterSeed = vegetationSeed(seed ^ Math.imul(clusterIndex + 1, 0x9e3779b9));
        const clusterRadius = clusterIndex === 0 ? 0 : 1.5 + appCtx.rand01FromInt(clusterSeed) * 5.5;
        const clusterAngle = appCtx.rand01FromInt(clusterSeed ^ 0x85ebca6b) * Math.PI * 2;
        pushPlacement({
          x: point.x + Math.cos(clusterAngle) * clusterRadius,
          z: point.z + Math.sin(clusterAngle) * clusterRadius,
          scale: 0.86 + appCtx.rand01FromInt(clusterSeed ^ 0x7f4a7c15) * 0.62,
          canopyStretch: 0.88 + appCtx.rand01FromInt(clusterSeed ^ 0x27d4eb2f) * 0.24,
          rotation: appCtx.rand01FromInt(clusterSeed ^ 0x165667b1) * Math.PI * 2,
          color: [0x2c6726, 0x356f2d, 0x3a7b33][Math.floor(appCtx.rand01FromInt(clusterSeed ^ 0xd3a2646c) * 3) % 3],
          source: 'tree_row',
          landuseType: 'tree_row',
          options: { roadPadding: 1.75, buildingPadding: 1.0 }
        });
      }
    }
  }

  for (let i = 0; i < appCtx.landuses.length && placements.length < maxTrees; i++) {
    const lu = appCtx.landuses[i];
    if (!lu || !VEGETATION_ELIGIBLE_TYPES.has(lu.type) || !Array.isArray(lu.pts) || lu.pts.length < 3) continue;
    const cfg = TREE_DENSITY_BY_LANDUSE[lu.type] || TREE_DENSITY_BY_LANDUSE.park;
    const densityScale = vegetationLanduseDensityScale(lu.type);
    const area = Math.abs(runtime.signedPolygonAreaXZ(lu.pts));
    if (!(area > 24)) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let p = 0; p < lu.pts.length; p++) {
      const point = lu.pts[p];
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (!(width > 2) || !(depth > 2)) continue;

    const desired = Math.min(
      Math.max(2, Math.floor(area / Math.max(60, cfg.spacing * cfg.spacing * cfg.weight / Math.max(0.42, densityScale)))),
      Math.max(4, Math.floor(cfg.maxPerPolygon * budgetScale * densityScale))
    );
    const polySeed = vegetationSeed((appCtx.rdtSeed ^ (i + 1) ^ Math.floor(area * 10)) >>> 0);
    for (let attempt = 0; attempt < desired * 8 && placements.length < maxTrees; attempt++) {
      const seed = vegetationSeed(polySeed ^ attempt);
      const tx = minX + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * width;
      const tz = minZ + appCtx.rand01FromInt(seed ^ 0x165667b1) * depth;
      if (!runtime.pointInPolygon(tx, tz, lu.pts)) continue;
      pushPlacement({
        x: tx,
        z: tz,
        scale: 0.78 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * (lu.type === 'forest' || lu.type === 'wood' ? 0.92 : lu.type === 'scrub' ? 0.58 : 0.68),
        canopyStretch: 0.84 + appCtx.rand01FromInt(seed ^ 0x9e3779b9) * 0.38,
        rotation: appCtx.rand01FromInt(seed ^ 0x85ebca6b) * Math.PI * 2,
        color: (
          lu.type === 'forest' || lu.type === 'wood' ?
            [0x1d5620, 0x275f22, 0x2f6c27, 0x3d7a31] :
            lu.type === 'scrub' ?
              [0x607d3b, 0x6f8a41, 0x7d9550] :
            lu.type === 'orchard' ?
              [0x356f2d, 0x4b8a3a, 0x5d9441] :
              [0x2f7329, 0x417f34, 0x4e8c41]
        )[Math.floor(appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 4) % (lu.type === 'orchard' || lu.type === 'scrub' ? 3 : 4)],
        source: 'polygon',
        landuseType: lu.type,
        options: {
          roadPadding:
            lu.type === 'forest' || lu.type === 'wood' ? 2.2 :
            lu.type === 'scrub' ? 1.85 :
            lu.type === 'orchard' ? 2.0 :
            1.45,
          buildingPadding: lu.type === 'forest' || lu.type === 'wood' ? 1.1 : lu.type === 'scrub' ? 1.0 : 0.9
        }
      });
    }
  }

  for (let tileIndex = 0; tileIndex < terrainMeshes.length && placements.length < maxTrees; tileIndex++) {
    const mesh = terrainMeshes[tileIndex];
    const bounds = mesh.userData?.terrainTile?.bounds;
    let samples = mesh.userData?.worldCoverResult?.vegetationSamples || null;
    if ((!Array.isArray(samples) || samples.length === 0) && mesh.userData?.worldCoverStatus === 'neighbor-fallback') {
      const tileSeed = vegetationSeed(
        [...String(mesh.userData?.terrainTileKey || tileIndex)].reduce((seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619), 2166136261)
      );
      samples = [];
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          const seed = vegetationSeed(tileSeed ^ (row * 10 + col));
          samples.push({
            kind: 'tree',
            u: Math.max(0.02, Math.min(0.98, (col + 0.5 + (appCtx.rand01FromInt(seed) - 0.5) * 0.72) / 10)),
            v: Math.max(0.02, Math.min(0.98, (row + 0.5 + (appCtx.rand01FromInt(seed ^ 0x9e3779b9) - 0.5) * 0.72) / 10))
          });
        }
      }
    }
    if (!bounds || !Array.isArray(samples)) continue;
    for (let sampleIndex = 0; sampleIndex < samples.length && placements.length < maxTrees; sampleIndex++) {
      const sample = samples[sampleIndex];
      const lat = bounds.latN - (bounds.latN - bounds.latS) * Number(sample.v || 0);
      const lon = bounds.lonW + (bounds.lonE - bounds.lonW) * Number(sample.u || 0);
      const point = appCtx.geoToWorld(lat, lon);
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
      if (mappedLanduseAt(point.x, point.z)) continue;
      const seed = vegetationSeed(
        (appCtx.rdtSeed ^ Math.floor((lat + 90) * 10000) ^ Math.floor((lon + 180) * 10000)) >>> 0
      );
      const kind = String(sample.kind || 'tree');
      const isShrub = kind === 'shrub' || kind === 'wetland';
      const isTropicalTree = tropicalForest && !isShrub;
      const clusterCount = isTropicalTree ? 2 + Math.floor(appCtx.rand01FromInt(seed ^ 0x243f6a88) * 3) : 1;
      for (let clusterIndex = 0; clusterIndex < clusterCount && placements.length < maxTrees; clusterIndex++) {
        const clusterSeed = vegetationSeed(seed ^ Math.imul(clusterIndex + 1, 0x9e3779b9));
        const clusterRadius = clusterIndex === 0 ? 0 : 1.5 + appCtx.rand01FromInt(clusterSeed) * 5.5;
        const clusterAngle = appCtx.rand01FromInt(clusterSeed ^ 0x85ebca6b) * Math.PI * 2;
        pushPlacement({
          x: point.x + Math.cos(clusterAngle) * clusterRadius,
          z: point.z + Math.sin(clusterAngle) * clusterRadius,
          scale: isShrub ?
            0.42 + appCtx.rand01FromInt(clusterSeed ^ 0x27d4eb2f) * 0.35 :
            isTropicalTree ?
              1.18 + appCtx.rand01FromInt(clusterSeed ^ 0x27d4eb2f) * 0.92 :
              0.78 + appCtx.rand01FromInt(clusterSeed ^ 0x27d4eb2f) * 0.62,
          canopyStretch: isShrub ?
            0.72 :
            isTropicalTree ?
              1.08 + appCtx.rand01FromInt(clusterSeed ^ 0x9e3779b9) * 0.34 :
              0.9 + appCtx.rand01FromInt(clusterSeed ^ 0x9e3779b9) * 0.28,
          canopyWidth: isTropicalTree ?
            2.15 + appCtx.rand01FromInt(clusterSeed ^ 0x6a09e667) * 0.85 :
            1,
          rotation: appCtx.rand01FromInt(clusterSeed ^ 0x85ebca6b) * Math.PI * 2,
          color: isShrub ?
            0x55723c :
            isTropicalTree ?
              TROPICAL_TREE_COLORS[Math.floor(appCtx.rand01FromInt(clusterSeed ^ 0xd3a2646c) * TROPICAL_TREE_COLORS.length) % TROPICAL_TREE_COLORS.length] :
              kind === 'mangrove' ? 0x285f3b : 0x285f2d,
          source: mesh.userData?.worldCoverStatus === 'neighbor-fallback' ? 'worldcover_neighbor_fallback' : 'worldcover',
          landuseType: kind,
          biome: isTropicalTree ? 'tropical_forest' : 'temperate',
          options: { roadPadding: 1.8, buildingPadding: 1.0 }
        });
      }
    }
  }

  if (placements.length === 0 && Array.isArray(appCtx.landuses)) {
    for (let i = 0; i < appCtx.landuses.length && placements.length < 24; i++) {
      const lu = appCtx.landuses[i];
      if (!lu || !VEGETATION_ELIGIBLE_TYPES.has(lu.type) || !Array.isArray(lu.pts) || lu.pts.length < 3) continue;
      const centroid = polygonCentroid(lu.pts);
      if (!centroid || isVegetationPlacementBlocked(centroid.x, centroid.z, { roadPadding: 0.8, buildingPadding: 0.6 })) continue;
      placements.push({
        x: centroid.x,
        z: centroid.z,
        scale: 0.92,
        canopyStretch: 1.0,
        rotation: 0,
        color: 0x356f2d,
        source: 'fallback_polygon',
        landuseType: lu.type,
        options: { roadPadding: 0.8, buildingPadding: 0.6 }
      });
    }
  }

  return placements;
}

export function buildWorldVegetationInstancing(
  placements,
  {
    initFurnitureMaterials,
    initFurnitureGeometries,
    getResources
  } = {}
) {
  if (typeof THREE === 'undefined' || !Array.isArray(placements) || placements.length === 0) return 0;
  if (typeof initFurnitureMaterials === 'function') initFurnitureMaterials();
  if (typeof initFurnitureGeometries === 'function') initFurnitureGeometries();
  const resources = typeof getResources === 'function' ? getResources() : {};
  const trunkGeometry = resources?.geoTreeTrunk || null;
  const canopyGeometry = resources?.geoTreeCanopy || null;
  const trunkMaterial = resources?.matTrunk || null;
  if (!trunkGeometry || !canopyGeometry || !trunkMaterial) return 0;

  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x102d14,
    emissiveIntensity: 0.32,
    roughness: 0.96,
    metalness: 0.0
  });
  const canopyMesh = new THREE.InstancedMesh(canopyGeometry, canopyMat, placements.length);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  trunkMesh.castShadow = false;
  trunkMesh.receiveShadow = false;
  canopyMesh.castShadow = false;
  canopyMesh.receiveShadow = false;
  trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  canopyMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const baseY = typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(placement.x, placement.z) :
      appCtx.elevationWorldYAtWorldXZ(placement.x, placement.z);
    const trunkScale = Math.max(0.65, Number(placement.scale) || 1);
    const canopyStretch = Math.max(0.72, Number(placement.canopyStretch) || 1);
    const canopyWidth = Math.max(0.8, Number(placement.canopyWidth) || 1);
    euler.set(0, Number(placement.rotation) || 0, 0);
    quat.setFromEuler(euler);

    scale.set(trunkScale, trunkScale, trunkScale);
    matrix.compose(
      new THREE.Vector3(placement.x, baseY + 2.3 * trunkScale, placement.z),
      quat,
      scale
    );
    trunkMesh.setMatrixAt(i, matrix);

    scale.set(trunkScale * canopyWidth, trunkScale * canopyStretch, trunkScale * canopyWidth);
    matrix.compose(
      new THREE.Vector3(placement.x, baseY + 6.55 * trunkScale, placement.z),
      quat,
      scale
    );
    canopyMesh.setMatrixAt(i, matrix);
    color.setHex(Number(placement.color) || 0x2f7329);
    canopyMesh.setColorAt(i, color);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;

  trunkMesh.userData.isVegetationBatch = true;
  canopyMesh.userData.isVegetationBatch = true;
  trunkMesh.frustumCulled = false;
  canopyMesh.frustumCulled = false;
  appCtx.scene.add(trunkMesh);
  appCtx.scene.add(canopyMesh);
  appCtx.vegetationMeshes.push(trunkMesh, canopyMesh);
  appCtx.replaceWorldCollection('vegetationFeatures', placements);
  return placements.length;
}
