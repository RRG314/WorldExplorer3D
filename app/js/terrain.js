import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  roadSurfaceMaterialCacheKey
} from "./road-render.js?v=1";
import {
  classifyTerrainSurfaceProfile as classifySharedTerrainSurfaceProfile
} from "./surface-rules.js?v=3";
import {
  buildFeatureRibbonEdges,
  isRoadSurfaceReachable,
  polylineDistances,
  projectPointToFeature,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts
} from "./structure-semantics.js?v=9";
// terrain.js - Terrain elevation system (Terrarium tiles)
// ============================================================================

// =====================
// TERRAIN HELPER FUNCTIONS
// =====================

// Namespace for terrain internal state
const terrain = {
  _rebuildTimer: null,
  _rebuildInFlight: false,
  _lastRoadRebuildAt: 0,
  _raycaster: null,
  _rayOrigin: null,
  _rayDir: null,
  _roadMaterialCacheKey: '',
  _roadMaterials: null,
  _urbanSurfaceMaterialCacheKey: '',
  _urbanSurfaceMaterials: null,
  // Performance optimization caching
  _lastUpdatePos: { x: 0, z: 0 },
  _cachedIntersections: null,
  _lastRoadCount: 0,
  _lastTerrainTileCount: 0
};
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const ROAD_REBUILD_DEBOUNCE_MS = 90;
const ROAD_REBUILD_MIN_INTERVAL_MS = 420;
const SIDEWALK_INNER_GAP = 0.18;
const SIDEWALK_MIN_WIDTH = 0.9;
const SIDEWALK_SEGMENT_MIN_WIDTH = 0.62;
const SIDEWALK_CLEARANCE = 0.4;
const SIDEWALK_HEIGHT_BIAS = 0.46;
const SIDEWALK_CURB_LIFT = 0.05;
const URBAN_CONTEXT_PAD = 26;
const SNOW_COLOR_HEX = 0xffffff;
const ALPINE_SNOW_COLOR_HEX = 0xe5ebf2;
const SAND_COLOR_HEX = 0xd7c08a;
const GRASS_COLOR_HEX = 0x6b8e4a;
const URBAN_GROUND_HEX = 0x8b8f96;
const SOIL_COLOR_HEX = 0x8c6b47;
const ROCK_COLOR_HEX = 0x7b7e82;
const GROUND_FALLBACK_GRASS_HEX = 0x4a7a2e;
const GROUND_FALLBACK_SNOW_HEX = 0xd6e2ef;
const GROUND_FALLBACK_ALPINE_HEX = 0xc6d0d8;
const GROUND_FALLBACK_SAND_HEX = 0xc8aa70;
const GROUND_FALLBACK_URBAN_HEX = 0x767a82;
const GROUND_FALLBACK_SOIL_HEX = 0x7d5e3d;
const GROUND_FALLBACK_ROCK_HEX = 0x6e7279;
const MIN_VALID_ELEVATION_METERS = -500;
const MAX_VALID_ELEVATION_METERS = 9000;
const URBAN_LANDUSE_TYPES = new Set([
  'residential',
  'commercial',
  'industrial',
  'retail',
  'construction',
  'brownfield',
  'garages',
  'railway',
  'harbour',
  'port',
  'military'
]);
const GREEN_LANDUSE_TYPES = new Set([
  'forest',
  'wood',
  'park',
  'garden',
  'grass',
  'meadow',
  'orchard',
  'vineyard',
  'allotments',
  'farmland',
  'recreation_ground',
  'village_green',
  'cemetery'
]);

function clampElevationMeters(meters) {
  if (!Number.isFinite(meters)) return 0;
  return Math.max(MIN_VALID_ELEVATION_METERS, Math.min(MAX_VALID_ELEVATION_METERS, meters));
}

function disposeRoadMaterialCache() {
  if (!terrain._roadMaterials) return;
  disposeRoadSurfaceMaterials(terrain._roadMaterials);
  terrain._roadMaterials = null;
  terrain._roadMaterialCacheKey = '';
}

function disposeUrbanSurfaceMaterialCache() {
  if (!terrain._urbanSurfaceMaterials) return;
  disposeRoadSurfaceMaterials(terrain._urbanSurfaceMaterials);
  terrain._urbanSurfaceMaterials = null;
  terrain._urbanSurfaceMaterialCacheKey = '';
}

function getSharedRoadMaterials() {
  const key = roadSurfaceMaterialCacheKey({
    asphaltTex: appCtx.asphaltTex,
    asphaltNormal: appCtx.asphaltNormal,
    asphaltRoughness: appCtx.asphaltRoughness
  });
  if (terrain._roadMaterials && terrain._roadMaterialCacheKey === key) return terrain._roadMaterials;

  disposeRoadMaterialCache();
  const materials = createRoadSurfaceMaterials({
    asphaltTex: appCtx.asphaltTex,
    asphaltNormal: appCtx.asphaltNormal,
    asphaltRoughness: appCtx.asphaltRoughness
  });

  terrain._roadMaterialCacheKey = key;
  terrain._roadMaterials = {
    roadMat: materials.roadMainMaterial,
    skirtMat: materials.roadSkirtMaterial,
    capMat: materials.roadCapMaterial
  };
  return terrain._roadMaterials;
}

function getSharedUrbanSurfaceMaterials() {
  const key = roadSurfaceMaterialCacheKey({ includeSidewalk: true });
  if (terrain._urbanSurfaceMaterials && terrain._urbanSurfaceMaterialCacheKey === key) {
    return terrain._urbanSurfaceMaterials;
  }

  disposeUrbanSurfaceMaterialCache();
  const materials = createRoadSurfaceMaterials({ includeSidewalk: true });

  terrain._urbanSurfaceMaterialCacheKey = key;
  terrain._urbanSurfaceMaterials = { sidewalkMat: materials.sidewalkMaterial };
  return terrain._urbanSurfaceMaterials;
}

function boundsIntersectLocal(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    a.maxX < b.minX - padding ||
    a.minX > b.maxX + padding ||
    a.maxZ < b.minZ - padding ||
    a.minZ > b.maxZ + padding
  );
}

function expandBoundsLocal(bounds, padding = 0) {
  if (!bounds) return null;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    minX: bounds.minX - pad,
    maxX: bounds.maxX + pad,
    minZ: bounds.minZ - pad,
    maxZ: bounds.maxZ + pad
  };
}

function pointsBoundsLocal(points = [], padding = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return expandBoundsLocal({ minX, maxX, minZ, maxZ }, padding);
}

function pointInPolygonXZLocal(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = (zi > z) !== (zj > z) &&
      x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistanceXZLocal(x, z, p1, p2) {
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

function distanceToPolygonEdgeXZLocal(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dist = pointToSegmentDistanceXZLocal(x, z, pts[i], pts[(i + 1) % pts.length]);
    if (dist < best) best = dist;
  }
  return best;
}

function isUrbanLanduseType(type = '') {
  return URBAN_LANDUSE_TYPES.has(type);
}

function isGreenLanduseType(type = '') {
  return GREEN_LANDUSE_TYPES.has(type);
}

function roadSupportsSidewalks(road) {
  const type = String(road?.type || '').toLowerCase();
  if (road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade') return false;
  if (road?.structureSemantics?.rampCandidate) return false;
  const explicitSidewalk = roadHasExplicitSidewalkHint(road);
  if (explicitSidewalk) return true;
  if (!type) return true;
  if (type.includes('motorway') || type.includes('trunk')) return false;
  if (
    type.includes('service') ||
    type.includes('parking_aisle') ||
    type.includes('driveway') ||
    type.includes('alley') ||
    type.includes('_link') ||
    type.includes('link')
  ) {
    return false;
  }
  if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;
  return true;
}

function roadHasExplicitSidewalkHint(road) {
  return (
    road?.sidewalkHint === 'both' ||
    road?.sidewalkHint === 'left' ||
    road?.sidewalkHint === 'right'
  );
}

function roadBaseSidewalkWidth(road, denseUrban = false) {
  const type = String(road?.type || '').toLowerCase();
  let width =
    type.includes('pedestrian') || type.includes('living_street') ? 3.2 :
    type.includes('primary') ? 2.8 :
    type.includes('secondary') ? 2.5 :
    type.includes('tertiary') ? 2.25 :
    type.includes('service') ? 1.5 :
    2.0;
  if (road?.sidewalkHint === 'both') width += 0.35;
  else if (road?.sidewalkHint === 'left' || road?.sidewalkHint === 'right') width += 0.15;
  if (denseUrban) width += 0.2;
  return Math.max(SIDEWALK_MIN_WIDTH, Math.min(3.6, width));
}

function roadTypeFamily(type = '') {
  const normalized = String(type || '').toLowerCase();
  return normalized.replace(/_link$/i, '');
}

function roadPolylineLength(road) {
  const pts = Array.isArray(road?.pts) ? road.pts : [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return total;
}

function roadConnectedSidewalkContinuity(road, denseUrbanContext, ruralGreenContext) {
  if (!roadSupportsSidewalks(road)) return false;
  if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;
  const roadName = String(road?.name || '').trim().toLowerCase();
  const family = roadTypeFamily(road?.type || '');
  const length = roadPolylineLength(road);
  const shortContinuation = length > 0 && length <= 170;
  const bridgeGapContinuation = length > 0 && length <= 80;
  if (denseUrbanContext && !ruralGreenContext) return true;
  if (ruralGreenContext && !shortContinuation) return false;
  const startConnections = Array.isArray(road?.connectedFeatures?.start) ? road.connectedFeatures.start : [];
  const endConnections = Array.isArray(road?.connectedFeatures?.end) ? road.connectedFeatures.end : [];
  const continuityScoreFor = (entries) => {
    let score = 0;
    let explicitCount = 0;
    let supportiveCount = 0;
    let strongCount = 0;
    let deadEnd = entries.length === 0;
    for (let i = 0; i < entries.length; i++) {
      const other = entries[i]?.feature || null;
      if (!other || !roadSupportsSidewalks(other)) continue;
      if (other?.structureSemantics?.terrainMode && other.structureSemantics.terrainMode !== 'at_grade') continue;
      const otherName = String(other?.name || '').trim().toLowerCase();
      const sameNamedRoad = !!roadName && roadName === otherName;
      const sameFamily = roadTypeFamily(other?.type || '') === family;
      const otherLength = roadPolylineLength(other);
      const otherShort = otherLength > 0 && otherLength <= 170;
      const explicitSidewalk = roadHasExplicitSidewalkHint(other);
      if (!sameNamedRoad && !sameFamily) continue;
      deadEnd = false;
      if (
        explicitSidewalk
      ) {
        explicitCount += 1;
        supportiveCount += 1;
        strongCount += 1;
        score += sameNamedRoad ? 4 : 3;
      } else if (sameNamedRoad) {
        supportiveCount += 1;
        strongCount += (otherShort || shortContinuation) ? 1 : 0;
        score += otherShort || shortContinuation ? 2.25 : 1.6;
      } else if (sameFamily) {
        supportiveCount += 1;
        score += otherShort || shortContinuation ? 1.35 : 0.9;
        if (otherShort || bridgeGapContinuation) strongCount += 1;
      }
    }
    return {
      score,
      explicitCount,
      supportiveCount,
      strongCount,
      deadEnd
    };
  };

  const startScore = continuityScoreFor(startConnections);
  const endScore = continuityScoreFor(endConnections);
  if (startScore.explicitCount + endScore.explicitCount >= 2) return true;
  if (startScore.strongCount > 0 && endScore.supportiveCount > 0) return true;
  if (endScore.strongCount > 0 && startScore.supportiveCount > 0) return true;
  if (shortContinuation && (startScore.score + endScore.score) >= 2.6) return true;
  if (bridgeGapContinuation && (
    (startScore.score >= 1.8 && endScore.deadEnd) ||
    (endScore.score >= 1.8 && startScore.deadEnd)
  )) {
    return true;
  }
  return startScore.score > 0 && endScore.score > 0;
}

function pointInsideBuildingCandidate(x, z, building) {
  if (!building) return false;
  if (Number.isFinite(building.minX) && Number.isFinite(building.maxX) && (
    x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ
  )) {
    return false;
  }
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    return pointInPolygonXZLocal(x, z, building.pts);
  }
  return true;
}

function resolveSidewalkWidth(originX, originZ, outwardX, outwardZ, innerOffset, desiredWidth, buildingCandidates) {
  const probes = [
    desiredWidth,
    desiredWidth * 0.82,
    desiredWidth * 0.64,
    desiredWidth * 0.48
  ];
  for (let i = 0; i < probes.length; i++) {
    const width = probes[i];
    if (!Number.isFinite(width) || width < SIDEWALK_MIN_WIDTH) continue;
    const testOffsets = [
      innerOffset + Math.min(0.35, width * 0.35),
      innerOffset + width * 0.58,
      innerOffset + Math.max(0.2, width - 0.15)
    ];
    let blocked = false;
    for (let s = 0; s < testOffsets.length && !blocked; s++) {
      const px = originX + outwardX * testOffsets[s];
      const pz = originZ + outwardZ * testOffsets[s];
      for (let b = 0; b < buildingCandidates.length; b++) {
        const building = buildingCandidates[b];
        if (!pointInsideBuildingCandidate(px, pz, building)) continue;
        if (Array.isArray(building.pts) && building.pts.length >= 3) {
          if (distanceToPolygonEdgeXZLocal(px, pz, building.pts) < SIDEWALK_CLEARANCE) {
            blocked = true;
            break;
          }
        } else {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) return width;
  }
  return 0;
}

function clampSidewalkWidthTransitions(widths, pts, caps = null, locked = null) {
  if (!(widths instanceof Float32Array) || !Array.isArray(pts) || pts.length !== widths.length || widths.length < 2) return;

  const applyCaps = () => {
    if (!(caps instanceof Float32Array) || caps.length !== widths.length) return;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.min(widths[i], Math.max(0, caps[i]));
    }
  };
  const applyLocks = () => {
    if (!(locked instanceof Uint8Array) || locked.length !== widths.length) return;
    for (let i = 0; i < widths.length; i++) {
      if (locked[i]) widths[i] = 0;
    }
  };

  for (let i = 1; i < widths.length; i++) {
    const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) || 1;
    const maxDelta = Math.max(0.35, Math.min(0.95, segLen * 0.22));
    if (widths[i] > widths[i - 1] + maxDelta) widths[i] = widths[i - 1] + maxDelta;
  }
  applyCaps();
  applyLocks();
  for (let i = widths.length - 2; i >= 0; i--) {
    const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 1;
    const maxDelta = Math.max(0.35, Math.min(0.95, segLen * 0.22));
    if (widths[i] > widths[i + 1] + maxDelta) widths[i] = widths[i + 1] + maxDelta;
  }
  applyCaps();
  applyLocks();

  for (let i = 0; i < widths.length; i++) {
    if (widths[i] < SIDEWALK_SEGMENT_MIN_WIDTH * 0.45) widths[i] = 0;
  }
  applyCaps();
  applyLocks();
}

function smoothSidewalkOuterHeights(heights, widths, pts) {
  if (!(heights instanceof Float32Array) || !(widths instanceof Float32Array) || !Array.isArray(pts) || heights.length !== widths.length || heights.length < 3) return;

  for (let pass = 0; pass < 1; pass++) {
    for (let i = 1; i < heights.length - 1; i++) {
      if (widths[i] <= 0) continue;
      const prevWeight = widths[i - 1] > 0 ? 1 : 0;
      const nextWeight = widths[i + 1] > 0 ? 1 : 0;
      if (!prevWeight && !nextWeight) continue;
      const neighborSum =
        (prevWeight ? heights[i - 1] : 0) +
        (nextWeight ? heights[i + 1] : 0);
      const neighborCount = prevWeight + nextWeight;
      if (!neighborCount) continue;
      heights[i] = heights[i] * 0.68 + (neighborSum / neighborCount) * 0.32;
    }
  }
}

function computeSidewalkCornerScale(pts, index, sideSign) {
  if (!Array.isArray(pts) || index <= 0 || index >= pts.length - 1) return 1;
  const prev = pts[index - 1];
  const curr = pts[index];
  const next = pts[index + 1];
  if (!prev || !curr || !next) return 1;

  const inX = curr.x - prev.x;
  const inZ = curr.z - prev.z;
  const outX = next.x - curr.x;
  const outZ = next.z - curr.z;
  const inLen = Math.hypot(inX, inZ) || 1;
  const outLen = Math.hypot(outX, outZ) || 1;
  const inDirX = inX / inLen;
  const inDirZ = inZ / inLen;
  const outDirX = outX / outLen;
  const outDirZ = outZ / outLen;

  const turnAngle = Math.acos(Math.max(-1, Math.min(1, inDirX * outDirX + inDirZ * outDirZ)));
  if (!Number.isFinite(turnAngle) || turnAngle < 0.14) return 1;

  const turnCross = inDirX * outDirZ - inDirZ * outDirX;
  const insideCorner = turnCross * sideSign > 0.02;
  if (!insideCorner) return 1;

  const severity = Math.max(0, Math.min(1, (turnAngle - 0.14) / 1.1));
  return Math.max(0.18, Math.min(1, 1 - severity * 0.78));
}

function scheduleRoadAndBuildingRebuild() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return;
  appCtx.roadsNeedRebuild = true;
  if (terrain._rebuildTimer) return;

  const now = performance.now();
  const elapsed = now - terrain._lastRoadRebuildAt;
  const waitMs = elapsed >= ROAD_REBUILD_MIN_INTERVAL_MS ?
  ROAD_REBUILD_DEBOUNCE_MS :
  Math.max(ROAD_REBUILD_DEBOUNCE_MS, ROAD_REBUILD_MIN_INTERVAL_MS - elapsed);

  terrain._rebuildTimer = setTimeout(() => {
    terrain._rebuildTimer = null;
    if (!appCtx.roadsNeedRebuild || appCtx.onMoon || !appCtx.terrainEnabled || appCtx.roads.length === 0) return;
    if (terrain._rebuildInFlight) {
      scheduleRoadAndBuildingRebuild();
      return;
    }

    terrain._rebuildInFlight = true;
    try {
      rebuildRoadsWithTerrain();
      repositionBuildingsWithTerrain();
      terrain._lastRoadRebuildAt = performance.now();
    } finally {
      terrain._rebuildInFlight = false;
      if (appCtx.roadsNeedRebuild) scheduleRoadAndBuildingRebuild();
    }
  }, waitMs);
}

function canRunRoadAndBuildingRebuildNow() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return false;
  let tilesLoaded = 0;
  let tilesTotal = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    tilesTotal++;
    if (tile?.loaded) tilesLoaded++;
  });
  return tilesLoaded > 0 && tilesTotal > 0;
}

function requestWorldSurfaceSync(options = {}) {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return false;
  appCtx.roadsNeedRebuild = true;

  const force = options.force === true;
  if (force && terrain._rebuildTimer) {
    clearTimeout(terrain._rebuildTimer);
    terrain._rebuildTimer = null;
  }

  if (!force || terrain._rebuildInFlight || !canRunRoadAndBuildingRebuildNow()) {
    scheduleRoadAndBuildingRebuild();
    return false;
  }

  terrain._rebuildInFlight = true;
  try {
    rebuildRoadsWithTerrain();
    repositionBuildingsWithTerrain();
    terrain._lastRoadRebuildAt = performance.now();
    return true;
  } finally {
    terrain._rebuildInFlight = false;
    if (appCtx.roadsNeedRebuild) scheduleRoadAndBuildingRebuild();
  }
}

// =====================
// TERRAIN MESH GRID SAMPLER
// Reads vertex heights directly from terrain mesh geometry - O(1) per query.
// This gives the exact same height as the rendered terrain surface without
// expensive raycasting (which was O(triangles) and caused browser freezes).
// =====================
function terrainMeshHeightAt(x, z) {
  if (!appCtx.terrainGroup || appCtx.terrainGroup.children.length === 0) {
    return elevationWorldYAtWorldXZ(x, z);
  }

  const segs = appCtx.TERRAIN_SEGMENTS;
  const vps = segs + 1; // vertices per side

  for (let c = 0; c < appCtx.terrainGroup.children.length; c++) {
    const mesh = appCtx.terrainGroup.children[c];
    const info = mesh.userData?.terrainTile;
    if (!info) continue;

    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count < 4) continue;

    // Convert world position to mesh local space
    const lx = x - mesh.position.x;
    const lz = z - mesh.position.z;

    // Get mesh extents from corner vertices
    // Vertex 0 = top-left (-width/2, ?, -depth/2)
    // Vertex [segs] = top-right (width/2, ?, -depth/2)
    // Vertex [segs*vps] = bottom-left (-width/2, ?, depth/2)
    const x0 = pos.getX(0);
    const x1 = pos.getX(segs);
    const z0 = pos.getZ(0);
    const z1 = pos.getZ(segs * vps);

    // Bounds check - is point within this terrain tile?
    if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;

    // Compute grid cell coordinates
    const fx = (lx - x0) / (x1 - x0) * segs;
    const fz = (lz - z0) / (z1 - z0) * segs;

    const col = Math.max(0, Math.min(segs - 1, Math.floor(fx)));
    const row = Math.max(0, Math.min(segs - 1, Math.floor(fz)));

    const sx = fx - col; // 0..1 within cell
    const sz = fz - row;

    // Get four corner vertex Y values + mesh base position
    const baseY = mesh.position.y;
    const y00 = pos.getY(row * vps + col) + baseY;
    const y10 = pos.getY(row * vps + col + 1) + baseY;
    const y01 = pos.getY((row + 1) * vps + col) + baseY;
    const y11 = pos.getY((row + 1) * vps + col + 1) + baseY;

    // Bilinear interpolation - matches GPU linear triangle interpolation
    const y0 = y00 + (y10 - y00) * sx;
    const y1 = y01 + (y11 - y01) * sx;
    return y0 + (y1 - y0) * sz;
  }

  // Point not on any terrain tile - use raw elevation
  return elevationWorldYAtWorldXZ(x, z);
}

// =====================
// TERRAIN HEIGHT CACHE
// Cache terrain height lookups to avoid repeated queries during road generation
// =====================
const terrainHeightCache = new Map();
const baseTerrainHeightCache = new Map();
let terrainHeightCacheEnabled = true;

function baseTerrainHeightAt(x, z) {
  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
  if (tile.loaded) {
    const u = t.xf - t.x;
    const v = t.yf - t.y;
    const meters = clampElevationMeters(sampleTileElevationMeters(tile, u, v));
    return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
  }
  const meshY = terrainMeshHeightAt(x, z);
  if (Number.isFinite(meshY)) return meshY;
  return elevationWorldYAtWorldXZ(x, z);
}

function cachedBaseTerrainHeight(x, z) {
  const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (baseTerrainHeightCache.has(key)) return baseTerrainHeightCache.get(key);
  const h = baseTerrainHeightAt(x, z);
  baseTerrainHeightCache.set(key, h);
  return h;
}

function applyStructureTerrainCuts(worldX, worldZ, terrainY) {
  if (!Array.isArray(appCtx.structureTerrainCuts) || appCtx.structureTerrainCuts.length === 0 || !Number.isFinite(terrainY)) {
    return terrainY;
  }

  let adjustedY = terrainY;
  for (let i = 0; i < appCtx.structureTerrainCuts.length; i++) {
    const cut = appCtx.structureTerrainCuts[i];
    if (!cut?.feature || !cut?.bounds) continue;
    if (worldX < cut.bounds.minX || worldX > cut.bounds.maxX || worldZ < cut.bounds.minZ || worldZ > cut.bounds.maxZ) continue;

    const projected = projectPointToFeature(cut.feature, worldX, worldZ);
    if (!projected) continue;
    const width = Math.max(4.5, Number(cut.width) || Number(cut.feature?.width) || 6);
    const influenceRadius = width * 0.82 + 3.4;
    if (!Number.isFinite(projected.dist) || projected.dist > influenceRadius) continue;

    const surfaceY = sampleFeatureSurfaceY(cut.feature, worldX, worldZ, projected);
    if (!Number.isFinite(surfaceY)) continue;

    const clearance = Math.max(3.1, Number(cut.clearance) || 3.8);
    const targetY = surfaceY - clearance;
    if (!(targetY < adjustedY - 0.05)) continue;

    const lateralT = Math.max(0, Math.min(1, projected.dist / Math.max(0.5, influenceRadius)));
    let fade = 1 - (lateralT * lateralT * (3 - 2 * lateralT));
    const distances = cut.feature?.surfaceDistances;
    const points = cut.feature?.pts;
    if (distances instanceof Float32Array && Array.isArray(points) && points.length >= 2) {
      const lastIndex = distances.length - 1;
      const p1 = points[projected.segIndex];
      const p2 = points[projected.segIndex + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const distanceAlong = (Number(distances[projected.segIndex]) || 0) + segLen * projected.t;
      const totalDistance = Number(distances[lastIndex]) || 0;
      const portalLength = Math.max(6, Number(cut.portalLength) || 0);
      if (portalLength > 0 && totalDistance > 0) {
        const portalDistance = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
        const portalT = Math.max(0, Math.min(1, portalDistance / portalLength));
        fade *= portalT * portalT * (3 - 2 * portalT);
      }
    }
    adjustedY = Math.min(adjustedY, adjustedY + (targetY - adjustedY) * fade);
  }

  return adjustedY;
}

function pointAlongPolyline(points = [], distance = 0) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (points.length === 1) return { x: points[0].x, z: points[0].z, tangentX: 1, tangentZ: 0 };
  let remaining = Math.max(0, Number(distance) || 0);
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const segLen = Math.hypot(dx, dz);
    if (segLen <= 1e-6) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return {
        x: p1.x + dx * t,
        z: p1.z + dz * t,
        tangentX: dx / segLen,
        tangentZ: dz / segLen
      };
    }
    remaining -= segLen;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dz = last.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: last.x,
    z: last.z,
    tangentX: dx / len,
    tangentZ: dz / len
  };
}

function polylineCurvatureMetric(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let totalTurn = 0;
  let samples = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const aLen = Math.hypot(ax, az);
    const bLen = Math.hypot(bx, bz);
    if (!(aLen > 1e-5) || !(bLen > 1e-5)) continue;
    const dot = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (aLen * bLen)));
    totalTurn += Math.acos(dot);
    samples += 1;
  }
  return samples > 0 ? totalTurn / samples : 0;
}

function countNearbyElevatedFeatures(feature, elevatedFeatures, padding = 28) {
  const featureBounds = feature?.bounds || polylineBounds(feature?.pts || [], (Number(feature?.width) || 4) + padding);
  if (!featureBounds) return 0;
  let count = 0;
  for (let i = 0; i < elevatedFeatures.length; i++) {
    const other = elevatedFeatures[i];
    if (!other || other === feature) continue;
    const otherBounds = other.bounds || polylineBounds(other.pts || [], (Number(other.width) || 4) + padding);
    if (!otherBounds) continue;
    if (boundsIntersectLocal(featureBounds, otherBounds, padding)) count += 1;
  }
  return count;
}

function collectStructureVisualInstances() {
  const supportInstances = [];
  const portalInstances = [];
  const deckInstances = [];
  const girderInstances = [];
  const capInstances = [];
  const wallInstances = [];
  const roofInstances = [];
  const elevatedFeatures = []
    .concat(Array.isArray(appCtx.roads) ? appCtx.roads : [])
    .concat(Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.filter((feature) => feature?.isStructureConnector === true) : []);
  const elevatedVisualFeatures = elevatedFeatures.filter((feature) =>
    feature?.structureSemantics?.terrainMode === 'elevated' &&
    Array.isArray(feature?.pts) &&
    feature.pts.length >= 2
  );

  const addSupportInstance = (instance) => {
    if (!instance || !(instance.scaleY > 0.5)) return;
    supportInstances.push(instance);
  };

  const addPortalBeam = (x, y, z, sx, sy, sz, rotationY = 0) => {
    if (!(sx > 0 && sy > 0 && sz > 0)) return;
    portalInstances.push({ x, y, z, scaleX: sx, scaleY: sy, scaleZ: sz, rotationY });
  };

  const addDeckBody = (x, y, z, width, thickness, depth, rotationY = 0, quaternion = null) => {
    if (!(width > 0.4 && thickness > 0.12 && depth > 0.35)) return;
    deckInstances.push({
      x,
      y,
      z,
      scaleX: width,
      scaleY: thickness,
      scaleZ: depth,
      rotationY,
      quaternion
    });
  };

  const addBeam = (collection, x, y, z, sx, sy, sz, rotationY = 0, quaternion = null) => {
    if (!(sx > 0.08 && sy > 0.08 && sz > 0.2)) return;
    collection.push({ x, y, z, scaleX: sx, scaleY: sy, scaleZ: sz, rotationY, quaternion });
  };

  const deckQuaternionForSegment = (p1, y1, p2, y2) => {
    const dx = p2.x - p1.x;
    const dy = y2 - y1;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-5) || typeof THREE === 'undefined') return null;
    const direction = new THREE.Vector3(dx / length, dy / length, dz / length);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction
    );
    return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w, length };
  };

  for (let i = 0; i < elevatedFeatures.length; i++) {
    const feature = elevatedFeatures[i];
    const semantics = feature?.structureSemantics;
    if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || !semantics) continue;
    const category = String(semantics.featureCategory || feature.networkKind || feature.kind || 'road').toLowerCase();
    const isConnectorLike = category === 'connector' || category === 'footway';
    const isSkywalk = semantics.skywalk || semantics.covered || semantics.indoor;
    const suppressExteriorVisuals = semantics.embeddedInBuilding === true;
    const roadLinkFeature = /(?:^|_)link$/i.test(String(feature?.type || ''));
    const localRoadType = String(feature?.type || '').toLowerCase();
    const lowPriorityRoadVisual =
      !isConnectorLike &&
      /^(service|residential|unclassified|living_street|track)$/.test(localRoadType);
    const visualDetail =
      semantics.terrainMode === 'elevated' ?
        (isConnectorLike || isSkywalk ? 1.6 : 2.1) :
        0.8;
    const visualPts =
      typeof appCtx.subdivideRoadPoints === 'function' && feature.pts.length >= 2 ?
        appCtx.subdivideRoadPoints(feature.pts, visualDetail) :
        feature.pts;
    const structurePts = Array.isArray(visualPts) && visualPts.length >= 2 ? visualPts : feature.pts;
    const { distances, total } = polylineDistances(structurePts);
    const curvatureMetric = polylineCurvatureMetric(structurePts);
    const nearbyElevatedCount = semantics.terrainMode === 'elevated' ?
      countNearbyElevatedFeatures(feature, elevatedVisualFeatures) :
      0;
    const transitionAnchorDistances =
      Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0 ?
        feature.structureTransitionAnchors
          .map((anchor) => Number(anchor?.distance))
          .filter((distance) => Number.isFinite(distance)) :
        [];
    if (semantics.terrainMode === 'elevated') {
      if (suppressExteriorVisuals) continue;
      const clutteredInterchange =
        !isConnectorLike &&
        !isSkywalk &&
        (
          roadLinkFeature ||
          !!semantics.rampCandidate ||
          (lowPriorityRoadVisual && nearbyElevatedCount >= 1) ||
          (total < 120 && nearbyElevatedCount >= 2) ||
          (nearbyElevatedCount >= 4) ||
          (curvatureMetric >= 0.22) ||
          (transitionAnchorDistances.length >= 2 && nearbyElevatedCount >= 2)
        );
      const renderRoadFullDeckBody =
        !isConnectorLike &&
        !isSkywalk &&
        !clutteredInterchange &&
        total >= 42;
      const renderRoadSideGirders =
        renderRoadFullDeckBody &&
        total >= 140 &&
        curvatureMetric < 0.12 &&
        nearbyElevatedCount <= 2;
      const renderRoadSupports =
        !isConnectorLike &&
        !isSkywalk &&
        !clutteredInterchange &&
        total >= 58 &&
        nearbyElevatedCount <= 3;
      const renderRoadAbutments = renderRoadFullDeckBody;
      const renderCapBeams = isConnectorLike || isSkywalk || renderRoadSupports;
      const width = Math.max(2, Number(feature.width) || 4);
      const deckThickness = isConnectorLike ? 0.72 : Math.max(0.9, Math.min(1.6, width * 0.11));
      const girderDepth = isConnectorLike ? Math.max(0.34, deckThickness * 0.65) : Math.max(0.58, deckThickness * 0.72);
      for (let segIndex = 0; segIndex < structurePts.length - 1; segIndex++) {
        const p1 = structurePts[segIndex];
        const p2 = structurePts[segIndex + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > 0.35)) continue;
        const startY = sampleFeatureSurfaceY(feature, p1.x, p1.z);
        const endY = sampleFeatureSurfaceY(feature, p2.x, p2.z);
        const midX = (p1.x + p2.x) * 0.5;
        const midZ = (p1.z + p2.z) * 0.5;
        const deckY = sampleFeatureSurfaceY(feature, midX, midZ);
        if (!Number.isFinite(deckY) || !Number.isFinite(startY) || !Number.isFinite(endY)) continue;
        const rotationY = Math.atan2(dx, dz);
        const nx = -dz / (segLen || 1);
        const nz = dx / (segLen || 1);
        const segmentQuat = deckQuaternionForSegment(p1, startY, p2, endY);
        const deckDepth = segmentQuat?.length || segLen;
        const segmentStartDistance = Number(distances[segIndex]) || 0;
        const segmentEndDistance = Number(distances[segIndex + 1]) || segmentStartDistance + segLen;
        const segmentCenterDistance = (segmentStartDistance + segmentEndDistance) * 0.5;
        const slopeRatio = Math.abs(endY - startY) / Math.max(1, segLen);
        const terrainMidY = cachedTerrainHeight(midX, midZ);
        const segmentClearance = deckY - terrainMidY;
        const transitionVisualGap = Math.max(16, Math.min(42, width * 2.6));
        const nearTransitionVisual =
          !isConnectorLike &&
          !isSkywalk &&
          (
            segmentCenterDistance < transitionVisualGap ||
            segmentCenterDistance > Math.max(0, total - transitionVisualGap) ||
            transitionAnchorDistances.some((distance) => Math.abs(segmentCenterDistance - distance) < transitionVisualGap)
          );
        const rampVisualScale =
          isConnectorLike || isSkywalk ?
            1 :
            Math.max(0.24, 1 - Math.max(0, slopeRatio - 0.01) / 0.065);
        const renderMinimalRoadDeckBody =
          !isConnectorLike &&
          !isSkywalk &&
          !suppressExteriorVisuals &&
          !clutteredInterchange &&
          total >= 24 &&
          segmentClearance > 0.95 &&
          (!nearTransitionVisual || segmentClearance > 1.35);
        const renderDeckBody =
          (
            isConnectorLike ||
            isSkywalk ||
            renderMinimalRoadDeckBody
          );
        const renderSideGirders =
          !nearTransitionVisual &&
          (
            isConnectorLike ||
            isSkywalk ||
            renderRoadSideGirders
          );
        const deckBodyThickness =
          isConnectorLike || isSkywalk ?
            deckThickness :
            (
              renderRoadFullDeckBody ?
                Math.max(0.16, Math.min(0.34, width * 0.028)) * (0.82 + rampVisualScale * 0.18) :
                Math.max(0.08, Math.min(0.18, width * 0.014)) * (0.88 + rampVisualScale * 0.12)
            );
        const deckBodyWidth =
          isConnectorLike || isSkywalk ?
            width + 0.5 :
            (
              renderRoadFullDeckBody ?
                width + 0.16 + rampVisualScale * 0.12 :
                width + 0.08 + rampVisualScale * 0.08
            );
        if (renderDeckBody) {
          addDeckBody(
            midX,
            deckY - deckBodyThickness * 0.5 - 0.04,
            midZ,
            deckBodyWidth,
            deckBodyThickness,
            deckDepth,
            rotationY,
            segmentQuat
          );
        }

        const sideOffset = Math.max(0.7, width * 0.34);
        const sideBeamWidth =
          isConnectorLike ?
            0.24 :
            Math.max(0.12, Math.min(0.24, width * 0.022));
        const sideGirderDepth =
          isConnectorLike || isSkywalk ?
            girderDepth :
            Math.max(0.14, Math.min(0.24, girderDepth * 0.34));
        if (renderSideGirders) {
          addBeam(
            girderInstances,
            midX + nx * sideOffset,
            deckY - deckBodyThickness + sideGirderDepth * 0.5,
            midZ + nz * sideOffset,
            sideBeamWidth,
            sideGirderDepth,
            deckDepth,
            rotationY,
            segmentQuat
          );
          addBeam(
            girderInstances,
            midX - nx * sideOffset,
            deckY - deckBodyThickness + sideGirderDepth * 0.5,
            midZ - nz * sideOffset,
            sideBeamWidth,
            sideGirderDepth,
            deckDepth,
            rotationY,
            segmentQuat
          );
          if (!isConnectorLike && width > 9.5 && rampVisualScale >= 0.82) {
            addBeam(
              girderInstances,
              midX,
              deckY - deckBodyThickness + sideGirderDepth * 0.44,
              midZ,
              Math.max(0.26, Math.min(0.52, width * 0.05)),
              Math.max(0.28, sideGirderDepth * 0.82),
              deckDepth,
              rotationY,
              segmentQuat
            );
          }
        }

        if (isSkywalk) {
          const wallHeight = Math.max(1.8, Math.min(2.7, width * 0.22 + 1.2));
          const wallThickness = 0.18;
          const wallOffset = Math.max(0.8, width * 0.48);
          addBeam(
            wallInstances,
            midX + nx * wallOffset,
            deckY + wallHeight * 0.5,
            midZ + nz * wallOffset,
            wallThickness,
            wallHeight,
            deckDepth,
            rotationY,
            segmentQuat
          );
          addBeam(
            wallInstances,
            midX - nx * wallOffset,
            deckY + wallHeight * 0.5,
            midZ - nz * wallOffset,
            wallThickness,
            wallHeight,
            deckDepth,
            rotationY,
            segmentQuat
          );
          addBeam(
            roofInstances,
            midX,
            deckY + wallHeight + 0.12,
            midZ,
            width + 0.36,
            0.16,
            deckDepth,
            rotationY,
            segmentQuat
          );
        }
      }

      const supportSpacing =
        isConnectorLike ?
          Math.max(16, width * 3.6) :
          Math.max(26, width * 3.8 + nearbyElevatedCount * 5);
      const skipNear = Math.max(8, width * 0.9);
      const skipDistance = (distance) => {
        if (distance < skipNear || distance > total - skipNear) return true;
        if (!Array.isArray(feature.structureStations)) return false;
        return feature.structureStations.some((station) =>
          Math.abs(distance - station.distance) < Math.max(width * 1.6, station.span * 0.58)
        );
      };

      if (isConnectorLike || renderRoadSupports) {
        for (let distance = supportSpacing * 0.5; distance < total; distance += supportSpacing) {
          if (skipDistance(distance)) continue;
          const point = pointAlongPolyline(structurePts, distance);
          if (!point) continue;
          const terrainY = cachedTerrainHeight(point.x, point.z);
          const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
          const supportDeckThickness = isConnectorLike ? 0.42 : 0.78;
          const supportHeight = deckY - deckThickness - terrainY;
          if (!(supportHeight > 2.4)) continue;
          const nx = -point.tangentZ;
          const nz = point.tangentX;
          const pierWidth =
            isConnectorLike ?
              Math.max(0.7, width * 0.22) :
              Math.max(1.2, Math.min(2.0, width * 0.14));
          if (isConnectorLike) {
            addSupportInstance({
              x: point.x,
              y: terrainY + supportHeight * 0.5,
              z: point.z,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: pierWidth
            });
          } else {
            const columnOffset = Math.max(1.2, Math.min(width * 0.24, width * 0.34));
            addSupportInstance({
              x: point.x + nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z + nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.08)
            });
            addSupportInstance({
              x: point.x - nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z - nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.08)
            });
            if (renderCapBeams) {
              addBeam(
                capInstances,
                point.x,
                deckY - supportDeckThickness - 0.18,
                point.z,
                width * 0.76,
                0.26,
                Math.max(0.5, pierWidth * 1.1),
                Math.atan2(point.tangentX, point.tangentZ)
              );
            }
          }
        }
      }

      if (!isConnectorLike && renderRoadSupports && renderCapBeams && Array.isArray(feature.structureStations)) {
        const stationSpanFactor = Math.max(8, width * 1.2);
        for (let s = 0; s < feature.structureStations.length; s++) {
          const station = feature.structureStations[s];
          const offsets = [
            station.distance - Math.max(stationSpanFactor, station.span * 0.68),
            station.distance + Math.max(stationSpanFactor, station.span * 0.68)
          ];
          for (let o = 0; o < offsets.length; o++) {
            const stationDistance = offsets[o];
            if (stationDistance <= skipNear || stationDistance >= total - skipNear) continue;
            const point = pointAlongPolyline(structurePts, stationDistance);
            if (!point) continue;
            const terrainY = cachedTerrainHeight(point.x, point.z);
            const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
            const supportHeight = deckY - deckThickness - terrainY;
            if (!(supportHeight > 2.6)) continue;
            const nx = -point.tangentZ;
            const nz = point.tangentX;
            const pierWidth = Math.max(1.2, Math.min(2.5, width * 0.17));
            const columnOffset = Math.max(1.2, Math.min(width * 0.28, width * 0.42));
            addSupportInstance({
              x: point.x + nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z + nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.1)
            });
            addSupportInstance({
              x: point.x - nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z - nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.1)
            });
            addBeam(
              capInstances,
              point.x,
              deckY - deckThickness - 0.2,
              point.z,
              width * 0.86,
              0.36,
              Math.max(0.58, pierWidth * 1.2),
              Math.atan2(point.tangentX, point.tangentZ)
            );
          }
        }
      }

      const addAbutmentAt = (distance) => {
        const point = pointAlongPolyline(structurePts, distance);
        if (!point) return;
        const terrainY = cachedTerrainHeight(point.x, point.z);
        const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const supportHeight = deckY - 0.45 - terrainY;
        if (!(supportHeight > 1.4)) return;
        const nx = -point.tangentZ;
        const nz = point.tangentX;
        const widthScale = Math.max(1.2, Number(feature.width) || 4);
        addSupportInstance({
          x: point.x + nx * 0.2,
          y: terrainY + supportHeight * 0.5,
          z: point.z + nz * 0.2,
          scaleX: Math.max(1.8, widthScale * 0.92),
          scaleY: supportHeight,
          scaleZ: Math.max(2.1, widthScale * 0.44)
        });
        if (!isConnectorLike && renderCapBeams) {
          addBeam(
            capInstances,
            point.x,
            deckY - deckThickness - 0.18,
            point.z,
            Math.max(2.6, widthScale * 0.92),
            0.32,
            Math.max(1.2, widthScale * 0.38),
            Math.atan2(point.tangentX, point.tangentZ)
          );
        }
      };
      if (isConnectorLike || renderRoadAbutments) {
        addAbutmentAt(Math.min(6, total * 0.12));
        addAbutmentAt(Math.max(0, total - Math.min(6, total * 0.12)));
      }
    } else if (semantics.terrainMode === 'subgrade') {
      const width = Math.max(3.4, Number(feature.width) || 6);
      const openingHalfWidth = width * 0.5 + 0.9;
      const beamThickness = 0.6;
      const portalInset = Math.min(4, Math.max(2, total * 0.08));
      const portalDistances = [portalInset, Math.max(0, total - portalInset)];
      for (let p = 0; p < portalDistances.length; p++) {
        const point = pointAlongPolyline(feature.pts, portalDistances[p]);
        if (!point) continue;
        const terrainY = cachedTerrainHeight(point.x, point.z);
        const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const openingHeight = terrainY - roadY - 0.15;
        if (!(openingHeight > 2.6)) continue;
        const nx = -point.tangentZ;
        const nz = point.tangentX;
        const pillarWidth = Math.max(0.75, width * 0.16);
        const pillarHeight = openingHeight;
        const sideOffset = openingHalfWidth + pillarWidth * 0.5;
        addPortalBeam(
          point.x + nx * sideOffset,
          roadY + pillarHeight * 0.5,
          point.z + nz * sideOffset,
          pillarWidth,
          pillarHeight,
          Math.max(0.8, width * 0.26),
          Math.atan2(point.tangentX, point.tangentZ)
        );
        addPortalBeam(
          point.x - nx * sideOffset,
          roadY + pillarHeight * 0.5,
          point.z - nz * sideOffset,
          pillarWidth,
          pillarHeight,
          Math.max(0.8, width * 0.26),
          Math.atan2(point.tangentX, point.tangentZ)
        );
        addPortalBeam(
          point.x,
          roadY + openingHeight + beamThickness * 0.5,
          point.z,
          width + pillarWidth * 2.2,
          beamThickness,
          Math.max(0.9, width * 0.34),
          Math.atan2(point.tangentX, point.tangentZ)
        );
        addBeam(
          portalInstances,
          point.x + nx * (openingHalfWidth + pillarWidth * 0.88),
          roadY + openingHeight * 0.48,
          point.z + nz * (openingHalfWidth + pillarWidth * 0.88),
          pillarWidth * 0.68,
          openingHeight * 0.84,
          Math.max(2.4, width * 0.66),
          Math.atan2(point.tangentX, point.tangentZ)
        );
        addBeam(
          portalInstances,
          point.x - nx * (openingHalfWidth + pillarWidth * 0.88),
          roadY + openingHeight * 0.48,
          point.z - nz * (openingHalfWidth + pillarWidth * 0.88),
          pillarWidth * 0.68,
          openingHeight * 0.84,
          Math.max(2.4, width * 0.66),
          Math.atan2(point.tangentX, point.tangentZ)
        );
      }
    }
  }

  return {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances
  };
}

function clearStructureVisualMeshes() {
  if (!Array.isArray(appCtx.structureVisualMeshes)) appCtx.structureVisualMeshes = [];
  appCtx.structureVisualMeshes.forEach((mesh) => {
    if (!mesh) return;
    if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
    if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
    if (mesh.material && typeof mesh.material.dispose === 'function') mesh.material.dispose();
  });
  appCtx.structureVisualMeshes = [];
}

function buildStructureVisualMesh(instances, material, userData = {}) {
  if (!Array.isArray(instances) || instances.length === 0 || typeof THREE === 'undefined') return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    position.set(instance.x, instance.y, instance.z);
    if (instance?.quaternion && Number.isFinite(instance.quaternion.x) && Number.isFinite(instance.quaternion.y) && Number.isFinite(instance.quaternion.z) && Number.isFinite(instance.quaternion.w)) {
      quaternion.set(instance.quaternion.x, instance.quaternion.y, instance.quaternion.z, instance.quaternion.w);
    } else {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(instance.rotationY) || 0);
    }
    scale.set(instance.scaleX, instance.scaleY, instance.scaleZ);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, userData, { isStructureVisual: true });
  appCtx.scene.add(mesh);
  appCtx.structureVisualMeshes.push(mesh);
  return mesh;
}

function rebuildStructureVisualMeshes() {
  clearStructureVisualMeshes();
  if (appCtx.onMoon || !appCtx.scene) return;
  const {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances
  } = collectStructureVisualInstances();
  if (deckInstances.length > 0) {
    buildStructureVisualMesh(
      deckInstances,
      new THREE.MeshStandardMaterial({
        color: 0x56606b,
        roughness: 0.92,
        metalness: 0.03
      }),
      { structureVisualType: 'decks' }
    );
  }
  if (girderInstances.length > 0) {
    buildStructureVisualMesh(
      girderInstances,
      new THREE.MeshStandardMaterial({
        color: 0x404954,
        roughness: 0.88,
        metalness: 0.08
      }),
      { structureVisualType: 'girders' }
    );
  }
  if (capInstances.length > 0) {
    buildStructureVisualMesh(
      capInstances,
      new THREE.MeshStandardMaterial({
        color: 0x646c76,
        roughness: 0.92,
        metalness: 0.03
      }),
      { structureVisualType: 'caps' }
    );
  }
  if (supportInstances.length > 0) {
    buildStructureVisualMesh(
      supportInstances,
      new THREE.MeshStandardMaterial({
        color: 0x717983,
        roughness: 0.95,
        metalness: 0.02
      }),
      { structureVisualType: 'supports' }
    );
  }
  if (wallInstances.length > 0) {
    buildStructureVisualMesh(
      wallInstances,
      new THREE.MeshStandardMaterial({
        color: 0x66727d,
        roughness: 0.88,
        metalness: 0.08
      }),
      { structureVisualType: 'walls' }
    );
  }
  if (roofInstances.length > 0) {
    buildStructureVisualMesh(
      roofInstances,
      new THREE.MeshStandardMaterial({
        color: 0x4c5660,
        roughness: 0.84,
        metalness: 0.12
      }),
      { structureVisualType: 'roofs' }
    );
  }
  if (portalInstances.length > 0) {
    buildStructureVisualMesh(
      portalInstances,
      new THREE.MeshStandardMaterial({
        color: 0x585e64,
        roughness: 0.96,
        metalness: 0.02
      }),
      { structureVisualType: 'portals' }
    );
  }
}

function cachedTerrainHeight(x, z) {
  if (!terrainHeightCacheEnabled) return terrainMeshHeightAt(x, z);

  // Round to 0.1 precision for caching (10cm grid)
  const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (terrainHeightCache.has(key)) return terrainHeightCache.get(key);

  const h = terrainMeshHeightAt(x, z);
  terrainHeightCache.set(key, h);
  return h;
}

function clearTerrainHeightCache() {
  terrainHeightCache.clear();
  baseTerrainHeightCache.clear();
}

function cloneTerrainTextureWithRepeat(sourceTexture, repeats) {
  if (!sourceTexture) return null;
  const texture = sourceTexture.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.needsUpdate = true;
  return texture;
}

const proceduralTerrainTextureBases = {
  snow: null,
  snowRock: null,
  sand: null,
  urban: null,
  soil: null,
  rock: null
};

function hashNoise2D(x, y, seed = 1) {
  const v = Math.sin((x * 127.1 + y * 311.7 + seed * 101.3) * 0.017453292519943295) * 43758.5453123;
  return v - Math.floor(v);
}

function makeProceduralTerrainTextureSet(mode = 'snow', size = 128) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  if (!colorCtx) return null;
  const colorImage = colorCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');
  if (!normalCtx) return null;
  const normalImage = normalCtx.createImageData(size, size);

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessCtx = roughnessCanvas.getContext('2d');
  if (!roughnessCtx) return null;
  const roughnessImage = roughnessCtx.createImageData(size, size);

  const isAlpine = mode === 'snowRock';
  const isSand = mode === 'sand';
  const isUrban = mode === 'urban';
  const isSoil = mode === 'soil';
  const isRock = mode === 'rock';
  const colorSeed = isAlpine ? 9 : 5;
  const normalSeed = isAlpine ? 12 : 7;
  const roughSeed = isAlpine ? 15 : 11;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const macro = hashNoise2D(x * 0.06, y * 0.06, colorSeed);
      const micro = hashNoise2D(x * 0.26, y * 0.26, colorSeed + 3);
      let r = 0;
      let g = 0;
      let b = 0;
      if (isSand) {
        const duneWave = Math.sin((x * 0.14 + y * 0.045) + macro * 5.2);
        const duneRipple = Math.sin((x * 0.34 - y * 0.08) + micro * 4.6);
        const duneBlend = Math.max(0, duneWave * 0.65 + duneRipple * 0.35);
        const baseTone = 196 + macro * 22 + micro * 10;
        const warmTone = 22 + duneBlend * 24;
        r = baseTone + warmTone;
        g = baseTone * 0.91 + duneBlend * 11;
        b = baseTone * 0.72 + duneBlend * 6;
      } else if (isUrban) {
        const slab = Math.sin((x * 0.11) + macro * 3.2) * 0.5 + Math.cos((y * 0.12) + micro * 2.9) * 0.5;
        const grime = hashNoise2D(x * 0.24, y * 0.24, colorSeed + 6);
        const baseTone = 118 + macro * 20 + micro * 10;
        const seam = slab > 0.92 || slab < -0.92 ? -28 : 0;
        r = baseTone + seam - grime * 9;
        g = baseTone + 4 + seam - grime * 8;
        b = baseTone + 10 + seam - grime * 7;
      } else if (isSoil) {
        const furrow = Math.sin((x * 0.19 - y * 0.05) + macro * 4.4);
        const clump = hashNoise2D(x * 0.31, y * 0.31, colorSeed + 8);
        const baseTone = 118 + macro * 26 + micro * 12;
        r = baseTone + 20 + furrow * 9;
        g = baseTone * 0.74 + clump * 12;
        b = baseTone * 0.48 + furrow * 6;
      } else if (isRock) {
        const fracture = Math.sin((x * 0.16 + y * 0.08) + macro * 5.1);
        const grain = hashNoise2D(x * 0.34, y * 0.34, colorSeed + 10);
        const baseTone = 122 + macro * 30 + micro * 18;
        r = baseTone + fracture * 8;
        g = baseTone + 4 + fracture * 6;
        b = baseTone + 10 + grain * 10;
      } else {
        const rockMaskRaw = isAlpine ? Math.max(0, macro * 1.25 - 0.55) : 0;
        const rockMask = isAlpine ? Math.min(1, Math.max(0, rockMaskRaw * 1.8 + micro * 0.22)) : 0;
        const snowTone = 232 + macro * 18 + micro * 10;
        const rockTone = 122 + macro * 34 + micro * 26;
        const tintBlue = isAlpine ? 2 : 6;

        r = snowTone * (1 - rockMask) + rockTone * rockMask;
        g = (snowTone + 3) * (1 - rockMask) + (rockTone + 7) * rockMask;
        b = (snowTone + tintBlue) * (1 - rockMask) + (rockTone + 14) * rockMask;
      }

      colorImage.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[idx + 3] = 255;

      const nx = isSand ?
        Math.sin((x * 0.22 + y * 0.035) + macro * 4.1) * 46 + (hashNoise2D(x * 0.19, y * 0.19, normalSeed) - 0.5) * 10 :
        isUrban ?
          (hashNoise2D(x * 0.14, y * 0.14, normalSeed) - 0.5) * 12 :
          isSoil ?
            (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * 28 :
            isRock ?
              (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * 52 :
              (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * (isAlpine ? 54 : 34);
      const ny = isSand ?
        Math.cos((x * 0.12 - y * 0.09) + micro * 3.8) * 28 + (hashNoise2D(x * 0.19 + 41, y * 0.19 - 29, normalSeed + 2) - 0.5) * 8 :
        isUrban ?
          (hashNoise2D(x * 0.14 + 41, y * 0.14 - 29, normalSeed + 2) - 0.5) * 12 :
          isSoil ?
            (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * 28 :
            isRock ?
              (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * 52 :
              (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * (isAlpine ? 54 : 34);
      normalImage.data[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
      normalImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
      normalImage.data[idx + 2] = 255;
      normalImage.data[idx + 3] = 255;

      const roughBase = isSand ? 204 : isAlpine ? 168 : isUrban ? 148 : isSoil ? 196 : isRock ? 176 : 224;
      const roughVar = hashNoise2D(x * 0.18, y * 0.18, roughSeed) * (isSand ? 38 : isAlpine ? 64 : isUrban ? 26 : isSoil ? 34 : isRock ? 52 : 28);
      const roughMask = isSand ? 12 : isAlpine ? Math.max(0, macro * 18) : isUrban ? Math.max(0, micro * 12) : isRock ? Math.max(0, macro * 22) : 0;
      const rough = Math.max(0, Math.min(255, Math.round(roughBase + roughVar + roughMask)));
      roughnessImage.data[idx] = rough;
      roughnessImage.data[idx + 1] = rough;
      roughnessImage.data[idx + 2] = rough;
      roughnessImage.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);

  const makeTexture = (canvas, isColor = false) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (isColor) {
      if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
        texture.encoding = THREE.sRGBEncoding;
      }
    }
    texture.needsUpdate = true;
    return texture;
  };

  return {
    map: makeTexture(colorCanvas, true),
    normalMap: makeTexture(normalCanvas, false),
    roughnessMap: makeTexture(roughnessCanvas, false)
  };
}

function getProceduralTerrainTextureBase(mode = 'snow') {
  const key =
    mode === 'snowRock' ? 'snowRock' :
    mode === 'sand' ? 'sand' :
    mode === 'urban' ? 'urban' :
    mode === 'soil' ? 'soil' :
    mode === 'rock' ? 'rock' :
    'snow';
  if (!proceduralTerrainTextureBases[key]) {
    proceduralTerrainTextureBases[key] = makeProceduralTerrainTextureSet(key, 128);
  }
  return proceduralTerrainTextureBases[key];
}

function ensureTerrainTextureSet(mesh, repeats, mode = 'grass') {
  if (!mesh || !mesh.userData) return null;
  if (!mesh.userData.terrainTextureSetsByMode) mesh.userData.terrainTextureSetsByMode = {};
  const modeKey =
    mode === 'snowRock' ? 'snowRock' :
    mode === 'snow' ? 'snow' :
    mode === 'sand' ? 'sand' :
    mode === 'urban' ? 'urban' :
    mode === 'soil' ? 'soil' :
    mode === 'rock' ? 'rock' :
    'grass';
  const textureCacheKey = `${modeKey}:${Number(repeats) || 12}`;
  if (mesh.userData.terrainTextureSetsByMode[textureCacheKey]) {
    mesh.userData.terrainTextureSet = mesh.userData.terrainTextureSetsByMode[textureCacheKey];
    return mesh.userData.terrainTextureSet;
  }

  let source = null;
  if (modeKey === 'grass') {
    source = {
      map: appCtx.grassDiffuse,
      normalMap: appCtx.grassNormal,
      roughnessMap: appCtx.grassRoughness
    };
  } else if (modeKey === 'urban') {
    source =
      (appCtx.pavementDiffuse ? {
        map: appCtx.pavementDiffuse,
        normalMap: appCtx.pavementNormal,
        roughnessMap: appCtx.pavementRoughness
      } : null) ||
      (appCtx.concreteDiffuse ? {
        map: appCtx.concreteDiffuse,
        normalMap: appCtx.concreteNormal,
        roughnessMap: appCtx.concreteRoughness
      } : null) ||
      getProceduralTerrainTextureBase(modeKey);
  } else {
    source = getProceduralTerrainTextureBase(modeKey);
  }
  if (!source) return null;

  const textureSet = {
    map: cloneTerrainTextureWithRepeat(source.map, repeats),
    normalMap: cloneTerrainTextureWithRepeat(source.normalMap, repeats),
    roughnessMap: cloneTerrainTextureWithRepeat(source.roughnessMap, repeats)
  };
  mesh.userData.terrainTextureSetsByMode[textureCacheKey] = textureSet;
  mesh.userData.terrainTextureSet = textureSet;
  return textureSet;
}

let cachedGroundFallbackMesh = null;

function getGroundFallbackMesh() {
  if (cachedGroundFallbackMesh && cachedGroundFallbackMesh.parent) return cachedGroundFallbackMesh;
  cachedGroundFallbackMesh = null;
  if (!appCtx.scene) return null;
  for (let i = 0; i < appCtx.scene.children.length; i++) {
    const child = appCtx.scene.children[i];
    if (child?.userData?.isGroundPlane) {
      cachedGroundFallbackMesh = child;
      break;
    }
  }
  return cachedGroundFallbackMesh;
}

function applyGroundFallbackProfile(profile = null) {
  const ground = getGroundFallbackMesh();
  const material = ground?.material;
  if (!ground || !material || Array.isArray(material)) return;
  const mode = ['snow', 'snowRock', 'sand', 'urban', 'soil', 'rock'].includes(profile?.mode) ? profile.mode : 'grass';
  const colorHex = mode === 'snow' ?
    GROUND_FALLBACK_SNOW_HEX :
    mode === 'snowRock' ?
      GROUND_FALLBACK_ALPINE_HEX :
      mode === 'sand' ?
        GROUND_FALLBACK_SAND_HEX :
        mode === 'urban' ?
          GROUND_FALLBACK_URBAN_HEX :
          mode === 'soil' ?
            GROUND_FALLBACK_SOIL_HEX :
            mode === 'rock' ?
              GROUND_FALLBACK_ROCK_HEX :
      GROUND_FALLBACK_GRASS_HEX;
  material.color.setHex(colorHex);
  material.roughness =
    mode === 'grass' ? 0.95 :
    mode === 'sand' ? 0.92 :
    mode === 'urban' ? 0.84 :
    mode === 'soil' ? 0.9 :
    mode === 'rock' ? 0.87 :
    0.86;
  material.metalness = mode === 'urban' ? 0.03 : mode === 'grass' || mode === 'soil' || mode === 'sand' ? 0 : 0.02;
  material.needsUpdate = true;
}

function computeElevationStatsMeters(samplesMeters) {
  if (!Array.isArray(samplesMeters) || samplesMeters.length === 0) {
    return { min: 0, max: 0, p75: 0, p90: 0 };
  }
  const sorted = samplesMeters.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { min: 0, max: 0, p75: 0, p90: 0 };
  const pick = (p) => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
  };
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p75: pick(0.75),
    p90: pick(0.9)
  };
}

function classifyTerrainVisualProfile(bounds, minElevationMeters = null, maxElevationMeters = null, elevationStats = null) {
  return classifySharedTerrainSurfaceProfile({
    bounds,
    minElevationMeters,
    maxElevationMeters,
    elevationStats,
    worldSurfaceProfile: appCtx.worldSurfaceProfile || null
  });
}

function applyTerrainVisualProfile(mesh, profile, repeats = null) {
  if (!mesh || !mesh.material || Array.isArray(mesh.material)) return;
  if (!mesh.userData) mesh.userData = {};
  const mat = mesh.material;
  const tileBounds = mesh.userData.terrainTile?.bounds || null;
  const nextProfile = profile || classifyTerrainVisualProfile(tileBounds);
  const nextMode =
    nextProfile.mode === 'snowRock' ? 'snowRock' :
    nextProfile.mode === 'snow' ? 'snow' :
    nextProfile.mode === 'sand' ? 'sand' :
    nextProfile.mode === 'urban' ? 'urban' :
    nextProfile.mode === 'soil' ? 'soil' :
    nextProfile.mode === 'rock' ? 'rock' :
    'grass';
  const textureRepeats = Number.isFinite(repeats) && repeats > 0 ?
  repeats :
  Number(mesh.userData.terrainTextureRepeats) || 12;
  mesh.userData.terrainTextureRepeats = textureRepeats;

  if (nextMode === 'snow' || nextMode === 'snowRock') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, nextMode);
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(nextMode === 'snow' ? SNOW_COLOR_HEX : ALPINE_SNOW_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = nextMode === 'snow' ? 0.94 : 0.86;
    mat.metalness = 0.01;
    mat.normalScale = nextMode === 'snow' ? new THREE.Vector2(0.2, 0.2) : new THREE.Vector2(0.45, 0.45);
  } else if (nextMode === 'sand') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.3, 'sand');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : SAND_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.92;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.78, 0.42);
  } else if (nextMode === 'urban') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.1, 'urban');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : URBAN_GROUND_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.84;
    mat.metalness = 0.03;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.28, 0.28);
  } else if (nextMode === 'soil') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.05, 'soil');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : SOIL_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.48, 0.48);
  } else if (nextMode === 'rock') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 0.95, 'rock');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : ROCK_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.87;
    mat.metalness = 0.02;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.56, 0.56);
  } else {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, 'grass');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : GRASS_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.95;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }

  mesh.userData.terrainVisualProfile = nextProfile;
  applyGroundFallbackProfile(nextProfile);
  mat.needsUpdate = true;
}

function refreshTerrainSurfaceProfiles(profile = null) {
  const nextProfile = profile || appCtx.worldSurfaceProfile || null;
  if (appCtx.terrainGroup?.children?.length) {
    appCtx.terrainGroup.children.forEach((mesh) => {
      if (!mesh?.userData?.isTerrainMesh) return;
      const bounds = mesh.userData?.terrainTile?.bounds || null;
      const minMeters = Number(mesh.userData?.minElevationMeters);
      const maxMeters = Number(mesh.userData?.maxElevationMeters);
      const elevationStats = mesh.userData?.elevationStatsMeters || null;
      applyTerrainVisualProfile(
        mesh,
        classifyTerrainVisualProfile(
          bounds,
          Number.isFinite(minMeters) ? minMeters : null,
          Number.isFinite(maxMeters) ? maxMeters : null,
          elevationStats
        )
      );
    });
    return;
  }
  applyGroundFallbackProfile(nextProfile);
}

function setWorldSurfaceProfile(profile = null) {
  appCtx.worldSurfaceProfile = profile || null;
  refreshTerrainSurfaceProfiles(profile || null);
}

// =====================
// CURVATURE-AWARE ROAD RESAMPLING
// Subdivides road polylines with adaptive density based on curvature
// =====================

// Calculate curvature at point i using neighboring points
function calculateCurvature(pts, i) {
  if (i === 0 || i >= pts.length - 1) return 0;

  const p0 = pts[i - 1];
  const p1 = pts[i];
  const p2 = pts[i + 1];

  // Vector from p0 to p1
  const dx1 = p1.x - p0.x;
  const dz1 = p1.z - p0.z;
  const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;

  // Vector from p1 to p2
  const dx2 = p2.x - p1.x;
  const dz2 = p2.z - p1.z;
  const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;

  // Normalize
  const nx1 = dx1 / len1,nz1 = dz1 / len1;
  const nx2 = dx2 / len2,nz2 = dz2 / len2;

  // Dot product gives cos(angle)
  const dot = nx1 * nx2 + nz1 * nz2;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Curvature = angle / average segment length
  const avgLen = (len1 + len2) / 2;
  return angle / (avgLen || 1);
}

// Subdivide road points with curvature-aware adaptive sampling
// Straight segments: 2-5 meters, Curves: 0.5-2 meters
function subdivideRoadPoints(pts, maxDist) {
  if (pts.length < 2) return pts;

  const result = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Calculate curvature at prev and cur points
    const curvPrev = calculateCurvature(pts, i - 1);
    const curvCur = calculateCurvature(pts, i);
    const avgCurv = (curvPrev + curvCur) / 2;

    // Adaptive spacing based on curvature
    // Low curvature (< 0.1): use maxDist (2-5m)
    // High curvature (> 0.5): use minDist (0.5-2m)
    const minDist = maxDist * 0.2; // 0.5-1m for tight curves
    const curvFactor = Math.max(0, Math.min(1, avgCurv / 0.5));
    const adaptiveDist = maxDist * (1 - curvFactor * 0.8) || maxDist;

    if (dist > adaptiveDist) {
      const steps = Math.ceil(dist / adaptiveDist);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({ x: prev.x + dx * t, z: prev.z + dz * t });
      }
    }
    result.push(cur);
  }

  return result;
}

function latLonToTileXY(lat, lon, z) {
  const n = Math.pow(2, z);
  const xt = (lon + 180) / 360 * n;
  const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x: Math.floor(xt), y: Math.floor(yt), xf: xt, yf: yt };
}

function tileXYToLatLonBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lonW = x / n * 360 - 180;
  const lonE = (x + 1) / n * 360 - 180;

  const latN = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / n))));
  const latS = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + 1) / n))));

  return { latN, latS, lonW, lonE };
}

// Terrarium encoding: height_m = (R*256 + G + B/256) - 32768
function decodeTerrariumRGB(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

function getOrLoadTerrainTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (appCtx.terrainTileCache.has(key)) return appCtx.terrainTileCache.get(key);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = appCtx.TERRAIN_TILE_URL(z, x, y);

  const tile = { img, loaded: false, failed: false, elev: null, w: 256, h: 256 };
  appCtx.terrainTileCache.set(key, tile);

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 256, 256);

      // Store elevation as Float32Array (meters)
      const elev = new Float32Array(256 * 256);
      for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
        elev[i] = decodeTerrariumRGB(data[p], data[p + 1], data[p + 2]);
      }

      tile.loaded = true;
      tile.failed = false;
      tile.elev = elev;

      // IMPORTANT: After tile loads, reapply heights to any terrain meshes using this tile
      if (appCtx.terrainGroup) {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const tileInfo = mesh.userData?.terrainTile;
          if (tileInfo && tileInfo.z === z && tileInfo.tx === x && tileInfo.ty === y) {
            // Tile loaded - reapply heights
            applyHeightsToTerrainMesh(mesh);
          }
        });
      }

      // Immediately schedule road + building rebuild when terrain data arrives
      // Batch rebuild work to avoid repeated expensive bursts during tile streaming.
      scheduleRoadAndBuildingRebuild();
    } catch (e) {
      console.warn('Terrain tile decode failed:', z, x, y, e);
      tile.loaded = false;
      tile.failed = true;
      tile.elev = null;
    }
  };

  img.onerror = () => {
    tile.loaded = false;
    tile.failed = true;
    tile.elev = null;
  };

  return tile;
}

// Sample elevation (meters) from a loaded tile using bilinear interpolation
function sampleTileElevationMeters(tile, u, v) {
  if (!tile || !tile.loaded || !tile.elev) return 0;

  const w = 256,h = 256;
  const x = Math.max(0, Math.min(w - 1, u * (w - 1)));
  const y = Math.max(0, Math.min(h - 1, v * (h - 1)));

  const x0 = Math.floor(x),y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1),y1 = Math.min(h - 1, y0 + 1);

  const sx = x - x0,sy = y - y0;

  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;

  const e00 = tile.elev[i00],e10 = tile.elev[i10],e01 = tile.elev[i01],e11 = tile.elev[i11];

  const ex0 = e00 + (e10 - e00) * sx;
  const ex1 = e01 + (e11 - e01) * sx;
  return clampElevationMeters(ex0 + (ex1 - ex0) * sy);
}

function worldToLatLon(x, z) {
  const lat = appCtx.LOC.lat - z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  return { lat, lon };
}

function elevationMetersAtLatLon(lat, lon) {
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
  if (!tile.loaded) return 0;

  const u = t.xf - t.x;
  const v = t.yf - t.y;
  return sampleTileElevationMeters(tile, u, v);
}

function elevationWorldYAtWorldXZ(x, z) {
  const { lat, lon } = worldToLatLon(x, z);
  const meters = elevationMetersAtLatLon(lat, lon);
  return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
}

function ensureTerrainGroup() {
  if (!appCtx.terrainGroup) {
    appCtx.terrainGroup = new THREE.Group();
    appCtx.terrainGroup.name = 'TerrainGroup';
    appCtx.scene.add(appCtx.terrainGroup);
  }
}

function clearTerrainMeshes() {
  if (!appCtx.terrainGroup) return;
  while (appCtx.terrainGroup.children.length) {
    const m = appCtx.terrainGroup.children.pop();
    const texSet = m?.userData?.terrainTextureSet;
    if (texSet && typeof texSet === 'object') {
      Object.values(texSet).forEach((tex) => {
        if (tex && typeof tex.dispose === 'function') tex.dispose();
      });
    }
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
}

function buildTerrainTileMesh(z, tx, ty) {
  const bounds = tileXYToLatLonBounds(tx, ty, z);
  const pNW = appCtx.geoToWorld(bounds.latN, bounds.lonW);
  const pNE = appCtx.geoToWorld(bounds.latN, bounds.lonE);
  const pSW = appCtx.geoToWorld(bounds.latS, bounds.lonW);
  const pCenter = appCtx.geoToWorld((bounds.latN + bounds.latS) * 0.5, (bounds.lonW + bounds.lonE) * 0.5);

  const width = Math.hypot(pNE.x - pNW.x, pNE.z - pNW.z);
  const depth = Math.hypot(pSW.x - pNW.x, pSW.z - pNW.z);

  const cx = pCenter.x;
  const cz = pCenter.z;

  const geo = new THREE.PlaneGeometry(width, depth, appCtx.TERRAIN_SEGMENTS, appCtx.TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  // Tile grass every ~25 world units (~28 meters) for visible detail from car/walking
  const repeats = Math.max(10, Math.round(width / 25));

  const mat = new THREE.MeshStandardMaterial({
    color: typeof appCtx.grassDiffuse !== 'undefined' && appCtx.grassDiffuse ? 0xffffff : GRASS_COLOR_HEX,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    wireframe: false
  });

  // Mark material for update
  mat.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.castShadow = false; // Terrain doesn't cast shadows (performance)
  mesh.frustumCulled = false; // Don't cull terrain - always render it
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };
  mesh.userData.isTerrainMesh = true; // Mark as terrain for debug mode
  mesh.userData.terrainTextureRepeats = repeats;

  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds), repeats);

  applyHeightsToTerrainMesh(mesh);

  return mesh;
}

function applyFlatFallbackToTerrainMesh(mesh) {
  if (!mesh || !mesh.geometry || !mesh.geometry.attributes?.position) return;
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.position.y = 0;
  mesh.visible = true;
  const bounds = mesh.userData?.terrainTile?.bounds || null;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds));
}

function applyHeightsToTerrainMesh(mesh) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;
  const tile = getOrLoadTerrainTile(z, tx, ty);
  if (!tile.loaded) {
    mesh.userData.pendingTerrainTile = true;
    // Mobile networks can fail/lag elevation tile fetches; keep terrain visible
    // with a flat fallback mesh until decoded heights arrive.
    applyFlatFallbackToTerrainMesh(mesh);
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;

  // First pass: sample elevations and find range
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  const elevations = [];
  const elevationMetersSamples = [];

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    const { lat, lon } = worldToLatLon(wx, wz);
    const u = (lon - bounds.lonW) / lonRange;
    const v = (bounds.latN - lat) / latRange;
    const meters = clampElevationMeters(sampleTileElevationMeters(tile, u, v));
    elevationMetersSamples.push(meters);
    const baseY = meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    const y = applyStructureTerrainCuts(wx, wz, baseY);
    elevations.push(y);
    minElevation = Math.min(minElevation, y);
    maxElevation = Math.max(maxElevation, y);
  }

  // Position mesh base well below all vertices
  mesh.position.y = minElevation - 10;

  // Second pass: set vertex Y relative to mesh base
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, elevations[i] - mesh.position.y);
  }

  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.userData.pendingTerrainTile = false;
  mesh.visible = true;

  const unitsPerMeter = (appCtx.WORLD_UNITS_PER_METER || 1) * (appCtx.TERRAIN_Y_EXAGGERATION || 1);
  const minMeters = Number.isFinite(minElevation) && unitsPerMeter > 0 ? minElevation / unitsPerMeter : 0;
  const maxMeters = Number.isFinite(maxElevation) && unitsPerMeter > 0 ? maxElevation / unitsPerMeter : 0;

  // Store elevation range for debugging / style classification
  mesh.userData.minElevation = minElevation;
  mesh.userData.maxElevation = maxElevation;
  mesh.userData.minElevationMeters = minMeters;
  mesh.userData.maxElevationMeters = maxMeters;
  const elevationStats = computeElevationStatsMeters(elevationMetersSamples);
  mesh.userData.elevationStatsMeters = elevationStats;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds, minMeters, maxMeters, elevationStats));
}

function resetTerrainStreamingState() {
  lastTerrainCenterKey = null;
  lastDynamicTerrainRing = appCtx.TERRAIN_RING;
  terrain._lastUpdatePos.x = 0;
  terrain._lastUpdatePos.z = 0;
  terrain._cachedIntersections = null;
  terrain._lastRoadCount = 0;
  clearTerrainHeightCache();
}

// =====================
// INTERSECTION DETECTION
// Detect road intersections by finding shared endpoint nodes
// =====================

function detectRoadIntersections(roads) {
  const intersections = new Map(); // key: "x,z" -> array of road indices

  roads.forEach((road, roadIdx) => {
    if (!road.pts || road.pts.length < 2) return;

    // Check first and last points (endpoints)
    [0, road.pts.length - 1].forEach((idx) => {
      const pt = road.pts[idx];
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`; // 0.1 precision

      if (!intersections.has(key)) {
        intersections.set(key, { x: pt.x, z: pt.z, roads: [] });
      }
      let dirX = 0;
      let dirZ = 0;
      if (idx === 0) {
        dirX = road.pts[1].x - road.pts[0].x;
        dirZ = road.pts[1].z - road.pts[0].z;
      } else {
        const last = road.pts.length - 1;
        dirX = road.pts[last - 1].x - road.pts[last].x;
        dirZ = road.pts[last - 1].z - road.pts[last].z;
      }
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      intersections.get(key).roads.push({
        roadIdx,
        ptIdx: idx,
        width: road.width || 8,
        dir: { x: dirX / dirLen, z: dirZ / dirLen }
      });
    });
  });

  // Filter to only actual intersections (2+ roads meeting)
  const result = [];
  intersections.forEach((data, key) => {
    if (data.roads.length >= 2) {
      // Calculate max width for intersection cap sizing
      const maxWidth = Math.max(...data.roads.map((r) => r.width));
      result.push({ x: data.x, z: data.z, roads: data.roads, maxWidth });
    }
  });

  return result;
}

function shouldBuildIntersectionCap(intersection) {
  if (!intersection || !Array.isArray(intersection.roads)) return false;
  // Caps are now only used for dense 4+ way intersections; lower branch joints
  // stay clean and rely on strip overlap to avoid circular bulges.
  if (intersection.roads.length < 4) return false;
  return true;
}

function computeIntersectionCapRadius(intersection) {
  const maxWidth = Number(intersection?.maxWidth || 8);
  const roads = Array.isArray(intersection?.roads) ? intersection.roads : [];
  const branchCount = Math.max(2, roads.length);
  const avgWidth = roads.length > 0 ?
  roads.reduce((sum, r) => sum + Number(r?.width || maxWidth), 0) / roads.length :
  maxWidth;

  const halfWidth = Math.max(avgWidth * 0.46, maxWidth * 0.44);
  const branchBoost = Math.min(0.08, Math.max(0, (branchCount - 4) * 0.04));
  const unclamped = halfWidth * (1 + branchBoost);
  const minRadius = maxWidth * 0.40;
  const maxRadius = maxWidth * 0.52;
  return Math.max(minRadius, Math.min(maxRadius, unclamped));
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
    const count = verts.length / 3;
    for (let i = 0; i < count; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

// Build road skirts (vertical curtains) to hide terrain peeking
function buildRoadSkirts(leftEdge, rightEdge, skirtDepth = 1.5) {
  const verts = [];
  const indices = [];

  // Left skirt (curtain hanging down from left edge)
  for (let i = 0; i < leftEdge.length; i++) {
    const top = leftEdge[i];
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < leftEdge.length - 1) {
      const vi = i * 2;
      // Two triangles forming a quad
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  const leftSkirtStartIdx = indices.length;

  // Right skirt (curtain hanging down from right edge)
  for (let i = 0; i < rightEdge.length; i++) {
    const top = rightEdge[i];
    const baseIdx = leftEdge.length * 2 + i * 2;
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < rightEdge.length - 1) {
      const vi = baseIdx;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  return { verts, indices };
}

// Build intersection cap patch (circular/square mesh covering intersection)
function buildIntersectionCap(x, z, radius, segments = 16) {
  const verts = [];
  const indices = [];

  // Center vertex
  const centerY = cachedTerrainHeight(x, z) + 0.35; // Slightly above roads
  verts.push(x, centerY, z);

  // Ring vertices
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const pz = z + Math.sin(angle) * radius;
    const py = cachedTerrainHeight(px, pz) + 0.35;
    verts.push(px, py, pz);
  }

  // Triangles from center to ring
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 1, i + 2);
  }

  return { verts, indices };
}

let lastTerrainCenterKey = null;
let lastDynamicTerrainRing = appCtx.TERRAIN_RING;

function getStreamingSpeedMph() {
  if (appCtx.droneMode && appCtx.drone) return Math.max(0, Math.abs((appCtx.drone.speed || 0) * 1.8));
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk') {
    return Math.max(0, Math.abs(appCtx.Walk.state.walker?.speedMph || 0));
  }
  return Math.max(0, Math.abs((appCtx.car?.speed || 0) * 0.5));
}

function getDynamicTerrainRing() {
  const baseRing = Math.max(1, appCtx.TERRAIN_RING);
  const mode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode || 'rdt';
  if (mode === 'baseline') return baseRing;

  const mph = getStreamingSpeedMph();
  if (mph >= 120) return Math.max(1, baseRing - 2);
  if (mph >= 70) return Math.max(1, baseRing - 1);
  return baseRing;
}

function updateTerrainAround(x, z) {
  if (!appCtx.terrainEnabled) return;

  ensureTerrainGroup();

  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const centerKey = `${appCtx.TERRAIN_ZOOM}/${t.x}/${t.y}`;
  const activeRing = getDynamicTerrainRing();
  const ringChanged = activeRing !== lastDynamicTerrainRing;
  const needsRoadRebuild = !!appCtx.roadsNeedRebuild && appCtx.roads.length > 0 && !appCtx.onMoon;
  lastDynamicTerrainRing = activeRing;
  if (typeof appCtx.setPerfLiveStat === 'function') appCtx.setPerfLiveStat('terrainRing', activeRing);

  // OPTIMIZATION: Skip if same tile AND haven't moved enough (but always run on first call)
  if (lastTerrainCenterKey !== null) {
    const dx = x - terrain._lastUpdatePos.x;
    const dz = z - terrain._lastUpdatePos.z;
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    if (centerKey === lastTerrainCenterKey && distMoved < 5.0 && !ringChanged && !needsRoadRebuild) return;
  }

  const tilesChanged = centerKey !== lastTerrainCenterKey || ringChanged;
  lastTerrainCenterKey = centerKey;
  terrain._lastUpdatePos.x = x;
  terrain._lastUpdatePos.z = z;

  // Only rebuild terrain meshes if tiles actually changed
  if (tilesChanged) {
    clearTerrainMeshes();

    for (let dx = -activeRing; dx <= activeRing; dx++) {
      for (let dy = -activeRing; dy <= activeRing; dy++) {
        const tx = t.x + dx;
        const ty = t.y + dy;
        const mesh = buildTerrainTileMesh(appCtx.TERRAIN_ZOOM, tx, ty);
        appCtx.terrainGroup.add(mesh);
      }
    }

    // Only rebuild roads when terrain tiles actually change (not every frame)
    if (appCtx.roads.length > 0 && !appCtx.onMoon) {
      requestWorldSurfaceSync({ source: 'terrain_tiles_changed' });
    }
  } else if (needsRoadRebuild) {
    requestWorldSurfaceSync({ source: 'terrain_tiles_pending' });
  }
}

// Rebuild roads to follow current terrain elevation with improved conformance
function rebuildRoadsWithTerrain() {
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;

  // Disable debug mode before rebuild to prevent stuck materials
  if (roadDebugMode && typeof disableRoadDebugMode === 'function') {
    disableRoadDebugMode();
  }

  // Check if terrain tiles are loaded
  let tilesLoaded = 0;
  let tilesTotal = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    tilesTotal++;
    if (tile.loaded) tilesLoaded++;
  });

  if (tilesLoaded === 0 || tilesTotal === 0) return;

  if (typeof appCtx.refreshStructureAwareFeatureProfiles === 'function') {
    appCtx.refreshStructureAwareFeatureProfiles();
  }

  // OPTIMIZATION: Only clear height cache if road count changed (roads added/removed)
  // Otherwise keep cached heights for better performance
  const roadCountChanged = appCtx.roads.length !== terrain._lastRoadCount;
  if (roadCountChanged) {
    clearTerrainHeightCache();
    terrain._lastRoadCount = appCtx.roads.length;
  }

  // Remove old road meshes
  appCtx.roadMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    // Road batch materials are shared/reused across rebuilds; don't dispose here.
    if (m.material && !m.userData?.sharedRoadMaterial) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => {
          if (mat && typeof mat.dispose === 'function') mat.dispose();
        });
      } else if (typeof m.material.dispose === 'function') {
        m.material.dispose();
      }
    }
  });
  appCtx.roadMeshes = [];
  appCtx.urbanSurfaceMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material && !m.userData?.sharedUrbanSurfaceMaterial && typeof m.material.dispose === 'function') {
      m.material.dispose();
    }
  });
  appCtx.urbanSurfaceMeshes = [];
  appCtx.urbanSurfaceStats = {
    sidewalkBatchCount: 0,
    sidewalkVertices: 0,
    sidewalkTriangles: 0,
    skippedBuildingAprons: Number(appCtx.urbanSurfaceStats?.skippedBuildingAprons || 0)
  };

  // OPTIMIZATION: Cache intersection detection - only recalculate if roads changed
  let intersections;
  if (roadCountChanged || !terrain._cachedIntersections) {
    intersections = detectRoadIntersections(appCtx.roads);
    terrain._cachedIntersections = intersections;
  } else {
    intersections = terrain._cachedIntersections;
  }

  const roadMainBatchVerts = [];
  const roadMainBatchIdx = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadCapBatchVerts = [];
  const roadCapBatchIdx = [];
  const sidewalkBatchVerts = [];
  const sidewalkBatchIdx = [];

  const sharedRoadMaterials = getSharedRoadMaterials();
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
  const capMat = sharedRoadMaterials.capMat;
  const urbanSurfaceMaterials = getSharedUrbanSurfaceMaterials();
  const sidewalkMat = urbanSurfaceMaterials.sidewalkMat;

  const buildSidewalkStrip = (
    pts,
    edgePoints,
    sideSign,
    halfWidth,
    desiredWidth,
    roadFeature,
    buildingCandidates,
    nearbyIntersections = [],
    endpointIntersections = null
  ) => {
    if (!Array.isArray(pts) || pts.length < 2 || !Array.isArray(edgePoints) || edgePoints.length !== pts.length) return;
    if (!Number.isFinite(desiredWidth) || desiredWidth < SIDEWALK_MIN_WIDTH) return;

    const widths = new Float32Array(pts.length);
    const widthCaps = new Float32Array(pts.length);
    const widthLocked = new Uint8Array(pts.length);
    let pathDistances = null;
    let totalPathLength = 0;
    if (endpointIntersections?.start || endpointIntersections?.end) {
      pathDistances = new Float32Array(pts.length);
      for (let i = 1; i < pts.length; i++) {
        totalPathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        pathDistances[i] = totalPathLength;
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const outwardX = sideSign > 0 ? nx : -nx;
      const outwardZ = sideSign > 0 ? nz : -nz;
      let widthAtPoint = resolveSidewalkWidth(
        p.x,
        p.z,
        outwardX,
        outwardZ,
        halfWidth + SIDEWALK_INNER_GAP,
        desiredWidth,
        buildingCandidates
      );
      let widthCap = Math.max(0, desiredWidth * computeSidewalkCornerScale(pts, i, sideSign));
      if (widthAtPoint > widthCap) widthAtPoint = widthCap;
      if (pathDistances && widthAtPoint > 0) {
        const applyEndpointTaper = (intersection, distanceAlongRoad) => {
          if (!intersection || !Number.isFinite(distanceAlongRoad)) return;
          const capRadius = computeIntersectionCapRadius(intersection);
          const clearDistance = capRadius + Math.max(halfWidth * 0.35, 0.9);
          const taperDistance = clearDistance + Math.max(halfWidth + desiredWidth + 4.5, 10);
          if (distanceAlongRoad <= clearDistance) {
            widthAtPoint = 0;
            widthCap = 0;
            widthLocked[i] = 1;
            return;
          }
          if (distanceAlongRoad >= taperDistance) return;
          const t = Math.max(0, Math.min(1, (distanceAlongRoad - clearDistance) / Math.max(1, taperDistance - clearDistance)));
          const fade = t * t * (3 - 2 * t);
          widthCap = Math.min(widthCap, desiredWidth * fade);
          widthAtPoint = Math.min(widthAtPoint, widthCap);
        };
        if (endpointIntersections?.start) {
          applyEndpointTaper(endpointIntersections.start, pathDistances[i]);
        }
        if (!widthLocked[i] && endpointIntersections?.end) {
          applyEndpointTaper(endpointIntersections.end, totalPathLength - pathDistances[i]);
        }
      }
      if (widthAtPoint > 0 && nearbyIntersections.length > 0) {
        for (let j = 0; j < nearbyIntersections.length; j++) {
          const intersection = nearbyIntersections[j];
          const capRadius = computeIntersectionCapRadius(intersection);
          const taperRadius = capRadius + Math.max(halfWidth + desiredWidth + 2, 8);
          const dist = Math.hypot(p.x - intersection.x, p.z - intersection.z);
          if (dist >= taperRadius) continue;
          if (dist <= capRadius) {
            widthAtPoint = 0;
            widthCap = 0;
            widthLocked[i] = 1;
            break;
          }
          const t = Math.max(0, Math.min(1, (dist - capRadius) / Math.max(1, taperRadius - capRadius)));
          const fade = t * t * (3 - 2 * t);
          widthCap = Math.min(widthCap, desiredWidth * fade);
          widthAtPoint = Math.min(widthAtPoint, widthCap);
        }
      }
      widths[i] = widthAtPoint;
      widthCaps[i] = widthCap;
    }

    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < widths.length - 1; i++) {
        if (widthLocked[i]) {
          widths[i] = 0;
          continue;
        }
        let neighborSum = 0;
        let neighborCount = 0;
        if (!widthLocked[i - 1]) {
          neighborSum += widths[i - 1];
          neighborCount += 1;
        }
        if (!widthLocked[i + 1]) {
          neighborSum += widths[i + 1];
          neighborCount += 1;
        }
        if (!neighborCount) continue;
        const neighborAvg = neighborSum / neighborCount;
        const smoothed = widths[i] * 0.7 + neighborAvg * 0.3;
        widths[i] = Math.min(widthCaps[i], smoothed);
      }
    }
    clampSidewalkWidthTransitions(widths, pts, widthCaps, widthLocked);

    const outerHeights = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const outwardX = sideSign > 0 ? nx : -nx;
      const outwardZ = sideSign > 0 ? nz : -nz;
      const innerOffset = halfWidth + SIDEWALK_INNER_GAP;
      const width = widths[i] >= SIDEWALK_MIN_WIDTH ? widths[i] : 0;
      const innerY = edgePoints[i].y + SIDEWALK_CURB_LIFT;
      const outerX = p.x + outwardX * (innerOffset + width);
      const outerZ = p.z + outwardZ * (innerOffset + width);
      const elevatedSurfaceY =
        roadFeature?.structureSemantics?.terrainMode !== 'at_grade' ?
          sampleFeatureSurfaceY(roadFeature, outerX, outerZ) :
          NaN;
      const outerTerrainY = Number.isFinite(elevatedSurfaceY) ?
        elevatedSurfaceY + SIDEWALK_CURB_LIFT :
        cachedTerrainHeight(outerX, outerZ) + SIDEWALK_HEIGHT_BIAS;
      outerHeights[i] = width > 0 ? Math.max(outerTerrainY, innerY - 0.18) : innerY;
    }
    smoothSidewalkOuterHeights(outerHeights, widths, pts);

    const localVerts = [];
    const localIdx = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const outwardX = sideSign > 0 ? nx : -nx;
      const outwardZ = sideSign > 0 ? nz : -nz;
      const innerOffset = halfWidth + SIDEWALK_INNER_GAP;
      const width = widths[i] >= SIDEWALK_MIN_WIDTH ? widths[i] : 0;
      const innerX = p.x + outwardX * innerOffset;
      const innerZ = p.z + outwardZ * innerOffset;
      const outerX = p.x + outwardX * (innerOffset + width);
      const outerZ = p.z + outwardZ * (innerOffset + width);
      const innerY = edgePoints[i].y + SIDEWALK_CURB_LIFT;
      const outerY = width > 0 ? Math.max(outerHeights[i], innerY - 0.18) : innerY;
      localVerts.push(innerX, innerY, innerZ);
      localVerts.push(outerX, outerY, outerZ);
      if (i < pts.length - 1) {
        const nextWidth = widths[i + 1] >= SIDEWALK_MIN_WIDTH ? widths[i + 1] : 0;
        const segmentWidth = Math.max(width, nextWidth);
        const narrowSide = Math.min(width, nextWidth);
        if (segmentWidth >= SIDEWALK_SEGMENT_MIN_WIDTH && narrowSide >= SIDEWALK_SEGMENT_MIN_WIDTH * 0.25) {
          const vi = i * 2;
          localIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        }
      }
    }

    if (localIdx.length > 0) {
      appendIndexedGeometry(sidewalkBatchVerts, sidewalkBatchIdx, localVerts, localIdx);
    }
  };

  // Rebuild each road with improved terrain conformance
  appCtx.roads.forEach((road, roadIdx) => {
    if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return;
    const { width } = road;
    const hw = width / 2;

    // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
    const baseDetail = Number.isFinite(road?.subdivideMaxDist) ? road.subdivideMaxDist : 3.5;
    const hasTransitionAnchors = Array.isArray(road?.structureTransitionAnchors) && road.structureTransitionAnchors.length > 0;
    const detail =
      road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade' ?
        Math.min(baseDetail, 0.55) :
      hasTransitionAnchors ?
        Math.min(baseDetail, 0.6) :
        baseDetail;
    const pts = subdivideRoadPoints(road.pts, detail);

    const verts = [];
    const indices = [];
    const leftEdge = [];
    const rightEdge = [];
    const roadBounds = road.bounds || pointsBoundsLocal(road.pts, width * 0.5 + URBAN_CONTEXT_PAD);
    const contextBounds = expandBoundsLocal(roadBounds, URBAN_CONTEXT_PAD);
    const buildingCandidates = Array.isArray(appCtx.buildings) ? appCtx.buildings.filter((building) =>
      boundsIntersectLocal(building, contextBounds)
    ) : [];
    const nearbyLanduses = Array.isArray(appCtx.landuses) ? appCtx.landuses.filter((landuse) =>
      boundsIntersectLocal(landuse.bounds || pointsBoundsLocal(landuse.pts || []), contextBounds)
    ) : [];
    const nearbyUrbanLanduses = nearbyLanduses.filter((landuse) => isUrbanLanduseType(landuse?.type)).length;
    const nearbyGreenLanduses = nearbyLanduses.filter((landuse) => isGreenLanduseType(landuse?.type)).length;
    const explicitSidewalkHint = roadHasExplicitSidewalkHint(road);
    const denseUrbanContext =
      nearbyUrbanLanduses > 0 ||
      buildingCandidates.length >= 8 ||
      (buildingCandidates.length >= 6 && width >= 10) ||
      (nearbyUrbanLanduses > 0 && buildingCandidates.length >= 3);
    const ruralGreenContext =
      nearbyUrbanLanduses === 0 &&
      (nearbyGreenLanduses > 0 || buildingCandidates.length < 5);
    const continuitySidewalk = roadConnectedSidewalkContinuity(road, denseUrbanContext, ruralGreenContext);
    const shouldBuildSidewalks =
      roadSupportsSidewalks(road) &&
      (explicitSidewalkHint || continuitySidewalk || (denseUrbanContext && !ruralGreenContext));
    const sidewalkWidth = shouldBuildSidewalks ? roadBaseSidewalkWidth(road, denseUrbanContext) : 0;
    const nearbyIntersections = shouldBuildSidewalks ? intersections.filter((intersection) =>
      boundsIntersectLocal(roadBounds, { minX: intersection.x, maxX: intersection.x, minZ: intersection.z, maxZ: intersection.z }, Math.max(width * 1.8, 14))
    ) : [];
    const endpointIntersections = shouldBuildSidewalks ? {
      start: nearbyIntersections.find((intersection) =>
        intersection?.roads?.some((entry) => entry.roadIdx === roadIdx && entry.ptIdx === 0)
      ) || null,
      end: nearbyIntersections.find((intersection) =>
        intersection?.roads?.some((entry) => entry.roadIdx === roadIdx && entry.ptIdx === road.pts.length - 1)
      ) || null
    } : null;

    const ribbonEdges = buildFeatureRibbonEdges(road, pts, hw, cachedBaseTerrainHeight, {
      surfaceBias: Number.isFinite(road?.surfaceBias) ? road.surfaceBias : 0.42
    });
    leftEdge.push(...ribbonEdges.leftEdge);
    rightEdge.push(...ribbonEdges.rightEdge);

    // OPTIMIZATION: Smooth edge heights to eliminate micro-bumps (reduced from 2 to 1 pass)
    const edgeSmoothPasses =
      road?.structureSemantics?.terrainMode === 'elevated' ?
        3 :
      road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade' ?
        2 :
      hasTransitionAnchors ?
        2 :
        1;
    for (let pass = 0; pass < edgeSmoothPasses; pass++) {
      for (let i = 1; i < leftEdge.length - 1; i++) {
        leftEdge[i].y = leftEdge[i].y * 0.52 + (leftEdge[i - 1].y + leftEdge[i + 1].y) * 0.24;
        rightEdge[i].y = rightEdge[i].y * 0.52 + (rightEdge[i - 1].y + rightEdge[i + 1].y) * 0.24;
      }
    }

    for (let i = 0; i < leftEdge.length; i++) {
      verts.push(leftEdge[i].x, leftEdge[i].y, leftEdge[i].z);
      verts.push(rightEdge[i].x, rightEdge[i].y, rightEdge[i].z);
      if (i < leftEdge.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      }
    }
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);

    // Build road skirts (edge curtains) to hide terrain peeking
    const terrainMode = road?.structureSemantics?.terrainMode;
    if (shouldRenderRoadSkirts(road)) {
      const skirtDepth =
        terrainMode === 'subgrade' ? 0.3 :
        3.6;
      const skirtData = buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
      if (skirtData.verts.length > 0) {
        appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
      }
    }

    if (shouldBuildSidewalks) {
      const allowLeft = road.sidewalkHint !== 'right';
      const allowRight = road.sidewalkHint !== 'left';
      if (allowLeft) buildSidewalkStrip(pts, leftEdge, 1, hw, sidewalkWidth, road, buildingCandidates, nearbyIntersections, endpointIntersections);
      if (allowRight) buildSidewalkStrip(pts, rightEdge, -1, hw, sidewalkWidth, road, buildingCandidates, nearbyIntersections, endpointIntersections);
    }
  });

  // Build intersection cap patches
  intersections.forEach((intersection) => {
    const hasGradeSeparatedRoad = Array.isArray(intersection?.roads) && intersection.roads.some((entry) => {
      const road = appCtx.roads?.[entry?.roadIdx];
      return road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade';
    });
    if (hasGradeSeparatedRoad) return;
    if (!shouldBuildIntersectionCap(intersection)) return;
    const radius = computeIntersectionCapRadius(intersection);
    const capData = buildIntersectionCap(intersection.x, intersection.z, radius, 24);
    appendIndexedGeometry(roadCapBatchVerts, roadCapBatchIdx, capData.verts, capData.indices);
  });

  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadMainBatchVerts,
    indices: roadMainBatchIdx,
    material: roadMat,
    renderOrder: 2,
    userData: { isRoadBatch: true, sharedRoadMaterial: true }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadSkirtBatchVerts,
    indices: roadSkirtBatchIdx,
    material: skirtMat,
    renderOrder: 1,
    userData: { isRoadBatch: true, isRoadSkirt: true, sharedRoadMaterial: true }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadCapBatchVerts,
    indices: roadCapBatchIdx,
    material: capMat,
    renderOrder: 3,
    userData: { isRoadBatch: true, isIntersectionCap: true, sharedRoadMaterial: true }
  });
  if (sidewalkBatchVerts.length > 0 && sidewalkBatchIdx.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sidewalkBatchVerts, 3));
    const vertexCount = sidewalkBatchVerts.length / 3;
    const indexArray = vertexCount > 65535 ? new Uint32Array(sidewalkBatchIdx) : new Uint16Array(sidewalkBatchIdx);
    geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, sidewalkMat);
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    Object.assign(mesh.userData, {
      isUrbanSurfaceBatch: true,
      isSidewalkBatch: true,
      sharedUrbanSurfaceMaterial: true
    });
    appCtx.scene.add(mesh);
    appCtx.urbanSurfaceMeshes.push(mesh);
    appCtx.urbanSurfaceStats.sidewalkBatchCount += 1;
    appCtx.urbanSurfaceStats.sidewalkVertices += vertexCount;
    appCtx.urbanSurfaceStats.sidewalkTriangles += sidewalkBatchIdx.length / 3;
  }

  rebuildStructureVisualMeshes();

  appCtx.roadsNeedRebuild = false;

  // Run validation if enabled
  if (typeof validateRoadTerrainConformance === 'function') {
    setTimeout(() => validateRoadTerrainConformance(), 100);
  }
}

function reprojectWaterwayMeshToTerrain(mesh) {
  const centerline = mesh.userData?.waterwayCenterline;
  if (!centerline || centerline.length < 2) return false;

  const width = mesh.userData?.waterwayWidth || 6;
  const halfWidth = width * 0.5;
  const verticalBias = Number.isFinite(mesh.userData?.waterwayBias) ? mesh.userData.waterwayBias : 0.08;
  const positions = mesh.geometry?.attributes?.position;
  if (!positions || positions.count < centerline.length * 2) return false;

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
    const leftY = terrainMeshHeightAt(leftX, leftZ) + verticalBias;
    const rightY = terrainMeshHeightAt(rightX, rightZ) + verticalBias;

    positions.setXYZ(i * 2, leftX, leftY, leftZ);
    positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
  }

  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
}

function reprojectLinearFeatureMeshToTerrain(mesh) {
  const centerline = mesh.userData?.linearFeatureCenterline;
  if (!centerline || centerline.length < 2) return false;

  const width = mesh.userData?.linearFeatureWidth || 2;
  const halfWidth = width * 0.5;
  const verticalBias = Number.isFinite(mesh.userData?.linearFeatureBias) ? mesh.userData.linearFeatureBias : 0.05;
  const positions = mesh.geometry?.attributes?.position;
  if (!positions || positions.count < centerline.length * 2) return false;
  const featureRef = mesh.userData?.linearFeatureRef || null;
  if (featureRef?.structureSemantics?.gradeSeparated) {
    const ribbonEdges = buildFeatureRibbonEdges(featureRef, centerline, halfWidth, cachedBaseTerrainHeight, {
      surfaceBias: verticalBias
    });
    if (ribbonEdges.leftEdge.length === centerline.length && ribbonEdges.rightEdge.length === centerline.length) {
      for (let i = 0; i < centerline.length; i++) {
        const leftEdge = ribbonEdges.leftEdge[i];
        const rightEdge = ribbonEdges.rightEdge[i];
        positions.setXYZ(i * 2, leftEdge.x, leftEdge.y, leftEdge.z);
        positions.setXYZ(i * 2 + 1, rightEdge.x, rightEdge.y, rightEdge.z);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      return true;
    }
  }

  const resolveBaseY = (x, z, kind) => {
    const terrainY = terrainMeshHeightAt(x, z);
    const fallbackTerrain = Number.isFinite(terrainY) ? terrainY : 0;
    const nearestRoad = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z, {
      y: fallbackTerrain + 0.4,
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
      const roadSampleX = Number.isFinite(nearestRoad?.pt?.x) ? nearestRoad.pt.x : x;
      const roadSampleZ = Number.isFinite(nearestRoad?.pt?.z) ? nearestRoad.pt.z : z;
      const roadY =
        appCtx.GroundHeight && typeof appCtx.GroundHeight.roadMeshY === 'function' ?
          appCtx.GroundHeight.roadMeshY(roadSampleX, roadSampleZ) :
          null;
      if (Number.isFinite(roadY)) return roadY;
      if (appCtx.GroundHeight && typeof appCtx.GroundHeight.roadSurfaceY === 'function') {
        return appCtx.GroundHeight.roadSurfaceY(roadSampleX, roadSampleZ);
      }
      return fallbackTerrain + 0.2;
    }
    return fallbackTerrain;
  };
  const kind = String(mesh.userData?.linearFeatureKind || '').toLowerCase();

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
    const leftY = resolveBaseY(leftX, leftZ, kind) + verticalBias;
    const rightY = resolveBaseY(rightX, rightZ, kind) + verticalBias;

    positions.setXYZ(i * 2, leftX, leftY, leftZ);
    positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
  }

  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
}

// Reposition buildings and landuse to follow terrain
function repositionBuildingsWithTerrain() {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return;

  let buildingsRepositioned = 0;
  let landuseRepositioned = 0;
  let poisRepositioned = 0;

  // Reposition buildings using terrain mesh surface
  appCtx.buildingMeshes.forEach((mesh) => {
    const pts = mesh.userData.buildingFootprint;
    if (!pts || pts.length === 0) return;

    const fallbackElevation = Number.isFinite(mesh.userData?.avgElevation) ?
    mesh.userData.avgElevation :
    0;

    // Use minimum elevation of footprint corners so building sits on terrain.
    // Prefer terrain mesh samples; if unavailable, fall back to base elevation
    // model to avoid buildings popping/floating while tiles stream in.
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    let sampleCount = 0;
    pts.forEach((p) => {
      let h = terrainMeshHeightAt(p.x, p.z);
      if ((!Number.isFinite(h) || h === 0) && typeof elevationWorldYAtWorldXZ === 'function') {
        h = elevationWorldYAtWorldXZ(p.x, p.z);
      }
      if (h === 0 && Math.abs(fallbackElevation) > 2) h = fallbackElevation;
      if (!Number.isFinite(h)) return;
      minElevation = Math.min(minElevation, h);
      maxElevation = Math.max(maxElevation, h);
      sampleCount++;
    });
    if (!Number.isFinite(minElevation) || sampleCount === 0) {
      minElevation = Number.isFinite(fallbackElevation) ? fallbackElevation : 0;
      maxElevation = minElevation;
    }
    const slopeRange = Number.isFinite(maxElevation) && Number.isFinite(minElevation) ?
    Math.max(0, maxElevation - minElevation) :
    0;
    const reliefLift = slopeRange >= 0.15 ?
    Math.min(0.35, slopeRange * 0.22) :
    0.05;
    const structureBaseOffset = Number.isFinite(mesh.userData?.structureBaseOffset) ?
      mesh.userData.structureBaseOffset :
      0;
    const baseElevation = minElevation + reliefLift + structureBaseOffset;

    const midLodHalfHeight = Number.isFinite(mesh.userData?.midLodHalfHeight) ?
    mesh.userData.midLodHalfHeight :
    0;
    mesh.position.y = baseElevation + midLodHalfHeight;
    mesh.userData.avgElevation = baseElevation;
    const sourceBuildingId = String(mesh.userData?.sourceBuildingId || '');
    if (sourceBuildingId && Array.isArray(appCtx.buildings)) {
      for (let i = 0; i < appCtx.buildings.length; i++) {
        const building = appCtx.buildings[i];
        if (!building || String(building.sourceBuildingId || '') !== sourceBuildingId) continue;
        building.baseY = baseElevation;
        building.minY = baseElevation;
        building.maxY = baseElevation + (Number.isFinite(building.height) ? building.height : 0);
      }
    }
    buildingsRepositioned++;
  });

  // Reposition landuse areas - deform vertices to follow terrain mesh surface
  appCtx.landuseMeshes.forEach((mesh) => {
    if (mesh.userData?.isWaterwayLine) {
      if (reprojectWaterwayMeshToTerrain(mesh)) landuseRepositioned++;
      return;
    }

    const pts = mesh.userData.landuseFootprint;
    if (!pts || pts.length === 0) return;

    // Recalculate average elevation from terrain mesh
    let avgElevation = 0;
    pts.forEach((p) => {
      const h = terrainMeshHeightAt(p.x, p.z);
      avgElevation += h;
    });
    avgElevation /= pts.length;
    const isWaterPolygon = mesh.userData?.landuseType === 'water';
    mesh.position.y = avgElevation;

    // Deform each vertex to follow actual terrain mesh surface
    const positions = mesh.geometry.attributes.position;
    if (positions) {
      const flattenFactor = isWaterPolygon ?
      Number.isFinite(mesh.userData?.waterFlattenFactor) ? mesh.userData.waterFlattenFactor : 0.12 :
      1.0;
      const vertexOffset = isWaterPolygon ? 0.08 : 0.05;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const tY = terrainMeshHeightAt(x, z);
        positions.setY(i, (tY - avgElevation) * flattenFactor + vertexOffset);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      if (isWaterPolygon) mesh.userData.waterSurfaceBase = avgElevation;
      landuseRepositioned++;
    }
  });

  appCtx.linearFeatureMeshes.forEach((mesh) => {
    if (reprojectLinearFeatureMeshToTerrain(mesh)) landuseRepositioned++;
  });

  // Reposition POI markers using terrain mesh surface
  appCtx.poiMeshes.forEach((mesh) => {
    const pos = mesh.userData.poiPosition;
    if (!pos) return;

    const tY = terrainMeshHeightAt(pos.x, pos.z);
    const offset = mesh.userData.isCapMesh ? 4 : 2;
    mesh.position.y = tY + offset;
    poisRepositioned++;
  });

  // Reposition street furniture using terrain mesh surface
  appCtx.streetFurnitureMeshes.forEach((group) => {
    if (!group.userData || !group.userData.furniturePos) return;
    const pos = group.userData.furniturePos;
    const tY = terrainMeshHeightAt(pos.x, pos.z);
    group.position.y = tY;
  });

  // Debug log removed
}

// =====================
// ROAD DEBUG MODE
// Toggle with 'R' key to visualize road-terrain conformance issues
// =====================
let roadDebugMode = false;
let roadDebugMeshes = [];

// Force disable debug mode and restore materials (useful if stuck)
function disableRoadDebugMode() {
  if (!roadDebugMode) return;

  roadDebugMode = false;

  // Clear debug meshes
  roadDebugMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadDebugMeshes = [];

  // DISABLED: Terrain materials are no longer overridden in debug mode
  // No need to restore them
  /*
  if (terrainGroup) {
    terrainGroup.children.forEach(mesh => {
      if (mesh.userData._originalMaterial) {
        mesh.material.dispose();
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
  */

  // Restore original road materials
  appCtx.roadMeshes.forEach((mesh) => {
    if (mesh.userData._originalMaterial) {
      mesh.material.dispose();
      mesh.material = mesh.userData._originalMaterial;
      delete mesh.userData._originalMaterial;
    }
  });

  console.log('🔍 Road Debug Mode FORCE DISABLED - Materials restored');
}

function toggleRoadDebugMode() {
  roadDebugMode = !roadDebugMode;

  // Clear existing debug meshes
  roadDebugMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadDebugMeshes = [];

  if (roadDebugMode) {
    console.log('🔍 Road Debug Mode ENABLED');

    // DISABLED: Do NOT override terrain materials - keep grass visible
    // Users complained grass disappeared in debug mode
    // Terrain stays normal, only roads are highlighted
    /*
    if (terrainGroup) {
      terrainGroup.children.forEach(mesh => {
        if (!mesh.userData._originalMaterial) {
          mesh.userData._originalMaterial = mesh.material;
        }
        mesh.material = new THREE.MeshBasicMaterial({
          color: 0x00ff00, // Green terrain
          wireframe: false
        });
      });
    }
    */

    // Override road materials with solid color
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      if (!mesh.userData._originalMaterial) {
        mesh.userData._originalMaterial = mesh.material;
      }
      mesh.material = new THREE.MeshBasicMaterial({
        color: 0xff0000, // Red roads
        side: THREE.DoubleSide
      });
    });

    // Draw road edge lines and sample points
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      // Extract edge points
      const points = [];
      for (let i = 0; i < pos.count; i += 2) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        points.push(new THREE.Vector3(x, y + 0.5, z));
      }

      // Draw yellow line along edge
      if (points.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
        const line = new THREE.Line(lineGeo, lineMat);
        appCtx.scene.add(line);
        roadDebugMeshes.push(line);
      }

      // Draw sample point spheres every 10 points
      for (let i = 0; i < points.length; i += 10) {
        const sphereGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(points[i]);
        appCtx.scene.add(sphere);
        roadDebugMeshes.push(sphere);
      }
    });

    // Highlight problem areas (road below terrain)
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const terrainY = terrainMeshHeightAt(x, z);
        const delta = y - terrainY;

        // Flag if road is significantly below terrain
        if (delta < -0.05) {
          const markerGeo = new THREE.BoxGeometry(0.5, 2, 0.5);
          const markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // Magenta warning
          const marker = new THREE.Mesh(markerGeo, markerMat);
          marker.position.set(x, y + 1, z);
          appCtx.scene.add(marker);
          roadDebugMeshes.push(marker);
        }
      }
    });

  } else {
    console.log('🔍 Road Debug Mode DISABLED');

    // DISABLED: Terrain materials are never overridden now, so nothing to restore
    /*
    if (terrainGroup) {
      terrainGroup.children.forEach(mesh => {
        if (mesh.userData._originalMaterial) {
          mesh.material = mesh.userData._originalMaterial;
          delete mesh.userData._originalMaterial;
        }
      });
    }
    */

    // Restore original road materials
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData._originalMaterial) {
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
}

// =====================
// ROAD-TERRAIN CONFORMANCE VALIDATOR
// Automated runtime checks for road-terrain alignment
// =====================

function validateRoadTerrainConformance() {
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;

  console.log('🔬 Validating road-terrain conformance...');

  let totalSamples = 0;
  let issuesFound = 0;
  const worstDeltas = [];

  appCtx.roadMeshes.forEach((mesh, meshIdx) => {
    if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    const roadIdx = mesh.userData.roadIdx;
    const road = appCtx.roads[roadIdx];
    if (!road) return;

    // Sample every 5th vertex (performance)
    for (let i = 0; i < pos.count; i += 5) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const terrainY = terrainMeshHeightAt(x, z);
      const delta = y - terrainY;

      totalSamples++;

      // Flag issues
      if (delta < -0.05) {
        issuesFound++;
        const { lat, lon } = worldToLatLon(x, z);
        worstDeltas.push({
          roadName: road.name || `Road ${roadIdx}`,
          delta: delta.toFixed(3),
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          worldPos: `(${x.toFixed(1)}, ${z.toFixed(1)})`
        });
      }
    }
  });

  // Sort by worst delta
  worstDeltas.sort((a, b) => parseFloat(a.delta) - parseFloat(b.delta));

  console.log(`✅ Validation complete: ${totalSamples} samples checked`);

  if (issuesFound > 0) {
    console.warn(`⚠️  Found ${issuesFound} points where road is below terrain (delta < -0.05)`);
    console.warn('Worst 10 deltas:');
    worstDeltas.slice(0, 10).forEach((d) => {
      console.warn(`  ${d.roadName}: delta=${d.delta}m at ${d.worldPos} (${d.lat}, ${d.lon})`);
    });
  } else {
    console.log('✅ No issues found - all roads conform to terrain!');
  }

  // Check for gaps at intersections
  const intersections = detectRoadIntersections(appCtx.roads);
  console.log(`📍 Detected ${intersections.length} intersections`);

  return {
    totalSamples,
    issuesFound,
    worstDeltas: worstDeltas.slice(0, 10),
    intersectionCount: intersections.length
  };
}

Object.assign(appCtx, {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  baseTerrainHeightAt: cachedBaseTerrainHeight,
  buildRoadSkirts,
  clearStructureVisualMeshes,
  buildTerrainTileMesh,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  rebuildRoadsWithTerrain,
  requestWorldSurfaceSync,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon
});

export {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  baseTerrainHeightAt,
  buildRoadSkirts,
  clearStructureVisualMeshes,
  buildTerrainTileMesh,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  rebuildRoadsWithTerrain,
  requestWorldSurfaceSync,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon };
