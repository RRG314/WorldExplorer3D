import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendGeometryWithTransform, buildMergedGeometry } from "./geometry-batching.js?v=2";
import {
  addBuildingToSpatialIndex,
  clearBuildingSpatialIndex,
  removeBuildingsFromSpatialIndex
} from "./building-spatial-index.js?v=5";
import { waterSurfaceBaseElevation } from "./load-geometry.js?v=12";
import { fetchShortbreadTile } from "./shortbread-source.js?v=6";
import { buildStreamingLandcover } from "./streaming-landcover.js?v=8";
import { createRoadNameResolver } from "./streaming-road-labels.js?v=1";
import { applyFacadeWallMask } from "../engine/building-facade-shader.js?v=1";
import { createWindowTexture } from "../engine/procedural-textures.js?v=2";
import {
  classifyStructureSemantics,
  polylineBounds,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=12";
import {
  INITIAL_DETAIL_RADIUS,
  ROAD_SURFACE_OFFSET,
  appendRoadFeatureRibbon,
  appendRoadRibbon,
  cleanLine,
  cleanRing,
  createIndexedMesh,
  finite,
  forEachLayerFeature,
  forEachLayerFeatureAsync,
  geometryParts,
  outsideInitialDetail,
  roadSpeedLimit,
  roadWidth,
  stableHash,
  stableTerrainProfile,
  terrainY,
  waterwayIsNavigable,
  waterwayRenderWidth,
  worldPoint,
  yieldToRenderer
} from './streaming-vector-geometry.js?v=1';
import { registerBridgeGuardrails, removeBridgeGuardrails } from "./bridge-guardrails.js?v=6";
import { createInitialWorldRetirementApi } from "./streaming-initial-retirement.js?v=1";

const MAX_ROAD_FEATURES = 900;
const MAX_BUILDING_FEATURES = 900;
const MAX_WATER_FEATURES = 180;
const BUILDING_BATCH_CELL_METERS = 520;

let sharedMaterials = null;
let structureRefreshTimer = null;
let structureRefreshIdle = null;
let geometryDisposalIdle = null;
const geometryDisposalQueue = [];

function retainArrayItemsInPlace(source, keep) {
  if (!Array.isArray(source)) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < source.length; readIndex += 1) {
    const value = source[readIndex];
    if (!keep(value)) continue;
    source[writeIndex] = value;
    writeIndex += 1;
  }
  source.length = writeIndex;
  return source;
}

function queueGeometryDisposal(geometry) {
  if (!geometry) return;
  geometryDisposalQueue.push(geometry);
  if (geometryDisposalIdle !== null) return;
  const drain = (deadline) => {
    geometryDisposalIdle = null;
    let disposed = 0;
    while (geometryDisposalQueue.length > 0 && disposed < 24) {
      if (disposed > 0 && deadline && !deadline.didTimeout && deadline.timeRemaining() < 2) break;
      geometryDisposalQueue.shift()?.dispose?.();
      disposed += 1;
    }
    if (geometryDisposalQueue.length > 0) schedule();
  };
  const schedule = () => {
    geometryDisposalIdle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(drain, { timeout: 500 })
      : setTimeout(() => drain(null), 16);
  };
  schedule();
}

function scheduleStreamingStructureRefresh() {
  if (structureRefreshTimer !== null) clearTimeout(structureRefreshTimer);
  structureRefreshTimer = setTimeout(() => {
    structureRefreshTimer = null;
    if (structureRefreshIdle !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(structureRefreshIdle);
    }
    const run = () => {
      structureRefreshIdle = null;
      appCtx.rebuildStructureVisualMeshes?.();
      appCtx.buildTraversalNetworks?.();
    };
    structureRefreshIdle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run, { timeout: 450 })
      : setTimeout(run, 0);
  }, 180);
}

function materials() {
  if (sharedMaterials) return sharedMaterials;
  const facadeStyles = ['office_grid', 'residential_punched', 'townhouse', 'industrial_panel'];
  const buildingColors = [0x9da5a8, 0xb4aa99, 0x879398, 0xc2b9aa];
  sharedMaterials = {
    road: new THREE.MeshStandardMaterial({
      color: 0x353b40,
      roughness: 0.94,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2
    }),
    buildings: buildingColors.map((color, index) => {
      const baseTexture = createWindowTexture(`#${new THREE.Color(color).getHexString()}`, 9101 + index, {
        style: facadeStyles[index]
      });
      const texture = baseTexture?.clone?.() || baseTexture || null;
      if (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(index === 2 ? 0.06 : 0.085, 1 / 42);
        texture.needsUpdate = true;
      }
      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: texture ? 0xffffff : color,
        map: texture,
        roughness: 0.84,
        metalness: 0.04
      });
      applyFacadeWallMask(buildingMaterial, new THREE.Color(color).offsetHSL(0, -0.04, -0.12));
      return buildingMaterial;
    }),
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

async function buildRoads(tileRecord, chunk, options = {}) {
  const vertices = [];
  const indices = [];
  const resolveRoadName = createRoadNameResolver(tileRecord, cleanLine);
  const featureLimit = Math.max(1, Number(options.maxFeatures) || MAX_ROAD_FEATURES);
  await forEachLayerFeatureAsync(tileRecord, 'streets', featureLimit, (geojson, featureId) => {
    const properties = geojson.properties || {};
    const kind = String(properties.kind || '').toLowerCase();
    if (!kind || properties.rail === true) return;
    if (options.aerialContext && /(?:foot|path|track|steps|cycle|service|pedestrian)/.test(kind)) return;
    geometryParts(geojson.geometry, 'line').forEach((coordinates, partIndex) => {
      const sourcePoints = cleanLine(coordinates);
      if (sourcePoints.length < 2 || (!options.includeInitial && !outsideInitialDetail(sourcePoints))) return;
      const subdivisionStep = options.aerialContext ? 54 : 24;
      const points = typeof appCtx.subdivideRoadPoints === 'function'
        ? appCtx.subdivideRoadPoints(sourcePoints, subdivisionStep)
        : sourcePoints;
      const mappedWidth = roadWidth(properties);
      const width = options.aerialContext
        ? Math.max(1.6, Math.min(4.6, mappedWidth * 0.36))
        : mappedWidth;
      const structureTags = {
        highway: kind,
        bridge: properties.bridge === true ? 'yes' : String(properties.bridge || ''),
        tunnel: properties.tunnel === true ? 'yes' : String(properties.tunnel || ''),
        layer: String(properties.layer || ''),
        covered: String(properties.covered || ''),
        location: String(properties.location || '')
      };
      const structureSemantics = classifyStructureSemantics(structureTags, {
        featureKind: 'road',
        subtype: kind
      });
      const road = {
        pts: points,
        width,
        limit: roadSpeedLimit(properties),
        name: resolveRoadName(points, kind) || String(properties.name || kind || 'Road'),
        type: kind,
        sourceFeatureId: `stream:${chunk.key}:road:${featureId}:${partIndex}`,
        networkKind: 'road',
        walkable: true,
        driveable: !kind.includes('footway') && !kind.includes('path'),
        surfaceTag: String(properties.surface || '').toLowerCase(),
        litTag: String(properties.lit || '').toLowerCase(),
        structureTags,
        structureSemantics,
        baseStructureSemantics: { ...structureSemantics },
        surfaceBias: ROAD_SURFACE_OFFSET,
        subdivideMaxDist: subdivisionStep,
        bounds: polylineBounds(points, width * 0.5 + 18),
        _streamChunkKey: chunk.key
      };
      if (options.recordFeatures !== false) chunk.roads.push(road);
      updateFeatureSurfaceProfile(road, terrainY, { surfaceBias: ROAD_SURFACE_OFFSET });
      appendRoadFeatureRibbon(road, vertices, indices);
    });
  });
  const mesh = createIndexedMesh(vertices, indices, materials().road, {
    isRoadBatch: true,
    streamChunkKey: chunk.key,
    aerialContext: options.aerialContext === true
  });
  if (!mesh) return;
  mesh.renderOrder = 2;
  chunk.meshes.push(mesh);
  chunk.roadMeshes.push(mesh);
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
  if (!Array.isArray(footprint) || footprint.length < 3 || !(height > 0)) return;
  let signedArea = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const next = footprint[(i + 1) % footprint.length];
    signedArea += footprint[i].x * next.z - next.x * footprint[i].z;
  }

  const topY = baseY + height;
  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.01)) continue;
    const leftX = -dz / length;
    const leftZ = dx / length;
    const outwardSign = signedArea >= 0 ? -1 : 1;
    const nx = leftX * outwardSign;
    const nz = leftZ * outwardSign;
    const start = batch.positions.length / 3;
    batch.positions.push(a.x, baseY, a.z, b.x, baseY, b.z, b.x, topY, b.z, a.x, topY, a.z);
    for (let vertex = 0; vertex < 4; vertex += 1) batch.normals.push(nx, 0, nz);
    batch.uvs.push(0, 0, length, 0, length, height, 0, height);
    if (signedArea >= 0) batch.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
    else batch.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  const roofStart = batch.positions.length / 3;
  const contour = footprint.map((point) => new THREE.Vector2(point.x, point.z));
  for (let i = 0; i < footprint.length; i += 1) {
    batch.positions.push(footprint[i].x, topY, footprint[i].z);
    batch.normals.push(0, 1, 0);
    batch.uvs.push(footprint[i].x * 0.02, footprint[i].z * 0.02);
  }
  const roofTriangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (let i = 0; i < roofTriangles.length; i += 1) {
    let [aIndex, bIndex, cIndex] = roofTriangles[i];
    const a = footprint[aIndex];
    const b = footprint[bIndex];
    const c = footprint[cIndex];
    const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (normalY < 0) [bIndex, cIndex] = [cIndex, bIndex];
    batch.indices.push(roofStart + aIndex, roofStart + bIndex, roofStart + cIndex);
  }
}

async function buildBuildings(tileRecord, chunk, options = {}) {
  const batches = new Map();
  let partsBuilt = 0;
  let partsVisited = 0;
  const getBatch = (bounds, materialIndex) => {
    const cellMeters = Math.max(300, Number(options.batchCellMeters) || BUILDING_BATCH_CELL_METERS);
    const cellX = Math.floor(bounds.centerX / cellMeters);
    const cellZ = Math.floor(bounds.centerZ / cellMeters);
    const groupKey = options.batchByCell === false ? `${chunk.key}:tile` : `${chunk.key}:${cellX},${cellZ}`;
    const key = `${groupKey}:${materialIndex}`;
    if (!batches.has(key)) {
      batches.set(key, {
        positions: [],
        normals: [],
        uvs: [],
        indices: [],
        count: 0,
        groupKey,
        materialIndex
      });
    }
    return batches.get(key);
  };
  const layer = tileRecord.tile.layers.buildings;
  const featureCount = Math.min(Number(layer?.length) || 0, Math.max(1, Number(options.maxFeatures) || MAX_BUILDING_FEATURES));
  const partLimit = Math.max(100, Number(options.maxParts) || MAX_BUILDING_FEATURES * 3);
  for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
    if (partsBuilt >= partLimit) break;
    if (chunk.tile.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    const feature = layer.feature(featureIndex);
    if (!feature || typeof feature.toGeoJSON !== 'function') continue;
    const featureId = feature.id ?? featureIndex;
    const geojson = feature.toGeoJSON(tileRecord.x, tileRecord.y, tileRecord.z);
    const properties = geojson.properties || {};
    const parts = geometryParts(geojson.geometry, 'polygon');
    const remainingFeatures = Math.max(1, featureCount - featureIndex);
    const featureQuota = Math.max(1, Math.ceil((partLimit - partsBuilt) / remainingFeatures));
    const partStride = Math.max(1, Math.ceil(parts.length / featureQuota));
    for (let partIndex = 0; partIndex < parts.length && partsBuilt < partLimit; partIndex += partStride) {
      const coordinates = parts[partIndex];
      partsVisited += 1;
      if (partsVisited % 24 === 0) await yieldToRenderer();
      const footprint = cleanRing(coordinates, Math.max(16, Number(options.maxFootprintPoints) || 96));
      if (footprint.length < 3 || (!options.includeInitial && !outsideInitialDetail(footprint))) continue;
      const identity = `${chunk.key}:${featureId}:${partIndex}`;
      const bounds = footprintBounds(footprint);
      const height = buildingHeight(properties, footprint, identity);
      const baseY = terrainY(bounds.centerX, bounds.centerZ);
      const materialIndex = stableHash(`${identity}:${properties.kind || ''}`) % materials().buildings.length;
      const batch = getBatch(bounds, materialIndex);
      appendBuildingGeometry(footprint, height, baseY, batch);
      batch.count += 1;
      partsBuilt += 1;
      if (options.recordColliders !== false) {
        chunk.buildings.push({
          pts: null,
          ...bounds,
          height,
          baseY,
          minY: baseY,
          maxY: baseY + height,
          colliderDetail: 'bbox',
          sourceBuildingId: `stream:${identity}`,
          buildingType: String(properties.kind || 'yes'),
          collisionKind: 'solid',
          geometrySource: 'shortbread-vector',
          _streamChunkKey: chunk.key
        });
      }
    }
    if (featureIndex > 0 && featureIndex % 4 === 0) await yieldToRenderer();
  }

  let batchIndex = 0;
  for (const batch of batches.values()) {
    if (batch.positions.length === 0) continue;
    const geometry = buildMergedGeometry(batch);
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, materials().buildings[batch.materialIndex]);
    const sphere = geometry.boundingSphere;
    mesh.userData = {
      earthStreamingChunk: true,
      streamChunkKey: chunk.key,
      lodTier: options.lodTier || 'mid',
      lodGroupKey: batch.groupKey,
      isBuildingBatch: true,
      batchCount: batch.count,
      lodCenter: sphere ? { x: sphere.center.x, z: sphere.center.z } : null,
      lodRadius: Number(sphere?.radius) || BUILDING_BATCH_CELL_METERS * 0.75,
      aerialContext: options.aerialContext === true
    };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    chunk.meshes.push(mesh);
    chunk.buildingMeshes.push(mesh);
    batchIndex += 1;
    if (batchIndex % 12 === 0) await yieldToRenderer();
  }
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.z - next.x * points[i].z;
  }
  return Math.abs(area * 0.5);
}

async function buildWater(tileRecord, chunk) {
  const batch = { positions: [], normals: [], uvs: [], indices: [] };
  const lineVertices = [];
  const lineIndices = [];
  const visitLayer = async (layerName) => {
    await forEachLayerFeatureAsync(tileRecord, layerName, MAX_WATER_FEATURES, (geojson, featureId) => {
      geometryParts(geojson.geometry, 'polygon').forEach((coordinates, partIndex) => {
        const footprint = cleanRing(coordinates, 120);
        if (footprint.length < 3 || !outsideInitialDetail(footprint)) return;
        const area = polygonArea(footprint);
        if (area < 20) return;
        const bounds = footprintBounds(footprint);
        const stride = Math.max(1, Math.floor(footprint.length / 16));
        const sampledHeights = footprint
          .filter((_, index) => index % stride === 0)
          .map((point) => terrainY(point.x, point.z));
        const surfaceY = layerName === 'ocean' ? 0 : waterSurfaceBaseElevation(sampledHeights);
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
      });
    });
  };
  await visitLayer('ocean');
  await visitLayer('water_polygons');
  await forEachLayerFeatureAsync(tileRecord, 'water_lines', MAX_WATER_FEATURES, (geojson, featureId) => {
    const properties = geojson.properties || {};
    geometryParts(geojson.geometry, 'line').forEach((coordinates, partIndex) => {
      const points = cleanLine(coordinates, 180);
      if (points.length < 2 || !outsideInitialDetail(points)) return;
      const width = waterwayRenderWidth(properties);
      const surfaceProfile = stableTerrainProfile(points, 0.14);
      appendRoadRibbon(points, width, lineVertices, lineIndices, { surfaceProfile });
      const waterway = {
        type: String(properties.kind || properties.waterway || 'waterway'),
        pts: points,
        width,
        navigable: waterwayIsNavigable(properties),
        surfaceProfile,
        sourceFeatureId: `stream:${chunk.key}:waterway:${featureId}:${partIndex}`,
        _streamChunkKey: chunk.key
      };
      chunk.waterways.push(waterway);
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
      chunk.landuseMeshes.push(mesh);
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
    chunk.landuseMeshes.push(lineMesh);
  }
}

function commitStreamingVectorChunk(chunk) {
  if (!chunk || chunk._committed || chunk._disposed) return chunk;
  chunk._committed = true;
  chunk.meshes.forEach((mesh) => appCtx.scene.add(mesh));
  appCtx.roadMeshes.push(...chunk.roadMeshes);
  appCtx.buildingMeshes.push(...chunk.buildingMeshes);
  appCtx.landuseMeshes.push(...chunk.landuseMeshes);
  appCtx.vegetationMeshes.push(...chunk.vegetationMeshes);
  appCtx.roads.push(...chunk.roads);
  appCtx.buildings.push(...chunk.buildings);
  appCtx.landuses.push(...chunk.landuses);
  appCtx.waterAreas.push(...chunk.waterAreas);
  appCtx.waterways.push(...chunk.waterways);
  appCtx.vegetationFeatures.push(...chunk.vegetationFeatures);
  chunk.buildings.forEach(addBuildingToSpatialIndex);
  chunk.roads.forEach((road) => {
    if (road.structureSemantics?.terrainMode === 'elevated') registerBridgeGuardrails(road, chunk);
  });
  if (chunk.roads.length > 0) appCtx.invalidateTraversalNetworks?.('streaming_vector_chunk_committed');
  return chunk;
}

async function loadStreamingVectorChunk(request) {
  const chunk = {
    key: `${request.z}/${request.x}/${request.y}`,
    tile: request,
    meshes: [],
    roadMeshes: [],
    buildingMeshes: [],
    roads: [],
    buildings: [],
    bridgeGuardrails: [],
    landuses: [],
    landuseMeshes: [],
    waterAreas: [],
    waterways: [],
    vegetationFeatures: [],
    vegetationMeshes: []
  };
  try {
    if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    if (appCtx.terrainEnabled && typeof appCtx.waitForTerrainReadyAt === 'function') {
      const centerLat = (Number(request.bounds?.latN) + Number(request.bounds?.latS)) * 0.5;
      const centerLon = (Number(request.bounds?.lonW) + Number(request.bounds?.lonE)) * 0.5;
      const center = appCtx.geoToWorld(centerLat, centerLon);
      const terrainReady = await appCtx.waitForTerrainReadyAt(center.x, center.z, 6000);
      if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
      if (!terrainReady) throw new Error(`Terrain elevation unavailable for streaming chunk ${chunk.key}`);
    }
    const tileRecord = await fetchShortbreadTile(request.z, request.x, request.y, { signal: request.signal });
    if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    await buildWater(tileRecord, chunk);
    await yieldToRenderer();
    if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    await buildRoads(tileRecord, chunk);
    await yieldToRenderer();
    if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    await buildBuildings(tileRecord, chunk);
    await yieldToRenderer();
    if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    await buildStreamingLandcover(tileRecord, chunk, {
      cleanRing,
      forEachLayerFeature,
      forEachLayerFeatureAsync,
      geometryParts,
      outsideInitialDetail,
      terrainY
    });
    if (request.signal?.aborted) throw new DOMException('Streaming chunk aborted', 'AbortError');
    commitStreamingVectorChunk(chunk);
    appCtx.refreshBridgeGuardrails?.(chunk.roads);
    appCtx.invalidateRoadCache?.();
    scheduleStreamingStructureRefresh();
    return chunk;
  } catch (error) {
    disposeStreamingVectorChunk(chunk);
    throw error;
  }
}

function disposeStreamingVectorChunk(chunk) {
  if (!chunk || chunk._disposed) return;
  chunk._disposed = true;
  const committed = chunk._committed === true;
  const meshSet = new Set(chunk.meshes || []);
  meshSet.forEach((mesh) => {
    if (mesh?.parent) mesh.parent.remove(mesh);
    queueGeometryDisposal(mesh?.geometry);
  });
  if (!committed) return;
  retainArrayItemsInPlace(appCtx.roadMeshes, (mesh) => !meshSet.has(mesh));
  retainArrayItemsInPlace(appCtx.buildingMeshes, (mesh) => !meshSet.has(mesh));
  retainArrayItemsInPlace(appCtx.landuseMeshes, (mesh) => !meshSet.has(mesh));

  const roadSet = new Set(chunk.roads || []);
  const buildingSet = new Set(chunk.buildings || []);
  const waterSet = new Set(chunk.waterAreas || []);
  const waterwaySet = new Set(chunk.waterways || []);
  const landuseSet = new Set(chunk.landuses || []);
  const vegetationSet = new Set(chunk.vegetationFeatures || []);
  retainArrayItemsInPlace(appCtx.roads, (road) => !roadSet.has(road));
  removeBridgeGuardrails(chunk);
  removeBuildingsFromSpatialIndex(chunk.buildings || []);
  retainArrayItemsInPlace(appCtx.buildings, (building) => !buildingSet.has(building));
  retainArrayItemsInPlace(appCtx.waterAreas, (water) => !waterSet.has(water));
  retainArrayItemsInPlace(appCtx.waterways, (waterway) => !waterwaySet.has(waterway));
  retainArrayItemsInPlace(appCtx.landuses, (landuse) => !landuseSet.has(landuse));
  retainArrayItemsInPlace(appCtx.vegetationFeatures, (feature) => !vegetationSet.has(feature));
  retainArrayItemsInPlace(appCtx.vegetationMeshes, (mesh) => !meshSet.has(mesh));
  appCtx.invalidateRoadCache?.();
  if (roadSet.size > 0) appCtx.invalidateTraversalNetworks?.('streaming_vector_chunk_disposed');
  scheduleStreamingStructureRefresh();
}

const initialWorldRetirementApi = createInitialWorldRetirementApi({
  appCtx,
  addBuildingToSpatialIndex,
  clearBuildingSpatialIndex,
  initialDetailRadius: INITIAL_DETAIL_RADIUS,
  queueGeometryDisposal,
  retainArrayItemsInPlace
});
const { maybeRetireInitialEarthWorld, retireInitialEarthWorld } = initialWorldRetirementApi;

function initStreamingVectorChunks() {
  if (typeof appCtx.registerEarthStreamLayer !== 'function') return false;
  if (appCtx._streamingVectorChunksRegistered) return true;
  appCtx._streamingVectorChunksRegistered = true;
  appCtx.maybeRetireInitialEarthWorld = maybeRetireInitialEarthWorld;
  appCtx.retireInitialEarthWorld = retireInitialEarthWorld;
  appCtx.unregisterStreamingVectorChunks = appCtx.registerEarthStreamLayer('osm-vector', {
    radius: 1,
    maxActive: 20,
    loadChunk: loadStreamingVectorChunk,
    unloadChunk: disposeStreamingVectorChunk
  });
  return true;
}

initStreamingVectorChunks();

export {
  buildBuildings as buildStreamingBuildingVisuals,
  buildRoads as buildStreamingRoadVisuals,
  disposeStreamingVectorChunk,
  initStreamingVectorChunks,
  loadStreamingVectorChunk,
  queueGeometryDisposal
};
