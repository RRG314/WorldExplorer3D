import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildMergedGeometry } from "./geometry-batching.js?v=4";
import { appendTerrainConformingPolygonBatch } from './terrain-conforming-polygon.js?v=1';
import { surfaceComposition } from './surface-contract.js?v=7';

const MAX_LAND_FEATURES = 220;
const MAX_VEGETATION_PER_TILE = 150;

const LAND_STYLE = {
  forest: { color: 0x315f31, vegetation: true, density: 1 },
  wood: { color: 0x315f31, vegetation: true, density: 0.92 },
  scrub: { color: 0x687a43, vegetation: true, density: 0.52 },
  park: { color: 0x6f9a57, vegetation: true, density: 0.24 },
  garden: { color: 0x719b59, vegetation: true, density: 0.28 },
  grass: { color: 0x78985a, vegetation: true, density: 0.12 },
  grassland: { color: 0x78985a, vegetation: true, density: 0.16 },
  meadow: { color: 0x829e62, vegetation: true, density: 0.14 },
  orchard: { color: 0x6e914f, vegetation: true, density: 0.62 },
  recreation_ground: { color: 0x769c5b, vegetation: true, density: 0.12 },
  village_green: { color: 0x789f5d, vegetation: true, density: 0.18 },
  cemetery: { color: 0x668b54, vegetation: true, density: 0.24 },
  farmland: { color: 0x9aa36a, vegetation: false, density: 0 },
  farmyard: { color: 0x948d70, vegetation: false, density: 0 },
  vineyard: { color: 0x7f9359, vegetation: true, density: 0.38 },
  sand: { color: 0xc6b77b, vegetation: false, density: 0 },
  beach: { color: 0xd2bf82, vegetation: false, density: 0 },
  bare_rock: { color: 0x8c8c83, vegetation: false, density: 0 },
  scree: { color: 0x8b887d, vegetation: false, density: 0 },
  shingle: { color: 0x969184, vegetation: false, density: 0 },
  wetland: { color: 0x547e68, vegetation: true, density: 0.2 },
  marsh: { color: 0x587e69, vegetation: true, density: 0.16 },
  residential: { color: 0xb4b5ad, vegetation: false, density: 0 },
  construction: { color: 0xa79b87, vegetation: false, density: 0 },
  education: { color: 0xb3b29f, vegetation: false, density: 0 },
  pedestrian: { color: 0xb9b6ac, vegetation: false, density: 0 },
  religious: { color: 0xaaa99c, vegetation: false, density: 0 },
  medical: { color: 0xb6aaa7, vegetation: false, density: 0 },
  transportation: { color: 0x8c9090, vegetation: false, density: 0 }
};

let sharedMaterials = null;

function materials() {
  if (sharedMaterials) return sharedMaterials;
  const land = new Map();
  Object.entries(LAND_STYLE).forEach(([kind, style]) => {
    const composition = surfaceComposition(kind);
    land.set(kind, new THREE.MeshStandardMaterial({
      color: style.color,
      roughness: 0.98,
      metalness: 0,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: composition.polygonOffsetFactor,
      polygonOffsetUnits: composition.polygonOffsetUnits
    }));
  });
  sharedMaterials = {
    land,
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4530, roughness: 0.96 }),
    broadleaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true }),
    conifer: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, vertexColors: true }),
    shrub: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, vertexColors: true })
  };
  return sharedMaterials;
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

function random01(seed) {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.z - next.x * points[i].z;
  }
  return Math.abs(area * 0.5);
}

function polygonBounds(points) {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  points.forEach((point) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  });
  return bounds;
}

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const intersects = ((a.z > z) !== (b.z > z)) &&
      x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function landKind(properties = {}) {
  const kind = String(properties.kind || properties.landuse || properties.natural || '').toLowerCase();
  if (LAND_STYLE[kind]) return kind;
  if (['bog', 'swamp', 'wet_meadow', 'string_bog'].includes(kind)) return 'wetland';
  return '';
}

function pointSegmentDistanceSq(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return (x - a.x) ** 2 + (z - a.z) ** 2;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
  return (x - (a.x + dx * t)) ** 2 + (z - (a.z + dz * t)) ** 2;
}

function placementBlocked(x, z, chunk) {
  const roads = chunk.roads || [];
  for (let roadIndex = 0; roadIndex < roads.length; roadIndex += 1) {
    const road = roads[roadIndex];
    const clearance = Math.max(3, Number(road.width || 5) * 0.5 + 1.6);
    const bounds = road.bounds;
    if (bounds && (x < bounds.minX - clearance || x > bounds.maxX + clearance || z < bounds.minZ - clearance || z > bounds.maxZ + clearance)) continue;
    for (let pointIndex = 1; pointIndex < road.pts.length; pointIndex += 1) {
      if (pointSegmentDistanceSq(x, z, road.pts[pointIndex - 1], road.pts[pointIndex]) < clearance ** 2) return true;
    }
  }
  const buildings = chunk.buildings || [];
  for (let i = 0; i < buildings.length; i += 1) {
    const building = buildings[i];
    if (x >= building.minX - 1 && x <= building.maxX + 1 && z >= building.minZ - 1 && z <= building.maxZ + 1) return true;
  }
  return false;
}

function vegetationType(kind, x, z, terrainY, seed) {
  if (kind === 'scrub' || kind === 'wetland' || kind === 'marsh') return 'shrub';
  const latitude = Number(appCtx.LOC?.lat || 0) - z / Number(appCtx.SCALE || 100000);
  const elevation = terrainY(x, z) / Math.max(0.01, Number(appCtx.WORLD_UNITS_PER_METER || 1));
  if (Math.abs(latitude) > 48 || elevation > 900) return random01(seed ^ 0x72b9) < 0.72 ? 'conifer' : 'broadleaf';
  return 'broadleaf';
}

function buildVegetationMeshes(placements, chunk, provenance = null) {
  if (placements.length === 0) return;
  const groups = { broadleaf: [], conifer: [], shrub: [] };
  placements.forEach((placement) => groups[placement.type].push(placement));
  const trunkPlacements = placements.filter((placement) => placement.type !== 'shrub');
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const addMesh = (geometry, material, source, meshType, transform) => {
    if (source.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, source.length);
    source.forEach((placement, index) => {
      transform(placement, position, scale);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotation);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (meshType !== 'trunks') mesh.setColorAt(index, new THREE.Color(placement.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData = {
      earthStreamingChunk: true,
      streamChunkKey: chunk.key,
      vegetationType: meshType,
      renderProvenance: provenance
    };
    chunk.meshes.push(mesh);
    chunk.vegetationMeshes.push(mesh);
  };
  addMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 7), materials().trunk, trunkPlacements, 'trunks', (p, pos, size) => {
    pos.set(p.x, p.y + p.height * 0.36, p.z);
    size.set(p.scale, p.height * 0.72, p.scale);
  });
  addMesh(new THREE.IcosahedronGeometry(1, 1), materials().broadleaf, groups.broadleaf, 'broadleaf', (p, pos, size) => {
    pos.set(p.x, p.y + p.height * 0.88, p.z);
    size.set(p.scale * 1.45, p.height * 0.48, p.scale * 1.45);
  });
  addMesh(new THREE.ConeGeometry(1, 2.4, 9), materials().conifer, groups.conifer, 'conifer', (p, pos, size) => {
    pos.set(p.x, p.y + p.height * 0.72, p.z);
    size.set(p.scale * 1.25, p.height * 0.48, p.scale * 1.25);
  });
  addMesh(new THREE.IcosahedronGeometry(1, 1), materials().shrub, groups.shrub, 'shrub', (p, pos, size) => {
    pos.set(p.x, p.y + p.height * 0.22, p.z);
    size.set(p.scale * 1.1, p.height * 0.26, p.scale * 1.1);
  });
}

export async function buildStreamingLandcover(tileRecord, chunk, deps = {}) {
  const { cleanRing, forEachLayerFeature, forEachLayerFeatureAsync, geometryParts, outsideInitialDetail, terrainY } = deps;
  const placements = [];
  const landBatches = new Map();
  const visitLandFeatures = typeof forEachLayerFeatureAsync === 'function'
    ? forEachLayerFeatureAsync
    : async (record, name, limit, callback) => forEachLayerFeature(record, name, limit, callback);
  await visitLandFeatures(tileRecord, 'land', MAX_LAND_FEATURES, (geojson, featureId) => {
    const kind = landKind(geojson.properties || {});
    const style = LAND_STYLE[kind];
    if (!style) return;
    geometryParts(geojson.geometry, 'polygon').forEach((coordinates, partIndex) => {
      const points = cleanRing(coordinates, 100);
      if (points.length < 3 || !outsideInitialDetail(points)) return;
      const area = polygonArea(points);
      if (area < 24) return;
      const identity = `${chunk.key}:land:${featureId}:${partIndex}`;
      const composition = surfaceComposition(kind);
      const landuse = {
        type: kind,
        pts: points,
        area,
        sourceFeatureId: identity,
        geometrySource: String(tileRecord.source || 'shortbread-vector'),
        _streamChunkKey: chunk.key
      };
      chunk.landuses.push(landuse);
      if (!landBatches.has(kind)) landBatches.set(kind, { positions: [], normals: [], uvs: [], indices: [] });
      appendTerrainConformingPolygonBatch(points, terrainY, landBatches.get(kind), {
        maxEdgeLength: 48,
        maxTriangles: Math.max(100, Math.min(520, points.length * 6)),
        surfaceOffset: composition.surfaceOffset
      });
      if (!style.vegetation || placements.length >= MAX_VEGETATION_PER_TILE) return;
      const bounds = polygonBounds(points);
      const desired = Math.min(
        MAX_VEGETATION_PER_TILE - placements.length,
        Math.max(1, Math.floor(area / 430 * style.density))
      );
      const baseSeed = stableHash(identity);
      for (let attempt = 0, added = 0; attempt < desired * 10 && added < desired; attempt += 1) {
        const seed = stableHash(`${baseSeed}:${attempt}`);
        const x = bounds.minX + random01(seed ^ 0x9e37) * (bounds.maxX - bounds.minX);
        const z = bounds.minZ + random01(seed ^ 0x85eb) * (bounds.maxZ - bounds.minZ);
        if (!pointInPolygon(x, z, points) || placementBlocked(x, z, chunk)) continue;
        const type = vegetationType(kind, x, z, terrainY, seed);
        const scaleValue = 0.72 + random01(seed ^ 0x27d4) * 0.68;
        const height = type === 'shrub' ? 1.3 + scaleValue : 5.2 + scaleValue * 3.4;
        const colors = type === 'conifer' ? [0x194b2d, 0x235a32, 0x2d6337] :
          type === 'shrub' ? [0x516e36, 0x607c3e, 0x728c49] : [0x28632e, 0x36753a, 0x478343];
        placements.push({
          x,
          y: terrainY(x, z),
          z,
          type,
          height,
          scale: scaleValue,
          rotation: random01(seed ^ 0xd3a2) * Math.PI * 2,
          color: colors[seed % colors.length],
          sourceFeatureId: identity,
          _streamChunkKey: chunk.key
        });
        added += 1;
      }
    });
  });
  let batchIndex = 0;
  for (const [kind, batch] of landBatches) {
    const geometry = buildMergedGeometry(batch);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, materials().land.get(kind));
    mesh.receiveShadow = true;
    mesh.renderOrder = surfaceComposition(kind).renderOrder;
    mesh.userData = {
      earthStreamingChunk: true,
      streamChunkKey: chunk.key,
      landuseType: kind,
      alwaysVisible: true,
      renderProvenance: deps.createProvenance?.('base.land_cover/land_use', 'land-cover') || null
    };
    chunk.meshes.push(mesh);
    chunk.landuseMeshes.push(mesh);
    batchIndex += 1;
    if (batchIndex % 4 === 0) await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  chunk.vegetationFeatures.push(...placements);
  buildVegetationMeshes(
    placements,
    chunk,
    deps.createProvenance?.('base.land_cover/land_use', 'vegetation') || null
  );
}
