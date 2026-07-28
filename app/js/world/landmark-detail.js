import { ctx as appCtx } from "../shared-context.js?v=55";
import { fetchBundledLandmarkData } from "./landmark-source.js?v=2";
import { renderSuspensionBridgeLandmark } from "./bridge-landmark.js?v=9";
import { renderCuratedLandmarkModels } from './landmark-models.js?v=13';

const MAX_PYRAMIDS = 48;
const MAX_WALL_WAYS = 140;
const DEFAULT_PYRAMID_HEIGHT = 18;
const DEFAULT_WALL_HEIGHT = 6;
const DEFAULT_WALL_WIDTH = 3.6;

function numericMeters(value, fallback, min, max) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function isPyramid(tags = {}) {
  const roofShape = normalized(tags['roof:shape']);
  const tomb = normalized(tags.tomb);
  const historic = normalized(tags.historic);
  const explicitPyramid = tomb === 'pyramid' || historic === 'pyramid';
  const historicTombRoof = historic === 'tomb' && (roofShape === 'pyramidal' || roofShape === 'pyramid');
  return explicitPyramid || historicTombRoof;
}

function isHistoricWall(tags = {}) {
  const barrier = normalized(tags.barrier);
  const historic = normalized(tags.historic);
  return historic === 'citywalls' || barrier === 'city_wall' || (barrier === 'wall' && !!historic);
}

function wayPoints(way, nodes, sanitizer, polygon = false) {
  const raw = (way?.nodes || [])
    .map((id) => nodes[id])
    .filter(Boolean)
    .map((node) => appCtx.geoToWorld(node.lat, node.lon));
  if (polygon) return sanitizer(raw);
  const points = [];
  for (let i = 0; i < raw.length; i++) {
    const point = raw[i];
    const previous = points[points.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 0.15) points.push(point);
  }
  return points;
}

function addHistoricSite(way, points, kind, height) {
  if (!Array.isArray(points) || points.length === 0) return;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  center.x /= points.length;
  center.z /= points.length;
  const tags = way.tags || {};
  appCtx.historicSites.push({
    x: center.x,
    z: center.z,
    type: kind,
    name: tags.name || tags['name:en'] || (kind === 'pyramid' ? 'Historic Pyramid' : 'Historic Wall'),
    description: tags.description || null,
    wikipedia: tags.wikipedia || tags['wikipedia:en'] || null,
    wikidata: tags.wikidata || null,
    sourceFeatureId: `osm-way:${way.id}`,
    height
  });
}

function createPyramidMesh(way, nodes, sanitizeFootprint, registerBuildingCollision) {
  const points = wayPoints(way, nodes, sanitizeFootprint, true);
  if (points.length < 3 || typeof THREE === 'undefined') return null;
  const footprint = points.slice();
  if (
    footprint.length > 3 &&
    Math.hypot(footprint[0].x - footprint[footprint.length - 1].x, footprint[0].z - footprint[footprint.length - 1].z) < 0.2
  ) {
    footprint.pop();
  }
  if (footprint.length < 3) return null;

  const tags = way.tags || {};
  const height = numericMeters(tags.height ?? tags['roof:height'], DEFAULT_PYRAMID_HEIGHT, 3, 220);
  let centerX = 0;
  let centerZ = 0;
  let baseY = 0;
  for (let i = 0; i < footprint.length; i++) {
    centerX += footprint[i].x;
    centerZ += footprint[i].z;
    baseY += appCtx.elevationWorldYAtWorldXZ(footprint[i].x, footprint[i].z);
  }
  centerX /= footprint.length;
  centerZ /= footprint.length;
  baseY /= footprint.length;

  const positions = [];
  for (let i = 0; i < footprint.length; i++) {
    const current = footprint[i];
    const next = footprint[(i + 1) % footprint.length];
    positions.push(
      current.x, baseY, current.z,
      next.x, baseY, next.z,
      centerX, baseY + height, centerZ
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    color: 0xc9a96a,
    roughness: 0.96,
    metalness: 0.01,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData = {
    isHistoricLandmark: true,
    landmarkKind: 'pyramid',
    sourceFeatureId: `osm-way:${way.id}`,
    landmarkName: tags.name || tags['name:en'] || 'Historic Pyramid',
    heightMeters: height,
    baseY,
    footprint
  };
  registerBuildingCollision?.(footprint, height, {
    baseY,
    buildingType: 'historic_landmark',
    collisionKind: 'solid',
    detail: 'full',
    name: mesh.userData.landmarkName,
    sourceBuildingId: mesh.userData.sourceFeatureId
  });
  addHistoricSite(way, footprint, 'pyramid', height);
  return mesh;
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.z > z) !== (b.z > z)) &&
      (x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function reprojectActorOutsideLandmarks(meshes) {
  const mode = appCtx.getCurrentTravelMode?.() || (appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive');
  if (mode !== 'walk' && mode !== 'drive') return false;
  const actor = mode === 'walk' ? appCtx.Walk?.state?.walker : appCtx.car;
  const x = Number(actor?.x);
  const z = Number(actor?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const enclosed = meshes.some((mesh) => {
    const footprint = mesh?.userData?.footprint;
    return Array.isArray(footprint) && footprint.length >= 3 && pointInPolygon(x, z, footprint);
  });
  if (!enclosed || typeof appCtx.applySpawnTarget !== 'function') return false;
  appCtx.applySpawnTarget(x, z, {
    mode,
    preferRoad: mode === 'drive',
    source: 'publication_landmark_clearance'
  });
  return true;
}

function createWallMesh(way, nodes) {
  const points = wayPoints(way, nodes, (value) => value, false);
  if (points.length < 2 || typeof THREE === 'undefined') return null;
  const tags = way.tags || {};
  const height = numericMeters(tags.height, DEFAULT_WALL_HEIGHT, 1.2, 30);
  const width = numericMeters(tags.width, DEFAULT_WALL_WIDTH, 0.8, 14);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const startY = appCtx.elevationWorldYAtWorldXZ(start.x, start.z) + height * 0.5;
    const endY = appCtx.elevationWorldYAtWorldXZ(end.x, end.z) + height * 0.5;
    const dx = end.x - start.x;
    const dy = endY - startY;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.35 || length > 1200) continue;
    segments.push({ x: (start.x + end.x) * 0.5, y: (startY + endY) * 0.5, z: (start.z + end.z) * 0.5, dx, dy, dz, length });
  }
  if (segments.length === 0) return null;

  const merlons = [];
  const maxMerlons = 120;
  for (const segment of segments) {
    if (merlons.length >= maxMerlons) break;
    const horizontalLength = Math.hypot(segment.dx, segment.dz) || 1;
    const sideX = -segment.dz / horizontalLength;
    const sideZ = segment.dx / horizontalLength;
    const positions = Math.min(60, Math.max(1, Math.floor(segment.length / 4.2)));
    for (let index = 0; index < positions && merlons.length < maxMerlons; index++) {
      const t = (index + 0.5) / positions - 0.5;
      for (const side of [-1, 1]) {
        merlons.push({
          x: segment.x + segment.dx * t + sideX * width * 0.34 * side,
          y: segment.y + segment.dy * t + height * 0.5 + 0.65,
          z: segment.z + segment.dz * t + sideZ * width * 0.34 * side,
          dx: segment.dx,
          dz: segment.dz
        });
        if (merlons.length >= maxMerlons) break;
      }
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x8f8878, roughness: 0.98, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length + merlons.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const direction = new THREE.Vector3();
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    position.set(segment.x, segment.y, segment.z);
    direction.set(segment.dx, segment.dy, segment.dz).normalize();
    quaternion.setFromUnitVectors(forward, direction);
    scale.set(width, height, segment.length);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  for (let i = 0; i < merlons.length; i++) {
    const merlon = merlons[i];
    position.set(merlon.x, merlon.y, merlon.z);
    direction.set(merlon.dx, 0, merlon.dz).normalize();
    quaternion.setFromUnitVectors(forward, direction);
    scale.set(1.15, 1.3, 0.9);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(segments.length + i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData = {
    isHistoricLandmark: true,
    landmarkKind: 'historic_wall',
    sourceFeatureId: `osm-way:${way.id}`,
    landmarkName: tags.name || tags['name:en'] || 'Historic Wall',
    heightMeters: height,
    widthMeters: width,
    crenellationCount: merlons.length
  };
  addHistoricSite(way, points, 'historic_wall', height);
  return mesh;
}

function renderLandmarks(data, options) {
  const nodes = {};
  for (const element of data.elements || []) {
    if (element?.type === 'node') nodes[element.id] = element;
  }
  const ways = (data.elements || []).filter((element) => element?.type === 'way' && Array.isArray(element.nodes));
  const pyramidWays = ways.filter((way) => isPyramid(way.tags)).slice(0, MAX_PYRAMIDS);
  const wallWays = ways.filter((way) => isHistoricWall(way.tags)).slice(0, MAX_WALL_WAYS);
  let pyramids = 0;
  let walls = 0;
  const createdMeshes = [];

  for (const way of pyramidWays) {
    const mesh = createPyramidMesh(way, nodes, (points) => options.sanitizeWorldFootprintPoints(
      points,
      options.featureMinPolygonArea,
      options.geometryGuards
    ), options.registerBuildingCollision);
    if (!mesh) continue;
    appCtx.scene.add(mesh);
    appCtx.historicMarkers.push(mesh);
    createdMeshes.push(mesh);
    pyramids += 1;
  }
  for (const way of wallWays) {
    const mesh = createWallMesh(way, nodes);
    if (!mesh) continue;
    appCtx.scene.add(mesh);
    appCtx.historicMarkers.push(mesh);
    createdMeshes.push(mesh);
    walls += 1;
  }
  const suspensionBridge = renderSuspensionBridgeLandmark(data);
  if (suspensionBridge?.meshes?.length) createdMeshes.push(...suspensionBridge.meshes);
  return {
    requested: ways.length,
    pyramids,
    walls,
    suspensionBridge: suspensionBridge ? {
      towerParts: suspensionBridge.towerParts,
      towers: suspensionBridge.towers,
      cables: suspensionBridge.cables,
      girders: suspensionBridge.girders,
      suspenders: suspensionBridge.suspenders,
      structuralMembers: suspensionBridge.structuralMembers,
      synchronizedRoads: suspensionBridge.synchronizedRoads,
      spanMeters: suspensionBridge.spanMeters
    } : null,
    actorReprojected: reprojectActorOutsideLandmarks(createdMeshes)
  };
}

export async function loadLandmarksForPublication(options = {}) {
  if (!options.isActiveLoadContext?.()) return { status: 'aborted' };
  try {
    const data = await fetchBundledLandmarkData({
      lat: appCtx.LOC?.lat,
      lon: appCtx.LOC?.lon
    });
    if (!options.isActiveLoadContext?.()) return { status: 'aborted' };
    const metrics = data
      ? renderLandmarks(data, options)
      : { pyramids: 0, walls: 0, suspensionBridge: null };
    metrics.curatedModels = await renderCuratedLandmarkModels(options);
    if (!options.isActiveLoadContext?.()) return { status: 'aborted' };
    metrics.source = data?._overpassSource || null;
    metrics.packId = data?._landmarkPackId || null;
    options.loadMetrics.landmarks = metrics;
    if (appCtx.perfStats?.lastLoad) appCtx.perfStats.lastLoad.landmarks = metrics;
    return { status: 'ready', metrics };
  } catch (err) {
    options.recordLoadWarning?.('landmark publication', err);
    return { status: 'error', error: err?.message || String(err) };
  }
}
