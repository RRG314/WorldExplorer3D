import { ctx as appCtx } from "./shared-context.js?v=55";

const INTERIOR_FETCH_TIMEOUT_MS = 7000;
const INTERIOR_FETCH_RADIUS_PAD = 18;
const INTERIOR_ENTRY_RADIUS = 8.5;
const INTERIOR_LEVEL_HEIGHT = 3.4;
const INTERIOR_WALL_HEIGHT = 3.15;
const INTERIOR_WALL_THICKNESS = 0.32;
const INTERIOR_FLOOR_OFFSET = 0.03;
const INTERIOR_NOTICE_MS = 2600;
const INTERIOR_INTERACTION_REFRESH_MS = 120;
const INTERIOR_INTERACTION_MOVE_EPSILON = 0.75;

const interiorCache = new Map();
let transientHint = { text: '', until: 0 };
let candidateCache = { at: 0, x: NaN, z: NaN, candidate: null };
let lastPromptState = { text: '', variant: '' };

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
  const lat = Number(appCtx.LOC?.lat || 0) - z / Number(appCtx.SCALE || 1);
  const cosLat = Math.cos(lat * Math.PI / 180) || 1;
  const lon = Number(appCtx.LOC?.lon || 0) + x / ((Number(appCtx.SCALE || 1) || 1) * cosLat);
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

function pointToSegmentDistance(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) {
    return { dist: Math.hypot(x - p1.x, z - p1.z), x: p1.x, z: p1.z, t: 0 };
  }
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return { dist: Math.hypot(x - px, z - pz), x: px, z: pz, t };
}

function distanceToFootprint(x, z, building) {
  if (!building) return { dist: Infinity, point: null };
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    let best = null;
    for (let i = 0; i < building.pts.length; i++) {
      const p1 = building.pts[i];
      const p2 = building.pts[(i + 1) % building.pts.length];
      const hit = pointToSegmentDistance(x, z, p1, p2);
      if (!best || hit.dist < best.dist) best = hit;
    }
    const inside = appCtx.pointInPolygon?.(x, z, building.pts) === true;
    return {
      dist: inside ? 0 : (best?.dist ?? Infinity),
      point: best ? { x: best.x, z: best.z } : null,
      inside
    };
  }

  const nearestX = Math.max(building.minX, Math.min(x, building.maxX));
  const nearestZ = Math.max(building.minZ, Math.min(z, building.maxZ));
  const inside = x >= building.minX && x <= building.maxX && z >= building.minZ && z <= building.maxZ;
  return {
    dist: inside ? 0 : Math.hypot(x - nearestX, z - nearestZ),
    point: { x: nearestX, z: nearestZ },
    inside
  };
}

function buildingKey(building) {
  if (!building) return '';
  return String(
    building.sourceBuildingId ||
    `${Math.round(Number(building.centerX || 0))}:${Math.round(Number(building.centerZ || 0))}`
  );
}

function hasFullBuildingFootprint(building) {
  return !!(
    building &&
    building.colliderDetail === 'full' &&
    Array.isArray(building.pts) &&
    building.pts.length >= 3
  );
}

function isEnterableBuildingCandidate(building) {
  if (!hasFullBuildingFootprint(building)) return false;
  const buildingType = String(building?.buildingType || '').toLowerCase();
  if (!buildingType || buildingType === 'roof' || buildingType === 'canopy' || buildingType === 'carport') return false;
  return !building.isInteriorCollider && !building.collisionDisabled;
}

function mappedInteriorPriority(building) {
  const buildingType = String(building?.buildingType || '').toLowerCase();
  if (/^(commercial|office|retail|hotel|hospital|school|university|museum|civic|public|station|train_station)$/.test(buildingType)) {
    return 4;
  }
  if (/^(apartments|residential|yes)$/.test(buildingType)) return 2;
  return 1;
}

function buildingLabel(building) {
  const explicit = String(building?.name || '').trim();
  if (explicit) return explicit;
  const type = String(building?.buildingType || 'building').replace(/_/g, ' ').trim();
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Building';
}

function buildingFootprintPoints(building) {
  if (Array.isArray(building?.pts) && building.pts.length >= 3) return building.pts;
  if (!building) return [];
  return [
    { x: Number(building.minX || 0), z: Number(building.minZ || 0) },
    { x: Number(building.maxX || 0), z: Number(building.minZ || 0) },
    { x: Number(building.maxX || 0), z: Number(building.maxZ || 0) },
    { x: Number(building.minX || 0), z: Number(building.maxZ || 0) }
  ];
}

function resetInteriorInteractionCache() {
  candidateCache = { at: 0, x: NaN, z: NaN, candidate: null };
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

  const nearby = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(walker.x, walker.z, INTERIOR_ENTRY_RADIUS + 8) :
    (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);

  let best = null;
  for (let i = 0; i < nearby.length; i++) {
    const building = nearby[i];
    if (!isEnterableBuildingCandidate(building)) continue;
    const footprint = distanceToFootprint(walker.x, walker.z, building);
    if (!Number.isFinite(footprint.dist) || footprint.dist > INTERIOR_ENTRY_RADIUS) continue;
    const score = footprint.dist + (footprint.inside ? 0.4 : 0);
    if (!best || score < best.score) {
      best = {
        building,
        score,
        distance: footprint.dist,
        point: footprint.point,
        inside: footprint.inside
      };
    }
  }
  candidateCache = {
    at: now,
    x: walker.x,
    z: walker.z,
    candidate: best
  };
  return best;
}

function buildingGeoBounds(building) {
  const minX = Number(building?.minX || 0) - INTERIOR_FETCH_RADIUS_PAD;
  const maxX = Number(building?.maxX || 0) + INTERIOR_FETCH_RADIUS_PAD;
  const minZ = Number(building?.minZ || 0) - INTERIOR_FETCH_RADIUS_PAD;
  const maxZ = Number(building?.maxZ || 0) + INTERIOR_FETCH_RADIUS_PAD;
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

function pointInsideBuilding(point, building) {
  if (!point || !building) return false;
  if (
    point.x < building.minX - 2 ||
    point.x > building.maxX + 2 ||
    point.z < building.minZ - 2 ||
    point.z > building.maxZ + 2
  ) {
    return false;
  }
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    return appCtx.pointInPolygon?.(point.x, point.z, building.pts) === true;
  }
  return true;
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
    samples.push({
      x: (a.x + b.x) * 0.5,
      z: (a.z + b.z) * 0.5
    });
  }
  return samples;
}

function estimateInteriorFloorBaseY(building, footprint, centroid, entrances = [], desiredPoint = null) {
  const surfaceSamples = [];
  const fallbackBase = Number(building?.baseY || 0);
  if (Number.isFinite(fallbackBase)) surfaceSamples.push(fallbackBase);

  const perimeterSamples = polygonSamplePoints(footprint);
  perimeterSamples.forEach((point) => {
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

  const perimeterFloor = percentile(surfaceSamples, entrances.length > 0 ? 0.8 : 0.72);
  if (Number.isFinite(perimeterFloor)) {
    return Math.max(fallbackBase, perimeterFloor) - INTERIOR_FLOOR_OFFSET;
  }
  return fallbackBase - INTERIOR_FLOOR_OFFSET;
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
    if (!best || hit.dist < best.dist) {
      best = hit;
    }
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
      if (appCtx.pointInPolygon?.(desired.x, desired.z, surface.pts) === true) {
        return {
          x: desired.x,
          z: desired.z,
          y: surface.y
        };
      }

      const centroid = polygonCentroid(surface.pts);
      const ringHit = projectPointToPolygonRing(desired, surface.pts);
      if (centroid && ringHit) {
        const score = ringHit.dist;
        if (!polygonFallback || score < polygonFallback.score) {
          polygonFallback = {
            x: centroid.x,
            z: centroid.z,
            y: surface.y,
            score
          };
        }
      }

      if (!bestPolygon && centroid) {
        bestPolygon = {
          x: centroid.x,
          z: centroid.z,
          y: surface.y
        };
      }
      continue;
    }

    if (surface.kind === 'line' && Array.isArray(surface.pts) && surface.pts.length >= 2) {
      for (let p = 0; p < surface.pts.length - 1; p++) {
        const hit = pointToSegmentDistance(desired.x, desired.z, surface.pts[p], surface.pts[p + 1]);
        const widthAllowance = Math.max(0.75, Number(surface.halfWidth || 1));
        const score = Math.max(0, hit.dist - widthAllowance);
        if (!bestLine || score < bestLine.score) {
          bestLine = {
            x: hit.x,
            z: hit.z,
            y: surface.y,
            score
          };
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
  if (!(len > 0.2)) return;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len, height, thickness),
    material
  );
  mesh.position.set((p1.x + p2.x) * 0.5, y + height * 0.5, (p1.z + p2.z) * 0.5);
  mesh.rotation.y = Math.atan2(dx, dz);
  group.add(mesh);
}

function hideBuildingMeshes(building) {
  const key = buildingKey(building);
  const hidden = [];
  if (!Array.isArray(appCtx.buildingMeshes)) return hidden;
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (!mesh || mesh.userData?.sourceBuildingId !== key) continue;
    hidden.push(mesh);
    mesh.visible = false;
  }
  return hidden;
}

function showHiddenMeshes(meshes) {
  if (!Array.isArray(meshes)) return;
  meshes.forEach((mesh) => {
    if (mesh) mesh.visible = true;
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

async function fetchInteriorDefinition(building) {
  if (typeof appCtx.fetchOverpassJSON !== 'function') {
    throw new Error('Interior loader requires appCtx.fetchOverpassJSON.');
  }
  if (!hasFullBuildingFootprint(building)) {
    const definition = {
      key: buildingKey(building),
      label: buildingLabel(building),
      status: 'unsupported',
      fetchedAt: Date.now(),
      building,
      selectedLevel: 0,
      features: [],
      entrances: [],
      rawFeatureCount: 0,
      rawEntranceCount: 0
    };
    interiorCache.set(definition.key, definition);
    return definition;
  }

  const key = buildingKey(building);
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
    Number(building.centerX || (building.minX + building.maxX) * 0.5 || 0),
    Number(building.centerZ || (building.minZ + building.maxZ) * 0.5 || 0)
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
    const isIndoorWay = indoorTag || corridorTag;
    if (!isIndoorWay) continue;
    const rawWorldPoints = wayWorldPoints(element, nodesById);
    if (rawWorldPoints.length < 2) continue;
    const closed = isClosedWay(element, nodesById);
    const level = parseLevelValue(element.tags.level);
    const name = String(element.tags.name || '').trim();
    const width = Math.max(1.1, Math.min(4.5, Number.parseFloat(element.tags.width) || (corridorTag ? 2.1 : 1.6)));

    if (closed) {
      const pts = cleanRingPoints(rawWorldPoints);
      if (pts.length < 3 || Math.abs(ringArea(pts)) < 2) continue;
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
  const supported = selectedFeatures.length > 0;
  const definition = {
    key,
    label: buildingLabel(building),
    status: supported ? 'supported' : 'unsupported',
    fetchedAt: Date.now(),
    building,
    selectedLevel,
    features: selectedFeatures,
    entrances: selectedEntrances,
    rawFeatureCount: features.length,
    rawEntranceCount: entrances.length
  };
  interiorCache.set(key, definition);
  return definition;
}

function buildInteriorScene(definition) {
  const building = definition.building;
  const footprint = buildingFootprintPoints(building);
  const centroid = polygonCentroid(footprint) || {
    x: Number(building.centerX || 0),
    z: Number(building.centerZ || 0)
  };
  let entryPoint = null;
  const walker = appCtx.Walk?.state?.walker || null;
  if (definition.entrances.length > 0) {
    let best = null;
    for (let i = 0; i < definition.entrances.length; i++) {
      const entry = definition.entrances[i];
      const dist = walker ? Math.hypot(entry.x - walker.x, entry.z - walker.z) : 0;
      if (!best || dist < best.dist) best = { entry, dist };
    }
    if (best?.entry) {
      const dx = centroid.x - best.entry.x;
      const dz = centroid.z - best.entry.z;
      const len = Math.hypot(dx, dz) || 1;
      entryPoint = {
        x: best.entry.x + dx / len * 1.8,
        z: best.entry.z + dz / len * 1.8
      };
    }
  }
  if (!entryPoint) {
    const preferredSurface = definition.features.find((feature) => feature.kind === 'polygon') || definition.features[0] || null;
    if (preferredSurface?.kind === 'polygon') {
      entryPoint = polygonCentroid(preferredSurface.pts);
    } else if (preferredSurface?.pts?.length) {
      entryPoint = preferredSurface.pts[Math.floor(preferredSurface.pts.length / 2)];
    }
  }
  if (!entryPoint) entryPoint = centroid;

  const floorBaseY = estimateInteriorFloorBaseY(
    building,
    footprint,
    centroid,
    definition.entrances,
    entryPoint
  );
  const floorY = floorBaseY + definition.selectedLevel * INTERIOR_LEVEL_HEIGHT;
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
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe4e8ec,
    roughness: 0.97,
    metalness: 0.0,
    side: THREE.DoubleSide
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

  const ambientLight = new THREE.HemisphereLight(0xf8fafc, 0x1a2330, 0.72);
  ambientLight.position.set(centroid.x, floorY + INTERIOR_WALL_HEIGHT * 0.92, centroid.z);
  group.add(ambientLight);

  const ceilingLight = new THREE.PointLight(0xf7f3ea, 0.82, 36, 2);
  ceilingLight.position.set(centroid.x, floorY + INTERIOR_WALL_HEIGHT - 0.32, centroid.z);
  group.add(ceilingLight);

  if (Array.isArray(footprint) && footprint.length >= 3) {
    const slabShape = createShapeFromPoints(footprint);
    const slabGeometry = new THREE.ShapeGeometry(slabShape, 12);
    slabGeometry.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(slabGeometry, slabMaterial);
    slab.position.y = floorY + INTERIOR_FLOOR_OFFSET;
    group.add(slab);

    const shellCeilingGeometry = new THREE.ShapeGeometry(slabShape, 8);
    shellCeilingGeometry.rotateX(-Math.PI / 2);
    const shellCeiling = new THREE.Mesh(shellCeilingGeometry, ceilingMaterial);
    shellCeiling.position.y = floorY + INTERIOR_WALL_HEIGHT;
    group.add(shellCeiling);

    walkSurfaces.push({
      kind: 'polygon',
      pts: footprint,
      y: floorY + INTERIOR_FLOOR_OFFSET
    });

    for (let i = 0; i < footprint.length; i++) {
      const p1 = footprint[i];
      const p2 = footprint[(i + 1) % footprint.length];
      addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, wallMaterial);
      const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET);
      if (collider) dynamicColliders.push(collider);
    }
  }

  for (let i = 0; i < definition.features.length; i++) {
    const feature = definition.features[i];
    if (feature.kind === 'polygon') {
      const shape = createShapeFromPoints(feature.pts);
      const floorGeometry = new THREE.ShapeGeometry(shape, 10);
      floorGeometry.rotateX(-Math.PI / 2);
      const material = feature.indoorKind === 'corridor' ? corridorMaterial : roomMaterial;
      const floorMesh = new THREE.Mesh(floorGeometry, material);
      floorMesh.position.y = floorY + INTERIOR_FLOOR_OFFSET + 0.015;
      group.add(floorMesh);

      const ceilingGeometry = new THREE.ShapeGeometry(shape, 8);
      ceilingGeometry.rotateX(-Math.PI / 2);
      const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
      ceiling.position.y = floorY + INTERIOR_WALL_HEIGHT - 0.02;
      group.add(ceiling);

      walkSurfaces.push({
        kind: 'polygon',
        pts: feature.pts,
        y: floorY + INTERIOR_FLOOR_OFFSET + 0.015,
        label: feature.name || feature.indoorKind
      });

      for (let p = 0; p < feature.pts.length; p++) {
        const a = feature.pts[p];
        const b = feature.pts[(p + 1) % feature.pts.length];
        addWallMesh(group, a, b, floorY + INTERIOR_FLOOR_OFFSET, wallMaterial, INTERIOR_WALL_HEIGHT * 0.86, INTERIOR_WALL_THICKNESS * 0.6);
      }
    } else if (feature.kind === 'line') {
      const ribbonGeometry = makeRibbonGeometry(feature.pts, feature.width);
      if (!ribbonGeometry) continue;
      const ribbon = new THREE.Mesh(ribbonGeometry, corridorMaterial);
      ribbon.position.y = floorY + INTERIOR_FLOOR_OFFSET + 0.015;
      group.add(ribbon);
      walkSurfaces.push({
        kind: 'line',
        pts: feature.pts,
        halfWidth: Math.max(0.7, Number(feature.width) || 2) * 0.5,
        y: floorY + INTERIOR_FLOOR_OFFSET + 0.015,
        label: feature.name || feature.indoorKind
      });
    }
  }

  const entryMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.08, 18),
    entryMaterial
  );
  const resolvedEntryPoint = chooseInteriorSpawnPoint(entryPoint, walkSurfaces, centroid) || {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
  };
  entryMarker.position.set(resolvedEntryPoint.x, resolvedEntryPoint.y + 0.09, resolvedEntryPoint.z);
  group.add(entryMarker);

  return {
    group,
    dynamicColliders,
    walkSurfaces,
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
      if (appCtx.pointInPolygon?.(x, z, surface.pts) !== true) continue;
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
      for (let p = 0; p < surface.pts.length - 1; p++) {
        const hit = pointToSegmentDistance(x, z, surface.pts[p], surface.pts[p + 1]);
        if (hit.dist < bestLineDist) bestLineDist = hit.dist;
      }
      const maxDist = Math.max(0.85, Number(surface.halfWidth || 1));
      if (bestLineDist <= maxDist && (!best || bestLineDist < best.dist)) {
        best = {
          y: surface.y,
          source: 'interior',
          feature: surface,
          dist: bestLineDist
        };
      }
    }
  }
  return best;
}

function interiorReferencePosition() {
  if (appCtx.Walk && typeof appCtx.Walk.getMapRefPosition === 'function') {
    return appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone);
  }
  return {
    x: Number(appCtx.car?.x || 0),
    z: Number(appCtx.car?.z || 0)
  };
}

function listSupportedInteriorsNear(x, z, radius = 220, limit = 8) {
  const supported = [];
  const seen = new Set();
  interiorCache.forEach((definition) => {
    if (!definition || definition.status !== 'supported' || !isEnterableBuildingCandidate(definition.building)) return;
    const building = definition.building;
    const key = buildingKey(building);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const dx = Number(building.centerX || 0) - x;
    const dz = Number(building.centerZ || 0) - z;
    const dist = Math.hypot(dx, dz);
    if (!Number.isFinite(dist) || dist > radius) return;
    supported.push({
      key,
      label: definition.label || buildingLabel(building),
      x: Number(building.centerX || 0),
      z: Number(building.centerZ || 0),
      distance: dist
    });
  });
  supported.sort((a, b) => a.distance - b.distance);
  return supported.slice(0, Math.max(1, limit));
}

let nearbyInteriorScanPromise = null;

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

async function scanNearbyInteriorSupport(options = {}) {
  if (nearbyInteriorScanPromise) return nearbyInteriorScanPromise;

  const radius = Number.isFinite(options.radius) ? Math.max(40, options.radius) : 240;
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(8, options.limit)) : 4;
  const ref = interiorReferencePosition();
  const nearby = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(ref.x, ref.z, radius + 18) :
    (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);

  const candidates = nearby
    .filter((building) => isEnterableBuildingCandidate(building))
    .map((building) => ({
      building,
      distance: Math.hypot(Number(building.centerX || 0) - ref.x, Number(building.centerZ || 0) - ref.z),
      priority: mappedInteriorPriority(building)
    }))
    .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= radius)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.distance - b.distance;
    })
    .slice(0, limit);

  publishInteriorLegendState({
    loading: true,
    message: candidates.length > 0 ? 'Scanning nearby mapped interiors...' : 'No full-footprint buildings nearby to scan.',
    items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit)
  });

  nearbyInteriorScanPromise = (async () => {
    for (let i = 0; i < candidates.length; i++) {
      const building = candidates[i].building;
      const key = buildingKey(building);
      const cached = interiorCache.get(key);
      if (cached?.status === 'supported' || cached?.status === 'unsupported' || cached?.status === 'loading') continue;
      try {
        await fetchInteriorDefinition(building);
        publishInteriorLegendState({
          loading: true,
          message: 'Scanning nearby mapped interiors...',
          items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit)
        });
      } catch (error) {
        console.warn('[Interior] Nearby support scan failed for', buildingLabel(building), error);
        const errorText = String(error?.message || error || '');
        if (errorText.includes('429')) {
          publishInteriorLegendState({
            loading: false,
            message: 'Interior scan is rate-limited right now. Cached buildings will still appear here.',
            items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit)
          });
          nearbyInteriorScanPromise = null;
          return listSupportedInteriorsNear(ref.x, ref.z, radius, limit);
        }
      }
    }

    const items = listSupportedInteriorsNear(ref.x, ref.z, radius, limit);
    publishInteriorLegendState({
      loading: false,
      message: items.length > 0 ? '' : 'No mapped interiors found nearby yet.',
      items
    });
    nearbyInteriorScanPromise = null;
    return items;
  })();

  return nearbyInteriorScanPromise;
}

async function enterInteriorForBuilding(building) {
  if (!building || !isWalkModeActive()) return false;
  const key = buildingKey(building);
  let definition = interiorCache.get(key) || null;
  if (!definition || definition.status === 'loading') {
    interiorCache.set(key, { key, status: 'loading', building });
    try {
      definition = await fetchInteriorDefinition(building);
    } catch (error) {
      interiorCache.delete(key);
      setTransientHint(`Interior data load failed for ${buildingLabel(building)}.`);
      throw error;
    }
  }

  if (!definition || definition.status !== 'supported') {
    setTransientHint(`${buildingLabel(building)} has no mapped indoor floor data yet.`);
    return false;
  }

  if (appCtx.activeInterior && appCtx.activeInterior.key !== key) {
    clearActiveInterior({ restorePlayer: true, preserveCache: true });
  } else if (appCtx.activeInterior?.key === key) {
    return true;
  }

  const sceneState = buildInteriorScene(definition);
  appCtx.scene.add(sceneState.group);
  appCtx.dynamicBuildingColliders = sceneState.dynamicColliders.slice();

  const hiddenMeshes = hideBuildingMeshes(building);
  building.collisionDisabled = true;

  const walker = appCtx.Walk.state.walker;
  const outsideState = {
    x: Number(walker.x || 0),
    z: Number(walker.z || 0),
    y: Number(walker.y || 0),
    yaw: Number(walker.yaw || walker.angle || 0),
    angle: Number(walker.angle || 0)
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
    appCtx.Walk.state.view = 'first';
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.visible = false;
    }
  }

  appCtx.activeInterior = {
    key,
    building,
    label: definition.label,
    group: sceneState.group,
    hiddenMeshes,
    walkSurfaces: sceneState.walkSurfaces,
    outsideState,
    previousView
  };
  appCtx.interiorHint = {
    state: 'inside',
    label: definition.label,
    level: definition.selectedLevel
  };
  resetInteriorInteractionCache();
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

  if (active.building) active.building.collisionDisabled = false;
  showHiddenMeshes(active.hiddenMeshes);
  appCtx.dynamicBuildingColliders = [];
  disposeObject3D(active.group);
  appCtx.activeInterior = null;
  appCtx.interiorHint = null;
  resetInteriorInteractionCache();
  if (!options.preservePrompt) clearPrompt();
  return true;
}

async function handleInteriorAction() {
  if (appCtx.activeInterior) {
    clearActiveInterior({ restorePlayer: true, preserveCache: true });
    return true;
  }
  const candidate = pickNearbyBuildingCandidate(true);
  if (!candidate) return false;
  await enterInteriorForBuilding(candidate.building);
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
    const label = appCtx.activeInterior.label || 'Interior';
    appCtx.interiorHint = { state: 'inside', label };
    resetInteriorInteractionCache();
    setPrompt('E Exit interior', 'active');
    return;
  }

  const candidate = pickNearbyBuildingCandidate(false);
  if (candidate) {
    const key = buildingKey(candidate.building);
    const cached = interiorCache.get(key);
    const label = buildingLabel(candidate.building);
    appCtx.interiorHint = {
      state: cached?.status === 'supported' ? 'supported' : 'inspect',
      label,
      distance: candidate.distance
    };
    if (cached?.status === 'loading') {
      setPrompt('Loading interior...', 'loading');
      return;
    }
    if (cached?.status === 'supported') {
      setPrompt('E Enter interior', 'supported');
      return;
    }
    setPrompt('E Check interior', 'inspect');
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
  handleInteriorAction,
  listSupportedInteriorsNear,
  scanNearbyInteriorSupport,
  sampleInteriorWalkSurface,
  updateInteriorInteraction
});

export {
  clearActiveInterior,
  handleInteriorAction,
  listSupportedInteriorsNear,
  scanNearbyInteriorSupport,
  sampleInteriorWalkSurface,
  updateInteriorInteraction
};
