import { ctx as appCtx } from "./shared-context.js?v=55";
import {
  buildingFootprintPoints,
  buildingKey,
  buildingLabel,
  distanceToFootprint,
  listEnterableBuildingSupportsNear,
  pickNearbyEnterableBuildingSupport,
  pointToSegmentDistance,
  summarizeSupportType
} from "./building-entry.js?v=2";

const INTERIOR_FETCH_TIMEOUT_MS = 7000;
const INTERIOR_FETCH_RADIUS_PAD = 18;
const INTERIOR_ENTRY_RADIUS = 8.5;
const INTERIOR_LEVEL_HEIGHT = 3.4;
const INTERIOR_WALL_HEIGHT = 3.15;
const INTERIOR_WALL_THICKNESS = 0.32;
const INTERIOR_FLOOR_OFFSET = 0.03;
const INTERIOR_FLOOR_CLEARANCE = 0.12;
const INTERIOR_SHELL_CLEARANCE = INTERIOR_WALL_THICKNESS * 0.5 + 0.08;
const INTERIOR_NOTICE_MS = 2600;
const INTERIOR_INTERACTION_REFRESH_MS = 120;
const INTERIOR_INTERACTION_MOVE_EPSILON = 0.75;
const INTERIOR_FAST_ENTRY_WAIT_MS = 850;

const interiorCache = new Map();
const mappedInteriorWarmPromises = new Map();

let transientHint = { text: '', until: 0 };
let candidateCache = { at: 0, x: NaN, z: NaN, candidate: null };
let lastPromptState = { text: '', variant: '' };
let nearbyInteriorScanPromise = null;

function ensurePromptElement() {
  return document.getElementById('interiorPrompt');
}

function setPrompt(text, variant = 'inspect') {
  const el = ensurePromptElement();
  if (!el) return;
  const message = String(text || '').trim();
  if (lastPromptState.text === message && lastPromptState.variant === variant) return;
  lastPromptState = { text: message, variant };
  if (!message) {
    el.classList.remove('show');
    el.textContent = '';
    delete el.dataset.variant;
    return;
  }
  el.textContent = message;
  el.dataset.variant = variant;
  el.classList.add('show');
}

function clearPrompt() {
  setPrompt('');
}

function setTransientHint(text, durationMs = INTERIOR_NOTICE_MS) {
  transientHint = {
    text: String(text || '').trim(),
    until: performance.now() + Math.max(900, durationMs)
  };
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isWalkModeActive() {
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

function worldToGeo(x, z) {
  const lat = finiteNumber(appCtx.LOC?.lat, 0) - z / Math.max(1, finiteNumber(appCtx.SCALE, 1));
  const cosLat = Math.cos(lat * Math.PI / 180) || 1;
  const lon = finiteNumber(appCtx.LOC?.lon, 0) + x / (Math.max(1, finiteNumber(appCtx.SCALE, 1)) * cosLat);
  return { lat, lon };
}

function parseLevelValue(raw) {
  const text = String(raw || '').trim();
  if (!text) return 0;
  const first = text.split(/[;,]/)[0]?.trim() || '';
  const mapped = first.toUpperCase();
  if (mapped === 'G' || mapped === 'GF' || mapped === 'GROUND') return 0;
  if (mapped === 'B' || mapped === 'BASEMENT') return -1;
  const n = Number.parseFloat(first);
  return Number.isFinite(n) ? n : 0;
}

function ringArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return area * 0.5;
}

function ringAreaAbs(points) {
  return Math.abs(ringArea(points));
}

function footprintBounds(points) {
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

function polygonCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < points.length; i++) {
    sumX += points[i].x;
    sumZ += points[i].z;
  }
  return { x: sumX / points.length, z: sumZ / points.length };
}

function pointInPolygonSafe(x, z, polygon) {
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

function cleanLinePoints(points) {
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

function cleanRingPoints(points) {
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
  return Number.isFinite(fallback) ? fallback : 0;
}

function percentile(values, ratio = 0.5) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const clamped = Math.max(0, Math.min(1, ratio));
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * clamped)));
  return sorted[index];
}

function polygonSamplePoints(points) {
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

function footprintInteriorSamplePoints(points, steps = 4) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const bounds = footprintBounds(points);
  const out = [];
  for (let gx = 0; gx <= steps; gx++) {
    for (let gz = 0; gz <= steps; gz++) {
      const point = {
        x: bounds.minX + bounds.width * (gx / Math.max(1, steps)),
        z: bounds.minZ + bounds.depth * (gz / Math.max(1, steps))
      };
      if (pointInPolygonSafe(point.x, point.z, points)) {
        out.push(point);
      }
    }
  }
  return out;
}

function estimateInteriorFloorBaseY(building, footprint, centroid, entrances = [], desiredPoint = null) {
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
  if (Number.isFinite(safeFloor)) {
    return safeFloor + INTERIOR_FLOOR_CLEARANCE - INTERIOR_FLOOR_OFFSET;
  }
  return fallbackBase + INTERIOR_FLOOR_CLEARANCE - INTERIOR_FLOOR_OFFSET;
}

function pickInteriorLevel(features, entrances, building) {
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
  if (buildingLevels && bestLevel >= buildingLevels) {
    return Math.max(0, buildingLevels - 1);
  }
  return bestLevel;
}

function createShapeFromPoints(points) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  return shape;
}

function makeRibbonGeometry(points, width) {
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

function projectPointToPolygonRing(point, ring) {
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

function chooseInteriorSpawnPoint(desiredPoint, walkSurfaces, fallbackPoint = null) {
  if (!Array.isArray(walkSurfaces) || walkSurfaces.length === 0) {
    return fallbackPoint || desiredPoint || null;
  }
  const desired = desiredPoint || fallbackPoint || null;
  if (!desired) return null;

  let bestLine = null;
  let bestPolygon = null;
  let polygonFallback = null;

  for (let i = 0; i < walkSurfaces.length; i++) {
    const surface = walkSurfaces[i];
    if (!surface) continue;

    if (surface.kind === 'polygon' && Array.isArray(surface.pts) && surface.pts.length >= 3) {
      if (pointInPolygonSafe(desired.x, desired.z, surface.pts)) {
        return { x: desired.x, z: desired.z, y: surface.y };
      }

      const centroid = polygonCentroid(surface.pts);
      const ringHit = projectPointToPolygonRing(desired, surface.pts);
      if (centroid && ringHit) {
        const score = ringHit.dist;
        if (!polygonFallback || score < polygonFallback.score) {
          polygonFallback = { x: centroid.x, z: centroid.z, y: surface.y, score };
        }
      }
      if (!bestPolygon && centroid) {
        bestPolygon = { x: centroid.x, z: centroid.z, y: surface.y };
      }
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

function createWallCollider(p1, p2, baseY, height = INTERIOR_WALL_HEIGHT, thickness = INTERIOR_WALL_THICKNESS) {
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

function addWallMesh(group, p1, p2, y, material, height = INTERIOR_WALL_HEIGHT, thickness = INTERIOR_WALL_THICKNESS) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 0.2)) return null;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len, height, thickness),
    material
  );
  mesh.position.set((p1.x + p2.x) * 0.5, y + height * 0.5, (p1.z + p2.z) * 0.5);
  mesh.rotation.y = Math.atan2(dx, dz);
  group.add(mesh);
  return mesh;
}

function addBackdropRoomMesh(group, bounds, floorY, material, height = INTERIOR_WALL_HEIGHT) {
  if (!bounds || !(bounds.width > 1) || !(bounds.depth > 1)) return null;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + 0.18, height, bounds.depth + 0.18),
    material
  );
  mesh.position.set(
    (bounds.minX + bounds.maxX) * 0.5,
    floorY + height * 0.5,
    (bounds.minZ + bounds.maxZ) * 0.5
  );
  group.add(mesh);
  return mesh;
}

function addFlatSurfaceMesh(group, points, y, material, tessellation = 8) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const shape = createShapeFromPoints(points);
  const geometry = new THREE.ShapeGeometry(shape, tessellation);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  group.add(mesh);
  return mesh;
}

function snapshotMaterialState(material) {
  if (!material) return null;
  return {
    material,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite
  };
}

function eachMeshMaterial(mesh, callback) {
  if (!mesh?.material || typeof callback !== 'function') return [];
  if (Array.isArray(mesh.material)) {
    return mesh.material.map((material) => callback(material)).filter(Boolean);
  }
  const result = callback(mesh.material);
  return result ? [result] : [];
}

function prepareExteriorShellForInterior(building) {
  const key = buildingKey(building);
  const states = [];
  if (!Array.isArray(appCtx.buildingMeshes)) return states;
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    const meshKey = mesh?.userData?.sourceBuildingId ? String(mesh.userData.sourceBuildingId) : '';
    if (!mesh || meshKey !== key) continue;
    const isPrimaryShell = Array.isArray(mesh.userData?.buildingFootprint) && mesh.userData.buildingFootprint.length >= 3;
    states.push({
      mesh,
      visible: mesh.visible,
      materialStates: eachMeshMaterial(mesh, snapshotMaterialState)
    });
    if (isPrimaryShell) {
      mesh.visible = true;
      eachMeshMaterial(mesh, (material) => {
        material.side = THREE.DoubleSide;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        return null;
      });
      continue;
    }
    mesh.visible = false;
  }
  return states;
}

function restoreExteriorShellState(states) {
  if (!Array.isArray(states)) return;
  states.forEach((state) => {
    if (!state?.mesh) return;
    state.mesh.visible = state.visible !== false;
    if (!Array.isArray(state.materialStates)) return;
    state.materialStates.forEach((materialState) => {
      if (!materialState?.material) return;
      materialState.material.side = materialState.side;
      materialState.material.transparent = materialState.transparent;
      materialState.material.opacity = materialState.opacity;
      materialState.material.depthWrite = materialState.depthWrite;
    });
  });
}

function boundsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return !(
    a.maxX < b.minX - pad ||
    a.minX > b.maxX + pad ||
    a.maxZ < b.minZ - pad ||
    a.minZ > b.maxZ + pad
  );
}

function meshWorldBounds2D(mesh) {
  if (!mesh?.geometry) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox;
  if (!bbox) return null;
  mesh.updateMatrixWorld?.(true);
  const min = bbox.min.clone().applyMatrix4(mesh.matrixWorld);
  const max = bbox.max.clone().applyMatrix4(mesh.matrixWorld);
  return {
    minX: Math.min(min.x, max.x),
    maxX: Math.max(min.x, max.x),
    minZ: Math.min(min.z, max.z),
    maxZ: Math.max(min.z, max.z)
  };
}

function collectInteriorWorldSuppressionStates(footprint, center, radius = 42) {
  const states = [];
  if (!Array.isArray(footprint) || footprint.length < 3) return states;
  const footprintBox = footprintBounds(footprint);
  const refX = finiteNumber(center?.x, (footprintBox.minX + footprintBox.maxX) * 0.5);
  const refZ = finiteNumber(center?.z, (footprintBox.minZ + footprintBox.maxZ) * 0.5);
  const meshLists = [
    appCtx.roadMeshes,
    appCtx.landuseMeshes,
    appCtx.vegetationMeshes,
    appCtx.poiMeshes,
    appCtx.streetFurnitureMeshes
  ];

  meshLists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((mesh) => {
      if (!mesh || mesh.visible === false) return;
      const bounds = meshWorldBounds2D(mesh);
      if (!bounds || !boundsOverlap(bounds, footprintBox, 1.2)) return;
      const cx = (bounds.minX + bounds.maxX) * 0.5;
      const cz = (bounds.minZ + bounds.maxZ) * 0.5;
      if (Math.hypot(cx - refX, cz - refZ) > radius) return;
      states.push({ mesh, visible: mesh.visible !== false });
      mesh.visible = false;
    });
  });

  return states;
}

function restoreInteriorWorldSuppression(states) {
  if (!Array.isArray(states)) return;
  states.forEach((state) => {
    if (!state?.mesh) return;
    state.mesh.visible = state.visible !== false;
  });
}

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry?.dispose) obj.geometry.dispose();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((material) => material?.dispose && material.dispose());
    } else if (obj.material?.dispose) {
      obj.material.dispose();
    }
  });
  if (root.parent) root.parent.remove(root);
}

function resetInteriorInteractionCache() {
  candidateCache = { at: 0, x: NaN, z: NaN, candidate: null };
}

function interiorReferencePosition() {
  if (appCtx.Walk && typeof appCtx.Walk.getMapRefPosition === 'function') {
    return appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone);
  }
  return {
    x: finiteNumber(appCtx.car?.x, 0),
    z: finiteNumber(appCtx.car?.z, 0)
  };
}

function shortLabel(label, max = 30) {
  const text = String(label || 'Building').trim() || 'Building';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function currentSupportDisplayType(support) {
  const cached = support?.key ? interiorCache.get(support.key) : null;
  const mappedState = cached?.mode === 'mapped' ? 'mapped' : cached?.mode === 'generated' ? 'generated' : 'unknown';
  return summarizeSupportType(support, mappedState);
}

function publishInteriorLegendState({ loading = false, message = '', items = null } = {}) {
  const ref = interiorReferencePosition();
  if (items === null) {
    items = listSupportedInteriorsNear(ref.x, ref.z);
  }
  appCtx.interiorLegendLoading = !!loading;
  appCtx.interiorLegendMessage = String(message || '');
  appCtx.interiorLegendEntries = Array.isArray(items) ? items : [];
  if (typeof appCtx.renderInteriorLegend === 'function') {
    appCtx.renderInteriorLegend();
  }
}

function createInteriorCacheEntry(definition) {
  if (!definition || !definition.key) return definition;
  const normalized = {
    ...definition,
    status: 'ready',
    fetchedAt: Date.now()
  };
  interiorCache.set(normalized.key, normalized);
  return normalized;
}

function createGeneratedInteriorDefinition(support, options = {}) {
  return createInteriorCacheEntry({
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

function polygonEdgeClearance(point, polygon) {
  const hit = projectPointToPolygonRing(point, polygon);
  return Number.isFinite(hit?.dist) ? hit.dist : 0;
}

function buildEdgeSamplePoints(points, samplesPerEdge = 3) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    out.push({ x: a.x, z: a.z });
    for (let step = 1; step <= samplesPerEdge; step++) {
      const t = step / (samplesPerEdge + 1);
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t
      });
    }
  }
  return out;
}

function footprintFullyContained(inner, outer, minClearance = 0.05) {
  if (!Array.isArray(inner) || inner.length < 3 || !Array.isArray(outer) || outer.length < 3) return false;
  const samples = buildEdgeSamplePoints(inner, 3);
  if (samples.length === 0) return false;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (!pointInPolygonSafe(point.x, point.z, outer)) return false;
    if (polygonEdgeClearance(point, outer) < minClearance) return false;
  }
  return true;
}

function footprintMinimumClearance(inner, outer) {
  if (!Array.isArray(inner) || inner.length < 3 || !Array.isArray(outer) || outer.length < 3) return 0;
  const samples = buildEdgeSamplePoints(inner, 3);
  if (samples.length === 0) return 0;
  let minClearance = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (!pointInPolygonSafe(point.x, point.z, outer)) return 0;
    minClearance = Math.min(minClearance, polygonEdgeClearance(point, outer));
  }
  return Number.isFinite(minClearance) ? minClearance : 0;
}

function findInteriorAnchor(footprint) {
  if (!Array.isArray(footprint) || footprint.length < 3) return null;
  const bounds = footprintBounds(footprint);
  const centroid = polygonCentroid(footprint);
  const candidates = [];

  if (centroid) candidates.push({ x: centroid.x, z: centroid.z });
  candidates.push({
    x: (bounds.minX + bounds.maxX) * 0.5,
    z: (bounds.minZ + bounds.maxZ) * 0.5
  });

  polygonSamplePoints(footprint).forEach((point) => {
    candidates.push({ x: point.x, z: point.z });
  });

  const steps = 5;
  for (let gx = 0; gx <= steps; gx++) {
    for (let gz = 0; gz <= steps; gz++) {
      candidates.push({
        x: bounds.minX + bounds.width * (gx / steps),
        z: bounds.minZ + bounds.depth * (gz / steps)
      });
    }
  }

  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const point = candidates[i];
    if (!pointInPolygonSafe(point.x, point.z, footprint)) continue;
    const clearance = polygonEdgeClearance(point, footprint);
    if (!best || clearance > best.clearance) {
      best = { point, clearance };
    }
  }

  return best?.point || centroid || {
    x: (bounds.minX + bounds.maxX) * 0.5,
    z: (bounds.minZ + bounds.maxZ) * 0.5
  };
}

function buildContainedRectFootprint(footprint, center, minClearance = INTERIOR_SHELL_CLEARANCE) {
  if (!Array.isArray(footprint) || footprint.length < 3 || !center) return [];
  const bounds = footprintBounds(footprint);
  const maxHalfWidth = Math.max(0, bounds.width * 0.5 - minClearance);
  const maxHalfDepth = Math.max(0, bounds.depth * 0.5 - minClearance);
  if (!(maxHalfWidth > 0.75) || !(maxHalfDepth > 0.75)) return [];

  const baseHalfWidth = Math.min(Math.max(1.4, bounds.width * 0.42), maxHalfWidth);
  const baseHalfDepth = Math.min(Math.max(1.4, bounds.depth * 0.42), maxHalfDepth);
  const scales = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4, 0.34, 0.28, 0.22];

  for (let i = 0; i < scales.length; i++) {
    const scale = scales[i];
    const halfWidth = Math.max(0.8, Math.min(baseHalfWidth * scale, maxHalfWidth));
    const halfDepth = Math.max(0.8, Math.min(baseHalfDepth * scale, maxHalfDepth));
    const rect = [
      { x: center.x - halfWidth, z: center.z - halfDepth },
      { x: center.x + halfWidth, z: center.z - halfDepth },
      { x: center.x + halfWidth, z: center.z + halfDepth },
      { x: center.x - halfWidth, z: center.z + halfDepth }
    ];
    if (footprintFullyContained(rect, footprint, minClearance) && ringAreaAbs(rect) >= 6) {
      return rect;
    }
  }

  return [];
}

function buildUsableFootprint(points) {
  const footprint = cleanRingPoints(points);
  if (footprint.length < 3) return [];
  const centroid = findInteriorAnchor(footprint);
  if (!centroid) return footprint;

  const bounds = footprintBounds(footprint);
  const minDimension = Math.min(bounds.width, bounds.depth);
  const inset = Math.max(0.35, Math.min(1.25, minDimension * 0.06));
  const scaled = footprint.map((point) => {
    const dx = centroid.x - point.x;
    const dz = centroid.z - point.z;
    const dist = Math.hypot(dx, dz) || 1;
    const push = Math.min(inset, dist * 0.24);
    return {
      x: point.x + dx / dist * push,
      z: point.z + dz / dist * push
    };
  });

  const cleaned = cleanRingPoints(scaled);
  if (cleaned.length < 3) return footprint;
  const originalArea = ringAreaAbs(footprint);
  const nextArea = ringAreaAbs(cleaned);
  if (
    nextArea > 10 &&
    nextArea < originalArea * 0.97 &&
    footprintFullyContained(cleaned, footprint, INTERIOR_SHELL_CLEARANCE)
  ) {
    return cleaned;
  }

  const rectFallback = buildContainedRectFootprint(footprint, centroid, INTERIOR_SHELL_CLEARANCE);
  if (rectFallback.length >= 3) {
    return rectFallback;
  }

  return footprint;
}

function constrainPointToFootprint(point, footprint, centroid, margin = 0.28) {
  if (!point || !Array.isArray(footprint) || footprint.length < 3) return null;
  const center = centroid || polygonCentroid(footprint) || point;
  let candidate = { x: finiteNumber(point.x, center.x), z: finiteNumber(point.z, center.z) };

  const ringHit = projectPointToPolygonRing(candidate, footprint);
  if (!ringHit) return candidate;

  if (pointInPolygonSafe(candidate.x, candidate.z, footprint) && ringHit.dist >= margin) {
    return candidate;
  }

  const base = {
    x: ringHit.x,
    z: ringHit.z
  };
  const dx = center.x - base.x;
  const dz = center.z - base.z;
  const len = Math.hypot(dx, dz) || 1;
  candidate = {
    x: base.x + dx / len * Math.max(0.22, margin),
    z: base.z + dz / len * Math.max(0.22, margin)
  };
  return pointInPolygonSafe(candidate.x, candidate.z, footprint) ? candidate : center;
}

function fitLineToFootprint(points, footprint, centroid) {
  const fitted = cleanLinePoints(points.map((point) => constrainPointToFootprint(point, footprint, centroid, 0.24)).filter(Boolean));
  return fitted.length >= 2 ? fitted : [];
}

function fitRingToFootprint(points, footprint, centroid) {
  const fitted = cleanRingPoints(points.map((point) => constrainPointToFootprint(point, footprint, centroid, 0.28)).filter(Boolean));
  if (fitted.length < 3) return [];
  if (ringAreaAbs(fitted) < 4) return [];
  return fitted;
}

function pointInsideBuilding(point, building) {
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

function buildingGeoBounds(building) {
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

function isClosedWay(way, nodesById) {
  if (!Array.isArray(way?.nodes) || way.nodes.length < 3) return false;
  if (way.nodes[0] === way.nodes[way.nodes.length - 1]) return true;
  const first = nodesById.get(way.nodes[0]);
  const last = nodesById.get(way.nodes[way.nodes.length - 1]);
  if (!first || !last) return false;
  return Math.hypot(first.lon - last.lon, first.lat - last.lat) < 1e-7;
}

function wayWorldPoints(way, nodesById) {
  if (!Array.isArray(way?.nodes)) return [];
  return way.nodes
    .map((id) => nodesById.get(id))
    .filter(Boolean)
    .map((node) => appCtx.geoToWorld(node.lat, node.lon));
}

async function fetchMappedInteriorDefinition(support) {
  if (!support?.enterable || !support.allowMappedData || typeof appCtx.fetchOverpassJSON !== 'function') {
    return null;
  }
  const building = support.building;
  if (!building || !Array.isArray(building.pts) || building.pts.length < 3) {
    return null;
  }

  const bounds = buildingGeoBounds(building);
  const bbox = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const query = `[out:json][timeout:${Math.floor(INTERIOR_FETCH_TIMEOUT_MS / 1000)}];(
    node["entrance"]${bbox};
    node["door"]${bbox};
    node["indoor"]${bbox};
    way["indoor"]${bbox};
    way["highway"="corridor"]${bbox};
  );out body;>;out skel qt;`;
  const centerGeo = worldToGeo(
    finiteNumber(building.centerX, (finiteNumber(building.minX, 0) + finiteNumber(building.maxX, 0)) * 0.5),
    finiteNumber(building.centerZ, (finiteNumber(building.minZ, 0) + finiteNumber(building.maxZ, 0)) * 0.5)
  );
  const data = await appCtx.fetchOverpassJSON(
    query,
    INTERIOR_FETCH_TIMEOUT_MS,
    performance.now() + INTERIOR_FETCH_TIMEOUT_MS + 400,
    {
      lat: centerGeo.lat,
      lon: centerGeo.lon,
      roadsRadius: 0,
      featureRadius: Math.max(0.00008, Math.abs(bounds.north - bounds.south)),
      poiRadius: Math.max(0.00008, Math.abs(bounds.east - bounds.west))
    }
  );

  const nodesById = new Map();
  (data?.elements || []).forEach((element) => {
    if (element?.type === 'node') nodesById.set(element.id, element);
  });

  const entrances = [];
  const features = [];
  const elements = Array.isArray(data?.elements) ? data.elements : [];

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (!element?.tags) continue;
    if (element.type === 'node' && (element.tags.entrance || element.tags.door)) {
      const point = appCtx.geoToWorld(element.lat, element.lon);
      const footprint = distanceToFootprint(point.x, point.z, building);
      if (!footprint.inside && footprint.dist > 5) continue;
      entrances.push({
        x: point.x,
        z: point.z,
        level: parseLevelValue(element.tags.level),
        kind: element.tags.entrance ? 'entrance' : 'door'
      });
      continue;
    }

    if (element.type !== 'way') continue;
    const indoorTag = String(element.tags.indoor || '').toLowerCase();
    const corridorTag = String(element.tags.highway || '').toLowerCase() === 'corridor';
    if (!indoorTag && !corridorTag) continue;

    const rawWorldPoints = wayWorldPoints(element, nodesById);
    if (rawWorldPoints.length < 2) continue;
    const closed = isClosedWay(element, nodesById);
    const level = parseLevelValue(element.tags.level);
    const name = String(element.tags.name || '').trim();
    const width = Math.max(1.1, Math.min(4.5, Number.parseFloat(element.tags.width) || (corridorTag ? 2.1 : 1.6)));

    if (closed) {
      const pts = cleanRingPoints(rawWorldPoints);
      if (pts.length < 3 || ringAreaAbs(pts) < 2) continue;
      const centroid = polygonCentroid(pts);
      if (!pointInsideBuilding(centroid, building)) continue;
      features.push({
        kind: 'polygon',
        indoorKind: indoorTag || 'room',
        level,
        name,
        width,
        pts
      });
      continue;
    }

    const pts = cleanLinePoints(rawWorldPoints);
    if (pts.length < 2) continue;
    let insideCount = 0;
    for (let p = 0; p < pts.length; p++) {
      if (pointInsideBuilding(pts[p], building)) insideCount += 1;
    }
    if (insideCount === 0) continue;
    features.push({
      kind: 'line',
      indoorKind: corridorTag ? 'corridor' : (indoorTag || 'corridor'),
      level,
      name,
      width,
      pts
    });
  }

  const selectedLevel = pickInteriorLevel(features, entrances, building);
  const selectedFeatures = features.filter((feature) => Math.abs(feature.level - selectedLevel) < 0.01);
  const selectedEntrances = entrances.filter((entry) => Math.abs(entry.level - selectedLevel) < 0.01);
  if (selectedFeatures.length === 0) return null;

  return createInteriorCacheEntry({
    key: support.key,
    label: support.label || buildingLabel(building),
    mode: 'mapped',
    support,
    building,
    selectedLevel,
    features: selectedFeatures,
    entrances: selectedEntrances,
    rawFeatureCount: features.length,
    rawEntranceCount: entrances.length
  });
}

function warmMappedInteriorDefinition(support) {
  if (!support?.enterable || !support.allowMappedData || !support.key) {
    return Promise.resolve(null);
  }
  const cached = interiorCache.get(support.key);
  if (cached?.status === 'ready' && cached.mode === 'mapped') {
    return Promise.resolve(cached);
  }
  const existing = mappedInteriorWarmPromises.get(support.key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      return await fetchMappedInteriorDefinition(support);
    } catch (error) {
      console.warn('[Interior] Mapped indoor fetch failed for', support.label || support.key, error);
      return null;
    } finally {
      mappedInteriorWarmPromises.delete(support.key);
    }
  })();
  mappedInteriorWarmPromises.set(support.key, promise);
  return promise;
}

async function resolveInteriorDefinitionForEntry(support) {
  if (!support?.enterable) return null;
  const cached = interiorCache.get(support.key);
  if (cached?.status === 'ready') return cached;

  let mappedResult = null;
  if (support.allowMappedData) {
    const warmPromise = warmMappedInteriorDefinition(support);
    mappedResult = await Promise.race([
      warmPromise,
      new Promise((resolve) => {
        window.setTimeout(() => resolve(null), INTERIOR_FAST_ENTRY_WAIT_MS);
      })
    ]);
  }

  if (mappedResult?.mode === 'mapped') {
    return mappedResult;
  }

  const generated = createGeneratedInteriorDefinition(support, {
    reason: support.allowMappedData ? 'fast_fallback' : 'generated_only'
  });
  if (support.allowMappedData) {
    warmMappedInteriorDefinition(support).then((definition) => {
      if (definition?.mode === 'mapped') {
        interiorCache.set(definition.key, definition);
      }
    }).catch(() => {});
  }
  return generated;
}

function makeLineFeature(points, width, indoorKind = 'corridor', name = '') {
  const pts = cleanLinePoints(points);
  if (pts.length < 2) return null;
  return {
    kind: 'line',
    indoorKind,
    level: 0,
    name,
    width,
    pts
  };
}

function buildGeneratedPartitions(footprint, centroid) {
  const bounds = footprintBounds(footprint);
  const width = bounds.width;
  const depth = bounds.depth;
  const partitions = [];
  const doorway = Math.max(1.5, Math.min(2.6, Math.min(width, depth) * 0.24));

  if (width >= depth && depth >= 9) {
    const leftX = centroid.x - width * 0.18;
    const rightX = centroid.x + width * 0.18;
    [
      [
        { x: leftX, z: bounds.minZ + 1.1 },
        { x: leftX, z: centroid.z - doorway * 0.5 }
      ],
      [
        { x: leftX, z: centroid.z + doorway * 0.5 },
        { x: leftX, z: bounds.maxZ - 1.1 }
      ],
      [
        { x: rightX, z: bounds.minZ + 1.1 },
        { x: rightX, z: centroid.z - doorway * 0.5 }
      ],
      [
        { x: rightX, z: centroid.z + doorway * 0.5 },
        { x: rightX, z: bounds.maxZ - 1.1 }
      ]
    ].forEach(([a, b]) => {
      const pts = fitLineToFootprint([a, b], footprint, centroid);
      if (pts.length >= 2 && Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) > 2.2) {
        partitions.push(pts);
      }
    });
    return partitions;
  }

  if (width >= 9) {
    [
      [
        { x: bounds.minX + 1.1, z: centroid.z - depth * 0.18 },
        { x: centroid.x - doorway * 0.5, z: centroid.z - depth * 0.18 }
      ],
      [
        { x: centroid.x + doorway * 0.5, z: centroid.z - depth * 0.18 },
        { x: bounds.maxX - 1.1, z: centroid.z - depth * 0.18 }
      ],
      [
        { x: bounds.minX + 1.1, z: centroid.z + depth * 0.18 },
        { x: centroid.x - doorway * 0.5, z: centroid.z + depth * 0.18 }
      ],
      [
        { x: centroid.x + doorway * 0.5, z: centroid.z + depth * 0.18 },
        { x: bounds.maxX - 1.1, z: centroid.z + depth * 0.18 }
      ]
    ].forEach(([a, b]) => {
      const pts = fitLineToFootprint([a, b], footprint, centroid);
      if (pts.length >= 2 && Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) > 2.2) {
        partitions.push(pts);
      }
    });
  }
  return partitions;
}

function createGeneratedInteriorPlan(definition, footprint, centroid) {
  return {
    features: [
      {
        kind: 'polygon',
        indoorKind: 'room',
        level: finiteNumber(definition?.selectedLevel, 0),
        name: definition.label || 'Interior',
        pts: footprint
      }
    ],
    partitions: []
  };
}

function prepareInteriorFeaturePlan(definition, shellFootprint, centroid) {
  if (definition.mode === 'mapped' && Array.isArray(definition.features) && definition.features.length > 0) {
    const fittedFeatures = [];
    for (let i = 0; i < definition.features.length; i++) {
      const feature = definition.features[i];
      if (feature.kind === 'polygon') {
        const pts = fitRingToFootprint(feature.pts, shellFootprint, centroid);
        if (pts.length >= 3) {
          fittedFeatures.push({ ...feature, pts });
        }
        continue;
      }
      if (feature.kind === 'line') {
        const pts = fitLineToFootprint(feature.pts, shellFootprint, centroid);
        if (pts.length >= 2) {
          fittedFeatures.push({ ...feature, pts });
        }
      }
    }
    if (fittedFeatures.length > 0) {
      return { mode: 'mapped', features: fittedFeatures, partitions: [] };
    }
  }
  const generated = createGeneratedInteriorPlan(definition, shellFootprint, centroid);
  return {
    mode: 'generated',
    features: generated.features,
    partitions: generated.partitions
  };
}

function buildInteriorScene(definition) {
  const support = definition.support;
  const building = support?.building || definition.building;
  const exteriorFootprint = buildingFootprintPoints(building);
  const baseShellFootprint = buildUsableFootprint(exteriorFootprint);
  const exteriorArea = ringAreaAbs(exteriorFootprint);
  const baseCentroid = findInteriorAnchor(baseShellFootprint) || findInteriorAnchor(exteriorFootprint) || {
    x: finiteNumber(building?.centerX, 0),
    z: finiteNumber(building?.centerZ, 0)
  };
  const generatedRoomFootprint = buildContainedRectFootprint(
    exteriorFootprint,
    baseCentroid,
    INTERIOR_SHELL_CLEARANCE + 0.2
  );
  let shellFootprint = baseShellFootprint;
  let centroid = baseCentroid;
  let featurePlan = prepareInteriorFeaturePlan(definition, shellFootprint, centroid);
  if (featurePlan.mode === 'generated' && generatedRoomFootprint.length >= 3) {
    shellFootprint = generatedRoomFootprint;
    centroid = findInteriorAnchor(shellFootprint) || centroid;
    featurePlan = prepareInteriorFeaturePlan(definition, shellFootprint, centroid);
  }

  const shellArea = ringAreaAbs(shellFootprint);
  const needsOuterEnvelope =
    featurePlan.mode === 'mapped' &&
    Array.isArray(exteriorFootprint) &&
    exteriorFootprint.length >= 3 &&
    shellArea > 0 &&
    shellArea < exteriorArea * 0.97;
  const shellClearanceMin = footprintMinimumClearance(shellFootprint, exteriorFootprint);

  let desiredEntry = support?.entryAnchor ? { ...support.entryAnchor } : centroid;
  const walker = appCtx.Walk?.state?.walker || null;
  if (Array.isArray(definition.entrances) && definition.entrances.length > 0) {
    let best = null;
    for (let i = 0; i < definition.entrances.length; i++) {
      const entry = definition.entrances[i];
      const dist = walker ? Math.hypot(entry.x - walker.x, entry.z - walker.z) : 0;
      if (!best || dist < best.dist) best = { entry, dist };
    }
    if (best?.entry) {
      desiredEntry = constrainPointToFootprint(best.entry, shellFootprint, centroid, 0.65) || desiredEntry;
    }
  } else {
    desiredEntry = constrainPointToFootprint(desiredEntry, shellFootprint, centroid, 0.65) || centroid;
  }

  const floorBaseY = estimateInteriorFloorBaseY(
    building,
    shellFootprint,
    centroid,
    Array.isArray(definition.entrances) ? definition.entrances : [],
    desiredEntry
  );
  const floorY = floorBaseY + finiteNumber(definition.selectedLevel, 0) * INTERIOR_LEVEL_HEIGHT;
  const group = new THREE.Group();
  group.name = `interior:${definition.key}`;

  const slabMaterial = new THREE.MeshStandardMaterial({
    color: 0x20242b,
    roughness: 0.92,
    metalness: 0.02
  });
  const roomMaterial = new THREE.MeshStandardMaterial({
    color: 0x596674,
    roughness: 0.84,
    metalness: 0.04
  });
  const envelopeFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0x36403a,
    roughness: 0.96,
    metalness: 0.01
  });
  const corridorMaterial = new THREE.MeshStandardMaterial({
    color: 0x434f5d,
    roughness: 0.88,
    metalness: 0.03
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9d2da,
    roughness: 0.95,
    metalness: 0.01
  });
  const accentWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c0c8,
    roughness: 0.94,
    metalness: 0.01
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe4e8ec,
    roughness: 0.97,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const generatedShellMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfd6dd,
    roughness: 0.97,
    metalness: 0,
    side: THREE.BackSide
  });
  const entryMaterial = new THREE.MeshStandardMaterial({
    color: 0x4cc9b0,
    emissive: 0x21564d,
    emissiveIntensity: 0.42,
    roughness: 0.6,
    metalness: 0.06
  });

  const walkSurfaces = [];
  const dynamicColliders = [];
  const placementTargets = [];

  const ambientLight = new THREE.HemisphereLight(0xf8fafc, 0x1a2330, 0.72);
  ambientLight.position.set(centroid.x, floorY + INTERIOR_WALL_HEIGHT * 0.92, centroid.z);
  group.add(ambientLight);

  const ceilingLight = new THREE.PointLight(0xf7f3ea, 0.82, 36, 2);
  ceilingLight.position.set(centroid.x, floorY + INTERIOR_WALL_HEIGHT - 0.32, centroid.z);
  group.add(ceilingLight);

  if (needsOuterEnvelope) {
    const envelopeFloor = addFlatSurfaceMesh(group, exteriorFootprint, floorY + INTERIOR_FLOOR_OFFSET - 0.012, envelopeFloorMaterial, 10);
    const envelopeCeiling = addFlatSurfaceMesh(group, exteriorFootprint, floorY + INTERIOR_WALL_HEIGHT, ceilingMaterial, 8);
    if (envelopeFloor) envelopeFloor.renderOrder = -1;
    if (envelopeCeiling) envelopeCeiling.renderOrder = 0;

    for (let i = 0; i < exteriorFootprint.length; i++) {
      const p1 = exteriorFootprint[i];
      const p2 = exteriorFootprint[(i + 1) % exteriorFootprint.length];
      addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET - 0.01, accentWallMaterial);
    }
  }

  const effectiveMode = featurePlan.mode;

  if (Array.isArray(shellFootprint) && shellFootprint.length >= 3) {
    if (effectiveMode === 'generated') {
      addBackdropRoomMesh(group, footprintBounds(shellFootprint), floorY + INTERIOR_FLOOR_OFFSET, generatedShellMaterial);
    }
    const slab = addFlatSurfaceMesh(group, shellFootprint, floorY + INTERIOR_FLOOR_OFFSET, slabMaterial, 12);
    const shellCeiling = addFlatSurfaceMesh(group, shellFootprint, floorY + INTERIOR_WALL_HEIGHT, ceilingMaterial, 8);
    if (slab) placementTargets.push(slab);
    if (shellCeiling) shellCeiling.renderOrder = 1;

    walkSurfaces.push({
      kind: 'polygon',
      pts: shellFootprint,
      y: floorY + INTERIOR_FLOOR_OFFSET
    });

    for (let i = 0; i < shellFootprint.length; i++) {
      const p1 = shellFootprint[i];
      const p2 = shellFootprint[(i + 1) % shellFootprint.length];
      addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, wallMaterial);
      const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET);
      if (collider) dynamicColliders.push(collider);
    }
  }

  for (let i = 0; i < featurePlan.features.length; i++) {
    const feature = featurePlan.features[i];
    if (feature.kind === 'polygon') {
      const material = feature.indoorKind === 'corridor' ? corridorMaterial : roomMaterial;
      const floorMesh = addFlatSurfaceMesh(group, feature.pts, floorY + INTERIOR_FLOOR_OFFSET + 0.015, material, 10);
      if (floorMesh) placementTargets.push(floorMesh);
      walkSurfaces.push({
        kind: 'polygon',
        pts: feature.pts,
        y: floorY + INTERIOR_FLOOR_OFFSET + 0.015,
        label: feature.name || feature.indoorKind
      });
      continue;
    }

    if (feature.kind === 'line') {
      const ribbonGeometry = makeRibbonGeometry(feature.pts, feature.width);
      if (!ribbonGeometry) continue;
      const ribbon = new THREE.Mesh(ribbonGeometry, corridorMaterial);
      ribbon.position.y = floorY + INTERIOR_FLOOR_OFFSET + 0.015;
      group.add(ribbon);
      placementTargets.push(ribbon);
      walkSurfaces.push({
        kind: 'line',
        pts: feature.pts,
        halfWidth: Math.max(0.7, finiteNumber(feature.width, 2)) * 0.5,
        y: floorY + INTERIOR_FLOOR_OFFSET + 0.015,
        label: feature.name || feature.indoorKind
      });
    }
  }

  featurePlan.partitions.forEach((segment) => {
    if (!Array.isArray(segment) || segment.length < 2) return;
    const p1 = segment[0];
    const p2 = segment[1];
    addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, accentWallMaterial, INTERIOR_WALL_HEIGHT * 0.86, INTERIOR_WALL_THICKNESS * 0.62);
    const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET, INTERIOR_WALL_HEIGHT * 0.86, INTERIOR_WALL_THICKNESS * 0.62);
    if (collider) dynamicColliders.push(collider);
  });

  const resolvedEntryPoint = chooseInteriorSpawnPoint(desiredEntry, walkSurfaces, {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
  }) || {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
  };

  const entryMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.08, 18),
    entryMaterial
  );
  entryMarker.position.set(resolvedEntryPoint.x, resolvedEntryPoint.y + 0.09, resolvedEntryPoint.z);
  group.add(entryMarker);

  return {
    group,
    mode: effectiveMode,
    dynamicColliders,
    placementTargets,
    walkSurfaces,
    exteriorFootprint,
    usableFootprint: shellFootprint,
    center: { x: centroid.x, z: centroid.z },
    shellClearanceMin,
    requiredShellClearance: INTERIOR_WALL_THICKNESS * 0.5,
    entryPoint: {
      x: resolvedEntryPoint.x,
      z: resolvedEntryPoint.z,
      y: Number.isFinite(resolvedEntryPoint.y) ?
        resolvedEntryPoint.y + (appCtx.Walk?.CFG?.eyeHeight || 1.7) :
        floorY + (appCtx.Walk?.CFG?.eyeHeight || 1.7) + INTERIOR_FLOOR_OFFSET
    },
    floorY
  };
}

function sampleInteriorWalkSurface(x, z) {
  const active = appCtx.activeInterior;
  if (!active || !Array.isArray(active.walkSurfaces)) return null;
  let best = null;
  for (let i = 0; i < active.walkSurfaces.length; i++) {
    const surface = active.walkSurfaces[i];
    if (surface.kind === 'polygon') {
      if (!Array.isArray(surface.pts) || surface.pts.length < 3) continue;
      if (!pointInPolygonSafe(x, z, surface.pts)) continue;
      best = {
        y: surface.y,
        source: 'interior',
        feature: surface,
        dist: 0
      };
      break;
    }
    if (surface.kind === 'line' && Array.isArray(surface.pts) && surface.pts.length >= 2) {
      let bestLineDist = Infinity;
      let bestPoint = null;
      for (let p = 0; p < surface.pts.length - 1; p++) {
        const hit = pointToSegmentDistance(x, z, surface.pts[p], surface.pts[p + 1]);
        if (hit.dist < bestLineDist) {
          bestLineDist = hit.dist;
          bestPoint = { x: hit.x, z: hit.z };
        }
      }
      const maxDist = Math.max(0.85, finiteNumber(surface.halfWidth, 1));
      if (bestLineDist <= maxDist && (!best || bestLineDist < best.dist)) {
        best = {
          y: surface.y,
          source: 'interior',
          feature: surface,
          dist: bestLineDist,
          pt: bestPoint
        };
      }
    }
  }
  return best;
}

function listSupportedInteriorsNear(x, z, radius = 220, limit = 8) {
  const supports = listEnterableBuildingSupportsNear(x, z, radius, limit, { allowSynthetic: true });
  return supports.map((support) => {
    const cached = support?.key ? interiorCache.get(support.key) : null;
    const mappedState = cached?.mode === 'mapped' ? 'mapped' : cached?.mode === 'generated' ? 'generated' : 'unknown';
    const badge = summarizeSupportType(support, mappedState);
    return {
      key: support.key,
      label: support.label || buildingLabel(support.building || support.destination),
      x: finiteNumber(support.center?.x, finiteNumber(support.entryAnchor?.x, 0)),
      z: finiteNumber(support.center?.z, finiteNumber(support.entryAnchor?.z, 0)),
      distance: finiteNumber(support.distance, 0),
      supportType: badge,
      mode: cached?.mode || null,
      destinationKind: support.destinationKind || '',
      synthetic: !!support.synthetic
    };
  });
}

async function scanNearbyInteriorSupport(options = {}) {
  if (nearbyInteriorScanPromise) return nearbyInteriorScanPromise;

  const radius = Number.isFinite(options.radius) ? Math.max(40, options.radius) : 240;
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(8, options.limit)) : 6;
  const ref = interiorReferencePosition();
  const supports = listEnterableBuildingSupportsNear(ref.x, ref.z, radius, limit, { allowSynthetic: true });

  publishInteriorLegendState({
    loading: supports.length > 0,
    message: supports.length > 0 ? 'Scanning nearby enterable buildings...' : 'No enterable buildings nearby yet.',
    items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit)
  });

  nearbyInteriorScanPromise = (async () => {
    for (let i = 0; i < supports.length; i++) {
      const support = supports[i];
      if (!support?.allowMappedData) continue;
      try {
        await warmMappedInteriorDefinition(support);
        publishInteriorLegendState({
          loading: true,
          message: 'Scanning nearby enterable buildings...',
          items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit)
        });
      } catch (error) {
        console.warn('[Interior] Nearby support scan failed for', support.label, error);
      }
    }

    const items = listSupportedInteriorsNear(ref.x, ref.z, radius, limit);
    publishInteriorLegendState({
      loading: false,
      message: items.length > 0 ? '' : 'No enterable buildings identified nearby yet.',
      items
    });
    nearbyInteriorScanPromise = null;
    return items;
  })();

  return nearbyInteriorScanPromise;
}

async function enterInteriorForSupport(support) {
  if (!support?.enterable || !isWalkModeActive()) return false;
  const key = support.key;
  if (appCtx.activeInterior && appCtx.activeInterior.key === key) {
    return true;
  }
  if (appCtx.activeInterior && appCtx.activeInterior.key !== key) {
    clearActiveInterior({ restorePlayer: true, preserveCache: true });
  }

  const definition = await resolveInteriorDefinitionForEntry(support);
  if (!definition) {
    setTransientHint(`${support.label || 'This building'} is not enterable right now.`);
    return false;
  }

  const sceneState = buildInteriorScene(definition);
  appCtx.scene.add(sceneState.group);
  appCtx.dynamicBuildingColliders = sceneState.dynamicColliders.slice();

  const exteriorShellState = support.synthetic ? [] : prepareExteriorShellForInterior(support.building);
  const suppressedWorldMeshes = collectInteriorWorldSuppressionStates(
    sceneState.exteriorFootprint,
    sceneState.center,
    48
  );
  if (support.building && !support.synthetic) {
    support.building.collisionDisabled = true;
  }

  const walker = appCtx.Walk.state.walker;
  const outsideState = {
    x: finiteNumber(walker.x, 0),
    z: finiteNumber(walker.z, 0),
    y: finiteNumber(walker.y, 0),
    yaw: finiteNumber(walker.yaw || walker.angle, 0),
    angle: finiteNumber(walker.angle, 0)
  };

  walker.x = sceneState.entryPoint.x;
  walker.z = sceneState.entryPoint.z;
  walker.y = sceneState.entryPoint.y;
  walker.vy = 0;
  if (appCtx.car) {
    appCtx.car.x = walker.x;
    appCtx.car.z = walker.z;
  }
  const previousView = appCtx.Walk?.state?.view || 'third';
  if (appCtx.Walk?.state) {
    appCtx.Walk.state.view = previousView === 'first' ? 'third' : previousView;
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
    }
  }

  const entryHeight = sceneState.entryPoint.y;
  appCtx.activeInterior = {
    key,
    label: definition.label,
    mode: sceneState.mode,
    support,
    building: support.building,
    group: sceneState.group,
    exteriorShellState,
    suppressedWorldMeshes,
    walkSurfaces: sceneState.walkSurfaces,
    placementTargets: sceneState.placementTargets,
    usableFootprint: sceneState.usableFootprint,
    shellClearanceMin: sceneState.shellClearanceMin,
    requiredShellClearance: sceneState.requiredShellClearance,
    outsideState,
    previousView,
    entryPoint: { ...sceneState.entryPoint },
    lastValidPosition: {
      x: sceneState.entryPoint.x,
      z: sceneState.entryPoint.z,
      y: entryHeight,
      yaw: finiteNumber(walker.yaw || walker.angle, 0),
      angle: finiteNumber(walker.angle, 0)
    },
    containmentNoticeUntil: 0
  };
  appCtx.interiorHint = {
    state: 'inside',
    label: definition.label,
    mode: sceneState.mode
  };
  resetInteriorInteractionCache();
  publishInteriorLegendState();
  return true;
}

function clearActiveInterior(options = {}) {
  const active = appCtx.activeInterior;
  if (!active) {
    appCtx.dynamicBuildingColliders = [];
    if (!options.preservePrompt) clearPrompt();
    return false;
  }

  if (options.restorePlayer !== false && isWalkModeActive() && active.outsideState) {
    const walker = appCtx.Walk.state.walker;
    walker.x = active.outsideState.x;
    walker.z = active.outsideState.z;
    walker.y = active.outsideState.y;
    walker.yaw = active.outsideState.yaw;
    walker.angle = active.outsideState.angle;
    walker.vy = 0;
    if (appCtx.car) {
      appCtx.car.x = walker.x;
      appCtx.car.z = walker.z;
    }
  }

  if (appCtx.Walk?.state) {
    appCtx.Walk.state.view = active.previousView || 'third';
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
    }
  }

  if (active.building && !active.support?.synthetic) {
    active.building.collisionDisabled = false;
  }
  restoreExteriorShellState(active.exteriorShellState);
  restoreInteriorWorldSuppression(active.suppressedWorldMeshes);
  appCtx.dynamicBuildingColliders = [];
  disposeObject3D(active.group);
  appCtx.activeInterior = null;
  appCtx.interiorHint = null;
  resetInteriorInteractionCache();
  publishInteriorLegendState();
  if (!options.preservePrompt) clearPrompt();
  return true;
}

function keepActiveInteriorContained() {
  const active = appCtx.activeInterior;
  if (!active || !isWalkModeActive()) return;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return;

  const interiorSurface = sampleInteriorWalkSurface(walker.x, walker.z);
  const inside = Array.isArray(active.usableFootprint) && active.usableFootprint.length >= 3 ?
    pointInPolygonSafe(walker.x, walker.z, active.usableFootprint) :
    true;

  if (interiorSurface && inside) {
    active.lastValidPosition = {
      x: walker.x,
      z: walker.z,
      y: finiteNumber(walker.y, active.entryPoint?.y || 0),
      yaw: finiteNumber(walker.yaw || walker.angle, 0),
      angle: finiteNumber(walker.angle, 0)
    };
    return;
  }

  const footprintHit = Array.isArray(active.usableFootprint) && active.usableFootprint.length >= 3 ?
    distanceToFootprint(walker.x, walker.z, { pts: active.usableFootprint }) :
    { dist: Infinity };
  if (inside || footprintHit.dist <= 0.55) return;

  const now = performance.now();
  if (now < finiteNumber(active.containmentNoticeUntil, 0)) return;

  const safe = active.lastValidPosition || active.entryPoint || active.outsideState;
  if (!safe) return;
  walker.x = finiteNumber(safe.x, walker.x);
  walker.z = finiteNumber(safe.z, walker.z);
  walker.y = finiteNumber(safe.y, walker.y);
  walker.yaw = finiteNumber(safe.yaw || safe.angle, walker.yaw || walker.angle);
  walker.angle = finiteNumber(safe.angle || safe.yaw, walker.angle);
  walker.vy = 0;
  if (appCtx.car) {
    appCtx.car.x = walker.x;
    appCtx.car.z = walker.z;
  }
  active.containmentNoticeUntil = now + 900;
}

function pickNearbyBuildingCandidate(force = false) {
  if (!isWalkModeActive()) return null;
  const walker = appCtx.Walk.state.walker;
  const now = performance.now();
  const movedDistance =
    Number.isFinite(candidateCache.x) && Number.isFinite(candidateCache.z) ?
      Math.hypot(walker.x - candidateCache.x, walker.z - candidateCache.z) :
      Infinity;
  if (
    !force &&
    now - candidateCache.at <= INTERIOR_INTERACTION_REFRESH_MS &&
    movedDistance <= INTERIOR_INTERACTION_MOVE_EPSILON
  ) {
    return candidateCache.candidate;
  }

  const candidate = pickNearbyEnterableBuildingSupport(walker.x, walker.z, {
    radius: INTERIOR_ENTRY_RADIUS,
    allowSynthetic: true
  });
  candidateCache = {
    at: now,
    x: walker.x,
    z: walker.z,
    candidate
  };
  return candidate;
}

async function handleInteriorAction() {
  if (appCtx.activeInterior) {
    clearActiveInterior({ restorePlayer: true, preserveCache: true });
    return true;
  }
  const candidate = pickNearbyBuildingCandidate(true);
  if (!candidate?.support?.enterable) return false;
  await enterInteriorForSupport(candidate.support);
  return true;
}

function updateInteriorInteraction() {
  const now = performance.now();

  if (!isWalkModeActive()) {
    appCtx.interiorHint = null;
    resetInteriorInteractionCache();
    if (transientHint.text && transientHint.until > now) {
      setPrompt(transientHint.text, 'notice');
      return;
    }
    clearPrompt();
    return;
  }

  if (appCtx.activeInterior) {
    keepActiveInteriorContained();
    const label = appCtx.activeInterior.label || 'Interior';
    appCtx.interiorHint = { state: 'inside', label, mode: appCtx.activeInterior.mode || 'generated' };
    resetInteriorInteractionCache();
    setPrompt(`E Exit ${shortLabel(label, 24)}`, 'active');
    return;
  }

  const candidate = pickNearbyBuildingCandidate(false);
  if (candidate?.support?.enterable) {
    const support = candidate.support;
    const type = currentSupportDisplayType(support);
    const label = support.label || buildingLabel(support.building || support.destination);
    appCtx.interiorHint = {
      state: 'enterable',
      label,
      type,
      distance: candidate.distance
    };
    setPrompt(`E Enter ${shortLabel(label, 24)}`, type === 'Mapped' ? 'supported' : 'inspect');
    return;
  }

  appCtx.interiorHint = null;
  if (transientHint.text && transientHint.until > now) {
    setPrompt(transientHint.text, 'notice');
    return;
  }
  clearPrompt();
}

Object.assign(appCtx, {
  clearActiveInterior,
  enterInteriorForSupport,
  handleInteriorAction,
  listSupportedInteriorsNear,
  scanNearbyInteriorSupport,
  sampleInteriorWalkSurface,
  updateInteriorInteraction
});

export {
  clearActiveInterior,
  enterInteriorForSupport,
  handleInteriorAction,
  listSupportedInteriorsNear,
  scanNearbyInteriorSupport,
  sampleInteriorWalkSurface,
  updateInteriorInteraction
};
