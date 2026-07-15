import { ctx as appCtx } from '../shared-context.js?v=55';
import { clampLat, geometryPolygonRings, normalizeGeometry, wrapLon } from './schema.js?v=1';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function worldToGeoPoint(x, z) {
  if (typeof appCtx.worldToLatLon === 'function') {
    const point = appCtx.worldToLatLon(x, z);
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
      return { lat: clampLat(point.lat), lon: wrapLon(point.lon) };
    }
  }
  const loc = appCtx.LOC;
  const scale = Math.max(1, finiteNumber(appCtx.SCALE, 1));
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return { lat: 0, lon: 0 };
  const lat = loc.lat - z / scale;
  const lon = loc.lon + x / (scale * (Math.cos(loc.lat * Math.PI / 180) || 1));
  return { lat: clampLat(lat), lon: wrapLon(lon) };
}

function geoToWorldPoint(lat, lon) {
  if (typeof appCtx.geoToWorld === 'function') {
    const point = appCtx.geoToWorld(lat, lon);
    if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
      return { x: point.x, z: point.z };
    }
  }
  const loc = appCtx.LOC;
  const scale = Math.max(1, finiteNumber(appCtx.SCALE, 1));
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return { x: NaN, z: NaN };
  return {
    x: (lon - loc.lon) * scale * (Math.cos(loc.lat * Math.PI / 180) || 1),
    z: -(lat - loc.lat) * scale
  };
}

function sampleSurfaceY(x, z, fallback = 0) {
  if (appCtx.GroundHeight && typeof appCtx.GroundHeight.walkSurfaceY === 'function') {
    const y = appCtx.GroundHeight.walkSurfaceY(x, z);
    if (Number.isFinite(y)) return y;
  }
  if (typeof appCtx.terrainMeshHeightAt === 'function') {
    const y = appCtx.terrainMeshHeightAt(x, z);
    if (Number.isFinite(y)) return y;
  }
  if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
    const y = appCtx.elevationWorldYAtWorldXZ(x, z);
    if (Number.isFinite(y)) return y;
  }
  return finiteNumber(fallback, 0);
}

function cloneWorldPoint(point = {}) {
  return {
    x: finiteNumber(point.x, 0),
    z: finiteNumber(point.z, 0)
  };
}

function distance2d(a = {}, b = {}) {
  return Math.hypot(finiteNumber(a.x) - finiteNumber(b.x), finiteNumber(a.z) - finiteNumber(b.z));
}

function projectPointToSegment2d(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) {
    return {
      x: p1.x,
      z: p1.z,
      t: 0,
      dist: Math.hypot(x - p1.x, z - p1.z)
    };
  }
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return {
    x: px,
    z: pz,
    t,
    dist: Math.hypot(x - px, z - pz)
  };
}

function signedAreaWorld(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return area * 0.5;
}

function pointInPolygonWorld(x, z, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function cleanWorldLinePoints(points = []) {
  const out = [];
  points.forEach((point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const clean = cloneWorldPoint(point);
    if (out.length === 0 || distance2d(out[out.length - 1], clean) > 0.08) {
      out.push(clean);
    }
  });
  return out;
}

function cleanWorldRingPoints(points = []) {
  const out = cleanWorldLinePoints(points);
  if (out.length >= 2 && distance2d(out[0], out[out.length - 1]) < 0.2) {
    out.pop();
  }
  return out;
}

function buildAxisAlignedWorldRing(anchor = {}, current = {}, minSize = 0.6) {
  const start = cloneWorldPoint(anchor);
  const end = cloneWorldPoint(current);
  let minX = Math.min(start.x, end.x);
  let maxX = Math.max(start.x, end.x);
  let minZ = Math.min(start.z, end.z);
  let maxZ = Math.max(start.z, end.z);
  if (Math.abs(maxX - minX) < minSize) maxX = minX + minSize;
  if (Math.abs(maxZ - minZ) < minSize) maxZ = minZ + minSize;
  return cleanWorldRingPoints([
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ }
  ]);
}

function geometryToWorldData(geometry = {}) {
  const normalized = normalizeGeometry(geometry, geometry.type || 'Point');
  if (normalized.type === 'Point') {
    const point = geoToWorldPoint(normalized.coordinates.lat, normalized.coordinates.lon);
    return {
      type: 'Point',
      coordinates: { x: point.x, z: point.z }
    };
  }
  if (normalized.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: normalized.coordinates.map((point) => {
        const world = geoToWorldPoint(point.lat, point.lon);
        return { x: world.x, z: world.z };
      })
    };
  }
  return {
    type: 'Polygon',
    coordinates: geometryPolygonRings(normalized).map((ring) => ring.map((point) => {
      const world = geoToWorldPoint(point.lat, point.lon);
      return { x: world.x, z: world.z };
    }))
  };
}

function worldDataToGeometry(worldGeometry = {}, geometryType = '') {
  const type = String(geometryType || worldGeometry?.type || 'Point');
  if (type === 'Point') {
    const point = worldGeometry?.coordinates || worldGeometry;
    return {
      type,
      coordinates: worldToGeoPoint(point.x, point.z)
    };
  }
  if (type === 'LineString') {
    return {
      type,
      coordinates: cleanWorldLinePoints(worldGeometry?.coordinates || []).map((point) => worldToGeoPoint(point.x, point.z))
    };
  }
  return {
    type: 'Polygon',
    rings: [
      {
        role: 'outer',
        points: cleanWorldRingPoints(Array.isArray(worldGeometry?.coordinates) ? worldGeometry.coordinates[0] || [] : [])
          .map((point) => worldToGeoPoint(point.x, point.z))
      }
    ]
  };
}

function featureWorldCenter(feature = {}) {
  const world = geometryToWorldData(feature.geometry || {});
  if (world.type === 'Point') return { x: world.coordinates.x, z: world.coordinates.z };
  const points = world.type === 'LineString'
    ? world.coordinates
    : Array.isArray(world.coordinates) ? world.coordinates[0] || [] : [];
  if (!points.length) return { x: 0, z: 0 };
  let sumX = 0;
  let sumZ = 0;
  points.forEach((point) => {
    sumX += point.x;
    sumZ += point.z;
  });
  return {
    x: sumX / points.length,
    z: sumZ / points.length
  };
}

function nearestVertexIndex(points = [], point = {}, maxDistance = Infinity) {
  let bestIndex = -1;
  let bestDistance = maxDistance;
  points.forEach((candidate, index) => {
    const dist = distance2d(candidate, point);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function nearestSegmentIndex(points = [], point = {}, closed = false, maxDistance = Infinity) {
  if (!Array.isArray(points) || points.length < 2) {
    return { index: -1, distance: Infinity, point: null };
  }
  let bestIndex = -1;
  let bestDistance = maxDistance;
  let bestPoint = null;
  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const projection = projectPointToSegment2d(point.x, point.z, p1, p2);
    if (projection.dist < bestDistance) {
      bestDistance = projection.dist;
      bestIndex = i;
      bestPoint = projection;
    }
  }
  return { index: bestIndex, distance: bestDistance, point: bestPoint };
}

function projectPointToPolygonBoundary(point = {}, ring = []) {
  const segment = nearestSegmentIndex(ring, point, true, Infinity);
  if (segment.index < 0 || !segment.point) return null;
  const p1 = ring[segment.index];
  const p2 = ring[(segment.index + 1) % ring.length];
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz) || 1;
  const winding = signedAreaWorld(ring) >= 0 ? -1 : 1;
  const nx = (-dz / len) * winding;
  const nz = (dx / len) * winding;
  return {
    point: {
      x: segment.point.x + nx * 0.34,
      z: segment.point.z + nz * 0.34
    },
    boundaryPoint: {
      x: segment.point.x,
      z: segment.point.z
    },
    normal: { x: nx, z: nz },
    yaw: Math.atan2(nx, nz),
    segmentIndex: segment.index,
    distance: segment.distance
  };
}

function updateWorldGeometryVertex(worldGeometry = {}, vertexIndex = -1, point = {}) {
  const geometry = JSON.parse(JSON.stringify(worldGeometry || {}));
  if (geometry.type === 'Point') {
    geometry.coordinates = cloneWorldPoint(point);
    return geometry;
  }
  const closed = geometry.type === 'Polygon';
  const points = closed ? geometry.coordinates?.[0] || [] : geometry.coordinates || [];
  if (vertexIndex < 0 || vertexIndex >= points.length) return geometry;
  points[vertexIndex] = cloneWorldPoint(point);
  return geometry;
}

function insertWorldGeometryVertex(worldGeometry = {}, segmentIndex = -1, point = {}) {
  const geometry = JSON.parse(JSON.stringify(worldGeometry || {}));
  if (geometry.type !== 'LineString' && geometry.type !== 'Polygon') return geometry;
  const closed = geometry.type === 'Polygon';
  const points = closed ? geometry.coordinates?.[0] || [] : geometry.coordinates || [];
  if (segmentIndex < 0 || segmentIndex >= points.length) return geometry;
  points.splice(segmentIndex + 1, 0, cloneWorldPoint(point));
  return geometry;
}

function removeWorldGeometryVertex(worldGeometry = {}, vertexIndex = -1) {
  const geometry = JSON.parse(JSON.stringify(worldGeometry || {}));
  if (geometry.type !== 'LineString' && geometry.type !== 'Polygon') return geometry;
  const points = geometry.type === 'Polygon' ? geometry.coordinates?.[0] || [] : geometry.coordinates || [];
  if (vertexIndex < 0 || vertexIndex >= points.length) return geometry;
  points.splice(vertexIndex, 1);
  return geometry;
}

function splitLineWorldGeometry(worldGeometry = {}, segmentIndex = -1, point = {}) {
  if (worldGeometry?.type !== 'LineString') return null;
  const points = cleanWorldLinePoints(worldGeometry.coordinates || []);
  if (points.length < 2 || segmentIndex < 0 || segmentIndex >= points.length - 1) return null;
  const splitPoint = cloneWorldPoint(point);
  const first = points.slice(0, segmentIndex + 1).concat([splitPoint]);
  const second = [splitPoint].concat(points.slice(segmentIndex + 1));
  return [
    { type: 'LineString', coordinates: first },
    { type: 'LineString', coordinates: second }
  ];
}

function mergeLineWorldGeometries(a = {}, b = {}, snapDistance = 6) {
  if (a?.type !== 'LineString' || b?.type !== 'LineString') return null;
  const lineA = cleanWorldLinePoints(a.coordinates || []);
  const lineB = cleanWorldLinePoints(b.coordinates || []);
  if (lineA.length < 2 || lineB.length < 2) return null;

  const candidates = [
    { a: 'end', b: 'start', distance: distance2d(lineA[lineA.length - 1], lineB[0]) },
    { a: 'start', b: 'end', distance: distance2d(lineA[0], lineB[lineB.length - 1]) },
    { a: 'start', b: 'start', distance: distance2d(lineA[0], lineB[0]) },
    { a: 'end', b: 'end', distance: distance2d(lineA[lineA.length - 1], lineB[lineB.length - 1]) }
  ].sort((left, right) => left.distance - right.distance);

  const best = candidates[0];
  if (!(best && best.distance <= snapDistance)) return null;

  let merged = [];
  if (best.a === 'end' && best.b === 'start') {
    merged = lineA.concat(lineB.slice(1));
  } else if (best.a === 'start' && best.b === 'end') {
    merged = lineB.concat(lineA.slice(1));
  } else if (best.a === 'start' && best.b === 'start') {
    merged = [...lineA].reverse().concat(lineB.slice(1));
  } else {
    merged = lineA.concat([...lineB].reverse().slice(1));
  }
  return {
    type: 'LineString',
    coordinates: cleanWorldLinePoints(merged)
  };
}

function distanceToWorldFeature(featureLike = {}, point = {}, options = {}) {
  const threshold = finiteNumber(options.maxDistance, Infinity);
  const geometry = geometryToWorldData(featureLike.geometry || {});
  if (geometry.type === 'Point') {
    const dist = distance2d(geometry.coordinates, point);
    return {
      distance: dist,
      target: geometry.coordinates,
      mode: 'point',
      inside: false
    };
  }
  if (geometry.type === 'LineString') {
    const segment = nearestSegmentIndex(geometry.coordinates, point, false, threshold);
    return {
      distance: segment.distance,
      target: segment.point ? { x: segment.point.x, z: segment.point.z } : null,
      mode: 'segment',
      inside: false,
      segmentIndex: segment.index
    };
  }
  const ring = Array.isArray(geometry.coordinates) ? geometry.coordinates[0] || [] : [];
  const segment = nearestSegmentIndex(ring, point, true, threshold);
  const inside = pointInPolygonWorld(point.x, point.z, ring);
  return {
    distance: inside ? 0 : segment.distance,
    target: inside ? point : segment.point ? { x: segment.point.x, z: segment.point.z } : null,
    mode: 'polygon',
    inside,
    segmentIndex: segment.index
  };
}

export {
  buildAxisAlignedWorldRing,
  cleanWorldLinePoints,
  cleanWorldRingPoints,
  cloneWorldPoint,
  distance2d,
  distanceToWorldFeature,
  featureWorldCenter,
  geoToWorldPoint,
  geometryToWorldData,
  insertWorldGeometryVertex,
  mergeLineWorldGeometries,
  nearestSegmentIndex,
  nearestVertexIndex,
  pointInPolygonWorld,
  projectPointToPolygonBoundary,
  projectPointToSegment2d,
  removeWorldGeometryVertex,
  sampleSurfaceY,
  signedAreaWorld,
  splitLineWorldGeometry,
  updateWorldGeometryVertex,
  worldDataToGeometry,
  worldToGeoPoint
};
