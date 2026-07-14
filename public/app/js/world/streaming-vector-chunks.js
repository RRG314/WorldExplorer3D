import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendGeometryWithTransform, buildMergedGeometry } from "./geometry-batching.js?v=2";
import {
  addBuildingToSpatialIndex,
  clearBuildingSpatialIndex,
  removeBuildingsFromSpatialIndex
} from "./building-spatial-index.js?v=3";
import { fetchShortbreadTile } from "./shortbread-source.js?v=5";

const INITIAL_DETAIL_RADIUS = 1050;
const MAX_ROAD_FEATURES = 900;
const MAX_BUILDING_FEATURES = 900;
const MAX_WATER_FEATURES = 180;
const ROAD_SURFACE_OFFSET = 0.1;

let sharedMaterials = null;

function materials() {
  if (sharedMaterials) return sharedMaterials;
  sharedMaterials = {
    road: new THREE.MeshStandardMaterial({ color: 0x353b40, roughness: 0.94, metalness: 0.01 }),
    buildings: [0x9da5a8, 0xb4aa99, 0x879398, 0xc2b9aa].map((color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.03 })),
    water: new THREE.MeshStandardMaterial({
      color: 0x2477ad,
      emissive: 0x0b2e4a,
      emissiveIntensity: 0.16,
      roughness: 0.3,
      metalness: 0.02,
      side: THREE.DoubleSide
    })
  };
  return sharedMaterials;
}

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
  return Math.hypot(x / points.length, z / points.length) > INITIAL_DETAIL_RADIUS;
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

function waterwayWidth(properties = {}) {
  const explicit = finite(properties.width, NaN);
  if (Number.isFinite(explicit) && explicit > 1) return Math.min(240, explicit);
  const kind = String(properties.kind || properties.waterway || '').toLowerCase();
  if (kind.includes('river')) return 24;
  if (kind.includes('canal')) return 14;
  if (kind.includes('drain')) return 6;
  return 4;
}

function terrainY(x, z) {
  const meshY = appCtx.terrainMeshHeightAt?.(x, z);
  if (Number.isFinite(meshY)) return meshY;
  const elevationY = appCtx.elevationWorldYAtWorldXZ?.(x, z);
  return Number.isFinite(elevationY) ? elevationY : 0;
}

function appendRoadRibbon(points, width, vertices, indices) {
  if (points.length < 2) return;
  const start = vertices.length / 3;
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const halfWidth = width * 0.5;
    const y = terrainY(points[i].x, points[i].z) + ROAD_SURFACE_OFFSET;
    vertices.push(
      points[i].x + nx * halfWidth, y, points[i].z + nz * halfWidth,
      points[i].x - nx * halfWidth, y, points[i].z - nz * halfWidth
    );
    if (i < points.length - 1) {
      const vi = start + i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }
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

function buildRoads(tileRecord, chunk) {
  const vertices = [];
  const indices = [];
  forEachLayerFeature(tileRecord, 'streets', MAX_ROAD_FEATURES, (geojson, featureId) => {
    const properties = geojson.properties || {};
    const kind = String(properties.kind || '').toLowerCase();
    if (!kind || properties.rail === true) return;
    geometryParts(geojson.geometry, 'line').forEach((coordinates, partIndex) => {
      const points = cleanLine(coordinates);
      if (points.length < 2 || !outsideInitialDetail(points)) return;
      const width = roadWidth(properties);
      const road = {
        pts: points,
        width,
        limit: roadSpeedLimit(properties),
        name: String(properties.name || kind || 'Road'),
        type: kind,
        sourceFeatureId: `stream:${chunk.key}:road:${featureId}:${partIndex}`,
        networkKind: 'road',
        walkable: true,
        driveable: !kind.includes('footway') && !kind.includes('path'),
        surfaceTag: String(properties.surface || '').toLowerCase(),
        litTag: String(properties.lit || '').toLowerCase(),
        _streamChunkKey: chunk.key
      };
      chunk.roads.push(road);
      appCtx.roads.push(road);
      appendRoadRibbon(points, width, vertices, indices);
    });
  });
  const mesh = createIndexedMesh(vertices, indices, materials().road, {
    isRoadBatch: true,
    streamChunkKey: chunk.key
  });
  if (!mesh) return;
  mesh.renderOrder = 2;
  chunk.meshes.push(mesh);
  appCtx.scene.add(mesh);
  appCtx.roadMeshes.push(mesh);
}

function buildingHeight(properties, footprint, identity) {
  const explicit = finite(properties.height, NaN);
  if (Number.isFinite(explicit) && explicit > 1) return Math.min(480, explicit);
  const levels = finite(properties.levels ?? properties.num_floors, NaN);
  if (Number.isFinite(levels) && levels > 0) return Math.min(480, levels * 3.2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  footprint.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  const span = Math.max(maxX - minX, maxZ - minZ);
  const random = (stableHash(identity) % 1000) / 1000;
  return Math.min(42, Math.max(4.5, 6 + span * 0.22 + random * 9));
}

function footprintBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  return { minX, maxX, minZ, maxZ, centerX: (minX + maxX) * 0.5, centerZ: (minZ + maxZ) * 0.5 };
}

function appendBuildingGeometry(footprint, height, baseY, batch) {
  const shape = new THREE.Shape();
  footprint.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  appendGeometryWithTransform(batch, geometry, new THREE.Matrix4().makeTranslation(0, baseY, 0));
  geometry.dispose();
}

function buildBuildings(tileRecord, chunk) {
  const batches = materials().buildings.map(() => ({ positions: [], normals: [], uvs: [], indices: [] }));
  forEachLayerFeature(tileRecord, 'buildings', MAX_BUILDING_FEATURES, (geojson, featureId) => {
    const properties = geojson.properties || {};
    geometryParts(geojson.geometry, 'polygon').forEach((coordinates, partIndex) => {
      const footprint = cleanRing(coordinates);
      if (footprint.length < 3 || !outsideInitialDetail(footprint)) return;
      const identity = `${chunk.key}:${featureId}:${partIndex}`;
      const bounds = footprintBounds(footprint);
      const height = buildingHeight(properties, footprint, identity);
      const baseY = terrainY(bounds.centerX, bounds.centerZ);
      const materialIndex = stableHash(`${identity}:${properties.kind || ''}`) % batches.length;
      appendBuildingGeometry(footprint, height, baseY, batches[materialIndex]);
      const collider = {
        pts: footprint,
        ...bounds,
        height,
        baseY,
        minY: baseY,
        maxY: baseY + height,
        colliderDetail: 'full',
        sourceBuildingId: `stream:${identity}`,
        buildingType: String(properties.kind || 'yes'),
        collisionKind: 'solid',
        geometrySource: 'shortbread-vector',
        _streamChunkKey: chunk.key
      };
      chunk.buildings.push(collider);
      appCtx.buildings.push(collider);
      addBuildingToSpatialIndex(collider);
    });
  });

  batches.forEach((batch, index) => {
    if (batch.positions.length === 0) return;
    const geometry = buildMergedGeometry(batch);
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, materials().buildings[index]);
    mesh.userData = {
      earthStreamingChunk: true,
      streamChunkKey: chunk.key,
      lodTier: 'stream-far',
      isBuildingBatch: true
    };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    chunk.meshes.push(mesh);
    appCtx.scene.add(mesh);
    appCtx.buildingMeshes.push(mesh);
  });
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.z - next.x * points[i].z;
  }
  return Math.abs(area * 0.5);
}

function buildWater(tileRecord, chunk) {
  const batch = { positions: [], normals: [], uvs: [], indices: [] };
  const lineVertices = [];
  const lineIndices = [];
  const visitLayer = (layerName) => {
    forEachLayerFeature(tileRecord, layerName, MAX_WATER_FEATURES, (geojson, featureId) => {
      geometryParts(geojson.geometry, 'polygon').forEach((coordinates, partIndex) => {
        const footprint = cleanRing(coordinates, 220);
        if (footprint.length < 3 || !outsideInitialDetail(footprint)) return;
        const area = polygonArea(footprint);
        if (area < 20) return;
        const bounds = footprintBounds(footprint);
        const sampledY = terrainY(bounds.centerX, bounds.centerZ);
        const surfaceY = sampledY < -1 ? 0 : sampledY;
        const shape = new THREE.Shape();
        footprint.forEach((point, index) => {
          if (index === 0) shape.moveTo(point.x, -point.z);
          else shape.lineTo(point.x, -point.z);
        });
        shape.closePath();
        const geometry = new THREE.ShapeGeometry(shape, 1);
        geometry.rotateX(-Math.PI / 2);
        appendGeometryWithTransform(batch, geometry, new THREE.Matrix4().makeTranslation(0, surfaceY + 0.08, 0));
        geometry.dispose();
        const water = {
          type: 'water',
          pts: footprint,
          area,
          ...bounds,
          surfaceY: surfaceY + 0.08,
          sourceFeatureId: `stream:${chunk.key}:water:${featureId}:${partIndex}`,
          _streamChunkKey: chunk.key
        };
        chunk.waterAreas.push(water);
        appCtx.waterAreas.push(water);
      });
    });
  };
  visitLayer('ocean');
  visitLayer('water_polygons');
  forEachLayerFeature(tileRecord, 'water_lines', MAX_WATER_FEATURES, (geojson, featureId) => {
    const properties = geojson.properties || {};
    geometryParts(geojson.geometry, 'line').forEach((coordinates, partIndex) => {
      const points = cleanLine(coordinates, 180);
      if (points.length < 2 || !outsideInitialDetail(points)) return;
      const width = waterwayWidth(properties);
      appendRoadRibbon(points, width, lineVertices, lineIndices);
      const waterway = {
        type: String(properties.kind || properties.waterway || 'waterway'),
        pts: points,
        width,
        navigable: width >= 12,
        sourceFeatureId: `stream:${chunk.key}:waterway:${featureId}:${partIndex}`,
        _streamChunkKey: chunk.key
      };
      chunk.waterways.push(waterway);
      appCtx.waterways.push(waterway);
    });
  });

  if (batch.positions.length > 0) {
    const geometry = buildMergedGeometry(batch);
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, materials().water);
      mesh.renderOrder = 1;
      mesh.userData = {
        earthStreamingChunk: true,
        streamChunkKey: chunk.key,
        landuseType: 'water',
        alwaysVisible: true
      };
      chunk.meshes.push(mesh);
      appCtx.scene.add(mesh);
      appCtx.landuseMeshes.push(mesh);
    }
  }
  const lineMesh = createIndexedMesh(lineVertices, lineIndices, materials().water, {
    streamChunkKey: chunk.key,
    landuseType: 'waterway',
    alwaysVisible: true
  });
  if (lineMesh) {
    lineMesh.renderOrder = 1;
    chunk.meshes.push(lineMesh);
    appCtx.scene.add(lineMesh);
    appCtx.landuseMeshes.push(lineMesh);
  }
}

async function loadStreamingVectorChunk(request) {
  const chunk = {
    key: `${request.z}/${request.x}/${request.y}`,
    tile: request,
    meshes: [],
    roads: [],
    buildings: [],
    waterAreas: [],
    waterways: []
  };
  if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
  const tileRecord = await fetchShortbreadTile(request.z, request.x, request.y, { signal: request.signal });
  if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
  buildRoads(tileRecord, chunk);
  buildBuildings(tileRecord, chunk);
  buildWater(tileRecord, chunk);
  appCtx.invalidateRoadCache?.();
  return chunk;
}

function disposeStreamingVectorChunk(chunk) {
  if (!chunk) return;
  const meshSet = new Set(chunk.meshes || []);
  meshSet.forEach((mesh) => {
    if (mesh?.parent) mesh.parent.remove(mesh);
    mesh?.geometry?.dispose?.();
  });
  appCtx.roadMeshes = appCtx.roadMeshes.filter((mesh) => !meshSet.has(mesh));
  appCtx.buildingMeshes = appCtx.buildingMeshes.filter((mesh) => !meshSet.has(mesh));
  appCtx.landuseMeshes = appCtx.landuseMeshes.filter((mesh) => !meshSet.has(mesh));

  const roadSet = new Set(chunk.roads || []);
  const buildingSet = new Set(chunk.buildings || []);
  const waterSet = new Set(chunk.waterAreas || []);
  const waterwaySet = new Set(chunk.waterways || []);
  appCtx.roads = appCtx.roads.filter((road) => !roadSet.has(road));
  removeBuildingsFromSpatialIndex(chunk.buildings || []);
  appCtx.buildings = appCtx.buildings.filter((building) => !buildingSet.has(building));
  appCtx.waterAreas = appCtx.waterAreas.filter((water) => !waterSet.has(water));
  appCtx.waterways = appCtx.waterways.filter((waterway) => !waterwaySet.has(waterway));
  appCtx.invalidateRoadCache?.();
}

function isStreamingMesh(mesh) {
  return !!(mesh?.userData?.earthStreamingChunk || mesh?.userData?.streamChunkKey);
}

function removeOriginalMeshes(listName) {
  const source = Array.isArray(appCtx[listName]) ? appCtx[listName] : [];
  const retained = [];
  source.forEach((mesh) => {
    if (isStreamingMesh(mesh)) {
      retained.push(mesh);
      return;
    }
    if (mesh?.parent) mesh.parent.remove(mesh);
    mesh?.geometry?.dispose?.();
  });
  appCtx[listName] = retained;
}

function retireInitialEarthWorld() {
  if (appCtx.initialEarthWorldRetired) return false;
  appCtx.initialEarthWorldRetired = true;
  appCtx.cancelWorldSurfaceSync?.();

  removeOriginalMeshes('roadMeshes');
  removeOriginalMeshes('buildingMeshes');
  removeOriginalMeshes('landuseMeshes');
  removeOriginalMeshes('urbanSurfaceMeshes');
  removeOriginalMeshes('linearFeatureMeshes');
  removeOriginalMeshes('poiMeshes');
  removeOriginalMeshes('historicMarkers');
  removeOriginalMeshes('streetFurnitureMeshes');
  removeOriginalMeshes('vegetationMeshes');
  if (typeof appCtx.clearStructureVisualMeshes === 'function') appCtx.clearStructureVisualMeshes();
  else removeOriginalMeshes('structureVisualMeshes');

  appCtx.roads = appCtx.roads.filter((road) => road?._streamChunkKey);
  appCtx.buildings = appCtx.buildings.filter((building) => building?._streamChunkKey);
  appCtx.landuses = appCtx.landuses.filter((landuse) => landuse?._streamChunkKey);
  appCtx.waterAreas = appCtx.waterAreas.filter((water) => water?._streamChunkKey);
  appCtx.waterways = appCtx.waterways.filter((waterway) => waterway?._streamChunkKey);
  appCtx.linearFeatures = appCtx.linearFeatures.filter((feature) => feature?._streamChunkKey);
  appCtx.pois = [];
  appCtx.historicSites = [];
  appCtx.vegetationFeatures = [];
  appCtx.osmTreeNodes = [];
  appCtx.osmTreeRows = [];
  appCtx.surfaceFeatureHints = [];

  clearBuildingSpatialIndex();
  appCtx.buildings.forEach(addBuildingToSpatialIndex);
  appCtx.invalidateRoadCache?.();
  appCtx.invalidateTraversalNetworks?.('initial_world_stream_retired');
  appCtx.setPerfLiveStat?.('initialWorldRetired', true);
  return true;
}

function maybeRetireInitialEarthWorld(actor, snapshot) {
  if (appCtx.initialEarthWorldRetired || !actor) return false;
  if (Math.hypot(Number(actor.x) || 0, Number(actor.z) || 0) < 3600) return false;
  const vectorLayer = snapshot?.layers?.['osm-vector'];
  if (Number(vectorLayer?.loaded || 0) < 6 || Number(vectorLayer?.pending || 0) > 2) return false;
  return retireInitialEarthWorld();
}

function initStreamingVectorChunks() {
  if (typeof appCtx.registerEarthStreamLayer !== 'function') return false;
  if (appCtx._streamingVectorChunksRegistered) return true;
  appCtx._streamingVectorChunksRegistered = true;
  appCtx.maybeRetireInitialEarthWorld = maybeRetireInitialEarthWorld;
  appCtx.retireInitialEarthWorld = retireInitialEarthWorld;
  appCtx.unregisterStreamingVectorChunks = appCtx.registerEarthStreamLayer('osm-vector', {
    radius: 1,
    maxActive: 16,
    loadChunk: loadStreamingVectorChunk,
    unloadChunk: disposeStreamingVectorChunk
  });
  return true;
}

initStreamingVectorChunks();

export { disposeStreamingVectorChunk, initStreamingVectorChunks, loadStreamingVectorChunk };
