import { ctx as appCtx } from "../shared-context.js?v=55";
import { fetchShortbreadTile } from "./shortbread-source.js?v=13";
import {
  buildStreamingBuildingVisuals,
  buildStreamingRoadVisuals,
  queueGeometryDisposal
} from "./streaming-vector-chunks.js?v=54";
import { SOURCE_PROFILE } from "./surface-contract.js?v=7";

function removeMeshesInPlace(source, removed) {
  if (!Array.isArray(source)) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < source.length; readIndex += 1) {
    const mesh = source[readIndex];
    if (removed.has(mesh)) continue;
    source[writeIndex] = mesh;
    writeIndex += 1;
  }
  source.length = writeIndex;
  return source;
}

async function loadAerialContextChunk(request) {
  const chunk = {
    key: `aerial:${request.z}/${request.x}/${request.y}`,
    tile: request,
    surfaceTile: request.surfaceTile || null,
    featureBudget: {},
    meshes: [],
    roadMeshes: [],
    buildingMeshes: [],
    roads: [],
    buildings: []
  };
  try {
    const tileRecord = await fetchShortbreadTile(request.z, request.x, request.y, { signal: request.signal });
    if (request.signal?.aborted) throw new DOMException('Aerial context chunk aborted', 'AbortError');
    await buildStreamingRoadVisuals(tileRecord, chunk, {
      aerialContext: true,
      includeInitial: true,
      maxFeatures: 140,
      recordFeatures: false
    });
    if (request.signal?.aborted) throw new DOMException('Aerial context chunk aborted', 'AbortError');
    await buildStreamingBuildingVisuals(tileRecord, chunk, {
      aerialContext: true,
      batchByCell: false,
      includeInitial: true,
      lodTier: 'far',
      maxFeatures: 120,
      maxFootprintPoints: 14,
      maxParts: 80,
      recordColliders: false
    });
    if (request.signal?.aborted) throw new DOMException('Aerial context chunk aborted', 'AbortError');
    chunk.meshes.forEach((mesh) => {
      mesh.userData.aerialContext = true;
      mesh.visible = false;
      appCtx.scene.add(mesh);
    });
    if (!Array.isArray(appCtx.aerialContextMeshes)) appCtx.aerialContextMeshes = [];
    appCtx.aerialContextMeshes.push(...chunk.meshes);
    appCtx.updateWorldLod?.(true);
    return chunk;
  } catch (error) {
    disposeAerialContextChunk(chunk);
    throw error;
  }
}

function disposeAerialContextChunk(chunk) {
  if (!chunk || chunk._disposed) return;
  chunk._disposed = true;
  const removed = new Set(chunk.meshes || []);
  removed.forEach((mesh) => {
    if (mesh?.parent) mesh.parent.remove(mesh);
    queueGeometryDisposal(mesh?.geometry);
  });
  removeMeshesInPlace(appCtx.aerialContextMeshes, removed);
}

function aerialContextCenter({ center, enabled } = {}) {
  return enabled && Number.isFinite(center?.lat) && Number.isFinite(center?.lon) ? center : appCtx.LOC;
}

async function primeAerialContext(options = {}) {
  const minLoadedTiles = Math.max(1, Math.round(Number(options.minLoadedTiles) || 9));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 20000);
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    appCtx.updateEarthWorldStreaming?.(0.25, { allowLoading: true });
    const layer = appCtx.getEarthStreamingSnapshot?.()?.layers?.['aerial-vector'];
    if (layer?.centerLoaded && Number(layer.loadedNearCenter || 0) >= minLoadedTiles) return layer;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 80));
  }
  throw new Error(`Aerial context preparation timed out after ${Math.round(timeoutMs)}ms.`);
}

function initStreamingAerialContext() {
  if (typeof appCtx.registerEarthStreamLayer !== 'function' || appCtx._streamingAerialContextRegistered) return false;
  appCtx._streamingAerialContextRegistered = true;
  appCtx.aerialContextMeshes = Array.isArray(appCtx.aerialContextMeshes) ? appCtx.aerialContextMeshes : [];
  appCtx.unregisterStreamingAerialContext = appCtx.registerEarthStreamLayer('aerial-vector', {
    activeWhen: () => !!appCtx.initialEarthWorldReady && appCtx.getContinuousWorldEnabled?.() !== true,
    availableWhenDisabled: true,
    centerWhen: aerialContextCenter,
    loadChunk: loadAerialContextChunk,
    maxActive: 9,
    maxConcurrent: 3,
    priorityBias: 0.8,
    profile: SOURCE_PROFILE.LOCATION_OSM,
    radius: 1,
    sources: ['osm-shortbread'],
    unloadChunk: disposeAerialContextChunk,
    zoom: 13
  });
  appCtx.primeAerialContext = primeAerialContext;
  return true;
}

initStreamingAerialContext();

export { disposeAerialContextChunk, initStreamingAerialContext, loadAerialContextChunk, primeAerialContext };
