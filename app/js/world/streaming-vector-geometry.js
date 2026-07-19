import { ctx as appCtx } from '../shared-context.js?v=55';
import { buildFeatureRibbonEdges } from '../structure-semantics.js?v=13';
import { appendUpwardRibbonGeometry } from '../road-render.js?v=2';

const INITIAL_DETAIL_RADIUS = 1050;
const ROAD_SURFACE_OFFSET = 0.1;
const WEB_MERCATOR_MAX_LAT = 85.05112878;

function finite(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function expandGeographicBounds(bounds, marginMeters = 96) {
  const latN = Number(bounds?.latN);
  const latS = Number(bounds?.latS);
  const lonW = Number(bounds?.lonW);
  const lonE = Number(bounds?.lonE);
  if (![latN, latS, lonW, lonE].every(Number.isFinite)) return bounds;
  const centerLat = (latN + latS) * 0.5;
  const latitudeDelta = Math.max(0, Number(marginMeters) || 0) / 111320;
  const longitudeDelta = latitudeDelta / Math.max(0.05, Math.cos(centerLat * Math.PI / 180));
  const wrapLongitude = (longitude) => ((longitude + 180) % 360 + 360) % 360 - 180;
  return {
    latN: Math.min(WEB_MERCATOR_MAX_LAT, latN + latitudeDelta),
    latS: Math.max(-WEB_MERCATOR_MAX_LAT, latS - latitudeDelta),
    lonW: wrapLongitude(lonW - longitudeDelta),
    lonE: wrapLongitude(lonE + longitudeDelta)
  };
}

function worldPoint(coordinate) {
  const lon = Number(coordinate?.[0]);
  const lat = Number(coordinate?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return appCtx.geoToWorld(lat, lon);
}

function cleanLine(coordinates, maxPoints = 160) {
  if (!Array.isArray(coordinates)) return [];
  const points = coordinates.map(worldPoint).filter(Boolean);
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const reduced = points.filter((_, index) => index === 0 || index === points.length - 1 || index % stride === 0);
  if (reduced[reduced.length - 1] !== points[points.length - 1]) reduced.push(points[points.length - 1]);
  return reduced;
}

function cleanRing(coordinates, maxPoints = 180) {
  const points = cleanLine(coordinates, maxPoints);
  if (points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.05) points.pop();
  }
  return points.length >= 3 ? points : [];
}

function outsideInitialDetail(points) {
  if (!Array.isArray(points) || points.length === 0) return false;
  if (appCtx.initialEarthWorldRetired) return true;
  let x = 0;
  let z = 0;
  points.forEach((point) => {
    x += point.x;
    z += point.z;
  });
  const detailRadius = Math.max(800, Number(appCtx.initialEarthDetailRadius) || INITIAL_DETAIL_RADIUS);
  return Math.hypot(x / points.length, z / points.length) > detailRadius;
}

function geometryParts(geometry, expected) {
  if (!geometry) return [];
  if (expected === 'line') {
    if (geometry.type === 'LineString') return [geometry.coordinates];
    if (geometry.type === 'MultiLineString') return geometry.coordinates || [];
    return [];
  }
  if (geometry.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).map((polygon) => polygon?.[0]).filter(Array.isArray);
  }
  return [];
}

function forEachLayerFeature(tileRecord, layerName, limit, callback) {
  const layer = tileRecord.tile.layers[layerName];
  if (!layer || !Number.isFinite(layer.length)) return 0;
  const count = Math.min(layer.length, limit);
  for (let index = 0; index < count; index += 1) {
    const feature = layer.feature(index);
    if (!feature || typeof feature.toGeoJSON !== 'function') continue;
    callback(feature.toGeoJSON(tileRecord.x, tileRecord.y, tileRecord.z), feature.id ?? index, index);
  }
  return count;
}

async function forEachLayerFeatureAsync(tileRecord, layerName, limit, callback, yieldEvery = 6) {
  const layer = tileRecord.tile.layers[layerName];
  if (!layer || !Number.isFinite(layer.length)) return 0;
  const count = Math.min(layer.length, limit);
  for (let index = 0; index < count; index += 1) {
    const feature = layer.feature(index);
    if (feature && typeof feature.toGeoJSON === 'function') {
      callback(feature.toGeoJSON(tileRecord.x, tileRecord.y, tileRecord.z), feature.id ?? index, index);
    }
    if (index > 0 && index % yieldEvery === 0) await yieldToRenderer();
  }
  return count;
}

function roadWidth(properties = {}) {
  const kind = String(properties.kind || '').toLowerCase();
  if (kind.includes('motorway') || kind.includes('trunk')) return 10.5;
  if (kind.includes('primary')) return 8.5;
  if (kind.includes('secondary')) return 7.2;
  if (kind.includes('tertiary')) return 6.4;
  if (kind.includes('service') || kind.includes('track')) return 3.6;
  if (kind.includes('path') || kind.includes('footway') || kind.includes('cycleway')) return 1.8;
  return 5.4;
}

function roadSpeedLimit(properties = {}) {
  const kind = String(properties.kind || '').toLowerCase();
  if (kind.includes('motorway')) return 65;
  if (kind.includes('trunk')) return 55;
  if (kind.includes('primary')) return 40;
  if (kind.includes('secondary')) return 35;
  return 25;
}

function waterwayRenderWidth(properties = {}) {
  const explicit = finite(properties.width, NaN);
  if (Number.isFinite(explicit) && explicit > 1) return Math.min(240, explicit);
  const kind = String(properties.kind || properties.waterway || '').toLowerCase();
  if (kind.includes('river')) return 12;
  if (kind.includes('canal')) return 8;
  if (kind.includes('drain')) return 6;
  return 4;
}

function waterwayIsNavigable(properties = {}) {
  const explicitWidth = finite(properties.width, NaN);
  if (Number.isFinite(explicitWidth) && explicitWidth >= 12) return true;
  return ['boat', 'motorboat', 'ship'].some((key) => {
    const value = String(properties[key] || '').toLowerCase();
    return value === 'yes' || value === 'designated' || value === 'permissive';
  });
}

function terrainY(x, z) {
  const meshY = appCtx.terrainMeshHeightAt?.(x, z);
  if (Number.isFinite(meshY)) return meshY;
  const elevationY = appCtx.elevationWorldYAtWorldXZ?.(x, z);
  return Number.isFinite(elevationY) ? elevationY : 0;
}

function stableTerrainProfile(points, offset = 0) {
  const profile = [];
  points.forEach((point, index) => {
    let y = terrainY(point.x, point.z) + offset;
    const previous = profile[index - 1];
    if (!Number.isFinite(y)) y = Number(previous?.y) || offset;
    if (previous) {
      const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
      const maxDelta = Math.max(0.35, Math.min(6, distance * 0.08));
      y = Math.max(previous.y - maxDelta, Math.min(previous.y + maxDelta, y));
    }
    profile.push({ x: point.x, z: point.z, y });
  });
  return profile;
}

function appendRoadRibbon(points, width, vertices, indices, options = {}) {
  if (points.length < 2) return;
  const leftEdge = [];
  const rightEdge = [];
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const halfWidth = width * 0.5;
    const profileY = Number(options.surfaceProfile?.[i]?.y);
    const y = Number.isFinite(profileY) ? profileY : terrainY(points[i].x, points[i].z) + ROAD_SURFACE_OFFSET;
    leftEdge.push({ x: points[i].x + nx * halfWidth, y, z: points[i].z + nz * halfWidth });
    rightEdge.push({ x: points[i].x - nx * halfWidth, y, z: points[i].z - nz * halfWidth });
  }
  appendUpwardRibbonGeometry(leftEdge, rightEdge, vertices, indices);
}

function appendRoadFeatureRibbon(road, vertices, indices) {
  const edges = buildFeatureRibbonEdges(road, road.pts, road.width * 0.5, terrainY, {
    surfaceBias: ROAD_SURFACE_OFFSET
  });
  appendUpwardRibbonGeometry(edges.leftEdge, edges.rightEdge, vertices, indices);
}

function createIndexedMesh(vertices, indices, material, userData) {
  if (vertices.length === 0 || indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { ...userData, earthStreamingChunk: true };
  mesh.receiveShadow = true;
  return mesh;
}

function yieldToRenderer() {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}


export {
  INITIAL_DETAIL_RADIUS,
  ROAD_SURFACE_OFFSET,
  finite,
  stableHash,
  expandGeographicBounds,
  worldPoint,
  cleanLine,
  cleanRing,
  outsideInitialDetail,
  geometryParts,
  forEachLayerFeature,
  forEachLayerFeatureAsync,
  roadWidth,
  roadSpeedLimit,
  waterwayRenderWidth,
  waterwayIsNavigable,
  terrainY,
  stableTerrainProfile,
  appendRoadRibbon,
  appendRoadFeatureRibbon,
  createIndexedMesh,
  yieldToRenderer
};
