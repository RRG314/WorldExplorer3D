import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  classifyWaterSurfaceProfile,
  normalizeLanduseSurfaceType
} from "../surface-rules.js?v=12";
import { geometryHasFinitePositions } from "./geometry-batching.js?v=2";
import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "./shortbread-source.js?v=4";

const WATER_VECTOR_TILE_ZOOM = 13;
const FEATURE_CLIP_RADIUS_SCALE = 1.75;
const FEATURE_CLIP_RADIUS_MIN = 1900;
const FEATURE_CLIP_RADIUS_MAX = 9000;
const FEATURE_MAX_SEGMENT_SCALE = 0.48;
const FEATURE_MAX_SEGMENT_MIN = 260;
const FEATURE_MAX_SEGMENT_MAX = 1700;
const FEATURE_MAX_SPAN_SCALE = 1.25;
const FEATURE_MAX_AREA_SCALE = 1.0;

let sanitizeWorldFootprintPointsFn = () => [];
let sanitizeWorldPathPointsFn = () => [];
let decimatePointsFn = (pts) => pts;
let clampNumberFn = (value) => value;
let featureMinPolygonArea = 8;

export function initWorldLoadGeometry(options = {}) {
  if (typeof options.sanitizeWorldFootprintPoints === 'function') {
    sanitizeWorldFootprintPointsFn = options.sanitizeWorldFootprintPoints;
  }
  if (typeof options.sanitizeWorldPathPoints === 'function') {
    sanitizeWorldPathPointsFn = options.sanitizeWorldPathPoints;
  }
  if (typeof options.decimatePoints === 'function') {
    decimatePointsFn = options.decimatePoints;
  }
  if (typeof options.clampNumber === 'function') {
    clampNumberFn = options.clampNumber;
  }
  if (Number.isFinite(options.featureMinPolygonArea)) {
    featureMinPolygonArea = Math.max(1, Number(options.featureMinPolygonArea));
  }
}

function fallbackMidLodBuildingMesh(pts, height, avgElevation, colorHex = '#7f8ca0') {
  if (!pts || pts.length < 3) return null;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });

  const w = Math.max(4, maxX - minX);
  const d = Math.max(4, maxZ - minZ);
  const h = Math.max(3.2, Number.isFinite(height) ? height : 10);

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
  mesh.userData.midLodPositionMode = 'center';
  mesh.userData.midLodDims = { w, h, d };
  mesh.userData.midLodColor = colorHex;
  mesh.userData.avgElevation = avgElevation;
  mesh.userData.lodTier = 'mid';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function footprintMetrics(pts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    minX = Math.min(minX, p0.x);
    maxX = Math.max(maxX, p0.x);
    minZ = Math.min(minZ, p0.z);
    maxZ = Math.max(maxZ, p0.z);
    area += p0.x * p1.z - p1.x * p0.z;
  }
  return {
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ),
    area: Math.abs(area) * 0.5
  };
}

export function createMidLodBuildingMesh(pts, height, avgElevation, options = {}) {
  if (!pts || pts.length < 3) return null;

  const colorHex = typeof options === 'string' ? options : (options.colorHex || '#7f8ca0');
  const buildingType = typeof options === 'object' ? options.buildingType || 'yes' : 'yes';
  const buildingSeed = typeof options === 'object' ? options.buildingSeed : 0;
  const minimumHeight = options.buildingSemantics?.partKind && options.buildingSemantics.partKind !== 'full' ? 0.2 : 3.2;
  const h = Math.max(minimumHeight, Number.isFinite(height) ? height : 10);
  const metrics = footprintMetrics(pts);

  try {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    });
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1
    });
    geo.rotateX(-Math.PI / 2);
    if (!geometryHasFinitePositions(geo)) {
      geo.dispose();
      return fallbackMidLodBuildingMesh(pts, h, avgElevation, colorHex);
    }

    const mat = typeof appCtx.getBuildingMaterial === 'function'
      ? appCtx.getBuildingMaterial(buildingType, buildingSeed, colorHex, {
        lodTier: 'mid',
        heightMeters: h,
        footprintWidth: metrics.width,
        footprintDepth: metrics.depth,
        footprintArea: metrics.area,
        denseUrban: options.denseUrban === true,
        facadeMaterial: options.facadeMaterial || '',
        buildingSemantics: options.buildingSemantics || null
      })
      : new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.88,
        metalness: 0.03
      });
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = avgElevation;
    mesh.userData.buildingFootprint = pts;
    mesh.userData.midLodHalfHeight = 0;
    mesh.userData.midLodPositionMode = 'base';
    mesh.userData.midLodDims = geo.boundingBox ? {
      w: geo.boundingBox.max.x - geo.boundingBox.min.x,
      h: geo.boundingBox.max.y - geo.boundingBox.min.y,
      d: geo.boundingBox.max.z - geo.boundingBox.min.z
    } : null;
    mesh.userData.midLodColor = colorHex;
    mesh.userData.avgElevation = avgElevation;
    mesh.userData.lodTier = 'mid';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  } catch (err) {
    console.warn('[WorldLoad] createMidLodBuildingMesh fallback:', err);
    return fallbackMidLodBuildingMesh(pts, h, avgElevation, colorHex);
  }
}

export async function fetchVectorTileWater(z, x, y) {
  return fetchShortbreadTile(z, x, y);
}

export function normalizeWorldRingFromLonLat(coords, maxPoints = 900, guardOptions = null) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    pts.push(appCtx.geoToWorld(c[1], c[0]));
  }
  if (pts.length < 3) return null;
  const ring = sanitizeWorldFootprintPointsFn(
    decimatePointsFn(pts, maxPoints, false),
    featureMinPolygonArea,
    guardOptions || undefined
  );
  return ring.length >= 3 ? ring : null;
}

export function worldLinePointsFromLonLat(coords, maxPoints = 1000, guardOptions = null) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    pts.push(appCtx.geoToWorld(c[1], c[0]));
  }
  if (pts.length < 2) return null;
  const cleaned = sanitizeWorldPathPointsFn(decimatePointsFn(pts, maxPoints, false), guardOptions || undefined);
  return cleaned.length >= 2 ? cleaned : null;
}

export function classifyLanduseType(tags) {
  return normalizeLanduseSurfaceType(tags);
}

export function polylineBounds(pts, padding = 0) {
  if (!Array.isArray(pts) || pts.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

export function buildFeatureGeometryGuards(featureRadiusDeg = 0.02) {
  const radiusWorld = Math.abs(Number(featureRadiusDeg) || 0) * appCtx.SCALE;
  const clipRadius = clampNumberFn(radiusWorld * FEATURE_CLIP_RADIUS_SCALE, FEATURE_CLIP_RADIUS_MIN, FEATURE_CLIP_RADIUS_MAX, FEATURE_CLIP_RADIUS_MIN);
  const maxSegmentLength = clampNumberFn(clipRadius * FEATURE_MAX_SEGMENT_SCALE, FEATURE_MAX_SEGMENT_MIN, FEATURE_MAX_SEGMENT_MAX, FEATURE_MAX_SEGMENT_MAX);
  const maxSpan = Math.max(FEATURE_CLIP_RADIUS_MIN, clipRadius * FEATURE_MAX_SPAN_SCALE);
  const maxArea = Math.max(2500000, clipRadius * clipRadius * FEATURE_MAX_AREA_SCALE);
  return { maxArea, maxDistanceFromOrigin: clipRadius, maxSegmentLength, maxSpan };
}

export function buildBuildingGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  return { ...guards, maxArea: Math.min(guards.maxArea, 220000), maxSegmentLength: Math.min(guards.maxSegmentLength, 650), maxSpan: Math.min(guards.maxSpan, 950) };
}

export function buildLanduseGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  const maxSpan = Math.min(guards.maxSpan, Math.max(1200, guards.maxDistanceFromOrigin * 1.05));
  return { ...guards, maxArea: Math.min(guards.maxArea, maxSpan * maxSpan * 0.72), maxSegmentLength: Math.min(guards.maxSegmentLength, 900), maxSpan };
}

export function buildWaterGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  const maxDistanceFromOrigin = Math.min(Math.max(guards.maxDistanceFromOrigin * 3.2, 4800), FEATURE_CLIP_RADIUS_MAX * 2.8);
  const maxSpan = Math.min(Math.max(guards.maxSpan * 4.2, 8600), Math.max(12000, maxDistanceFromOrigin * 1.65));
  return {
    ...guards,
    maxDistanceFromOrigin,
    maxArea: Math.min(Math.max(guards.maxArea * 12.0, 38000000), maxSpan * maxSpan * 1.45),
    maxSegmentLength: Math.min(Math.max(guards.maxSegmentLength * 4.8, 4200), 6800),
    maxSpan
  };
}

export function waterSurfaceBaseElevation(heights) {
  if (!Array.isArray(heights) || heights.length === 0) return 0;
  const finite = heights.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  finite.sort((a, b) => a - b);
  const min = finite[0];
  const percentileIdx = Math.max(0, Math.min(finite.length - 1, Math.floor((finite.length - 1) * 0.12)));
  const representativeSurface = Math.min(finite[percentileIdx], min + 0.1);
  // Elevation tiles report bathymetry below oceans. Surface water remains at
  // sea level; seabed depth belongs to underwater terrain, not surface height.
  return representativeSurface < -1 ? 0 : representativeSurface;
}

export function resolveWaterSurfaceVisualProfile(bounds = null) {
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
    color: 0x2d7cad,
    emissive: 0x0a2542,
    emissiveIntensity: 0.14,
    roughness: 0.44,
    metalness: 0.02
  };
}

export { vectorTileRangeForBounds, WATER_VECTOR_TILE_ZOOM };
