import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials
} from "./road-render.js?v=1";
import {
  classifyWaterSurfaceProfile,
  classifyWorldSurfaceProfile,
  normalizeLanduseSurfaceType
} from "./surface-rules.js?v=3";
import {
  buildWaterShaderLibrary,
  inferWaterRenderContext
} from "./water-dynamics.js?v=2";
import {
  areRoadsConnected,
  assignFeatureConnections,
  buildFeatureRibbonEdges,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  classifyStructureSemantics,
  featureTraversalKey,
  isRoadSurfaceReachable,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
} from "./structure-semantics.js?v=9";
import {
  interpretBuildingSemantics
} from "./building-semantics.js?v=2";
import {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  initWorldSpawning,
  resolveSafeWorldSpawn,
  spawnOnRoad,
  terrainYAtWorld,
  tryAutoEnterBoatAt
} from "./world/spawn.js?v=1";
import {
  scheduleDeferredWorldLinearFeatureLoad
} from "./world/linear-features.js?v=1";
import {
  buildWorldOverpassPlan,
  fetchOverpassJSON,
  getWorldLoadSignature,
  initWorldOsmLoader,
  sameLocation
} from "./world/osm-loader.js?v=1";
import {
  clampNumber,
  featureTileKeyForLatLon,
  getAdaptiveLoadProfile,
  getRoadSubdivisionStep,
  getRuntimeDynamicBudget,
  getWorldLodThresholds,
  initWorldBudgets,
  limitNodesByTileBudget,
  limitWaysByTileBudget,
  rdtDepthForFeatureTile,
  wayCenterLatLon
} from "./world/budgets.js?v=1";
import {
  initWorldLod,
  updateWorldLod
} from "./world/lod.js?v=1";
import {
  buildPoiGeometryPass,
  buildStreetFurniturePass,
  createSyntheticFallbackWorld,
  finalizeLoadedWorld,
  recordWorldLoadWarning,
  safeWorldLoadCall
} from "./world/load-support.js?v=1";
import {
  earthSceneSuppressed,
  hideEarthSceneMeshes,
  resetWorldForReload
} from "./world/load-reset.js?v=1";
import {
  prepareWorldFeatureSelections
} from "./world/load-budgeting.js?v=1";
import {
  buildingContainingPoint,
  findNearestRoad,
  initWorldNavigation,
  largeMapScreenToWorld,
  minimapScreenToWorld,
  pointInPolygon,
  runtimeRoadFeatures,
  teleportToLocation
} from "./world/navigation.js?v=1";
import {
  buildTraversalNetworks,
  findNearestTraversalFeature,
  findTraversalRoute,
  initWorldTraversal,
  invalidateTraversalNetworks,
  measureRemainingPolylineDistance,
  pickNavigationTargetPoint,
  surfaceDisplayName,
  traversableFeaturesForMode
} from "./world/traversal.js?v=1";
import {
  initWorldVegetation,
  MAX_TREE_NODES,
  MAX_TREE_ROW_WAYS
} from "./world/vegetation.js?v=1";
import {
  resetWorldFurnitureCaches
} from "./world/furniture.js?v=1";
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

const WATER_VECTOR_TILE_ZOOM = 13;
const WATER_VECTOR_TILE_FETCH_TIMEOUT_MS = 8000;
const WATER_VECTOR_TILE_ENDPOINT = (z, x, y) =>
`https://vector.openstreetmap.org/shortbread_v1/${z}/${x}/${y}.mvt`;
let _vectorTileLibPromise = null;
const BUILDING_INDEX_CELL_SIZE = 120;
let buildingSpatialIndex = new Map();
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const FEATURE_CLIP_RADIUS_SCALE = 1.75;
const FEATURE_CLIP_RADIUS_MIN = 1900;
const FEATURE_CLIP_RADIUS_MAX = 9000;
const FEATURE_MAX_SEGMENT_SCALE = 0.48;
const FEATURE_MAX_SEGMENT_MIN = 260;
const FEATURE_MAX_SEGMENT_MAX = 1700;
const FEATURE_MAX_SPAN_SCALE = 1.25;
const FEATURE_MAX_AREA_SCALE = 1.0;
const FEATURE_MIN_POLYGON_AREA = 8;
const FEATURE_MIN_HOLE_AREA = 6;
const DRIVEABLE_HIGHWAY_TYPES = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service'
]);
const LINEAR_FEATURE_STYLE_PRESETS = {
  railway: {
    width: 3.2,
    bias: 0.02,
    color: 0x53545a,
    emissive: 0x111317,
    emissiveIntensity: 0.08,
    roughness: 0.9,
    metalness: 0.07,
    opacity: 1
  },
  footway: {
    width: 2.9,
    bias: 0.018,
    color: 0xbfb8ad,
    emissive: 0x1c1a17,
    emissiveIntensity: 0.03,
    roughness: 0.98,
    metalness: 0.01,
    opacity: 1
  },
  cycleway: {
    width: 3.0,
    bias: 0.018,
    color: 0x6f847a,
    emissive: 0x131916,
    emissiveIntensity: 0.03,
    roughness: 0.95,
    metalness: 0.02,
    opacity: 1
  }
};
const ENABLE_LINEAR_FEATURES = false;
const INTERIOR_LEVEL_HEIGHT = 3.4;
let _activeWorldLoad = null;

async function getVectorTileLib() {
  if (_vectorTileLibPromise) return _vectorTileLibPromise;
  _vectorTileLibPromise = Promise.all([
  import('https://cdn.jsdelivr.net/npm/pbf@3.2.1/+esm'),
  import('https://cdn.jsdelivr.net/npm/@mapbox/vector-tile@1.3.1/+esm')]
  ).then(([pbfMod, vtMod]) => ({
    Pbf: pbfMod.default || pbfMod.Pbf,
    VectorTile: vtMod.VectorTile
  })).catch((err) => {
    _vectorTileLibPromise = null;
    throw err;
  });
  return _vectorTileLibPromise;
}

function roadTypePriority(type) {
  if (!type) return 0;
  if (type.includes('motorway')) return 6;
  if (type.includes('trunk')) return 5;
  if (type.includes('primary')) return 4;
  if (type.includes('secondary')) return 3;
  if (type.includes('tertiary')) return 2;
  if (type.includes('residential') || type.includes('unclassified') || type.includes('living_street')) return 2;
  if (type.includes('service')) return 1;
  return 1;
}

function isDriveableHighwayTag(highway = '') {
  return DRIVEABLE_HIGHWAY_TYPES.has(String(highway || '').toLowerCase());
}

function classifyLinearFeatureTags(tags = {}, options = {}) {
  if (!ENABLE_LINEAR_FEATURES && options.force !== true) return null;
  const highway = String(tags?.highway || '').toLowerCase();
  const railway = String(tags?.railway || '').toLowerCase();
  const bicycle = String(tags?.bicycle || '').toLowerCase();

  if (/^(rail|light_rail|tram|subway|narrow_gauge)$/.test(railway)) {
    return { kind: 'railway', subtype: railway };
  }

  if (highway === 'cycleway') {
    return { kind: 'cycleway', subtype: highway };
  }

  if (highway === 'path' && bicycle === 'designated') {
    return { kind: 'cycleway', subtype: 'shared_path' };
  }

  if (/^(footway|pedestrian|steps|path)$/.test(highway)) {
    return { kind: 'footway', subtype: highway || 'footway' };
  }

  return null;
}

function linearFeaturePriority(kind, subtype = '') {
  if (kind === 'railway') {
    if (subtype === 'rail') return 4;
    if (subtype === 'light_rail' || subtype === 'tram') return 3;
    return 2;
  }
  if (kind === 'cycleway') return subtype === 'cycleway' ? 3 : 2;
  if (kind === 'footway') {
    if (subtype === 'pedestrian') return 3;
    if (subtype === 'footway') return 2;
    return 1;
  }
  return 0;
}

function clampLinearFeatureWidth(width, fallback) {
  if (!Number.isFinite(width)) return fallback;
  return Math.max(0.9, Math.min(7.5, width));
}

function linearFeatureVisualSpec(classification, tags = {}) {
  const kind = classification?.kind;
  const preset = LINEAR_FEATURE_STYLE_PRESETS[kind] || LINEAR_FEATURE_STYLE_PRESETS.footway;
  const parsedWidth = Number.parseFloat(tags?.width);
  let width = preset.width;

  if (kind === 'railway') {
    if (classification?.subtype === 'tram') width = 2.4;
    if (classification?.subtype === 'subway') width = 2.2;
  } else if (kind === 'footway') {
    if (classification?.subtype === 'pedestrian') width = 3.3;
    if (classification?.subtype === 'footway') width = 3.0;
    if (classification?.subtype === 'steps') width = 1.4;
  } else if (kind === 'cycleway' && classification?.subtype === 'shared_path') {
    width = 2.5;
  }

  return {
    ...preset,
    width: clampLinearFeatureWidth(parsedWidth, width)
  };
}

function buildingPaletteForType(buildingType = 'yes') {
  switch (buildingType) {
  case 'house':
  case 'residential':
  case 'detached':
    return ['#d4c7b5', '#c7aa8a', '#b99176', '#a8826d', '#c9beb0'];
  case 'apartments':
    return ['#c5c1b8', '#b6b6ae', '#8f99a4', '#cbb4a4', '#9da7b3'];
  case 'commercial':
  case 'office':
    return ['#acb4bd', '#8e99a5', '#d0c1b2', '#b7afa4', '#8a949f'];
  case 'industrial':
  case 'warehouse':
    return ['#9ba0a4', '#898b8f', '#7d858c', '#aca79a', '#8d8d84'];
  case 'church':
  case 'cathedral':
    return ['#9d8d7c', '#b19b85', '#85796e', '#c0b1a0', '#8d745f'];
  default:
    return ['#a8b0b7', '#95897b', '#76828e', '#c3bbb0', '#8d7364', '#b3bcc4'];
  }
}

function pickBuildingBaseColor(buildingType, bSeed) {
  const palette = buildingPaletteForType(buildingType);
  const baseIdx = Math.floor(appCtx.rand01FromInt(bSeed ^ 0x514e2d3b) * palette.length) % palette.length;
  const baseColor = new THREE.Color(palette[baseIdx]);
  const hueShift = (appCtx.rand01FromInt(bSeed ^ 0x9e3779b9) - 0.5) * 0.03;
  const satShift = (appCtx.rand01FromInt(bSeed ^ 0x85ebca6b) - 0.5) * 0.08;
  const lightShift = (appCtx.rand01FromInt(bSeed ^ 0xc2b2ae35) - 0.5) * 0.12;
  baseColor.offsetHSL(hueShift, satShift, lightShift);
  return `#${baseColor.getHexString()}`;
}

function pickRoofColor(bSeed) {
  const palette = ['#5b5f66', '#6b6258', '#7b7469', '#4d5661', '#7b6e60'];
  const idx = Math.floor(appCtx.rand01FromInt(bSeed ^ 0x7f4a7c15) * palette.length) % palette.length;
  const color = new THREE.Color(palette[idx]);
  color.offsetHSL(
    (appCtx.rand01FromInt(bSeed ^ 0x165667b1) - 0.5) * 0.02,
    (appCtx.rand01FromInt(bSeed ^ 0xd3a2646c) - 0.5) * 0.05,
    (appCtx.rand01FromInt(bSeed ^ 0x27d4eb2f) - 0.5) * 0.08
  );
  return `#${color.getHexString()}`;
}

function wayCenterDistanceSq(way, nodeMap) {
  if (!way?.nodes?.length) return Infinity;

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  const sampleCount = Math.min(way.nodes.length, 8);

  for (let i = 0; i < sampleCount; i++) {
    const n = nodeMap[way.nodes[i]];
    if (!n) continue;
    latSum += n.lat;
    lonSum += n.lon;
    count += 1;
  }

  if (count === 0) return Infinity;

  const lat = latSum / count;
  const lon = lonSum / count;
  const dLat = lat - appCtx.LOC.lat;
  const dLon = (lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

function nodeDistanceSq(node) {
  if (!node) return Infinity;
  const dLat = node.lat - appCtx.LOC.lat;
  const dLon = (node.lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

function limitWaysByDistance(ways, nodeMap, limit, compareFn, options = {}) {
  if (ways.length <= limit) return ways;

  const sorted = ways.
  slice().
  sort((a, b) => {
    const cmp = compareFn ? compareFn(a, b) : 0;
    if (cmp !== 0) return cmp;
    return wayCenterDistanceSq(a, nodeMap) - wayCenterDistanceSq(b, nodeMap);
  });

  // Optional spatial spread mode: keep a dense city-core slice, then sample
  // evenly across the remaining distance-sorted tail so outskirts are represented.
  if (options?.spreadAcrossArea) {
    const coreRatio = Math.max(0.1, Math.min(0.9, options.coreRatio ?? 0.5));
    const coreKeep = Math.max(1, Math.min(limit, Math.floor(limit * coreRatio)));
    const selected = sorted.slice(0, coreKeep);
    const tail = sorted.slice(coreKeep);
    let remaining = limit - selected.length;

    if (remaining > 0 && tail.length > 0) {
      if (tail.length <= remaining) {
        selected.push(...tail);
      } else {
        const picked = new Set();
        for (let i = 0; i < remaining; i++) {
          let idx = Math.floor(i * tail.length / remaining);
          while (idx < tail.length - 1 && picked.has(idx)) idx++;
          if (picked.has(idx)) {
            while (idx > 0 && picked.has(idx)) idx--;
          }
          if (!picked.has(idx)) {
            picked.add(idx);
            selected.push(tail[idx]);
          }
        }
      }
    }

    return selected.slice(0, limit);
  }

  return sorted.slice(0, limit);
}

function limitNodesByDistance(nodes, limit) {
  if (nodes.length <= limit) return nodes;
  return nodes.slice().sort((a, b) => nodeDistanceSq(a) - nodeDistanceSq(b)).slice(0, limit);
}

function getPerfModeValue() {
  const mode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode;
  return mode === 'baseline' ? 'baseline' : 'rdt';
}

function decimateRoadCenterlineByDepth(pts, roadType, tileDepth, mode = getPerfModeValue()) {
  if (!Array.isArray(pts) || pts.length < 3) return pts;
  if (mode === 'baseline') return pts;

  const depth = Math.max(0, tileDepth | 0);
  if (depth < 4) return pts;

  let minSpacing =
  depth >= 6 ? 16 :
  depth === 5 ? 12 :
  8;
  if (roadType?.includes('motorway') || roadType?.includes('trunk')) {
    minSpacing *= 0.75;
  } else if (roadType?.includes('service') || roadType?.includes('residential')) {
    minSpacing *= 1.15;
  }

  const maxStraightTurn =
  depth >= 6 ? 0.20 :
  depth === 5 ? 0.24 :
  0.28;

  const out = [pts[0]];
  let lastKept = pts[0];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const dLast = Math.hypot(curr.x - lastKept.x, curr.z - lastKept.z);

    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const al = Math.hypot(ax, az);
    const bl = Math.hypot(bx, bz);

    let turn = 0;
    if (al > 1e-6 && bl > 1e-6) {
      const dot = (ax * bx + az * bz) / (al * bl);
      turn = Math.acos(Math.max(-1, Math.min(1, dot)));
    }

    const isTurn = turn > maxStraightTurn;
    if (!isTurn && dLast < minSpacing) continue;

    out.push(curr);
    lastKept = curr;
  }

  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function createMidLodBuildingMesh(pts, height, avgElevation, colorHex = '#7f8ca0') {
  if (!pts || pts.length < 3) return null;

  let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });

  const w = Math.max(4, maxX - minX);
  const d = Math.max(4, maxZ - minZ);
  const h = Math.max(6, Number.isFinite(height) ? height : 10);

  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.92,
    metalness: 0.02
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((minX + maxX) * 0.5, avgElevation + h * 0.5, (minZ + maxZ) * 0.5);
  mesh.userData.buildingFootprint = pts;
  mesh.userData.midLodHalfHeight = h * 0.5;
  mesh.userData.midLodDims = { w, h, d };
  mesh.userData.midLodColor = colorHex;
  mesh.userData.avgElevation = avgElevation;
  mesh.userData.lodTier = 'mid';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function createRoofDetailMesh(pts, height, baseElevation, bSeed, buildingType = 'yes', lodTier = 'near') {
  if (!pts || pts.length < 3 || lodTier !== 'near') return null;

  let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const width = Math.max(0, maxX - minX);
  const depth = Math.max(0, maxZ - minZ);
  const area = Math.abs(signedPolygonAreaXZ(pts));
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
      if (!pointInPolygon(x, z, pts)) continue;
      if (distanceToPolygonEdgeXZ(x, z, pts) < minEdgeClearance) continue;
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
    color: pickRoofColor(bSeed),
    roughness: 0.96,
    metalness: 0.03,
    emissive: 0x0f1114,
    emissiveIntensity: 0.05
  });
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

function batchMidLodBuildingMeshes() {
  if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length === 0) return 0;

  const mids = [];
  const keep = [];
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (mesh?.userData?.lodTier === 'mid' && !mesh.userData?.isBuildingBatch) {
      mids.push(mesh);
    } else {
      keep.push(mesh);
    }
  }

  if (mids.length < 2) return 0;

  const instGeom = new THREE.BoxGeometry(1, 1, 1);
  const instMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02
  });
  const instanced = new THREE.InstancedMesh(instGeom, instMat, mids.length);
  instanced.castShadow = false;
  instanced.receiveShadow = true;
  // InstancedMesh bounds can become stale for large-spread instance sets.
  // Keep visible and rely on explicit world LOD gating to avoid pop/disappear artifacts.
  instanced.frustumCulled = false;
  instanced.userData = {
    lodTier: 'mid',
    isBuildingBatch: true,
    isMidBuildingInstanceBatch: true,
    batchCount: mids.length
  };

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let sumX = 0;
  let sumZ = 0;
  const instanceXZ = new Array(mids.length);

  for (let i = 0; i < mids.length; i++) {
    const mesh = mids[i];
    const dims = mesh.userData?.midLodDims || { w: 1, h: 1, d: 1 };
    position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    scale.set(dims.w || 1, dims.h || 1, dims.d || 1);
    matrix.compose(position, quat, scale);
    instanced.setMatrixAt(i, matrix);

    const c = mesh.userData?.midLodColor || '#7f8ca0';
    color.set(c);
    instanced.setColorAt(i, color);
    sumX += mesh.position.x;
    sumZ += mesh.position.z;
    instanceXZ[i] = { x: mesh.position.x, z: mesh.position.z };

    appCtx.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }

  const centerX = mids.length > 0 ? sumX / mids.length : 0;
  const centerZ = mids.length > 0 ? sumZ / mids.length : 0;
  let maxRadius = 0;
  for (let i = 0; i < instanceXZ.length; i++) {
    const p = instanceXZ[i];
    if (!p) continue;
    const d = Math.hypot(p.x - centerX, p.z - centerZ);
    if (d > maxRadius) maxRadius = d;
  }
  instanced.userData.lodCenter = { x: centerX, z: centerZ };
  instanced.userData.lodRadius = maxRadius;

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;

  appCtx.scene.add(instanced);
  appCtx.buildingMeshes = [...keep, instanced];
  return mids.length;
}

function latLonToTileFloat(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = (lon + 180) / 360 * n;
  const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x, y };
}

function vectorTileRangeForBounds(latMin, lonMin, latMax, lonMax, zoom) {
  const nw = latLonToTileFloat(latMax, lonMin, zoom);
  const se = latLonToTileFloat(latMin, lonMax, zoom);
  const n = Math.pow(2, zoom) - 1;

  return {
    xMin: Math.max(0, Math.min(n, Math.floor(Math.min(nw.x, se.x)))),
    xMax: Math.max(0, Math.min(n, Math.floor(Math.max(nw.x, se.x)))),
    yMin: Math.max(0, Math.min(n, Math.floor(Math.min(nw.y, se.y)))),
    yMax: Math.max(0, Math.min(n, Math.floor(Math.max(nw.y, se.y))))
  };
}

async function fetchVectorTileWater(z, x, y) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WATER_VECTOR_TILE_FETCH_TIMEOUT_MS);
  try {
    const { Pbf, VectorTile } = await getVectorTileLib();
    const res = await fetch(WATER_VECTOR_TILE_ENDPOINT(z, x, y), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const tile = new VectorTile(new Pbf(new Uint8Array(buf)));
    return { tile, z, x, y };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeWorldRingFromLonLat(coords, maxPoints = 900, guardOptions = null) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    const p = appCtx.geoToWorld(c[1], c[0]); // GeoJSON: [lon, lat]
    pts.push(p);
  }
  if (pts.length < 3) return null;
  const ring = sanitizeWorldFootprintPoints(
    decimatePoints(pts, maxPoints, false),
    FEATURE_MIN_POLYGON_AREA,
    guardOptions || undefined
  );
  return ring.length >= 3 ? ring : null;
}

function worldLinePointsFromLonLat(coords, maxPoints = 1000, guardOptions = null) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    pts.push(appCtx.geoToWorld(c[1], c[0]));
  }
  if (pts.length < 2) return null;
  const cleaned = sanitizeWorldPathPoints(
    decimatePoints(pts, maxPoints, false),
    guardOptions || undefined
  );
  return cleaned.length >= 2 ? cleaned : null;
}

function classifyLanduseType(tags) {
  return normalizeLanduseSurfaceType(tags);
}

function polylineBounds(pts, padding = 0) {
  if (!Array.isArray(pts) || pts.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad
  };
}

function poiKeyFromTags(tags = {}) {
  if (!tags || typeof tags !== 'object') return null;
  if (tags.amenity) return `amenity=${tags.amenity}`;
  if (tags.shop === 'supermarket') return 'shop=supermarket';
  if (tags.shop === 'mall') return 'shop=mall';
  if (tags.shop === 'convenience') return 'shop=convenience';
  if (tags.tourism) return `tourism=${tags.tourism}`;
  if (tags.historic) return tags.historic === 'monument' ? 'historic=monument' : 'historic=memorial';
  if (tags.leisure) return `leisure=${tags.leisure}`;
  return null;
}

function signedPolygonAreaXZ(pts) {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return area * 0.5;
}

function decimatePoints(pts, maxPoints, preserveClosedRing = false) {
  if (!pts || pts.length <= maxPoints) return pts;
  if (maxPoints < 3) return pts.slice(0, Math.max(2, maxPoints));

  const out = [];
  const end = preserveClosedRing ? pts.length - 1 : pts.length;
  const step = Math.max(1, Math.ceil((end - 1) / (maxPoints - 1)));
  for (let i = 0; i < end; i += step) out.push(pts[i]);
  if (out[out.length - 1] !== pts[end - 1]) out.push(pts[end - 1]);
  if (preserveClosedRing && pts.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first !== last) out.push(first);
  }
  return out;
}

function isFiniteWorldPointXZ(point) {
  return !!point &&
  Number.isFinite(point.x) &&
  Number.isFinite(point.z);
}

function buildFeatureGeometryGuards(featureRadiusDeg = 0.02) {
  const radiusWorld = Math.abs(Number(featureRadiusDeg) || 0) * appCtx.SCALE;
  const clipRadius = clampNumber(
    radiusWorld * FEATURE_CLIP_RADIUS_SCALE,
    FEATURE_CLIP_RADIUS_MIN,
    FEATURE_CLIP_RADIUS_MAX,
    FEATURE_CLIP_RADIUS_MIN
  );
  const maxSegmentLength = clampNumber(
    clipRadius * FEATURE_MAX_SEGMENT_SCALE,
    FEATURE_MAX_SEGMENT_MIN,
    FEATURE_MAX_SEGMENT_MAX,
    FEATURE_MAX_SEGMENT_MAX
  );
  const maxSpan = Math.max(FEATURE_CLIP_RADIUS_MIN, clipRadius * FEATURE_MAX_SPAN_SCALE);
  const maxArea = Math.max(2500000, clipRadius * clipRadius * FEATURE_MAX_AREA_SCALE);
  return {
    maxArea,
    maxDistanceFromOrigin: clipRadius,
    maxSegmentLength,
    maxSpan
  };
}

function buildBuildingGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  return {
    ...guards,
    maxArea: Math.min(guards.maxArea, 220000),
    maxSegmentLength: Math.min(guards.maxSegmentLength, 650),
    maxSpan: Math.min(guards.maxSpan, 950)
  };
}

function buildLanduseGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  const maxSpan = Math.min(guards.maxSpan, Math.max(1200, guards.maxDistanceFromOrigin * 1.05));
  return {
    ...guards,
    maxArea: Math.min(guards.maxArea, maxSpan * maxSpan * 0.72),
    maxSegmentLength: Math.min(guards.maxSegmentLength, 900),
    maxSpan
  };
}

function buildWaterGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  const maxDistanceFromOrigin = Math.min(
    Math.max(guards.maxDistanceFromOrigin * 3.2, 4800),
    FEATURE_CLIP_RADIUS_MAX * 2.8
  );
  const maxSpan = Math.min(
    Math.max(guards.maxSpan * 4.2, 8600),
    Math.max(12000, maxDistanceFromOrigin * 1.65)
  );
  return {
    ...guards,
    maxDistanceFromOrigin,
    maxArea: Math.min(Math.max(guards.maxArea * 12.0, 38000000), maxSpan * maxSpan * 1.45),
    maxSegmentLength: Math.min(Math.max(guards.maxSegmentLength * 4.8, 4200), 6800),
    maxSpan
  };
}

function waterSurfaceBaseElevation(heights) {
  if (!Array.isArray(heights) || heights.length === 0) return 0;
  const finite = heights.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  finite.sort((a, b) => a - b);
  const min = finite[0];
  const percentileIdx = Math.max(0, Math.min(finite.length - 1, Math.floor((finite.length - 1) * 0.12)));
  return Math.min(finite[percentileIdx], min + 0.1);
}

function resolveWaterSurfaceVisualProfile(bounds = null) {
  const surfaceProfile = classifyWaterSurfaceProfile({
    bounds,
    worldSurfaceProfile: appCtx.worldSurfaceProfile || null
  });
  if (surfaceProfile.mode === 'ice') {
    return {
      mode: 'ice',
      color: appCtx.LANDUSE_STYLES?.glacier?.color || 0xdfe9f4,
      emissive: 0x8fa6bd,
      emissiveIntensity: 0.1,
      roughness: 0.84,
      metalness: 0.02
    };
  }
  return {
    mode: 'water',
    color: appCtx.LANDUSE_STYLES?.water?.color || 0x4a90e2,
    emissive: 0x0a2542,
    emissiveIntensity: 0.14,
    roughness: 0.44,
    metalness: 0.02
  };
}

function registerWaterWaveMaterial(material, options = {}) {
  if (!material || material.userData?.weWaterWavePatched || typeof THREE === 'undefined') return material;
  const waveScale = Number.isFinite(options.waveScale) ? options.waveScale : 1;
  const waveBase = Number.isFinite(options.waveBase) ? options.waveBase : 1;
  const visualBase = Number.isFinite(options.visualBase) ? options.visualBase : 1;
  const foamBase = Number.isFinite(options.foamBase) ? options.foamBase : 1;
  const edgeFade = Number.isFinite(options.edgeFade) ? options.edgeFade : 0;
  const shaderKey = String(options.shaderKey || 'base');
  const shaderHook = typeof options.shaderHook === 'function' ? options.shaderHook : null;
  const waterKind = inferWaterRenderContext({
    kindHint: options.waterKind,
    area: options.area,
    span: options.span,
    width: options.width
  });
  const shaderLibrary = buildWaterShaderLibrary();
  material.userData.weWaterWavePatched = true;
  material.userData.weWaterWaveConfig = {
    waveScale,
    waveBase,
    visualBase,
    foamBase,
    edgeFade,
    waterKind,
    energyBase: Number.isFinite(options.energyBase) ? options.energyBase : 1,
    shorelineDistance: Number.isFinite(options.shorelineDistance) ? options.shorelineDistance : null,
    localPatch: options.localPatch === true,
    useRuntimeKind: options.useRuntimeKind === true
  };

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.customProgramCacheKey = () =>
    `we3d-water-wave-${waveScale.toFixed(3)}-${waveBase.toFixed(3)}-${edgeFade.toFixed(3)}-${waterKind}-${shaderKey}`;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousOnBeforeCompile === 'function') previousOnBeforeCompile(shader, renderer);
    shader.uniforms.weWaveTime = { value: 0 };
    shader.uniforms.weWaveAmplitude = { value: 0 };
    shader.uniforms.weWaveSecondaryAmplitude = { value: 0 };
    shader.uniforms.weWaveSwellAmplitude = { value: 0 };
    shader.uniforms.weWaveRippleAmplitude = { value: 0 };
    shader.uniforms.weWaveScale = { value: waveScale };
    shader.uniforms.weWaveSpeed = { value: 0.52 };
    shader.uniforms.weWaveVisualStrength = { value: 0.16 };
    shader.uniforms.weWaveFoamStrength = { value: 0.08 };
    shader.uniforms.weWaveEdgeFade = { value: edgeFade };
    material.userData.weWaterWaveShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${shaderLibrary}`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
vec4 weWorldPos = modelMatrix * vec4(transformed, 1.0);
vWeWaveWorldXZ = weWorldPos.xz;
#ifdef USE_UV
vWePatchUv = uv;
#else
vWePatchUv = vec2(0.5);
#endif
transformed.y += weWaveField(weWorldPos.xz);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${shaderLibrary}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
float weWaveHeight = weWaveField(vWeWaveWorldXZ);
float weWaveCrestValue = weWaveCrest(vWeWaveWorldXZ);
float weWaveGlint = clamp(0.44 + weWaveHeight * 0.22 + weWaveCrestValue * 0.14, 0.0, 1.0);
float weFoamBands = smoothstep(0.42, 0.94, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.8);
float weWhitecapBands = smoothstep(0.72, 1.28, weWaveCrestValue) * clamp(weWaveFoamStrength * 0.62, 0.0, 1.4);
float weSurfaceGrain = 0.5 + 0.5 * sin(vWeWaveWorldXZ.x * 0.085 + weWaveTime * 1.24) * sin(vWeWaveWorldXZ.y * 0.073 - weWaveTime * 1.08);
vec3 weWaveTint = mix(vec3(0.72, 0.79, 0.88), vec3(0.92, 0.98, 1.04), weWaveGlint);
diffuseColor.rgb *= mix(vec3(0.9), weWaveTint, clamp(weWaveVisualStrength * 0.64, 0.0, 1.0));
diffuseColor.rgb *= mix(vec3(0.97), vec3(1.03), weSurfaceGrain * clamp(weWaveVisualStrength * 0.18, 0.0, 0.14));
diffuseColor.rgb += vec3(0.05, 0.07, 0.09) * (weFoamBands * 0.44 + weWhitecapBands * 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.93, 0.98), clamp(weWhitecapBands * 0.18, 0.0, 0.22));
if (weWaveEdgeFade > 0.0) {
  float weEdge = min(min(vWePatchUv.x, 1.0 - vWePatchUv.x), min(vWePatchUv.y, 1.0 - vWePatchUv.y));
  float wePatchMask = smoothstep(0.0, weWaveEdgeFade, weEdge);
  diffuseColor.a *= wePatchMask;
}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.024, 0.038, 0.054) * max(0.0, weWaveGlint - 0.5) * (weWaveVisualStrength * 1.4);
totalEmissiveRadiance += vec3(0.036, 0.052, 0.072) * (weFoamBands * 0.44 + weWhitecapBands * 0.28) * (weWaveVisualStrength * 0.52);`
      );
    if (shaderHook) shaderHook(shader, { material, waterKind });
  };

  if (Array.isArray(appCtx.waterWaveVisuals)) {
    appCtx.waterWaveVisuals.push(material);
  } else {
    appCtx.waterWaveVisuals = [material];
  }
  material.needsUpdate = true;
  return material;
}

function resolveLinearFeatureBaseY(x, z, kind = 'footway') {
  const terrainY = typeof appCtx.baseTerrainHeightAt === 'function' ?
    appCtx.baseTerrainHeightAt(x, z) :
    typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(x, z) :
    appCtx.elevationWorldYAtWorldXZ(x, z);
  const fallbackTerrain = Number.isFinite(terrainY) ? terrainY : 0;
  const nearestRoad = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z, {
    y: fallbackTerrain + 1.2,
    maxVerticalDelta: 6
  }) : null;
  const snapPadding =
    kind === 'footway' ? 2.4 :
    kind === 'cycleway' ? 2.0 :
    1.0;
  const shouldSnapToRoad = isRoadSurfaceReachable(nearestRoad, {
    extraLateralPadding: snapPadding - 1.35
  });
  if (shouldSnapToRoad) {
    const roadY = sampleFeatureSurfaceY(nearestRoad.road, x, z, nearestRoad);
    if (Number.isFinite(roadY)) return roadY;
    return fallbackTerrain + 0.2;
  }
  return fallbackTerrain;
}

function worldBaseTerrainY(x, z) {
  if (typeof appCtx.baseTerrainHeightAt === 'function') {
    return appCtx.baseTerrainHeightAt(x, z);
  }
  if (typeof appCtx.terrainMeshHeightAt === 'function') {
    return appCtx.terrainMeshHeightAt(x, z);
  }
  return appCtx.elevationWorldYAtWorldXZ(x, z);
}

function structureAwareLinearFeatures() {
  if (!Array.isArray(appCtx.linearFeatures)) return [];
  return appCtx.linearFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated);
}

function smoothstep01Local(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

function cloneStructureSemantics(semantics) {
  return semantics ? { ...semantics } : null;
}

function featureBuildingContainmentStats(feature) {
  const points = Array.isArray(feature?.pts) ? feature.pts : null;
  if (!points || points.length < 2 || typeof getNearbyBuildings !== 'function') {
    return {
      total: 0,
      inside: 0,
      near: 0,
      endpointInside: 0,
      insideRatio: 0,
      nearRatio: 0
    };
  }

  const sampleIndices = new Set([
    0,
    points.length - 1,
    Math.floor((points.length - 1) * 0.25),
    Math.floor((points.length - 1) * 0.5),
    Math.floor((points.length - 1) * 0.75)
  ]);

  let total = 0;
  let inside = 0;
  let near = 0;
  let endpointInside = 0;
  for (const index of sampleIndices) {
    const point = points[index];
    if (!point) continue;
    const candidates = getNearbyBuildings(point.x, point.z, 16);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      total += 1;
      continue;
    }

    let insideBuilding = false;
    let nearBuilding = false;
    for (let i = 0; i < candidates.length; i++) {
      const building = candidates[i];
      if (!building) continue;
      const withinBounds =
        point.x >= (Number(building.minX) || 0) - 2.4 &&
        point.x <= (Number(building.maxX) || 0) + 2.4 &&
        point.z >= (Number(building.minZ) || 0) - 2.4 &&
        point.z <= (Number(building.maxZ) || 0) + 2.4;
      if (!withinBounds) continue;
      if (Array.isArray(building.pts) && building.pts.length >= 3 && pointInPolygon(point.x, point.z, building.pts)) {
        insideBuilding = true;
        break;
      }
      nearBuilding = true;
    }

    total += 1;
    if (insideBuilding) {
      inside += 1;
      if (index === 0 || index === points.length - 1) endpointInside += 1;
    } else if (nearBuilding) {
      near += 1;
    }
  }

  return {
    total,
    inside,
    near,
    endpointInside,
    insideRatio: total > 0 ? inside / total : 0,
    nearRatio: total > 0 ? near / total : 0
  };
}

function applyBuildingContextSemanticsToFeature(feature) {
  if (!feature) return;
  if (!feature.baseStructureSemantics) {
    feature.baseStructureSemantics = cloneStructureSemantics(feature.structureSemantics);
  }

  const baseSemantics = feature.baseStructureSemantics || feature.structureSemantics || null;
  if (!baseSemantics) return;

  const stats = featureBuildingContainmentStats(feature);
  const embeddedInBuilding =
    baseSemantics.terrainMode === 'elevated' &&
    !baseSemantics.isBridge &&
    stats.total > 0 &&
    (
      stats.insideRatio >= 0.62 ||
      (
        stats.endpointInside >= 1 &&
        (stats.inside + stats.near) >= Math.max(3, Math.ceil(stats.total * 0.72))
      )
    );

  if (!embeddedInBuilding) {
    feature.structureSemantics = {
      ...cloneStructureSemantics(baseSemantics),
      embeddedInBuilding: false
    };
    if (feature.isStructureConnector === true) {
      feature.isStructureConnector = feature.structureSemantics.gradeSeparated || feature.structureSemantics.skywalk === true;
    }
    return;
  }

  const coveredLike = baseSemantics.covered || baseSemantics.indoor;
  feature.structureSemantics = {
    ...cloneStructureSemantics(baseSemantics),
    structureKind: coveredLike ? 'covered' : 'at_grade',
    terrainMode: 'at_grade',
    gradeSeparated: false,
    skywalk: false,
    verticalOrder: 0,
    deckClearance: 0,
    cutDepth: 0,
    embeddedInBuilding: true,
    verticalGroup: `at_grade:0:${coveredLike ? 'covered' : 'at_grade'}`
  };
  if (feature.isStructureConnector === true) feature.isStructureConnector = false;
}

function normalizeStructureEndpointHeights(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  const endpointGroups = new Map();
  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    if (!semantics?.gradeSeparated || !points || points.length < 2 || !(heights instanceof Float32Array) || !(distances instanceof Float32Array)) continue;
    const entries = [
      { index: 0, point: points[0] },
      { index: points.length - 1, point: points[points.length - 1] }
    ];
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e];
      const point = entry.point;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      const key = `${Math.round(point.x * 10)},${Math.round(point.z * 10)}:${semantics.verticalGroup || semantics.terrainMode || 'structure'}`;
      let group = endpointGroups.get(key);
      if (!group) {
        group = [];
        endpointGroups.set(key, group);
      }
      group.push({ feature, endpointIndex: entry.index, y: Number(heights[entry.index]) || 0 });
    }
  }

  endpointGroups.forEach((entries) => {
    if (!Array.isArray(entries) || entries.length < 2) return;
    const averageY = entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length;
    for (let i = 0; i < entries.length; i++) {
      const { feature, endpointIndex } = entries[i];
      const heights = feature?.surfaceHeights;
      const distances = feature?.surfaceDistances;
      if (!(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length !== distances.length) continue;
      const lastIndex = heights.length - 1;
      const anchorIndex = endpointIndex === 0 ? 0 : lastIndex;
      const delta = averageY - (Number(heights[anchorIndex]) || 0);
      if (Math.abs(delta) < 0.01) continue;
      const blendDistance = Math.max(12, Math.min(28, (Number(feature.width) || 6) * 2.6));
      const totalDistance = Number(distances[lastIndex]) || 0;
      for (let h = 0; h < heights.length; h++) {
        const distanceFromEndpoint = endpointIndex === 0 ?
          (Number(distances[h]) || 0) :
          Math.max(0, totalDistance - (Number(distances[h]) || 0));
        if (distanceFromEndpoint > blendDistance) continue;
        const weight = 1 - smoothstep01Local(distanceFromEndpoint / Math.max(1, blendDistance));
        heights[h] += delta * weight;
      }
      feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
      feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
    }
  });
}

function smoothStructureSurfaceProfiles(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if ((!semantics?.gradeSeparated && !hasTransitionAnchors) || !(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length < 4) continue;

    const smoothed = new Float32Array(heights);
    const passes =
      semantics.terrainMode === 'elevated' ?
        3 :
      semantics.terrainMode === 'subgrade' ?
        2 :
      hasTransitionAnchors ?
        2 :
        1;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(smoothed);
      const lastIndex = smoothed.length - 1;
      for (let h = 1; h < lastIndex; h++) {
        const current = smoothed[h];
        const neighborAverage = (smoothed[h - 1] + smoothed[h + 1]) * 0.5;
        let blend =
          semantics?.terrainMode === 'elevated' ? 0.46 :
          semantics?.terrainMode === 'subgrade' ? 0.4 :
          hasTransitionAnchors ? 0.26 :
          0.42;
        if (Array.isArray(feature.structureStations) && feature.structureStations.length > 0) {
          const distance = Number(distances[h]) || 0;
          let nearestWeight = Infinity;
          for (let s = 0; s < feature.structureStations.length; s++) {
            const station = feature.structureStations[s];
            const stationSpan = Math.max(1, Number(station?.span) || 1);
            const normalizedDistance = Math.abs(distance - (Number(station?.distance) || 0)) / stationSpan;
            nearestWeight = Math.min(nearestWeight, normalizedDistance);
          }
          if (nearestWeight < 0.35) blend = semantics?.terrainMode === 'elevated' ? 0.16 : 0.18;
          else if (nearestWeight < 0.7) blend = semantics?.terrainMode === 'elevated' ? 0.24 : 0.28;
        }
        next[h] = current * (1 - blend) + neighborAverage * blend;
      }
      smoothed.set(next);
    }
    heights.set(smoothed);
    feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
    feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
  }
}

function refreshStructureAwareFeatureProfiles() {
  const roadFeatures = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  const connectorFeatures = structureAwareLinearFeatures();
  const transportFeatures = roadFeatures.concat(connectorFeatures);

  for (let i = 0; i < transportFeatures.length; i++) {
    applyBuildingContextSemanticsToFeature(transportFeatures[i]);
  }

  if (Array.isArray(appCtx.linearFeatureMeshes)) {
    for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
      const mesh = appCtx.linearFeatureMeshes[i];
      const feature = mesh?.userData?.linearFeatureRef || null;
      if (!mesh || !feature) continue;
      mesh.userData.structureConnector = feature.isStructureConnector === true;
      mesh.userData.structureSemantics = feature.structureSemantics || null;
    }
  }

  const structureFeatures = transportFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated);

  assignFeatureConnections(transportFeatures);

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    if (!feature?.structureSemantics?.gradeSeparated) continue;
    feature.structureStations = buildFeatureStations(feature, {
      features: structureFeatures,
      waterAreas: appCtx.waterAreas
    });
  }

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    if (!feature) continue;
    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.42
    });
  }

  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    buildFeatureTransitionAnchors(feature, worldBaseTerrainY);
  }

  const profiledFeatures = [];
  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    const hasTransitionAnchors = Array.isArray(feature.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if (!feature?.structureSemantics?.gradeSeparated && !hasTransitionAnchors) continue;
    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.42
    });
    profiledFeatures.push(feature);
  }

  normalizeStructureEndpointHeights(structureFeatures);
  smoothStructureSurfaceProfiles(profiledFeatures);

  if (structureFeatures.length > 0) {
    appCtx.structureTerrainCuts = structureFeatures
      .filter((feature) => feature?.structureSemantics?.terrainMode === 'subgrade')
      .map((feature) => ({
        feature,
        pts: feature.pts,
        width: Math.max(6.2, (Number(feature.width) || 6) + 3.2),
        clearance: Math.max(3.8, Number(feature?.structureSemantics?.cutDepth) ? 3.35 + Math.min(3.4, Number(feature.structureSemantics.cutDepth) * 0.45) : 3.8),
        portalLength: Math.max(12, Math.min(34, (Number(feature.width) || 6) * 2.2)),
        bounds: feature.bounds
      }));
  } else {
    appCtx.structureTerrainCuts = [];
  }
}

function syncLinearFeatureOverlayVisibility() {
  const visible = ENABLE_LINEAR_FEATURES && appCtx.showPathOverlays !== false;
  if (!Array.isArray(appCtx.linearFeatureMeshes)) return;
  for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
    const mesh = appCtx.linearFeatureMeshes[i];
    if (mesh) {
      const alwaysVisible = mesh.userData?.structureConnector === true;
      mesh.visible = !mesh.userData?.boatSuppressed && (alwaysVisible || visible);
    }
  }
}

function pointToSegmentDistanceXZ(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return Math.hypot(x - p1.x, z - p1.z);
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return Math.hypot(x - px, z - pz);
}

function distanceToPolygonEdgeXZ(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dist = pointToSegmentDistanceXZ(x, z, pts[i], pts[(i + 1) % pts.length]);
    if (dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : 0;
}

function sanitizeWorldPathPoints(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const maxDistanceFromOrigin = Number.isFinite(options.maxDistanceFromOrigin) ?
  Math.max(32, options.maxDistanceFromOrigin) :
  Infinity;
  const maxSegmentLength = Number.isFinite(options.maxSegmentLength) ?
  Math.max(12, options.maxSegmentLength) :
  Infinity;
  const cleaned = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!isFiniteWorldPointXZ(p)) continue;
    if (Math.hypot(p.x, p.z) > maxDistanceFromOrigin) continue;

    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const segLen = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (segLen <= 1e-4) continue;
      if (segLen > maxSegmentLength) return [];
    }
    cleaned.push({ x: p.x, z: p.z });
  }

  return cleaned.length >= 2 ? cleaned : [];
}

function sanitizeWorldFootprintPoints(pts, minArea = FEATURE_MIN_POLYGON_AREA, options = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return [];
  const maxDistanceFromOrigin = Number.isFinite(options.maxDistanceFromOrigin) ?
  Math.max(32, options.maxDistanceFromOrigin) :
  Infinity;
  const maxSegmentLength = Number.isFinite(options.maxSegmentLength) ?
  Math.max(12, options.maxSegmentLength) :
  Infinity;
  const maxSpan = Number.isFinite(options.maxSpan) ?
  Math.max(40, options.maxSpan) :
  Infinity;
  const maxArea = Number.isFinite(options.maxArea) ?
  Math.max(200, options.maxArea) :
  Infinity;
  const cleaned = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!isFiniteWorldPointXZ(p)) continue;
    if (Math.hypot(p.x, p.z) > maxDistanceFromOrigin) continue;

    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const segLen = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (segLen <= 1e-4) continue;
      if (segLen > maxSegmentLength) return [];
    }
    cleaned.push({ x: p.x, z: p.z });
  }

  if (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    const closeLen = Math.hypot(first.x - last.x, first.z - last.z);
    if (closeLen <= 1e-4) {
      cleaned.pop();
    } else if (closeLen > maxSegmentLength * 1.35) {
      return [];
    }
  }

  if (cleaned.length < 3) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < cleaned.length; i++) {
    const p = cleaned[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  if ((maxX - minX) > maxSpan || (maxZ - minZ) > maxSpan) return [];

  const area = Math.abs(signedPolygonAreaXZ(cleaned));
  if (area < minArea || area > maxArea) return [];
  return cleaned;
}

function appendIndexedGeometry(targetVerts, targetIndices, verts, indices) {
  if (!Array.isArray(verts) || verts.length === 0) return;
  const baseVertex = targetVerts.length / 3;
  targetVerts.push(...verts);
  if (Array.isArray(indices) && indices.length > 0) {
    for (let i = 0; i < indices.length; i++) {
      targetIndices.push(indices[i] + baseVertex);
    }
  } else {
    const addedVerts = verts.length / 3;
    for (let i = 0; i < addedVerts; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

function geometryHasFinitePositions(geometry) {
  const arr = geometry?.attributes?.position?.array;
  if (!arr || !Number.isFinite(arr.length)) return false;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return false;
  }
  return true;
}

function materialBatchKey(material) {
  if (!material || Array.isArray(material)) return null;
  const colorHex = material.color ? material.color.getHexString() : '';
  const emissiveHex = material.emissive ? material.emissive.getHexString() : '';
  const mapId = material.map ? material.map.uuid : '-';
  const normalId = material.normalMap ? material.normalMap.uuid : '-';
  const roughnessId = material.roughnessMap ? material.roughnessMap.uuid : '-';
  return [
  material.type || '',
  mapId,
  normalId,
  roughnessId,
  colorHex,
  emissiveHex,
  Number(material.emissiveIntensity || 0).toFixed(3),
  Number(material.roughness || 0).toFixed(3),
  Number(material.metalness || 0).toFixed(3),
  material.transparent ? 1 : 0,
  Number(material.opacity ?? 1).toFixed(3),
  material.side ?? 0,
  material.depthWrite ? 1 : 0,
  material.depthTest ? 1 : 0,
  material.polygonOffset ? 1 : 0,
  Number(material.polygonOffsetFactor || 0).toFixed(3),
  Number(material.polygonOffsetUnits || 0).toFixed(3)].
  join('|');
}

function appendGeometryWithTransform(batch, geometry, matrix) {
  if (!geometry?.attributes?.position) return 0;

  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  const baseVertex = batch.positions.length / 3;
  const startPos = batch.positions.length;
  const startNormals = batch.normals.length;
  const startUvs = batch.uvs.length;
  const startIdx = batch.indices.length;

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  const rollback = () => {
    batch.positions.length = startPos;
    batch.normals.length = startNormals;
    batch.uvs.length = startUvs;
    batch.indices.length = startIdx;
  };

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
      rollback();
      return -1;
    }
    batch.positions.push(v.x, v.y, v.z);

    if (normAttr) {
      n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
      if (Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)) {
        batch.normals.push(n.x, n.y, n.z);
      } else {
        batch.normals.push(0, 1, 0);
      }
    } else {
      batch.normals.push(0, 1, 0);
    }

    if (uvAttr) {
      const u = uvAttr.getX(i);
      const vUv = uvAttr.getY(i);
      batch.uvs.push(Number.isFinite(u) ? u : 0, Number.isFinite(vUv) ? vUv : 0);
    } else {
      batch.uvs.push(0, 0);
    }
  }

  if (geometry.index) {
    const indexArr = geometry.index.array;
    for (let i = 0; i < indexArr.length; i++) {
      const idx = Number(indexArr[i]);
      if (!Number.isFinite(idx) || idx < 0 || idx >= posAttr.count) {
        rollback();
        return -1;
      }
      batch.indices.push(idx + baseVertex);
    }
  } else {
    for (let i = 0; i < posAttr.count; i++) {
      batch.indices.push(baseVertex + i);
    }
  }

  return posAttr.count;
}

function buildMergedGeometry(batch) {
  if (!batch.positions.length || !batch.indices.length) return null;
  if (batch.positions.length % 3 !== 0 || batch.normals.length % 3 !== 0 || batch.uvs.length % 2 !== 0) return null;
  if (batch.normals.length !== batch.positions.length) return null;
  if (batch.uvs.length !== batch.positions.length / 3 * 2) return null;

  for (let i = 0; i < batch.positions.length; i++) {
    if (!Number.isFinite(batch.positions[i])) return null;
  }
  for (let i = 0; i < batch.normals.length; i++) {
    if (!Number.isFinite(batch.normals[i])) return null;
  }
  for (let i = 0; i < batch.uvs.length; i++) {
    if (!Number.isFinite(batch.uvs[i])) return null;
  }
  const vertexCount = batch.positions.length / 3;
  for (let i = 0; i < batch.indices.length; i++) {
    const idx = batch.indices[i];
    if (!Number.isFinite(idx) || idx < 0 || idx >= vertexCount) return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));

  const indexArray = vertexCount > 65535 ? new Uint32Array(batch.indices) : new Uint16Array(batch.indices);
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function batchNearLodBuildingMeshes() {
  try {
    if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length < 2) return 0;

    const keep = [];
    const groups = new Map();

    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
      const tier = mesh.userData?.lodTier || 'near';
      if (tier !== 'near' && tier !== 'mid' || mesh.userData?.isBuildingBatch) {
        keep.push(mesh);
        continue;
      }
      if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) {
        keep.push(mesh);
        continue;
      }

      const matKey = materialBatchKey(mesh.material);
      if (!matKey) {
        keep.push(mesh);
        continue;
      }
      const key = `${tier}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          lodTier: tier
        };
        groups.set(key, group);
      }
      group.meshes.push(mesh);
    }

    if (groups.size === 0) return 0;

    const batchedMeshes = [];
    let sourceMeshCount = 0;
    const xzPoints = [];

    groups.forEach((group) => {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        return;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      const sourceMeshes = [];
      xzPoints.length = 0;

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        const appendCount = appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);
        if (appendCount <= 0) {
          keep.push(mesh);
          continue;
        }
        sourceMeshes.push(mesh);

        let cx = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
        let cz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
        const footprint = mesh.userData?.buildingFootprint;
        if (Array.isArray(footprint) && footprint.length > 0) {
          let sumX = 0;
          let sumZ = 0;
          for (let p = 0; p < footprint.length; p++) {
            sumX += footprint[p].x;
            sumZ += footprint[p].z;
          }
          cx = sumX / footprint.length;
          cz = sumZ / footprint.length;
        } else if (mesh.geometry) {
          if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
          const bs = mesh.geometry.boundingSphere;
          if (bs) {
            cx = bs.center.x + cx;
            cz = bs.center.z + cz;
          }
        }
        xzPoints.push({ x: cx, z: cz });
      }

      if (sourceMeshes.length < 2) {
        keep.push(...sourceMeshes);
        return;
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...sourceMeshes);
        return;
      }

      const material = group.material.clone();
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      mergedMesh.castShadow = true;
      mergedMesh.receiveShadow = true;
      mergedMesh.frustumCulled = false;

      let centerX = 0;
      let centerZ = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        centerX += xzPoints[i].x;
        centerZ += xzPoints[i].z;
      }
      centerX /= xzPoints.length;
      centerZ /= xzPoints.length;

      let maxRadius = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        const d = Math.hypot(xzPoints[i].x - centerX, xzPoints[i].z - centerZ);
        if (d > maxRadius) maxRadius = d;
      }

      mergedMesh.userData = {
        lodTier: group.lodTier || 'near',
        isBuildingBatch: true,
        isNearBuildingBatch: true,
        batchCount: sourceMeshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };

      appCtx.scene.add(mergedMesh);
      batchedMeshes.push(mergedMesh);

      for (let i = 0; i < sourceMeshes.length; i++) {
        const src = sourceMeshes[i];
        appCtx.scene.remove(src);
        if (src.geometry) src.geometry.dispose();
        if (src.material) src.material.dispose();
      }
      sourceMeshCount += sourceMeshes.length;
    });

    if (!batchedMeshes.length) {
      appCtx._lastBuildingBatchStats = {
        groupCount: groups.size,
        batchMeshCount: 0,
        sourceMeshCount: 0
      };
      return 0;
    }
    appCtx.buildingMeshes = [...keep, ...batchedMeshes];
    appCtx._lastBuildingBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batchedMeshes.length,
      sourceMeshCount
    };
    return sourceMeshCount;
  } catch (err) {
    console.warn('[WorldLoad] batchNearLodBuildingMeshes failed:', err);
    appCtx._lastBuildingBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}

function batchLanduseMeshes() {
  try {
    if (!Array.isArray(appCtx.landuseMeshes) || appCtx.landuseMeshes.length < 4) return 0;

    const keep = [];
    const groups = new Map();

    for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
      const mesh = appCtx.landuseMeshes[i];
      if (!mesh || mesh.userData?.isLanduseBatch) {
        if (mesh) keep.push(mesh);
        continue;
      }
      if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) {
        keep.push(mesh);
        continue;
      }

      const matKey = materialBatchKey(mesh.material);
      if (!matKey) {
        keep.push(mesh);
        continue;
      }
      const type = mesh.userData?.landuseType || 'unknown';
      const isWaterwayLine = !!mesh.userData?.isWaterwayLine;
      const surfaceVariant = mesh.userData?.surfaceVariant || type;
      const key = `${type}|${isWaterwayLine ? 1 : 0}|${mesh.renderOrder || 0}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          landuseType: type,
          isWaterwayLine,
          surfaceVariant,
          alwaysVisible: false,
          anyVisible: false
        };
        groups.set(key, group);
      }
      group.meshes.push(mesh);
      group.alwaysVisible = group.alwaysVisible || !!mesh.userData?.alwaysVisible;
      group.anyVisible = group.anyVisible || !!mesh.visible;
    }

    if (!groups.size) return 0;

    const batched = [];
    let sourceCount = 0;
    const xzPoints = [];

    groups.forEach((group) => {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        return;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      xzPoints.length = 0;

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);

        let cx = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
        let cz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
        const footprint = mesh.userData?.landuseFootprint || mesh.userData?.waterwayCenterline;
        if (Array.isArray(footprint) && footprint.length > 0) {
          let sumX = 0;
          let sumZ = 0;
          for (let p = 0; p < footprint.length; p++) {
            sumX += footprint[p].x;
            sumZ += footprint[p].z;
          }
          cx = sumX / footprint.length;
          cz = sumZ / footprint.length;
        } else if (mesh.geometry) {
          if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
          const bs = mesh.geometry.boundingSphere;
          if (bs) {
            cx = bs.center.x + cx;
            cz = bs.center.z + cz;
          }
        }
        xzPoints.push({ x: cx, z: cz });
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...group.meshes);
        return;
      }

      const material = group.material.clone();
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      mergedMesh.receiveShadow = false;
      mergedMesh.castShadow = false;
      mergedMesh.frustumCulled = false;

      let centerX = 0;
      let centerZ = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        centerX += xzPoints[i].x;
        centerZ += xzPoints[i].z;
      }
      centerX /= xzPoints.length;
      centerZ /= xzPoints.length;

      let maxRadius = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        const d = Math.hypot(xzPoints[i].x - centerX, xzPoints[i].z - centerZ);
        if (d > maxRadius) maxRadius = d;
      }

      mergedMesh.userData = {
        landuseType: group.landuseType,
        isWaterwayLine: !!group.isWaterwayLine,
        surfaceVariant: group.surfaceVariant,
        isLanduseBatch: true,
        alwaysVisible: group.alwaysVisible,
        batchCount: group.meshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };
      mergedMesh.visible = group.anyVisible || group.alwaysVisible;

      appCtx.scene.add(mergedMesh);
      batched.push(mergedMesh);

      for (let i = 0; i < group.meshes.length; i++) {
        const src = group.meshes[i];
        appCtx.scene.remove(src);
        if (src.geometry) src.geometry.dispose();
        if (src.material) src.material.dispose();
      }
      sourceCount += group.meshes.length;
    });

    if (!batched.length) {
      appCtx._lastLanduseBatchStats = {
        groupCount: groups.size,
        batchMeshCount: 0,
        sourceMeshCount: 0
      };
      return 0;
    }
    appCtx.landuseMeshes = [...keep, ...batched];
    appCtx._lastLanduseBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batched.length,
      sourceMeshCount: sourceCount
    };
    return sourceCount;
  } catch (err) {
    console.warn('[WorldLoad] batchLanduseMeshes failed:', err);
    appCtx._lastLanduseBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}

function clearBuildingSpatialIndex() {
  buildingSpatialIndex = new Map();
}

function addBuildingToSpatialIndex(building) {
  if (!building) return;
  const minCellX = Math.floor(building.minX / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(building.maxX / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(building.minZ / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(building.maxZ / BUILDING_INDEX_CELL_SIZE);

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const key = `${cx},${cz}`;
      let bucket = buildingSpatialIndex.get(key);
      if (!bucket) {
        bucket = [];
        buildingSpatialIndex.set(key, bucket);
      }
      bucket.push(building);
    }
  }
}

function getNearbyBuildings(x, z, radius = 80) {
  const overlayColliders = Array.isArray(appCtx.overlayRuntimeBuildingColliders) ? appCtx.overlayRuntimeBuildingColliders : [];
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return (appCtx.buildings || []).filter((building) => !isSuppressedBaseBuilding(building)).concat(appCtx.dynamicBuildingColliders || [], overlayColliders);
  }
  if (!buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    return (appCtx.buildings || []).filter((building) => !isSuppressedBaseBuilding(building)).concat(appCtx.dynamicBuildingColliders || [], overlayColliders);
  }

  const queryRadius = Math.max(20, radius);
  const minCellX = Math.floor((x - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((x + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor((z - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor((z + queryRadius) / BUILDING_INDEX_CELL_SIZE);

  const out = [];
  const seen = new Set();

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const bucket = buildingSpatialIndex.get(`${cx},${cz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const b = bucket[i];
        if (seen.has(b)) continue;
        if (isSuppressedBaseBuilding(b)) continue;
        seen.add(b);
        out.push(b);
      }
    }
  }

  if (Array.isArray(appCtx.dynamicBuildingColliders) && appCtx.dynamicBuildingColliders.length > 0) {
    for (let i = 0; i < appCtx.dynamicBuildingColliders.length; i++) {
      const b = appCtx.dynamicBuildingColliders[i];
      if (!b || seen.has(b)) continue;
      if (
        x < b.minX - queryRadius ||
        x > b.maxX + queryRadius ||
        z < b.minZ - queryRadius ||
        z > b.maxZ + queryRadius
      ) {
        continue;
      }
      seen.add(b);
      out.push(b);
    }
  }

  if (overlayColliders.length > 0) {
    for (let i = 0; i < overlayColliders.length; i++) {
      const b = overlayColliders[i];
      if (!b || seen.has(b)) continue;
      if (
        x < b.minX - queryRadius ||
        x > b.maxX + queryRadius ||
        z < b.minZ - queryRadius ||
        z > b.maxZ + queryRadius
      ) {
        continue;
      }
      seen.add(b);
      out.push(b);
    }
  }

  return out;
}

async function loadRoadsInternal(retryPass = 0) {
  const locName = appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
  const perfModeNow = getPerfModeValue();
  const useRdtBudgeting = perfModeNow === 'rdt';
  const loadMetrics = {
    mode: perfModeNow,
    location: locName,
    retryPass,
    success: false,
    lod: { near: 0, mid: 0, midSkipped: 0, farSkipped: 0 },
    roads: { requested: 0, selected: 0, sourcePoints: 0, decimatedPoints: 0, subdividedPoints: 0, vertices: 0 },
    buildings: { requested: 0, selected: 0 },
    colliders: { full: 0, simplified: 0 },
    landuse: { requested: 0, selected: 0 },
    linearFeatures: {
      railway: { requested: 0, selected: 0 },
      footway: { requested: 0, selected: 0 },
      cycleway: { requested: 0, selected: 0 }
    },
    vegetation: {
      treesRequested: 0,
      treesSelected: 0,
      treeRowsRequested: 0,
      treeRowsSelected: 0,
      generated: 0
    },
    pois: { requested: 0, selected: 0, near: 0, mid: 0, far: 0 },
    phases: {}
  };
  appCtx._lastBuildingBatchStats = null;
  appCtx._lastLanduseBatchStats = null;
  if (typeof appCtx.startPerfLoad === 'function') {
    appCtx.startPerfLoad('world-load', { mode: perfModeNow, location: locName });
  }

  let _perfLoadFinalized = false;
  const finalizePerfLoad = (success, extra = {}) => {
    if (_perfLoadFinalized) return;
    _perfLoadFinalized = true;
    loadMetrics.success = !!success;
    const payload = { ...loadMetrics, ...extra };
    if (typeof appCtx.finishPerfLoad === 'function') appCtx.finishPerfLoad(payload);
  };
  const _phaseStartedAt = Object.create(null);
  const _phaseTotals = Object.create(null);
  const startLoadPhase = (name) => {
    if (!name) return;
    _phaseStartedAt[name] = performance.now();
  };
  const endLoadPhase = (name) => {
    if (!name) return;
    const startedAt = _phaseStartedAt[name];
    if (!Number.isFinite(startedAt)) return;
    const dt = performance.now() - startedAt;
    _phaseTotals[name] = (_phaseTotals[name] || 0) + dt;
    delete _phaseStartedAt[name];
  };
  resetWorldForReload({
    clearBuildingSpatialIndex,
    invalidateTraversalNetworks,
    locName,
    resetWorldFurnitureCaches
  });

  if (appCtx.selLoc === 'custom') {
    const lat = parseFloat(document.getElementById('customLat').value);
    const lon = parseFloat(document.getElementById('customLon').value);
    if (isNaN(lat) || isNaN(lon)) {
      appCtx.showLoad('Enter valid coordinates');
      appCtx.worldLoading = false;
      finalizePerfLoad(false, { reason: 'invalid_coordinates' });
      return;
    }
    appCtx.LOC = { lat, lon };
    appCtx.customLoc = { lat, lon, name: appCtx.customLoc?.name || 'Custom' };
  } else {
    appCtx.LOC = { lat: appCtx.LOCS[appCtx.selLoc].lat, lon: appCtx.LOCS[appCtx.selLoc].lon };
  }
  const loadLocation = { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon };
  const loadSequence = appCtx._worldLoadSequence = (appCtx._worldLoadSequence || 0) + 1;
  const isActiveLoadContext = () =>
    appCtx._worldLoadSequence === loadSequence &&
    sameLocation(appCtx.LOC, loadLocation) &&
    !earthSceneSuppressed();
  // Prevent old-city coordinates from driving terrain stream while loading.
  appCtx.car.x = 0;
  appCtx.car.z = 0;
  appCtx.car.vx = 0;
  appCtx.car.vz = 0;
  appCtx.car.vy = 0;
  if (appCtx.drone) {
    appCtx.drone.x = 0;
    appCtx.drone.z = 0;
  }
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
    appCtx.Walk.state.walker.x = 0;
    appCtx.Walk.state.walker.z = 0;
    appCtx.Walk.state.walker.vy = 0;
  }

  // Reset terrain streaming state when location origin changes so stale tiles
  // from the previous city cannot remain at mismatched world coordinates.
  if (appCtx.terrainEnabled && !appCtx.onMoon) {
    if (typeof appCtx.resetTerrainStreamingState === 'function') appCtx.resetTerrainStreamingState();
    if (typeof appCtx.clearTerrainMeshes === 'function') appCtx.clearTerrainMeshes();
    if (typeof appCtx.updateTerrainAround === 'function') appCtx.updateTerrainAround(0, 0);
  }

  // RDT complexity index: location-derived complexity used by adaptive mode.
  appCtx.rdtSeed = appCtx.hashGeoToInt(
    appCtx.LOC.lat,
    appCtx.LOC.lon,
    appCtx.gameMode === 'trial' ? 1 :
    appCtx.gameMode === 'checkpoint' ? 2 :
    appCtx.gameMode === 'painttown' ? 3 :
    0
  );
  const sharedSeedOverrideRaw = Number(appCtx.sharedSeedOverride);
  if (Number.isFinite(sharedSeedOverrideRaw)) {
    appCtx.rdtSeed = (Math.floor(sharedSeedOverrideRaw) | 0) >>> 0;
  }
  const rawRdtComplexity = appCtx.rdtDepth(appCtx.rdtSeed, 1.5);
  const rdtLoadComplexity = appCtx.rdtDepth(appCtx.rdtSeed % 1000000 + 2, 1.5);
  appCtx.rdtComplexity = useRdtBudgeting ? rawRdtComplexity : 0;

  const dynamicBudgetState = getRuntimeDynamicBudget(perfModeNow);
  const loadProfile = getAdaptiveLoadProfile(rdtLoadComplexity, perfModeNow, dynamicBudgetState.budgetScale);
  const radii = loadProfile.radii.slice();
  const featureRadiusScale = loadProfile.featureRadiusScale;
  const poiRadiusScale = loadProfile.poiRadiusScale;
  const maxRoadWays = loadProfile.maxRoadWays;
  const maxBuildingWays = loadProfile.maxBuildingWays;
  const maxLanduseWays = loadProfile.maxLanduseWays;
  const maxPoiNodes = loadProfile.maxPoiNodes;
  const tileBudgetCfg = loadProfile.tileBudgetCfg;

  const lodThresholds = getWorldLodThresholds(rdtLoadComplexity, perfModeNow, dynamicBudgetState.lodScale);
  appCtx.dynamicBudgetScale = dynamicBudgetState.budgetScale;
  appCtx.dynamicLodScale = dynamicBudgetState.lodScale;

  const overpassTimeoutMs = loadProfile.overpassTimeoutMs;
  const maxTotalLoadMs = loadProfile.maxTotalLoadMs;
  const loadStartedAt = performance.now();

  loadMetrics.rdtLoadComplexity = rdtLoadComplexity;
  appCtx.rdtLoadComplexity = rdtLoadComplexity;
  loadMetrics.rdtComplexity = rawRdtComplexity;
  loadMetrics.radii = radii.slice();
  loadMetrics.lodThresholds = lodThresholds;
  loadMetrics.loadProfile = {
    dynamicBudgetScale: dynamicBudgetState.budgetScale,
    dynamicLodScale: dynamicBudgetState.lodScale,
    maxRoadWays,
    maxBuildingWays,
    maxLanduseWays,
    maxPoiNodes,
    tileBudgetCfg,
    overpassTimeoutMs,
    maxTotalLoadMs
  };
  loadMetrics.dynamicBudget = {
    auto: !!dynamicBudgetState.auto,
    tier: dynamicBudgetState.tier || 'balanced',
    budgetScale: dynamicBudgetState.budgetScale,
    lodScale: dynamicBudgetState.lodScale,
    reason: dynamicBudgetState.reason || null
  };

  let loaded = false;
  const useSyntheticFallbackRoads =
  appCtx.gameMode === 'trial' ||
  appCtx.gameMode === 'checkpoint' ||
  appCtx.gameMode === 'painttown';

  function registerBuildingCollision(pts, height, options = {}) {
    if (!Array.isArray(pts) || pts.length < 3) return null;
    const detail = options.detail === 'bbox' ? 'bbox' : 'full';
    let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
    let sumX = 0,sumZ = 0;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      sumX += p.x;
      sumZ += p.z;
    });
    const centerX = Number.isFinite(options.centerX) ? options.centerX : sumX / pts.length;
    const centerZ = Number.isFinite(options.centerZ) ? options.centerZ : sumZ / pts.length;
    const baseY = Number.isFinite(options.baseY) ? options.baseY : null;
    const building = {
      pts: detail === 'full' ? pts : null,
      minX,
      maxX,
      minZ,
      maxZ,
      height,
      centerX,
      centerZ,
      colliderDetail: detail,
      sourceBuildingId: options.sourceBuildingId || null,
      name: String(options.name || '').trim(),
      buildingType: options.buildingType || 'yes',
      buildingPartKind: options.buildingPartKind || 'full',
      collisionKind: options.collisionKind || 'solid',
      allowsPassageBelow: options.allowsPassageBelow === true,
      levels: Number.isFinite(options.levels) ? options.levels : null,
      minLevels: Number.isFinite(options.minLevels) ? options.minLevels : null,
      baseY,
      minY: baseY,
      maxY: Number.isFinite(baseY) ? baseY + height : null,
      buildingSemantics: options.buildingSemantics || null,
      structureSemantics: options.structureSemantics || null
    };
    appCtx.buildings.push(building);
    addBuildingToSpatialIndex(building);
    return building;
  }

  const recordLoadWarning = (label, err) => recordWorldLoadWarning(loadMetrics, label, err);
  const safeLoadCall = (label, fn) => safeWorldLoadCall(loadMetrics, label, fn);

  for (const r of radii) {
    if (loaded) break;
    try {
      if (performance.now() - loadStartedAt > maxTotalLoadMs) {
        console.warn('[Overpass] Max load budget reached, switching to fallback world.');
        break;
      }

      appCtx.showLoad('Loading map data...');
      const overpassPlan = buildWorldOverpassPlan({
        location: appCtx.LOC,
        roadsRadius: r,
        featureRadiusScale,
        poiRadiusScale,
        overpassTimeoutMs,
        loadStartedAt,
        maxTotalLoadMs
      });
      const {
        deferredLinearFeatureQuery,
        featureRadius,
        loadDeadline,
        overpassCacheMeta,
        primaryQuery
      } = overpassPlan;
      const geometryGuards = buildFeatureGeometryGuards(featureRadius);
      const buildingGeometryGuards = buildBuildingGeometryGuards(geometryGuards);
      const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
      const waterGeometryGuards = buildWaterGeometryGuards(geometryGuards);
      const scheduleDeferredLinearFeatureLoad = () => {
        scheduleDeferredWorldLinearFeatureLoad({
          enabled: ENABLE_LINEAR_FEATURES,
          isActiveLoadContext,
          overpassTimeoutMs,
          deferredLinearFeatureQuery,
          fetchOverpassJSON,
          classifyLinearFeatureTags,
          limitWaysByTileBudget,
          tileBudgetCfg,
          useRdtBudgeting,
          linearFeaturePriority,
          geometryGuards,
          geoToWorld: appCtx.geoToWorld,
          sanitizeWorldPathPoints,
          addLinearFeatureRibbon,
          startLoadPhase,
          endLoadPhase,
          syncLinearFeatureOverlayVisibility,
          rebuildStructureVisualMeshes: appCtx.rebuildStructureVisualMeshes,
          invalidateTraversalNetworks,
          buildTraversalNetworks,
          safeLoadCall,
          updateWorldLod,
          recordLoadWarning
        });
      };

      // Load roads, buildings, landuse, and POIs in one comprehensive query.
      startLoadPhase('fetchOverpass');
      let data;
      try {
        data = await fetchOverpassJSON(primaryQuery, overpassTimeoutMs, loadDeadline, overpassCacheMeta);
      } finally {
        endLoadPhase('fetchOverpass');
      }
      if (data?._overpassSource) loadMetrics.overpassSource = data._overpassSource;
      if (data?._overpassEndpoint) loadMetrics.overpassEndpoint = data._overpassEndpoint;
      if (Number.isFinite(data?._overpassCacheAgeMs)) {
        loadMetrics.overpassCacheAgeMs = Math.floor(data._overpassCacheAgeMs);
      }
      if (earthSceneSuppressed()) {
        loaded = true;
        loadMetrics.recoveryReason = 'env_changed_during_fetch';
        loadMetrics.partialRecovery = true;
        hideEarthSceneMeshes();
        break;
      }
      const nodes = {};
      data.elements.filter((e) => e.type === 'node').forEach((n) => nodes[n.id] = n);
      appCtx._worldLoadNodes = nodes;
      const baselineFullWorld = perfModeNow === 'baseline';

      startLoadPhase('featureBudgeting');
      const {
        roadWays,
        buildingWays,
        landuseWays,
        waterwayWays,
        railwayWays,
        footwayWays,
        cyclewayWays,
        structureConnectorWays,
        treeNodes,
        treeRowWays,
        poiNodes,
        worldSurfaceProfile,
        requestedCounts
      } = prepareWorldFeatureSelections({
        baselineFullWorld,
        centerLat: appCtx.LOC?.lat,
        classifyLinearFeatureTags,
        classifyStructureSemantics,
        classifyWorldSurfaceProfile,
        data,
        enableLinearFeatures: ENABLE_LINEAR_FEATURES,
        isDriveableHighwayTag,
        limitNodesByTileBudget,
        limitWaysByTileBudget,
        linearFeaturePriority,
        loadMetrics,
        maxBuildingWays,
        maxLanduseWays,
        maxPoiNodes,
        maxRoadWays,
        maxTreeNodes: MAX_TREE_NODES,
        maxTreeRowWays: MAX_TREE_ROW_WAYS,
        nodes,
        poiKeyFromTags,
        roadTypePriority,
        tileBudgetCfg,
        useRdtBudgeting
      });
      endLoadPhase('featureBudgeting');

      if (
      roadWays.length < requestedCounts.roads ||
      buildingWays.length < requestedCounts.buildings ||
      landuseWays.length < requestedCounts.landuse ||
      poiNodes.length < requestedCounts.pois)
      {
        console.warn(
          `[WorldLoad] Applied adaptive limits ` +
          `(roads ${roadWays.length}/${requestedCounts.roads}, ` +
          `buildings ${buildingWays.length}/${requestedCounts.buildings}, ` +
          `landuse ${landuseWays.length}/${requestedCounts.landuse}, ` +
          `pois ${poiNodes.length}/${requestedCounts.pois}).`
        );
      }

      // Process roads
      appCtx.showLoad(`Loading roads... (${roadWays.length})`);
      startLoadPhase('buildRoadGeometry');
      const roadMainBatchVerts = [];
      const roadMainBatchIdx = [];
      const roadSkirtBatchVerts = [];
      const roadSkirtBatchIdx = [];
      const roadMarkBatchVerts = [];
      const roadMarkBatchIdx = [];

      const {
        roadMainMaterial,
        roadSkirtMaterial,
        roadMarkMaterial
      } = createRoadSurfaceMaterials({
        asphaltTex: appCtx.asphaltTex,
        asphaltNormal: appCtx.asphaltNormal,
        asphaltRoughness: appCtx.asphaltRoughness,
        includeMarkings: true
      });

      roadWays.forEach((way) => {
        const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
        if (pts.length < 2) return;
        const type = way.tags?.highway || 'residential';
        const structureSemantics = classifyStructureSemantics(way.tags || {}, {
          featureKind: 'road',
          subtype: type
        });
        const width = type.includes('motorway') ? 16 : type.includes('trunk') ? 14 : type.includes('primary') ? 12 : type.includes('secondary') ? 10 : 8;
        const limit = type.includes('motorway') ? 65 : type.includes('trunk') ? 55 : type.includes('primary') ? 40 : type.includes('secondary') ? 35 : 25;
        const name = way.tags?.name || type.charAt(0).toUpperCase() + type.slice(1);
        const centerLatLon = wayCenterLatLon(way, nodes);
        const roadTileKey = centerLatLon ?
        featureTileKeyForLatLon(centerLatLon.lat, centerLatLon.lon, tileBudgetCfg.tileDegrees) :
        null;
        const roadTileDepth = useRdtBudgeting && roadTileKey ?
        rdtDepthForFeatureTile(roadTileKey, tileBudgetCfg.tileDegrees) :
        0;
        const roadSubdivideStepBase = getRoadSubdivisionStep(type, roadTileDepth, perfModeNow);
        const roadSubdivideStep =
          structureSemantics?.terrainMode && structureSemantics.terrainMode !== 'at_grade' ?
            Math.min(roadSubdivideStepBase, 0.55) :
          structureSemantics?.rampCandidate ?
            Math.min(roadSubdivideStepBase, 0.65) :
            roadSubdivideStepBase;
        const decimatedRoadPts = decimateRoadCenterlineByDepth(pts, type, roadTileDepth, perfModeNow);
        if (decimatedRoadPts.length < 2) return;

        const roadFeature = {
          pts: decimatedRoadPts,
          width,
          limit,
          name,
          sourceFeatureId: way.id ? String(way.id) : '',
          type,
          sidewalkHint: String(way.tags?.sidewalk || '').toLowerCase(),
          networkKind: 'road',
          walkable: true,
          driveable: true,
          structureTags: {
            bridge: way.tags?.bridge || '',
            tunnel: way.tags?.tunnel || '',
            layer: way.tags?.layer || '',
            level: way.tags?.level || '',
            placement: way.tags?.placement || '',
            ramp: way.tags?.ramp || '',
            covered: way.tags?.covered || '',
            indoor: way.tags?.indoor || '',
            location: way.tags?.location || '',
            min_height: way.tags?.min_height || '',
            man_made: way.tags?.man_made || ''
          },
          structureSemantics,
          baseStructureSemantics: cloneStructureSemantics(structureSemantics),
          surfaceBias: 0.42,
          lodDepth: roadTileDepth,
          subdivideMaxDist: roadSubdivideStep,
          bounds: polylineBounds(decimatedRoadPts, width * 0.5 + 18)
        };
        appCtx.roads.push(roadFeature);
        updateFeatureSurfaceProfile(roadFeature, worldBaseTerrainY, { surfaceBias: 0.42 });
        const hw = width / 2;

        // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
        const subdPts = typeof appCtx.subdivideRoadPoints === 'function' ?
        appCtx.subdivideRoadPoints(decimatedRoadPts, roadSubdivideStep) :
        decimatedRoadPts;
        loadMetrics.roads.sourcePoints += pts.length;
        loadMetrics.roads.decimatedPoints += decimatedRoadPts.length;
        loadMetrics.roads.subdividedPoints += subdPts.length;

        const _tmh = worldBaseTerrainY;

        const verts = [],indices = [];
        const { leftEdge, rightEdge } = buildFeatureRibbonEdges(roadFeature, subdPts, hw, _tmh, {
          surfaceBias: 0.42
        });
        for (let i = 0; i < leftEdge.length; i++) {
          verts.push(leftEdge[i].x, leftEdge[i].y, leftEdge[i].z);
          verts.push(rightEdge[i].x, rightEdge[i].y, rightEdge[i].z);
          if (i < leftEdge.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          }
        }

        appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
        loadMetrics.roads.vertices += verts.length / 3;

        // Build road skirts (edge curtains) to hide terrain peeking
        // Increased depth from 1.5 to 3.0 for better coverage on steep slopes
        if (typeof appCtx.buildRoadSkirts === 'function' && shouldRenderRoadSkirts(roadFeature)) {
          const skirtDepth =
            roadFeature.structureSemantics?.terrainMode === 'subgrade' ? 0.3 :
            3.6;
          const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
          if (skirtData.verts.length > 0) {
            appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
            loadMetrics.roads.vertices += skirtData.verts.length / 3;
          }
        }

        // Add lane markings only for major roads (performance optimization)
        if (
          roadFeature.structureSemantics?.terrainMode === 'at_grade' &&
          width >= 12 &&
          (type.includes('motorway') || type.includes('trunk') || type.includes('primary'))
        ) {
          const markVerts = [],markIdx = [];
          const mw = 0.15,dashLen = 6,gapLen = 6; // Increased gap for performance
          let dist = 0;
          for (let i = 0; i < decimatedRoadPts.length - 1; i++) {
            const p1 = decimatedRoadPts[i],p2 = decimatedRoadPts[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
            const dx = (p2.x - p1.x) / segLen,dz = (p2.z - p1.z) / segLen;
            const nx = -dz,nz = dx;
            let segDist = 0;
            while (segDist < segLen) {
              if (Math.floor((dist + segDist) / (dashLen + gapLen)) % 2 === 0) {
                const x = p1.x + dx * segDist,z = p1.z + dz * segDist;
                const len = Math.min(dashLen, segLen - segDist);
                const y = (typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z)) + 0.35; // Just above road surface
                const vi = markVerts.length / 3;
                markVerts.push(
                  x + nx * mw, y, z + nz * mw,
                  x - nx * mw, y, z - nz * mw,
                  x + dx * len + nx * mw, y, z + dz * len + nz * mw,
                  x + dx * len - nx * mw, y, z + dz * len - nz * mw
                );
                markIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
              }
              segDist += dashLen + gapLen;
            }
            dist += segLen;
          }
          if (markVerts.length > 0) {
            appendIndexedGeometry(roadMarkBatchVerts, roadMarkBatchIdx, markVerts, markIdx);
            loadMetrics.roads.vertices += markVerts.length / 3;
          }
        }
      });

      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: roadMainBatchVerts,
        indices: roadMainBatchIdx,
        material: roadMainMaterial,
        renderOrder: 2,
        userData: { isRoadBatch: true, sharedRoadMaterial: true }
      });
      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: roadSkirtBatchVerts,
        indices: roadSkirtBatchIdx,
        material: roadSkirtMaterial,
        renderOrder: 1,
        userData: { isRoadBatch: true, isRoadSkirt: true, sharedRoadMaterial: true }
      });
      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: roadMarkBatchVerts,
        indices: roadMarkBatchIdx,
        material: roadMarkMaterial,
        renderOrder: 3,
        userData: { isRoadBatch: true, isRoadMarking: true, sharedRoadMaterial: true }
      });
      endLoadPhase('buildRoadGeometry');

      // Process buildings
      appCtx.showLoad(`Loading buildings... (${buildingWays.length})`);
      startLoadPhase('buildBuildingGeometry');
      const roadBuildingCellSize = 120;
      const buildingRoadRadiusCells = useRdtBudgeting ?
      rdtLoadComplexity >= 6 ? 5 : 4 :
      3;
      const roadCoverageCells = new Set();
      const roadCoreCellSize = 6;
      const roadCoreCells = new Set();
      const roadCorridorCellSize = 4;
      const roadCorridorCells = new Set();
      const toRoadCoreCellKey = (x, z) => `${Math.floor(x / roadCoreCellSize)},${Math.floor(z / roadCoreCellSize)}`;
      const toRoadCorridorCellKey = (x, z) => `${Math.floor(x / roadCorridorCellSize)},${Math.floor(z / roadCorridorCellSize)}`;
      const markRoadCoreCell = (x, z, radiusCells) => {
        const cx = Math.floor(x / roadCoreCellSize);
        const cz = Math.floor(z / roadCoreCellSize);
        const r = Math.max(0, radiusCells | 0);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            roadCoreCells.add(`${cx + dx},${cz + dz}`);
          }
        }
      };
      const markRoadCorridorCell = (x, z, radiusCells) => {
        const cx = Math.floor(x / roadCorridorCellSize);
        const cz = Math.floor(z / roadCorridorCellSize);
        const r = Math.max(0, radiusCells | 0);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            roadCorridorCells.add(`${cx + dx},${cz + dz}`);
          }
        }
      };
      const markRoadCorridorSegment = (p0, p1, radiusCells) => {
        if (!p0 || !p1) return;
        const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        const steps = Math.max(1, Math.ceil(segLen / Math.max(1.75, roadCorridorCellSize * 0.75)));
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          markRoadCorridorCell(
            p0.x + (p1.x - p0.x) * t,
            p0.z + (p1.z - p0.z) * t,
            radiusCells
          );
        }
      };
      const pointOnRoadCore = (x, z) => roadCoreCells.has(toRoadCoreCellKey(x, z));
      const pointOnRoadCorridor = (x, z) => roadCorridorCells.has(toRoadCorridorCellKey(x, z));
      const expandFootprintForGroundApron = (pts) => {
        if (!pts || pts.length < 3) return pts || [];
        let sumX = 0;
        let sumZ = 0;
        for (let i = 0; i < pts.length; i++) {
          sumX += pts[i].x;
          sumZ += pts[i].z;
        }
        const cx = sumX / pts.length;
        const cz = sumZ / pts.length;
        const maxRadius = pts.reduce((best, p) => Math.max(best, Math.hypot(p.x - cx, p.z - cz)), 0);
        const apronOutset = Math.min(1.5, Math.max(0.65, maxRadius * 0.08));
        return pts.map((p) => {
          const dx = p.x - cx;
          const dz = p.z - cz;
          const len = Math.hypot(dx, dz);
          if (!(len > 1e-4)) return { x: p.x, z: p.z };
          return {
            x: p.x + dx / len * apronOutset,
            z: p.z + dz / len * apronOutset
          };
        });
      };
      const sampleFootprintCoverage = (pts, tester) => {
        if (!pts || pts.length < 3 || typeof tester !== 'function') {
          return { total: 0, inside: 0, centroidInside: false };
        }
        let sumX = 0, sumZ = 0;
        const samples = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const n = pts[(i + 1) % pts.length];
          sumX += p.x;
          sumZ += p.z;
          samples.push(p);
          samples.push({ x: (p.x + n.x) * 0.5, z: (p.z + n.z) * 0.5 });
          samples.push({ x: p.x + (n.x - p.x) * 0.25, z: p.z + (n.z - p.z) * 0.25 });
          samples.push({ x: p.x + (n.x - p.x) * 0.75, z: p.z + (n.z - p.z) * 0.75 });
        }
        const centroid = { x: sumX / pts.length, z: sumZ / pts.length };
        samples.push(centroid);

        let inside = 0;
        for (let i = 0; i < samples.length; i++) {
          if (tester(samples[i].x, samples[i].z)) inside += 1;
        }
        return {
          total: samples.length,
          inside,
          centroidInside: tester(centroid.x, centroid.z)
        };
      };
      const sampleFootprintRoadCore = (pts) => {
        return sampleFootprintCoverage(pts, pointOnRoadCore);
      };
      const sampleFootprintRoadCorridor = (pts) => {
        return sampleFootprintCoverage(pts, pointOnRoadCorridor);
      };
      const overlapsRoadCore = (stats) => {
        if (!stats || stats.total <= 0) return false;
        const overlapRatio = stats.inside / stats.total;
        return stats.inside >= Math.max(4, Math.ceil(stats.total * 0.58)) && overlapRatio >= 0.55;
      };
      const overlapsRoadCorridor = (stats) => {
        if (!stats || stats.total <= 0) return false;
        const overlapRatio = stats.inside / stats.total;
        return stats.centroidInside || (stats.inside >= Math.max(3, Math.ceil(stats.total * 0.24)) && overlapRatio >= 0.18);
      };

      appCtx.roads.forEach((rd) => {
        if (!rd || !rd.pts) return;
        const roadHalfWidth = Number.isFinite(rd.width) ? rd.width * 0.5 : 4;
        const roadCoreRadius = Math.max(0.8, Math.max(0, roadHalfWidth * 0.32 - 0.25));
        const roadCoreRadiusCells = Math.max(0, Math.floor((roadCoreRadius + 0.25) / roadCoreCellSize));
        const corridorRadius = Math.max(1.6, roadHalfWidth + 2.4);
        const corridorRadiusCells = Math.max(0, Math.ceil((corridorRadius + 0.25) / roadCorridorCellSize));
        for (let i = 0; i < rd.pts.length; i++) {
          const p = rd.pts[i];
          const cx = Math.floor(p.x / roadBuildingCellSize);
          const cz = Math.floor(p.z / roadBuildingCellSize);
          roadCoverageCells.add(`${cx},${cz}`);
          markRoadCoreCell(p.x, p.z, roadCoreRadiusCells);
          markRoadCorridorCell(p.x, p.z, corridorRadiusCells);
          if (i < rd.pts.length - 1) {
            markRoadCorridorSegment(p, rd.pts[i + 1], corridorRadiusCells);
          }
        }
      });

      function isBuildingNearLoadedRoad(pts) {
        if (useRdtBudgeting) return true;
        if (!pts || pts.length === 0 || roadCoverageCells.size === 0) return true;
        let sumX = 0,sumZ = 0;
        for (let i = 0; i < pts.length; i++) {
          sumX += pts[i].x;
          sumZ += pts[i].z;
        }
        const cx = Math.floor(sumX / pts.length / roadBuildingCellSize);
        const cz = Math.floor(sumZ / pts.length / roadBuildingCellSize);
        for (let dx = -buildingRoadRadiusCells; dx <= buildingRoadRadiusCells; dx++) {
          for (let dz = -buildingRoadRadiusCells; dz <= buildingRoadRadiusCells; dz++) {
            if (roadCoverageCells.has(`${cx + dx},${cz + dz}`)) return true;
          }
        }
        return false;
      }
      const lodNearDist = lodThresholds.near;
      const lodMidDist = lodThresholds.mid;

      buildingWays.forEach((way) => {
        const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const pts = sanitizeWorldFootprintPoints(rawPts, FEATURE_MIN_POLYGON_AREA, buildingGeometryGuards);
        if (pts.length < 3) return;
        if (!isBuildingNearLoadedRoad(pts)) return;
        const roadCoreStats = sampleFootprintRoadCore(pts);
        if (overlapsRoadCore(roadCoreStats)) {
          loadMetrics.buildingsSkippedRoadOverlap = (loadMetrics.buildingsSkippedRoadOverlap || 0) + 1;
          return;
        }

        let centerX = 0;
        let centerZ = 0;
        let minFootprintX = Infinity;
        let maxFootprintX = -Infinity;
        let minFootprintZ = Infinity;
        let maxFootprintZ = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          centerX += pts[i].x;
          centerZ += pts[i].z;
          minFootprintX = Math.min(minFootprintX, pts[i].x);
          maxFootprintX = Math.max(maxFootprintX, pts[i].x);
          minFootprintZ = Math.min(minFootprintZ, pts[i].z);
          maxFootprintZ = Math.max(maxFootprintZ, pts[i].z);
        }
        centerX /= pts.length;
        centerZ /= pts.length;
        const footprintWidth = Math.max(0, maxFootprintX - minFootprintX);
        const footprintDepth = Math.max(0, maxFootprintZ - minFootprintZ);
        const footprintArea = Math.abs(signedPolygonAreaXZ(pts));
        const centerDist = Math.hypot(centerX, centerZ);
        const lodTier = centerDist <= lodNearDist ?
        'near' :
        centerDist <= lodThresholds.farVisible ? 'mid' : 'far';
        if (lodTier === 'far') {
          loadMetrics.lod.farSkipped += 1;
          return;
        }

        // RDT-seeded deterministic random for this building
        const bSeed = (appCtx.rdtSeed ^ way.id >>> 0) >>> 0;
        const br1 = appCtx.rand01FromInt(bSeed);
        const br2 = appCtx.rand01FromInt(bSeed ^ 0x9e3779b9);

        const bt = way.tags.building || way.tags['building:part'] || 'yes';
        let fallbackHeight = 10;
        if (!way.tags['building:part']) {
          if (bt === 'house' || bt === 'residential' || bt === 'detached') fallbackHeight = 6 + br1 * 4;else
          if (bt === 'apartments' || bt === 'commercial') fallbackHeight = 12 + br1 * 20;else
          if (bt === 'industrial' || bt === 'warehouse') fallbackHeight = 8 + br1 * 6;else
          if (bt === 'church' || bt === 'cathedral') fallbackHeight = 15 + br1 * 15;else
          if (bt === 'skyscraper' || bt === 'office') fallbackHeight = 30 + br1 * 50;else
          fallbackHeight = 8 + br1 * 12;
        }
        const structureSemantics = classifyStructureSemantics(way.tags || {}, {
          featureKind: 'building',
          subtype: bt
        });
        const buildingSemantics = interpretBuildingSemantics(way.tags || {}, {
          fallbackHeight,
          fallbackPartHeight: 3.4 + br1 * 1.6,
          footprintArea,
          footprintWidth,
          footprintDepth
        });
        const height = buildingSemantics.heightMeters;
        const buildingLevels = Number.parseFloat(way.tags['building:levels']);
        const sourceBuildingId = way.id ? String(way.id) : `osm-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`;
        const nearRoadCore = roadCoreStats.centroidInside || roadCoreStats.inside >= 2;
        const apronFootprint = expandFootprintForGroundApron(pts);
        const roadCorridorStats = sampleFootprintRoadCorridor(apronFootprint);
        const suppressGroundApron =
          nearRoadCore ||
          overlapsRoadCorridor(roadCorridorStats) ||
          structureSemantics.terrainMode === 'elevated' ||
          (
            roadCoreStats.total > 0 &&
            roadCoreStats.inside >= Math.max(1, Math.ceil(roadCoreStats.total * 0.18))
          );
        const colliderDetail = useRdtBudgeting && lodTier !== 'near' && !nearRoadCore ? 'bbox' : 'full';

        // Calculate terrain stats for building footprint
        let avgElevation = 0;
        let minElevation = Infinity;
        let maxElevation = -Infinity;
        pts.forEach((p) => {
          const h = appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
          avgElevation += h;
          if (h < minElevation) minElevation = h;
          if (h > maxElevation) maxElevation = h;
        });
        avgElevation /= pts.length;
        const slopeRange = Number.isFinite(minElevation) && Number.isFinite(maxElevation) ?
        maxElevation - minElevation :
        0;

        const baseElevationRaw = slopeRange >= 0.06 ? minElevation + 0.03 : avgElevation;
        const structureBaseOffset = Number.isFinite(buildingSemantics.baseOffsetMeters) ?
          buildingSemantics.baseOffsetMeters :
          0;
        const baseElevation = baseElevationRaw + structureBaseOffset;
        const baseColor = pickBuildingBaseColor(bt, bSeed ^ Math.floor(br2 * 0xffff));
        let mesh = null;

        if (lodTier === 'mid') {
          mesh = createMidLodBuildingMesh(pts, height, baseElevation, baseColor);
        } else {
          const shape = new THREE.Shape();
          pts.forEach((p, i) => {
            if (i === 0) shape.moveTo(p.x, -p.z);else
            shape.lineTo(p.x, -p.z);
          });
          shape.closePath();

          const extrudeSettings = { depth: height, bevelEnabled: false };
          const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          geo.rotateX(-Math.PI / 2);
          if (!geometryHasFinitePositions(geo)) {
            geo.dispose();
            return;
          }

          const bldgMat = typeof appCtx.getBuildingMaterial === 'function' ?
            appCtx.getBuildingMaterial(bt, bSeed, baseColor) :
            new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.85, metalness: 0.05 });

          mesh = new THREE.Mesh(geo, bldgMat);
          mesh.position.y = baseElevation;
          mesh.userData.buildingFootprint = pts;
          mesh.userData.avgElevation = baseElevation;
          mesh.userData.structureBaseOffset = structureBaseOffset;
          mesh.userData.structureSemantics = structureSemantics;
          mesh.userData.buildingSemantics = buildingSemantics;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }

        if (!mesh) return;
        mesh.userData.terrainAvgElevation = avgElevation;
        mesh.userData.lodTier = lodTier;
        mesh.userData.sourceBuildingId = sourceBuildingId;
        mesh.userData.buildingName = way.tags.name || '';
        mesh.userData.buildingType = bt;
        mesh.userData.buildingPartKind = buildingSemantics.partKind;
        mesh.userData.collisionKind = buildingSemantics.collisionKind;
        mesh.userData.allowsPassageBelow = buildingSemantics.allowsPassageBelow;
        mesh.userData.buildingSemantics = buildingSemantics;
        mesh.userData.structureBaseOffset = structureBaseOffset;
        mesh.userData.structureSemantics = structureSemantics;
        const colliderRef = registerBuildingCollision(pts, height, {
          detail: colliderDetail,
          centerX,
          centerZ,
          sourceBuildingId,
          name: way.tags.name || '',
          buildingType: bt,
          buildingPartKind: buildingSemantics.partKind,
          collisionKind: buildingSemantics.collisionKind,
          allowsPassageBelow: buildingSemantics.allowsPassageBelow,
          levels: Number.isFinite(buildingLevels) ? buildingLevels : null,
          minLevels: Number.isFinite(buildingSemantics.buildingMinLevel) ? buildingSemantics.buildingMinLevel : null,
          baseY: baseElevation,
          buildingSemantics,
          structureSemantics
        });
        if (colliderDetail === 'full') loadMetrics.colliders.full += 1;else
        loadMetrics.colliders.simplified += 1;
        if (colliderRef) {
          colliderRef.baseY = baseElevation;
          colliderRef.minY = baseElevation;
          colliderRef.maxY = baseElevation + height;
        }

        appCtx.scene.add(mesh);
        appCtx.buildingMeshes.push(mesh);
        const roofDetailMesh = buildingSemantics.shouldCreateRoofDetail ?
          createRoofDetailMesh(pts, height, baseElevation, bSeed, bt, lodTier) :
          null;
        if (roofDetailMesh) {
          roofDetailMesh.userData.sourceBuildingId = sourceBuildingId;
          roofDetailMesh.userData.terrainAvgElevation = avgElevation;
          roofDetailMesh.userData.structureBaseOffset = structureBaseOffset;
          roofDetailMesh.userData.buildingSemantics = buildingSemantics;
          roofDetailMesh.userData.structureSemantics = structureSemantics;
          appCtx.scene.add(roofDetailMesh);
          appCtx.buildingMeshes.push(roofDetailMesh);
        }
        if (lodTier === 'near') loadMetrics.lod.near += 1;else
        loadMetrics.lod.mid += 1;

        // On sloped terrain, add terrain-conforming ground support so building
        // bases do not appear to float above hills/step terrain.
        if (lodTier === 'near' && buildingSemantics.shouldCreateGroundPatch && typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.15) {
          const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation);
          const groundPatches = Array.isArray(groundPatchesRaw) ? groundPatchesRaw : groundPatchesRaw ? [groundPatchesRaw] : [];
          groundPatches.forEach((groundPatch) => {
            if (groundPatch.userData?.isGroundApron && suppressGroundApron) {
              appCtx.urbanSurfaceStats.skippedBuildingAprons += 1;
              return;
            }
            groundPatch.userData.landuseFootprint = pts;
            groundPatch.userData.landuseType = 'buildingGround';
            groundPatch.userData.avgElevation = baseElevation;
            groundPatch.userData.terrainAvgElevation = avgElevation;
            groundPatch.userData.alwaysVisible = true;
            groundPatch.visible = true;
            appCtx.scene.add(groundPatch);
            appCtx.landuseMeshes.push(groundPatch);
          });
        }
      });
      endLoadPhase('buildBuildingGeometry');
      startLoadPhase('batchBuildingGeometry');
      const batchedNearCount = appCtx.disableNearBuildingBatching ? 0 : batchNearLodBuildingMeshes();
      if (batchedNearCount > 0) {
        loadMetrics.lod.nearBatched = batchedNearCount;
      }
      const batchedMidCount = batchMidLodBuildingMeshes();
      if (batchedMidCount > 0) {
        loadMetrics.lod.midBatched = batchedMidCount;
      }
      if (appCtx._lastBuildingBatchStats) {
        loadMetrics.buildingBatching = { ...appCtx._lastBuildingBatchStats };
      }
      endLoadPhase('batchBuildingGeometry');

      function addLandusePolygon(pts, landuseType, holeRings = [], guardOptions = null) {
        if (!pts || pts.length < 3) return;

        let ring = sanitizeWorldFootprintPoints(
          pts,
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        ring = sanitizeWorldFootprintPoints(
          decimatePoints(ring, 900, false),
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        const outerArea = Math.abs(signedPolygonAreaXZ(ring));
        if (!Number.isFinite(outerArea) || outerArea < FEATURE_MIN_POLYGON_AREA) return;
        let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
        ring.forEach((p) => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        });

        const sampledHeights = [];
        let avgElevation = 0;
        ring.forEach((p) => {
          const sample = appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
          sampledHeights.push(sample);
          avgElevation += sample;
        });
        avgElevation /= ring.length;
        const minElevation = sampledHeights.reduce((best, value) =>
          Number.isFinite(value) ? Math.min(best, value) : best,
        Infinity);

        const shape = new THREE.Shape();
        ring.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, -p.z);else
          shape.lineTo(p.x, -p.z);
        });
        shape.closePath();

        if (holeRings && holeRings.length > 0) {
          holeRings.forEach((holeRing) => {
            if (!holeRing || holeRing.length < 3) return;
            const cleanedHole = sanitizeWorldFootprintPoints(
              holeRing,
              FEATURE_MIN_HOLE_AREA,
              guardOptions || undefined
            );
            if (cleanedHole.length < 3) return;
            const holeArea = Math.abs(signedPolygonAreaXZ(cleanedHole));
            if (!Number.isFinite(holeArea) || holeArea < FEATURE_MIN_HOLE_AREA) return;
            if (holeArea >= outerArea * 0.92) return;
            const path = new THREE.Path();
            cleanedHole.forEach((p, i) => {
              if (i === 0) path.moveTo(p.x, -p.z);else
              path.lineTo(p.x, -p.z);
            });
            path.closePath();
            shape.holes.push(path);
          });
        }

        const geometry = new THREE.ShapeGeometry(shape, 20);
        geometry.rotateX(-Math.PI / 2);

        const isWater = landuseType === 'water';
        const waterVisualProfile = isWater ? resolveWaterSurfaceVisualProfile() : null;
        const surfaceBaseElevation = isWater ?
          (Number.isFinite(avgElevation) ? avgElevation : waterSurfaceBaseElevation(sampledHeights)) :
          avgElevation;
        const waterFlattenFactor = isWater ? 0.12 : 1.0;
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const z = positions.getZ(i);
          const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
          const useY = terrainY === 0 && Math.abs(surfaceBaseElevation) > 2 ? surfaceBaseElevation : terrainY;
          positions.setY(i, (useY - surfaceBaseElevation) * waterFlattenFactor + (isWater ? 0.08 : 0.02));
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial(isWater ? {
          color: waterVisualProfile?.color || appCtx.LANDUSE_STYLES.water.color,
          emissive: waterVisualProfile?.emissive || 0x0f355a,
          emissiveIntensity: waterVisualProfile?.emissiveIntensity ?? 0.18,
          roughness: waterVisualProfile?.roughness ?? 0.34,
          metalness: waterVisualProfile?.metalness ?? 0.02,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -6,
          polygonOffsetUnits: -6
        } : {
          color: appCtx.LANDUSE_STYLES[landuseType].color,
          roughness: 0.95,
          metalness: 0.0,
          transparent: true,
          opacity: 0.85,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        });
        if (isWater) {
          registerWaterWaveMaterial(material, {
            waveScale: 1.0,
            waveBase: 1.0,
            area: outerArea,
            span: Math.max(maxX - minX, maxZ - minZ),
            waterKind: inferWaterRenderContext({
              area: outerArea,
              span: Math.max(maxX - minX, maxZ - minZ)
            })
          });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.position.y = surfaceBaseElevation;
        mesh.userData.landuseFootprint = ring;
        mesh.userData.avgElevation = surfaceBaseElevation;
        mesh.userData.alwaysVisible = isWater;
        mesh.userData.landuseType = landuseType;
        mesh.userData.waterFlattenFactor = waterFlattenFactor;
        mesh.userData.surfaceVariant = isWater ? waterVisualProfile?.mode || 'water' : landuseType;
        if (isWater) mesh.userData.waterSurfaceBase = surfaceBaseElevation;
        mesh.receiveShadow = false;
        mesh.visible = appCtx.landUseVisible || mesh.userData.alwaysVisible;
        appCtx.scene.add(mesh);
        appCtx.landuseMeshes.push(mesh);
        appCtx.landuses.push({
          type: landuseType,
          pts: ring,
          bounds: {
            minX,
            maxX,
            minZ,
            maxZ
          }
        });

        if (isWater) {
          const centroid = ring.reduce((acc, p) => {
            acc.x += p.x;
            acc.z += p.z;
            return acc;
          }, { x: 0, z: 0 });
          appCtx.waterAreas.push({
            type: 'water',
            pts: ring,
            area: outerArea,
            centerX: centroid.x / ring.length,
            centerZ: centroid.z / ring.length,
            surfaceY: surfaceBaseElevation + 0.08,
            bounds: {
              minX,
              maxX,
              minZ,
              maxZ
            }
          });
        }
      }

      function cacheSurfaceFeatureHint(pts, landuseType, guardOptions = null) {
        if (!pts || pts.length < 3 || !landuseType) return;
        let ring = sanitizeWorldFootprintPoints(
          pts,
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        ring = sanitizeWorldFootprintPoints(
          decimatePoints(ring, 140, false),
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        const area = Math.abs(signedPolygonAreaXZ(ring));
        if (!Number.isFinite(area) || area < FEATURE_MIN_POLYGON_AREA) return;
        let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
        ring.forEach((p) => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        });
        appCtx.surfaceFeatureHints.push({
          type: landuseType,
          pts: ring,
          bounds: { minX, maxX, minZ, maxZ }
        });
      }

      function waterwayWidthFromTags(tags) {
        const kind = (tags?.kind || tags?.waterway || '').toString();
        if (kind.includes('ocean') || kind.includes('coast')) return 220;
        if (kind.includes('river')) return 18;
        if (kind.includes('canal')) return 12;
        if (kind.includes('drain')) return 4;
        if (kind.includes('ditch')) return 3;
        if (kind.includes('stream')) return 6;
        return 8;
      }

      function addWaterwayRibbon(pts, tags) {
        if (!pts || pts.length < 2) return;
        const centerline = decimatePoints(pts, 1000, false);
        if (centerline.length < 2) return;

        const width = waterwayWidthFromTags(tags);
        const waterVisualProfile = resolveWaterSurfaceVisualProfile();
        const halfWidth = width * 0.5;
        const verticalBias = 0.14;
        const _h = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
        const verts = [];
        const indices = [];

        for (let i = 0; i < centerline.length; i++) {
          const p = centerline[i];

          let dx, dz;
          if (i === 0) {
            dx = centerline[1].x - p.x;
            dz = centerline[1].z - p.z;
          } else if (i === centerline.length - 1) {
            dx = p.x - centerline[i - 1].x;
            dz = p.z - centerline[i - 1].z;
          } else {
            dx = centerline[i + 1].x - centerline[i - 1].x;
            dz = centerline[i + 1].z - centerline[i - 1].z;
          }

          const len = Math.hypot(dx, dz) || 1;
          const nx = -dz / len;
          const nz = dx / len;
          const leftX = p.x + nx * halfWidth;
          const leftZ = p.z + nz * halfWidth;
          const rightX = p.x - nx * halfWidth;
          const rightZ = p.z - nz * halfWidth;
          const leftY = _h(leftX, leftZ) + verticalBias;
          const rightY = _h(rightX, rightZ) + verticalBias;

          verts.push(leftX, leftY, leftZ);
          verts.push(rightX, rightY, rightZ);

          if (i < centerline.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          }
        }

        if (verts.length < 12 || indices.length < 6) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: waterVisualProfile.color,
          emissive: waterVisualProfile.mode === 'ice' ? 0x8fa6bd : 0x0d2b4f,
          emissiveIntensity: waterVisualProfile.mode === 'ice' ? 0.08 : 0.14,
          roughness: waterVisualProfile.mode === 'ice' ? 0.82 : 0.38,
          metalness: waterVisualProfile.mode === 'ice' ? 0.02 : 0.02,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        });
        registerWaterWaveMaterial(material, {
          waveScale: clampNumber(width / 42, 0.55, 1.1, 0.7),
          waveBase: clampNumber(width / 60, 0.4, 0.85, 0.55),
          width,
          waterKind: inferWaterRenderContext({ width })
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.receiveShadow = false;
        mesh.userData.isWaterwayLine = true;
        mesh.userData.alwaysVisible = true;
        mesh.userData.waterwayCenterline = centerline;
        mesh.userData.waterwayWidth = width;
        mesh.userData.waterwayBias = verticalBias;
        mesh.userData.surfaceVariant = waterVisualProfile.mode;
        mesh.visible = true;
        appCtx.scene.add(mesh);
        appCtx.landuseMeshes.push(mesh);
        appCtx.waterways.push({
          type: tags?.kind || tags?.waterway || 'waterway',
          width,
          surfaceY: verticalBias,
          pts: centerline
        });
      }

      function addLinearFeatureRibbon(pts, tags, options = {}) {
        if (!ENABLE_LINEAR_FEATURES) return false;
        if (!pts || pts.length < 2) return false;
        const classification = classifyLinearFeatureTags(tags, options);
        if (!classification) return false;
        const centerline = decimatePoints(pts, classification.kind === 'railway' ? 900 : 700, false);
        if (centerline.length < 2) return false;

        const spec = linearFeatureVisualSpec(classification, tags);
        const halfWidth = spec.width * 0.5;
        const verts = [];
        const indices = [];
        const structureSemantics = classifyStructureSemantics(tags || {}, {
          featureKind: classification.kind,
          subtype: classification.subtype
        });
        const feature = {
          kind: classification.kind,
          subtype: classification.subtype,
          networkKind: classification.kind,
          name: String(tags?.name || '').trim(),
          sourceFeatureId: tags?.sourceFeatureId ? String(tags.sourceFeatureId) : '',
          width: spec.width,
          bias: spec.bias,
          surfaceBias: spec.bias,
          pts: centerline,
          walkable: true,
          driveable: false,
          structureSemantics,
          baseStructureSemantics: cloneStructureSemantics(structureSemantics),
          structureTags: {
            bridge: tags?.bridge || '',
            tunnel: tags?.tunnel || '',
            layer: tags?.layer || '',
            level: tags?.level || '',
            placement: tags?.placement || '',
            ramp: tags?.ramp || '',
            covered: tags?.covered || '',
            indoor: tags?.indoor || '',
            location: tags?.location || '',
            min_height: tags?.min_height || '',
            man_made: tags?.man_made || ''
          },
          bounds: polylineBounds(centerline, spec.width * 0.5 + 12),
          isStructureConnector: options.force === true
        };
        applyBuildingContextSemanticsToFeature(feature);
        feature.isStructureConnector =
          options.force === true &&
          (feature?.structureSemantics?.gradeSeparated || feature?.structureSemantics?.skywalk === true);
        if (options.force === true && !feature.isStructureConnector) return false;
        updateFeatureSurfaceProfile(feature, worldBaseTerrainY, { surfaceBias: spec.bias });
        const ribbonEdges = buildFeatureRibbonEdges(feature, centerline, halfWidth, worldBaseTerrainY, {
          surfaceBias: spec.bias
        });

        for (let i = 0; i < ribbonEdges.leftEdge.length; i++) {
          const leftEdge = ribbonEdges.leftEdge[i];
          const rightEdge = ribbonEdges.rightEdge[i];
          verts.push(leftEdge.x, leftEdge.y, leftEdge.z);
          verts.push(rightEdge.x, rightEdge.y, rightEdge.z);
          if (i < ribbonEdges.leftEdge.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          }
        }

        if (verts.length < 12 || indices.length < 6) return false;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.emissive,
          emissiveIntensity: spec.emissiveIntensity,
          roughness: spec.roughness,
          metalness: spec.metalness,
          transparent: false,
          opacity: spec.opacity,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 2;
        mesh.receiveShadow = false;
        mesh.userData.isLinearFeatureLine = true;
        mesh.userData.linearFeatureCenterline = centerline;
        mesh.userData.linearFeatureKind = classification.kind;
        mesh.userData.linearFeatureSubtype = classification.subtype;
        mesh.userData.linearFeatureWidth = spec.width;
        mesh.userData.linearFeatureBias = spec.bias;
        mesh.userData.linearFeatureRef = feature;
        mesh.userData.structureSemantics = structureSemantics;
        mesh.userData.structureConnector = options.force === true;
        mesh.visible = options.alwaysVisible === true ? true : (ENABLE_LINEAR_FEATURES && appCtx.showPathOverlays !== false);
        appCtx.scene.add(mesh);
        appCtx.linearFeatureMeshes.push(mesh);
        appCtx.linearFeatures.push(feature);
        return true;
      }

      function addWaterPolygonFromVectorCoords(polygonCoords, properties = {}) {
        if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;
        const outer = normalizeWorldRingFromLonLat(polygonCoords[0], 1000);
        if (!outer) return false;

        const holes = [];
        for (let i = 1; i < polygonCoords.length; i++) {
          const hole = normalizeWorldRingFromLonLat(polygonCoords[i], 700);
          if (hole && Math.abs(signedPolygonAreaXZ(hole)) > FEATURE_MIN_HOLE_AREA) holes.push(hole);
        }

        addLandusePolygon(outer, 'water', holes);
        return true;
      }

      function addVectorWaterGeoJSON(geojson) {
        if (!geojson || !geojson.geometry) return { polygons: 0, lines: 0 };
        let polygons = 0;
        let lines = 0;
        const geom = geojson.geometry;
        const props = geojson.properties || {};

        if (geom.type === 'Polygon') {
          if (addWaterPolygonFromVectorCoords(geom.coordinates, props)) polygons++;
          return { polygons, lines };
        }
        if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach((polyCoords) => {
            if (addWaterPolygonFromVectorCoords(polyCoords, props)) polygons++;
          });
          return { polygons, lines };
        }
        if (geom.type === 'LineString') {
          const pts = worldLinePointsFromLonLat(geom.coordinates, 1000);
          if (pts && pts.length >= 2) {
            addWaterwayRibbon(pts, props);
            lines++;
          }
          return { polygons, lines };
        }
        if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((lineCoords) => {
            const pts = worldLinePointsFromLonLat(lineCoords, 1000);
            if (pts && pts.length >= 2) {
              addWaterwayRibbon(pts, props);
              lines++;
            }
          });
        }
        return { polygons, lines };
      }

      function ensureWaterFallbackIfEmpty() {
        const existingCount = (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0) +
          (Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0);
        if (existingCount > 0) return false;

        // Guarantee at least one visible water surface so sparse/remote loads
        // never present a fully dry/broken world due upstream data outages.
        const ringHalfWidth = Math.max(280, Math.min(820, appCtx.SCALE * featureRadius * 0.35));
        const zNear = ringHalfWidth * 0.75;
        const zFar = ringHalfWidth * 1.45;
        const fallbackOuter = [
          { x: -ringHalfWidth, z: zNear },
          { x: ringHalfWidth, z: zNear },
          { x: ringHalfWidth, z: zFar },
          { x: -ringHalfWidth, z: zFar },
          { x: -ringHalfWidth, z: zNear }
        ];
        addLandusePolygon(fallbackOuter, 'water', []);
        return true;
      }

      async function loadVectorTileWaterCoverage(latMin, lonMin, latMax, lonMax) {
        const tr = vectorTileRangeForBounds(latMin, lonMin, latMax, lonMax, WATER_VECTOR_TILE_ZOOM);
        const tileJobs = [];
        for (let tx = tr.xMin; tx <= tr.xMax; tx++) {
          for (let ty = tr.yMin; ty <= tr.yMax; ty++) {
            tileJobs.push(fetchVectorTileWater(WATER_VECTOR_TILE_ZOOM, tx, ty));
          }
        }
        if (tileJobs.length === 0) return { polygons: 0, lines: 0, tiles: 0, okTiles: 0 };

        const settled = await Promise.allSettled(tileJobs);
        let polygons = 0;
        let lines = 0;
        let okTiles = 0;

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          okTiles++;
          const { tile, x, y, z } = result.value;
          const polygonLayers = ['ocean', 'water_polygons'];
          const lineLayers = ['water_lines'];

          polygonLayers.forEach((layerName) => {
              const layer = tile.layers[layerName];
              if (!layer || !Number.isFinite(layer.length)) return;
              for (let i = 0; i < layer.length; i++) {
                const feature = layer.feature(i);
                if (!feature || typeof feature.toGeoJSON !== 'function') continue;
                const out = addVectorWaterGeoJSON(feature.toGeoJSON(x, y, z));
                polygons += out.polygons;
                lines += out.lines;
              }
          });

          lineLayers.forEach((layerName) => {
              const layer = tile.layers[layerName];
              if (!layer || !Number.isFinite(layer.length)) return;
              for (let i = 0; i < layer.length; i++) {
                const feature = layer.feature(i);
                if (!feature || typeof feature.toGeoJSON !== 'function') continue;
                const out = addVectorWaterGeoJSON(feature.toGeoJSON(x, y, z));
                polygons += out.polygons;
                lines += out.lines;
              }
          });
        });

        return { polygons, lines, tiles: tileJobs.length, okTiles };
      }

      const currentWaterFeatureCount = () =>
        (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0) +
        (Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0);

      const loadSignature = `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:${Number(appCtx.LOC?.lon || 0).toFixed(6)}:${Number(featureRadius || 0).toFixed(6)}`;
      const waterSignals = worldSurfaceProfile?.signals?.normalized || {};
      const likelyWaterNearby =
        currentWaterFeatureCount() > 0 ||
        Number(waterSignals.water || 0) >= 0.05 ||
        Number(waterSignals.explicitBlue || 0) >= 0.04 ||
        appCtx.boatMode?.active === true ||
        appCtx.oceanMode?.active === true;

      async function runVectorWaterCoverage(options = {}) {
        const showStatus = options.showStatus === true;
        const injectFallback = options.injectFallback === true;
        const currentSignature = `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:${Number(appCtx.LOC?.lon || 0).toFixed(6)}:${Number(featureRadius || 0).toFixed(6)}`;
        if (currentSignature !== loadSignature) return null;
        if (showStatus) {
          appCtx.showLoad('Loading water...');
        }
        try {
          const waterSummary = await loadVectorTileWaterCoverage(
            appCtx.LOC.lat - featureRadius,
            appCtx.LOC.lon - featureRadius,
            appCtx.LOC.lat + featureRadius,
            appCtx.LOC.lon + featureRadius
          );
          if (waterSummary.polygons === 0 && waterSummary.lines === 0 && showStatus) {
            console.warn(`[Water] Vector tiles loaded but no water features in bounds (tiles ok ${waterSummary.okTiles}/${waterSummary.tiles}).`);
          }
        } catch (waterErr) {
          console.warn('[Water] Vector water load failed, continuing without vector water layer.', waterErr);
        }
        if (injectFallback && ensureWaterFallbackIfEmpty()) {
          console.warn('[Water] No water features loaded; injected deterministic fallback water surface.');
        }
        return true;
      }

      appCtx.showLoad(`Loading land use... (${landuseWays.length})`);
      startLoadPhase('buildLanduseGeometry');
      landuseWays.forEach((way) => {
        const landuseType = classifyLanduseType(way.tags);
        if (!landuseType) return;
        const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const guard = landuseType === 'water' ? null : landuseGeometryGuards;
        cacheSurfaceFeatureHint(pts, landuseType, guard);
        addLandusePolygon(pts, landuseType, [], guard);
      });

      if (Array.isArray(waterwayWays) && waterwayWays.length > 0) {
        waterwayWays.forEach((way) => {
          const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
          addWaterwayRibbon(pts, way.tags || {});
        });
      }

      if (likelyWaterNearby) {
        await runVectorWaterCoverage({ showStatus: true, injectFallback: true });
      } else {
        window.setTimeout(() => {
          void runVectorWaterCoverage({ showStatus: false, injectFallback: false });
        }, 220);
      }
      endLoadPhase('buildLanduseGeometry');
      startLoadPhase('batchLanduseGeometry');
      const batchedLanduseCount = batchLanduseMeshes();
      if (batchedLanduseCount > 0) {
        loadMetrics.lod.landuseBatched = batchedLanduseCount;
      }
      if (appCtx._lastLanduseBatchStats) {
        loadMetrics.landuseBatching = { ...appCtx._lastLanduseBatchStats };
      }
      endLoadPhase('batchLanduseGeometry');

      refreshStructureAwareFeatureProfiles();
      startLoadPhase('buildLinearFeatureGeometry');
      const linearFeatureGroups = [
        { ways: railwayWays, force: false, alwaysVisible: false },
        { ways: cyclewayWays, force: false, alwaysVisible: false },
        { ways: footwayWays, force: false, alwaysVisible: false },
        { ways: structureConnectorWays, force: true, alwaysVisible: true }
      ];
      linearFeatureGroups.forEach((group) => {
        const featureWays = group.ways;
        if (!Array.isArray(featureWays) || featureWays.length === 0) return;
        featureWays.forEach((way) => {
          const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
          const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
          if (pts.length < 2) return;
          addLinearFeatureRibbon(pts, { ...(way.tags || {}), sourceFeatureId: way.id ? String(way.id) : '' }, {
            force: group.force === true,
            alwaysVisible: group.alwaysVisible === true
          });
        });
      });
      refreshStructureAwareFeatureProfiles();
      syncLinearFeatureOverlayVisibility();
      if (typeof appCtx.rebuildStructureVisualMeshes === 'function') {
        appCtx.rebuildStructureVisualMeshes();
      }
      endLoadPhase('buildLinearFeatureGeometry');

      if (appCtx.roads.length > 0) {
        appCtx.showLoad(`Loading POIs... (${poiNodes.length})`);
        buildPoiGeometryPass({
          endLoadPhase,
          loadMetrics,
          lodMidDist,
          lodNearDist,
          phaseName: 'buildPoiGeometry',
          poiKeyFromTags,
          poiNodes,
          startLoadPhase
        });
        appCtx.showLoad('Adding details...');
        buildStreetFurniturePass({
          endLoadPhase,
          loadMetrics,
          phaseName: 'buildStreetFurniture',
          startLoadPhase
        });

        finalizeLoadedWorld({
          buildTraversalNetworks,
          earthSceneSuppressed,
          hideEarthSceneMeshes,
          loadMetrics,
          markLoaded: () => { loaded = true; },
          reason: 'primary',
          spawnOnRoad,
          updateWorldLod
        });
        scheduleDeferredLinearFeatureLoad();
      } else
      {
        console.warn('No roads found in data, trying larger area...');
        appCtx.showLoad('No roads found, trying larger area...');
      }
    } catch (e) {
      const isLastAttempt = r === radii[radii.length - 1];
      if (appCtx.roads.length > 0) {
        console.warn('[WorldLoad] Recovering with partially loaded world data.');
        loadMetrics.error = e?.message || String(e);
        finalizeLoadedWorld({
          buildTraversalNetworks,
          earthSceneSuppressed,
          hideEarthSceneMeshes,
          loadMetrics,
          markLoaded: () => { loaded = true; },
          reason: 'partial_after_error',
          spawnOnRoad,
          updateWorldLod
        });
        break;
      }
      if (!isLastAttempt) {
        console.warn('Road loading attempt failed, retrying with larger area...', e);
        appCtx.showLoad('Retrying map data...');
        continue;
      }

      console.error('Road loading failed after all attempts:', e);
      if (appCtx.roads.length === 0) {
        if (useSyntheticFallbackRoads) {
          createSyntheticFallbackWorld({
            clearBuildingSpatialIndex,
            getRoadSubdivisionStep,
            invalidateTraversalNetworks,
            perfModeNow,
            polylineBounds,
            registerBuildingCollision
          });
          finalizeLoadedWorld({
            buildTraversalNetworks,
            earthSceneSuppressed,
            hideEarthSceneMeshes,
            loadMetrics,
            markLoaded: () => { loaded = true; },
            reason: 'synthetic_fallback',
            spawnOnRoad,
            updateWorldLod
          });
        } else {
          finalizeLoadedWorld({
            buildTraversalNetworks,
            earthSceneSuppressed,
            hideEarthSceneMeshes,
            loadMetrics,
            markLoaded: () => { loaded = true; },
            reason: 'no_roads_sparse',
            spawnOnRoad,
            updateWorldLod
          });
        }
      }
    }
  }
  if (!loaded && appCtx.roads.length > 0) {
    console.warn('[WorldLoad] Completing with partially loaded roads.');
    finalizeLoadedWorld({
      buildTraversalNetworks,
      earthSceneSuppressed,
      hideEarthSceneMeshes,
      loadMetrics,
      markLoaded: () => { loaded = true; },
      reason: 'post_loop_partial',
      spawnOnRoad,
      updateWorldLod
    });
  }
  if (!loaded && appCtx.roads.length === 0) {
    if (useSyntheticFallbackRoads) {
      console.warn('[WorldLoad] No road data found for this location. Using synthetic fallback world.');
      createSyntheticFallbackWorld({
        clearBuildingSpatialIndex,
        getRoadSubdivisionStep,
        invalidateTraversalNetworks,
        perfModeNow,
        polylineBounds,
        registerBuildingCollision
      });
      finalizeLoadedWorld({
        buildTraversalNetworks,
        earthSceneSuppressed,
        hideEarthSceneMeshes,
        loadMetrics,
        markLoaded: () => { loaded = true; },
        reason: 'synthetic_no_roads',
        spawnOnRoad,
        updateWorldLod
      });
    } else {
      console.warn('[WorldLoad] No road data found for this location. Loading sparse terrain-only world.');
      finalizeLoadedWorld({
        buildTraversalNetworks,
        earthSceneSuppressed,
        hideEarthSceneMeshes,
        loadMetrics,
        markLoaded: () => { loaded = true; },
        reason: 'no_roads_sparse',
        spawnOnRoad,
        updateWorldLod
      });
    }
  }
  if (!loaded && retryPass < 1) {
    console.warn('[WorldLoad] Initial pass failed. Retrying once automatically...');
    appCtx.showLoad('Retrying map data...');
    appCtx.worldLoading = false;
    return loadRoadsInternal(retryPass + 1);
  }
  if (!loaded) {
    // Final safety net for upstream outages: do not leave users blocked behind
    // a manual retry screen; recover with whichever fallback mode is appropriate.
    console.warn('[WorldLoad] Final load path failed. Entering fallback recovery mode.');
    if (appCtx.roads.length === 0) {
      if (useSyntheticFallbackRoads) {
        createSyntheticFallbackWorld({
          clearBuildingSpatialIndex,
          getRoadSubdivisionStep,
          invalidateTraversalNetworks,
          perfModeNow,
          polylineBounds,
          registerBuildingCollision
        });
        finalizeLoadedWorld({
          buildTraversalNetworks,
          earthSceneSuppressed,
          hideEarthSceneMeshes,
          loadMetrics,
          markLoaded: () => { loaded = true; },
          reason: 'synthetic_final_recovery',
          spawnOnRoad,
          updateWorldLod
        });
      } else {
        finalizeLoadedWorld({
          buildTraversalNetworks,
          earthSceneSuppressed,
          hideEarthSceneMeshes,
          loadMetrics,
          markLoaded: () => { loaded = true; },
          reason: 'no_roads_final_recovery',
          spawnOnRoad,
          updateWorldLod
        });
      }
    } else {
      finalizeLoadedWorld({
        buildTraversalNetworks,
        earthSceneSuppressed,
        hideEarthSceneMeshes,
        loadMetrics,
        markLoaded: () => { loaded = true; },
        reason: 'partial_final_recovery',
        spawnOnRoad,
        updateWorldLod
      });
    }
  }
  appCtx.worldLoading = false;
  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: loadMetrics.lod.near, mid: loadMetrics.lod.mid });
    appCtx.setPerfLiveStat('worldCounts', {
      roads: appCtx.roads.length,
      buildings: appCtx.buildingMeshes.length,
      poiMeshes: appCtx.poiMeshes.length,
      landuseMeshes: appCtx.landuseMeshes.length
    });
  }
  if (_phaseTotals && typeof _phaseTotals === 'object') {
    loadMetrics.phases = Object.fromEntries(
      Object.entries(_phaseTotals).map(([name, ms]) => [name, Math.round(ms)])
    );
  }
  finalizePerfLoad(loaded, {
    roadsFinal: appCtx.roads.length,
    roadVertices: Math.round(loadMetrics.roads.vertices || 0),
    buildingMeshes: appCtx.buildingMeshes.length,
    buildingColliders: appCtx.buildings.length,
    buildingCollidersFull: loadMetrics.colliders.full,
    buildingCollidersSimplified: loadMetrics.colliders.simplified,
    linearFeaturesFinal: Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.length : 0,
    linearFeatureMeshes: Array.isArray(appCtx.linearFeatureMeshes) ? appCtx.linearFeatureMeshes.length : 0,
    poiMeshes: appCtx.poiMeshes.length,
    landuseMeshes: appCtx.landuseMeshes.length
  });
}

async function loadRoads(retryPass = 0) {
  if (retryPass > 0) return loadRoadsInternal(retryPass);

  if (appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    appCtx.stopBoatMode({ targetMode: 'walk' });
  }

  const signature = getWorldLoadSignature();
  if (_activeWorldLoad && _activeWorldLoad.signature === signature) {
    return _activeWorldLoad.promise;
  }

  const promise = loadRoadsInternal(0).finally(() => {
    if (_activeWorldLoad?.promise === promise) {
      _activeWorldLoad = null;
    }
  });

  _activeWorldLoad = { signature, promise };
  return promise;
}

function isVehicleRoad(road) {
  if (!road) return false;
  if (road.driveable === false) return false;
  return !road.networkKind || road.networkKind === 'road';
}

function isInsideWaterArea(x, z) {
  if (!Array.isArray(appCtx.waterAreas) || appCtx.waterAreas.length === 0) return false;
  for (let i = 0; i < appCtx.waterAreas.length; i++) {
    const area = appCtx.waterAreas[i];
    if (!Array.isArray(area?.pts) || area.pts.length < 3) continue;
    if (pointInPolygon(x, z, area.pts)) return true;
  }
  return false;
}

function overlaySuppressionSet(key = 'roadIds') {
  const source = appCtx.overlaySuppression?.[key];
  if (source instanceof Set) return source;
  if (Array.isArray(source)) return new Set(source);
  return new Set();
}

function isSuppressedBaseRoad(road) {
  if (!road || String(road?.sourceFeatureId || '').startsWith('overlay:')) return false;
  const sourceId = String(road?.sourceFeatureId || '');
  return !!(sourceId && overlaySuppressionSet('roadIds').has(sourceId));
}

function isSuppressedBaseBuilding(building) {
  if (!building || String(building?.sourceBuildingId || '').startsWith('overlay:')) return false;
  const sourceId = String(building?.sourceBuildingId || '');
  return !!(sourceId && overlaySuppressionSet('buildingIds').has(sourceId));
}

initWorldSpawning({
  buildingContainingPoint,
  findNearestRoad,
  isInsideWaterArea,
  isVehicleRoad,
  traversableFeaturesForMode
});
initWorldOsmLoader({
  getPerfModeValue
});
initWorldNavigation({
  applySpawnTarget,
  areRoadsConnected,
  isSuppressedBaseRoad,
  sampleFeatureSurfaceY,
  tryAutoEnterBoatAt
});
initWorldBudgets({
  getPerfModeValue,
  limitNodesByDistance,
  limitWaysByDistance,
  nodeDistanceSq
});
initWorldLod({
  getPerfModeValue,
  getRuntimeDynamicBudget,
  getWorldLodThresholds
});
initWorldTraversal({
  enableLinearFeatures: () => ENABLE_LINEAR_FEATURES,
  featureTraversalKey,
  isFiniteWorldPointXZ,
  isVehicleRoad,
  runtimeRoadFeatures
});
initWorldVegetation({
  findNearestRoad,
  getNearbyBuildings,
  isRoadSurfaceReachable,
  pointInPolygon,
  sanitizeWorldPathPoints,
  signedPolygonAreaXZ
});

Object.assign(appCtx, {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  buildTraversalNetworks,
  fetchOverpassJSON,
  findNearestRoad,
  findNearestTraversalFeature,
  findTraversalRoute,
  getNearbyBuildings,
  invalidateTraversalNetworks,
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  minimapScreenToWorld,
  pickNavigationTargetPoint,
  pointInPolygon,
  registerWaterWaveMaterial,
  refreshStructureAwareFeatureProfiles,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updateWorldLod
});

export {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  buildTraversalNetworks,
  fetchOverpassJSON,
  findNearestRoad,
  findNearestTraversalFeature,
  findTraversalRoute,
  getNearbyBuildings,
  invalidateTraversalNetworks,
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  minimapScreenToWorld,
  pickNavigationTargetPoint,
  pointInPolygon,
  registerWaterWaveMaterial,
  refreshStructureAwareFeatureProfiles,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updateWorldLod };
