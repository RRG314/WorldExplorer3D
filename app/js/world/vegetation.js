import { ctx as appCtx } from "../shared-context.js?v=55";
import { isPointInsideWaterFootprint } from "../boat-mode/water-query.js?v=21";
import { vegetationIdentitySeed, semanticForestWeightAt, nearbyVegetationCells } from './vegetation-spatial.js';
import {renderVegetationModels} from './vegetation-models.js';

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
export const MAX_TREE_NODES = 320;
export const MAX_TREE_ROW_WAYS = 70;
const MAX_GENERATED_TREE_INSTANCES = 950;
const MAX_TROPICAL_TREE_INSTANCES = 4000;

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

function isTropicalCanopyLocation() {
  const biomeId = String(appCtx.worldSurfaceProfile?.biome?.id || '');
  return biomeId.startsWith('tropical-');
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
  if (Number.isFinite(appCtx.streetPavement?.sampleAt(x,z))) return true;
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
  const actor=appCtx.activeTransportActor?.();
  const focus={x:Number(actor?.position?.x)||0,z:Number(actor?.position?.z)||0};
  const treeNodes = Array.isArray(appCtx.osmTreeNodes) ? appCtx.osmTreeNodes : [];
  const treeRows = Array.isArray(appCtx.osmTreeRows) ? appCtx.osmTreeRows : [];
  const worldDensityScale = vegetationWorldDensityScale();
  const budgetScale =
    appCtx.rdtComplexity >= 6 ? 0.55 :
    appCtx.rdtComplexity >= 4 ? 0.72 :
    appCtx.rdtComplexity >= 2 ? 0.88 : 1;
  const tropicalCanopy = isTropicalCanopyLocation();
  const performanceTier = appCtx.getDynamicBudgetState?.().tier === 'performance';
  const maxTrees = Math.max(120, Math.floor(
    (tropicalCanopy ? MAX_TROPICAL_TREE_INSTANCES * (performanceTier ? 0.5 : 1) : MAX_GENERATED_TREE_INSTANCES) *
    budgetScale *
    worldDensityScale
  ));
  const pushPlacement = (placement) => {
    if (!placement || placements.length >= maxTrees) return false;
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.z)) return false;
    if (!['node','tree_row'].includes(placement.source) && Math.hypot(placement.x-focus.x,placement.z-focus.z)>1800) return false;
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
      leafType: node.tags?.leaf_type || '',
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
      pushPlacement({
        x: point.x,
        z: point.z,
        scale: 0.86 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.62,
        canopyStretch: 0.88 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * 0.24,
        rotation: appCtx.rand01FromInt(seed ^ 0x165667b1) * Math.PI * 2,
        color: [0x2c6726, 0x356f2d, 0x3a7b33][Math.floor(appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 3) % 3],
        source: 'tree_row',
        landuseType: 'tree_row',
        options: { roadPadding: 1.75, buildingPadding: 1.0 }
      });
    }
  }

  const prioritizedLanduses = [...(appCtx.landuses || [])].sort((a,b) => {
    const distance=lu=>lu?.bounds ? Math.hypot(Math.max(lu.bounds.minX-focus.x,0,focus.x-lu.bounds.maxX),Math.max(lu.bounds.minZ-focus.z,0,focus.z-lu.bounds.maxZ)) : Infinity;
    return distance(a)-distance(b) || String(a?.sourceFeatureId||'').localeCompare(String(b?.sourceFeatureId||''));
  });
  for (let i = 0; i < prioritizedLanduses.length && placements.length < maxTrees; i++) {
    const lu = prioritizedLanduses[i];
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
    const polygonIdentity=lu.sourceFeatureId || `${lu.type}:${minX}:${minZ}:${maxX}:${maxZ}`;
    minX=Math.max(minX,focus.x-1800);maxX=Math.min(maxX,focus.x+1800);
    minZ=Math.max(minZ,focus.z-1800);maxZ=Math.min(maxZ,focus.z+1800);
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (!(width > 2) || !(depth > 2)) continue;

    const desired = Math.min(
      Math.max(2, Math.floor(area / Math.max(60, cfg.spacing * cfg.spacing * cfg.weight / Math.max(0.42, densityScale)))),
      Math.max(4, Math.floor(cfg.maxPerPolygon * budgetScale * densityScale))
    );
    const polySeed = vegetationSeed((appCtx.rdtSeed ^ vegetationIdentitySeed(polygonIdentity)) >>> 0);
    const polygonStartCount = placements.length;
    const spacing = cfg.spacing / Math.sqrt(Math.max(0.42,densityScale));
    for (const cell of nearbyVegetationCells({minX,maxX,minZ,maxZ},spacing,desired*8,focus)) {
      if (placements.length >= maxTrees || placements.length-polygonStartCount >= desired) break;
      const seed = vegetationSeed(polySeed ^ vegetationIdentitySeed(`${cell.cx}:${cell.cz}`));
      const cluster = (vegetationIdentitySeed(`${Math.floor(cell.cx/5)}:${Math.floor(cell.cz/5)}:${polySeed}`) % 1000) / 1000;
      if (lu.type !== 'orchard' && appCtx.rand01FromInt(seed ^ 0x94d049bb) > 0.45 + cluster * 0.5) continue;
      const tx = (cell.cx + 0.1 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.8) * spacing;
      const tz = (cell.cz + 0.1 + appCtx.rand01FromInt(seed ^ 0x165667b1) * 0.8) * spacing;
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

  const terrainMeshes = tropicalCanopy ? [] : (appCtx.terrainGroup?.children || []).filter(
    (mesh) => mesh?.userData?.worldCoverResult?.vegetationSamples?.length
  ).sort((a,b)=>Math.hypot(a.position.x-focus.x,a.position.z-focus.z)-Math.hypot(b.position.x-focus.x,b.position.z-focus.z));
  for (let tileIndex = 0; tileIndex < terrainMeshes.length && placements.length < maxTrees; tileIndex++) {
    const mesh = terrainMeshes[tileIndex];
    const bounds = mesh.userData?.terrainTile?.bounds;
    const samples = mesh.userData.worldCoverResult.vegetationSamples;
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
      pushPlacement({
        x: point.x,
        z: point.z,
        scale: isShrub ? 0.42 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * 0.35 : 0.78 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * 0.62,
        canopyStretch: isShrub ? 0.72 : 0.9 + appCtx.rand01FromInt(seed ^ 0x9e3779b9) * 0.28,
        rotation: appCtx.rand01FromInt(seed ^ 0x85ebca6b) * Math.PI * 2,
        color: isShrub ? 0x55723c : kind === 'mangrove' ? 0x285f3b : 0x285f2d,
        source: 'worldcover',
        landuseType: kind,
        options: { roadPadding: 1.8, buildingPadding: 1.0 }
      });
    }
  }

  // The terrain compiler already owns a provider-independent semantic forest
  // weight. Use that accepted surface product when optional raster vegetation
  // samples are unavailable, so a provider outage cannot turn a mapped jungle
  // into an empty green sheet or trigger a duplicate land-cover request.
  const semanticMeshes = (appCtx.terrainGroup?.children || []).filter((mesh) => {
    const positions = mesh?.geometry?.attributes?.position;
    const mixA = mesh?.geometry?.attributes?.terrainSurfaceMixA;
    return positions && mixA && positions.count === mixA.count;
  }).sort((a,b)=>Math.hypot(a.position.x-focus.x,a.position.z-focus.z)-Math.hypot(b.position.x-focus.x,b.position.z-focus.z));
  const hasWorldCoverPlacements = placements.some((placement) => placement.source === 'worldcover');
  if (!hasWorldCoverPlacements || tropicalCanopy) {
    for (let meshIndex = 0; meshIndex < semanticMeshes.length && placements.length < maxTrees; meshIndex += 1) {
      const mesh = semanticMeshes[meshIndex];
      const perMeshBudget = Math.min(tropicalCanopy ? 1600 : 400,maxTrees-placements.length);
      const params=mesh.geometry.parameters;
      if(!params?.width || !params?.height) continue;
      const area={minX:Math.max(focus.x-900,mesh.position.x-params.width/2),maxX:Math.min(focus.x+900,mesh.position.x+params.width/2),minZ:Math.max(focus.z-900,mesh.position.z-params.height/2),maxZ:Math.min(focus.z+900,mesh.position.z+params.height/2)};
      if(area.minX>=area.maxX || area.minZ>=area.maxZ) continue;
      const spacing=tropicalCanopy ? 12 : 18;
      let accepted = 0;
      for (const {cx,cz} of nearbyVegetationCells(area,spacing,perMeshBudget*5,focus)) {
        if(accepted>=perMeshBudget || placements.length>=maxTrees) break;
        const seed = vegetationIdentitySeed(`${cx}:${cz}:forest`);
        const x=(cx+0.15+appCtx.rand01FromInt(seed^0x7f4a7c15)*.7)*spacing;
        const z=(cz+0.15+appCtx.rand01FromInt(seed^0x165667b1)*.7)*spacing;
        const forestWeight=semanticForestWeightAt(mesh,x,z);
        if(forestWeight < (tropicalCanopy ? .6 : .7)) continue;
        const cluster=appCtx.rand01FromInt(vegetationIdentitySeed(`${Math.floor(cx/5)}:${Math.floor(cz/5)}`));
        if(appCtx.rand01FromInt(seed^0x27d4eb2f)>.6+.35*cluster) continue;
        const mappedLanduse = mappedLanduseAt(x, z);
        if (mappedLanduse?.type && !VEGETATION_ELIGIBLE_TYPES.has(mappedLanduse.type)) continue;
        const layerRoll = appCtx.rand01FromInt(seed ^ 0xd3a2646c);
        const layer = tropicalCanopy
          ? layerRoll > 0.86 ? 'emergent' : layerRoll < 0.22 ? 'understory' : 'canopy'
          : 'canopy';
        const scale = tropicalCanopy
          ? layer === 'emergent'
            ? 1.6 + appCtx.rand01FromInt(seed ^ 0xa511e9b3) * 0.7
            : layer === 'understory'
              ? 0.62 + appCtx.rand01FromInt(seed ^ 0xa511e9b3) * 0.38
              : 0.95 + appCtx.rand01FromInt(seed ^ 0xa511e9b3) * 0.65
          : 0.76 + appCtx.rand01FromInt(seed ^ 0xa511e9b3) * 0.72;
        if (pushPlacement({
          x,
          z,
          scale,
          canopyStretch: tropicalCanopy
            ? 0.72 + appCtx.rand01FromInt(seed ^ 0x9e3779b9) * 0.55
            : 0.84 + appCtx.rand01FromInt(seed ^ 0x9e3779b9) * 0.34,
          rotation: appCtx.rand01FromInt(seed ^ 0x85ebca6b) * Math.PI * 2,
          color: tropicalCanopy
            ? [0x164d27, 0x1d5e2a, 0x286f32, 0x347c38][Math.floor(appCtx.rand01FromInt(seed ^ 0xc2b2ae35) * 4) % 4]
            : 0x285f2d,
          source: 'terrain_semantic_forest',
          landuseType: tropicalCanopy ? 'tropical_forest' : 'forest',
          biome: tropicalCanopy ? 'tropical_rainforest' : 'temperate_forest',
          layer,
          vine: tropicalCanopy && layer !== 'understory' && appCtx.rand01FromInt(seed ^ 0x94d049bb) > 0.82,
          options: { roadPadding: 1.8, buildingPadding: 1.0 }
        })) accepted += 1;
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

  // Small, bounded understory around supported forest trees; never a second
  // unconstrained scatter pass across roads, gardens, farms or water.
  const groundcover=[];
  for (const tree of placements) {
    if (groundcover.length >= 180) break;
    if (!['forest','wood','tropical_forest'].includes(tree.landuseType) || Math.hypot(tree.x-focus.x,tree.z-focus.z)>300) continue;
    const seed=vegetationIdentitySeed(`${tree.x}:${tree.z}:understory`);
    const x=tree.x+Math.cos(seed)*1.3, z=tree.z+Math.sin(seed)*1.3;
    if (isVegetationPlacementBlocked(x,z)) continue;
    const mapped=mappedLanduseAt(x,z);
    const supported=mapped ? ['forest','wood'].includes(mapped.type) : (appCtx.terrainGroup?.children||[]).some(mesh=>semanticForestWeightAt(mesh,x,z)>.7);
    if (supported) groundcover.push({x,z,scale:0.7+(seed%40)/100,rotation:seed%628/100,landuseType:'forest_groundcover',source:'supported-forest-understory'});
  }
  // Herbaceous wetland cover is not a forest. Close clumps use the same
  // accepted numeric raster, exclusion checks and existing instance publisher.
  const marsh=[];
  for(const mesh of appCtx.terrainGroup?.children||[]) {
    if(marsh.length>=600)break;
    const result=mesh.userData?.worldCoverResult,bounds=mesh.userData?.terrainTile?.bounds;
    const classes=result?.classIds,n=Math.sqrt(classes?.length||0);
    if(!bounds || !Number.isInteger(n) || n<2)continue;
    const nw=appCtx.geoToWorld(bounds.latN,bounds.lonW),se=appCtx.geoToWorld(bounds.latS,bounds.lonE);
    const area={minX:Math.max(nw.x,focus.x-90),maxX:Math.min(se.x,focus.x+90),minZ:Math.max(nw.z,focus.z-90),maxZ:Math.min(se.z,focus.z+90)};
    if(area.maxX<=area.minX || area.maxZ<=area.minZ)continue;
    for(const cell of nearbyVegetationCells(area,4,1000,focus)) {
      if(marsh.length>=600)break;
      const seed=vegetationIdentitySeed(`wetland:${cell.cx}:${cell.cz}`);
      const x=(cell.cx+.15+(seed%700)/1000)*4,z=(cell.cz+.15+((seed>>>12)%700)/1000)*4;
      if(x<area.minX || x>area.maxX || z<area.minZ || z>area.maxZ)continue;
      const u=Math.min(n-1,Math.floor((x-nw.x)/(se.x-nw.x)*n)),v=Math.min(n-1,Math.floor((z-nw.z)/(se.z-nw.z)*n));
      if(classes[v*n+u]!==90 || isVegetationPlacementBlocked(x,z,{roadPadding:1.8,buildingPadding:1}))continue;
      marsh.push({x,z,scale:.65+(seed%65)/100,rotation:seed%628/100,landuseType:'wetland_groundcover',source:'numeric-herbaceous-wetland'});
    }
  }
  return placements.concat(groundcover,marsh);
}

export function buildWorldVegetationInstancing(placements) {
  if (typeof THREE === 'undefined' || !Array.isArray(placements)) return 0;
  return renderVegetationModels(appCtx, placements);
}
