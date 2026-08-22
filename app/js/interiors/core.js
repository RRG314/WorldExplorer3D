import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildingLabel, pointToSegmentDistance } from "../building-entry.js?v=7";
import {
  INTERIOR_FETCH_RADIUS_PAD,
  INTERIOR_FLOOR_CLEARANCE,
  INTERIOR_FLOOR_OFFSET,
  INTERIOR_LEVEL_HEIGHT,
  INTERIOR_WALL_HEIGHT,
  INTERIOR_WALL_THICKNESS
} from "./constants.js?v=1";

export function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function isWalkModeActive() {
  return !!(
    appCtx.gameStarted &&
    !appCtx.paused &&
    !appCtx.onMoon &&
    !appCtx.droneMode &&
    appCtx.Walk &&
    appCtx.Walk.state?.mode === 'walk' &&
    appCtx.Walk.state.walker
  );
}

export function worldToGeo(x, z) {
  const lat = finiteNumber(appCtx.LOC?.lat, 0) - z / Math.max(1, finiteNumber(appCtx.SCALE, 1));
  const cosLat = Math.cos(lat * Math.PI / 180) || 1;
  const lon = finiteNumber(appCtx.LOC?.lon, 0) + x / (Math.max(1, finiteNumber(appCtx.SCALE, 1)) * cosLat);
  return { lat, lon };
}

export function parseLevelValue(raw) {
  const text = String(raw || '').trim();
  if (!text) return 0;
  const first = text.split(/[;,]/)[0]?.trim() || '';
  const mapped = first.toUpperCase();
  if (mapped === 'G' || mapped === 'GF' || mapped === 'GROUND') return 0;
  if (mapped === 'B' || mapped === 'BASEMENT') return -1;
  const n = Number.parseFloat(first);
  return Number.isFinite(n) ? n : 0;
}

export function ringArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return area * 0.5;
}

export function ringAreaAbs(points) {
  return Math.abs(ringArea(points));
}

export function footprintBounds(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, depth: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ)
  };
}

export function polygonCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < points.length; i++) {
    sumX += points[i].x;
    sumZ += points[i].z;
  }
  return { x: sumX / points.length, z: sumZ / points.length };
}

export function pointInPolygonSafe(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  if (typeof appCtx.pointInPolygon === 'function') {
    return appCtx.pointInPolygon(x, z, polygon) === true;
  }
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

export function cleanLinePoints(points) {
  if (!Array.isArray(points)) return [];
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    const last = out[out.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < 0.2) continue;
    out.push({ x: point.x, z: point.z });
  }
  return out;
}

export function cleanRingPoints(points) {
  const line = cleanLinePoints(points);
  if (line.length >= 2) {
    const first = line[0];
    const last = line[line.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.35) {
      line.pop();
    }
  }
  return line.length >= 3 ? line : [];
}

export function sampleSurfaceY(x, z, fallback = 0) {
  const y = appCtx.SurfaceQuery?.walkAt?.(x, z)?.position?.y;
  if (Number.isFinite(y)) return y;
  return Number.isFinite(fallback) ? fallback : 0;
}

export function percentile(values, ratio = 0.5) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const clamped = Math.max(0, Math.min(1, ratio));
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * clamped)));
  return sorted[index];
}

export function polygonSamplePoints(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const samples = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    samples.push({ x: a.x, z: a.z });
    samples.push({ x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 });
  }
  return samples;
}

export function footprintInteriorSamplePoints(points, steps = 4) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const bounds = footprintBounds(points);
  const out = [];
  for (let gx = 0; gx <= steps; gx++) {
    for (let gz = 0; gz <= steps; gz++) {
      const point = {
        x: bounds.minX + bounds.width * (gx / Math.max(1, steps)),
        z: bounds.minZ + bounds.depth * (gz / Math.max(1, steps))
      };
      if (pointInPolygonSafe(point.x, point.z, points)) out.push(point);
    }
  }
  return out;
}

export function estimateInteriorFloorBaseY(building, footprint, centroid, entrances = [], desiredPoint = null) {
  const surfaceSamples = [];
  const fallbackBase = finiteNumber(building?.baseY, 0);
  if (Number.isFinite(fallbackBase)) surfaceSamples.push(fallbackBase);

  polygonSamplePoints(footprint).forEach((point) => {
    const y = sampleSurfaceY(point.x, point.z, fallbackBase);
    if (Number.isFinite(y)) surfaceSamples.push(y);
  });
  footprintInteriorSamplePoints(footprint, 4).forEach((point) => {
    const y = sampleSurfaceY(point.x, point.z, fallbackBase);
    if (Number.isFinite(y)) surfaceSamples.push(y);
  });
  entrances.forEach((entry) => {
    const y = sampleSurfaceY(entry.x, entry.z, fallbackBase);
    if (Number.isFinite(y)) surfaceSamples.push(y);
  });
  if (desiredPoint) {
    const y = sampleSurfaceY(desiredPoint.x, desiredPoint.z, fallbackBase);
    if (Number.isFinite(y)) surfaceSamples.push(y);
  }
  if (centroid) {
    const y = sampleSurfaceY(centroid.x, centroid.z, fallbackBase);
    if (Number.isFinite(y)) surfaceSamples.push(y);
  }

  const perimeterFloor = percentile(surfaceSamples, entrances.length > 0 ? 0.88 : 0.82);
  const maxSurface = surfaceSamples.reduce((best, value) => Number.isFinite(value) ? Math.max(best, value) : best, -Infinity);
  const safeFloor = Math.max(
    fallbackBase,
    Number.isFinite(perimeterFloor) ? perimeterFloor : -Infinity,
    Number.isFinite(maxSurface) ? maxSurface : -Infinity
  );
  if (Number.isFinite(safeFloor)) return safeFloor + INTERIOR_FLOOR_CLEARANCE - INTERIOR_FLOOR_OFFSET;
  return fallbackBase + INTERIOR_FLOOR_CLEARANCE - INTERIOR_FLOOR_OFFSET;
}

export function pickInteriorLevel(features, entrances, building) {
  const counts = new Map();
  features.forEach((feature) => {
    const level = Number.isFinite(feature.level) ? feature.level : 0;
    counts.set(level, (counts.get(level) || 0) + (feature.kind === 'polygon' ? 2 : 1));
  });
  entrances.forEach((entry) => {
    const level = Number.isFinite(entry.level) ? entry.level : 0;
    counts.set(level, (counts.get(level) || 0) + 1);
  });

  if (counts.size === 0) return 0;
  let bestLevel = 0;
  let bestScore = -Infinity;
  counts.forEach((score, level) => {
    const normalized = score - Math.abs(level) * 0.2 + (level === 0 ? 0.35 : 0);
    if (normalized > bestScore) {
      bestScore = normalized;
      bestLevel = level;
    }
  });

  const buildingLevels = Number.isFinite(building?.levels) ? Math.max(1, Math.round(building.levels)) : null;
  if (buildingLevels && bestLevel >= buildingLevels) return Math.max(0, buildingLevels - 1);
  return bestLevel;
}

export function createShapeFromPoints(points) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  return shape;
}

export function makeRibbonGeometry(points, width) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const halfWidth = Math.max(0.5, Number(width) || 1.4) * 0.5;
  const verts = [];
  const indices = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    verts.push(p.x + nx * halfWidth, 0, p.z + nz * halfWidth);
    verts.push(p.x - nx * halfWidth, 0, p.z - nz * halfWidth);
    if (i < points.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }
  if (verts.length < 12) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function projectPointToPolygonRing(point, ring) {
  if (!point || !Array.isArray(ring) || ring.length < 3) return null;
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % ring.length];
    const hit = pointToSegmentDistance(point.x, point.z, p1, p2);
    if (!best || hit.dist < best.dist) best = hit;
  }
  return best;
}

export function chooseInteriorSpawnPoint(desiredPoint, walkSurfaces, fallbackPoint = null) {
  if (!Array.isArray(walkSurfaces) || walkSurfaces.length === 0) return fallbackPoint || desiredPoint || null;
  const desired = desiredPoint || fallbackPoint || null;
  if (!desired) return null;

  let bestLine = null;
  let bestPolygon = null;
  let polygonFallback = null;

  for (let i = 0; i < walkSurfaces.length; i++) {
    const surface = walkSurfaces[i];
    if (!surface) continue;

    if (surface.kind === 'polygon' && Array.isArray(surface.pts) && surface.pts.length >= 3) {
      if (pointInPolygonSafe(desired.x, desired.z, surface.pts)) return { x: desired.x, z: desired.z, y: surface.y };

      const centroid = polygonCentroid(surface.pts);
      const ringHit = projectPointToPolygonRing(desired, surface.pts);
      if (centroid && ringHit) {
        const score = ringHit.dist;
        if (!polygonFallback || score < polygonFallback.score) {
          polygonFallback = { x: centroid.x, z: centroid.z, y: surface.y, score };
        }
      }
      if (!bestPolygon && centroid) bestPolygon = { x: centroid.x, z: centroid.z, y: surface.y };
      continue;
    }

    if (surface.kind === 'line' && Array.isArray(surface.pts) && surface.pts.length >= 2) {
      for (let p = 0; p < surface.pts.length - 1; p++) {
        const hit = pointToSegmentDistance(desired.x, desired.z, surface.pts[p], surface.pts[p + 1]);
        const widthAllowance = Math.max(0.75, Number(surface.halfWidth || 1));
        const score = Math.max(0, hit.dist - widthAllowance);
        if (!bestLine || score < bestLine.score) {
          bestLine = { x: hit.x, z: hit.z, y: surface.y, score };
        }
      }
    }
  }

  if (polygonFallback) return polygonFallback;
  if (bestLine) return bestLine;
  if (bestPolygon) return bestPolygon;
  return fallbackPoint || desiredPoint || null;
}

export function createWallCollider(p1, p2, baseY, height = INTERIOR_WALL_HEIGHT, thickness = INTERIOR_WALL_THICKNESS) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 0.2)) return null;
  const nx = -dz / len;
  const nz = dx / len;
  const hw = thickness * 0.5;
  const pts = [
    { x: p1.x + nx * hw, z: p1.z + nz * hw },
    { x: p1.x - nx * hw, z: p1.z - nz * hw },
    { x: p2.x - nx * hw, z: p2.z - nz * hw },
    { x: p2.x + nx * hw, z: p2.z + nz * hw }
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  pts.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  return {
    pts,
    minX,
    maxX,
    minZ,
    maxZ,
    baseY,
    height,
    centerX: (p1.x + p2.x) * 0.5,
    centerZ: (p1.z + p2.z) * 0.5,
    sourceBuildingId: 'interior-wall',
    buildingType: 'interior_wall',
    colliderDetail: 'full',
    isInteriorCollider: true
  };
}

export function addWallMesh(group, p1, p2, y, material, height = INTERIOR_WALL_HEIGHT, thickness = INTERIOR_WALL_THICKNESS) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 0.2)) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, thickness), material);
  mesh.position.set((p1.x + p2.x) * 0.5, y + height * 0.5, (p1.z + p2.z) * 0.5);
  mesh.rotation.y = Math.atan2(-dz, dx);
  group.add(mesh);
  return mesh;
}

export function addBackdropRoomMesh(group, bounds, floorY, material, height = INTERIOR_WALL_HEIGHT) {
  if (!bounds || !(bounds.width > 1) || !(bounds.depth > 1)) return null;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + 0.18, height, bounds.depth + 0.18),
    material
  );
  mesh.position.set((bounds.minX + bounds.maxX) * 0.5, floorY + height * 0.5, (bounds.minZ + bounds.maxZ) * 0.5);
  group.add(mesh);
  return mesh;
}

export function addFlatSurfaceMesh(group, points, y, material, tessellation = 8) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const shape = createShapeFromPoints(points);
  const geometry = new THREE.ShapeGeometry(shape, tessellation);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  group.add(mesh);
  return mesh;
}

export function createInteriorCacheEntry(interiorCache, definition) {
  if (!definition || !definition.key) return definition;
  const normalized = {
    ...definition,
    status: 'ready',
    fetchedAt: Date.now()
  };
  interiorCache.set(normalized.key, normalized);
  return normalized;
}

export function createGeneratedInteriorDefinition(interiorCache, support, options = {}) {
  return createInteriorCacheEntry(interiorCache, {
    key: support.key,
    label: support.label || buildingLabel(support.building || support.destination),
    mode: 'generated',
    support,
    building: support.building,
    selectedLevel: 0,
    features: [],
    entrances: [],
    rawFeatureCount: 0,
    rawEntranceCount: 0,
    reason: String(options.reason || 'fallback')
  });
}

export function pointInsideBuilding(point, building) {
  if (!point || !building) return false;
  if (
    point.x < finiteNumber(building.minX, 0) - 2 ||
    point.x > finiteNumber(building.maxX, 0) + 2 ||
    point.z < finiteNumber(building.minZ, 0) - 2 ||
    point.z > finiteNumber(building.maxZ, 0) + 2
  ) {
    return false;
  }
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    return pointInPolygonSafe(point.x, point.z, building.pts);
  }
  return true;
}

export function buildingGeoBounds(building) {
  const minX = finiteNumber(building?.minX, 0) - INTERIOR_FETCH_RADIUS_PAD;
  const maxX = finiteNumber(building?.maxX, 0) + INTERIOR_FETCH_RADIUS_PAD;
  const minZ = finiteNumber(building?.minZ, 0) - INTERIOR_FETCH_RADIUS_PAD;
  const maxZ = finiteNumber(building?.maxZ, 0) + INTERIOR_FETCH_RADIUS_PAD;
  const sw = worldToGeo(minX, maxZ);
  const ne = worldToGeo(maxX, minZ);
  return {
    south: Math.min(sw.lat, ne.lat),
    west: Math.min(sw.lon, ne.lon),
    north: Math.max(sw.lat, ne.lat),
    east: Math.max(sw.lon, ne.lon)
  };
}

export function isClosedWay(way, nodesById) {
  if (!Array.isArray(way?.nodes) || way.nodes.length < 3) return false;
  if (way.nodes[0] === way.nodes[way.nodes.length - 1]) return true;
  const first = nodesById.get(way.nodes[0]);
  const last = nodesById.get(way.nodes[way.nodes.length - 1]);
  if (!first || !last) return false;
  return Math.hypot(first.lon - last.lon, first.lat - last.lat) < 1e-7;
}

export function wayWorldPoints(way, nodesById) {
  if (!Array.isArray(way?.nodes)) return [];
  return way.nodes
    .map((id) => nodesById.get(id))
    .filter(Boolean)
    .map((node) => appCtx.geoToWorld(node.lat, node.lon));
}
