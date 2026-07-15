import { ctx as appCtx } from "../shared-context.js?v=55";
import { fetchShortbreadTile } from "./shortbread-source.js?v=6";
import {
  buildStreamingBuildingVisuals,
  queueGeometryDisposal
} from "./streaming-vector-chunks.js?v=24";

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
    meshes: [],
    roadMeshes: [],
    buildingMeshes: [],
    roads: [],
    buildings: []
  };
  try {
    const tileRecord = await fetchShortbreadTile(request.z, request.x, request.y, { signal: request.signal });
    if (request.signal?.aborted) throw new DOMException('Aerial context chunk aborted', 'AbortError');
    await buildStreamingBuildingVisuals(tileRecord, chunk, {
      aerialContext: true,
      batchByCell: false,
      includeInitial: true,
      lodTier: 'far',
      maxFeatures: 220,
      maxFootprintPoints: 14,
      maxParts: 120,
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

function initStreamingAerialContext() {
  if (typeof appCtx.registerEarthStreamLayer !== 'function' || appCtx._streamingAerialContextRegistered) return false;
  appCtx._streamingAerialContextRegistered = true;
  appCtx.aerialContextMeshes = Array.isArray(appCtx.aerialContextMeshes) ? appCtx.aerialContextMeshes : [];
  appCtx.unregisterStreamingAerialContext = appCtx.registerEarthStreamLayer('aerial-vector', {
    availableWhenDisabled: true,
    loadChunk: loadAerialContextChunk,
    maxActive: 9,
    maxConcurrent: 1,
    priorityBias: 0.8,
    radius: 1,
    unloadChunk: disposeAerialContextChunk,
    zoom: 13
  });
  return true;
}

initStreamingAerialContext();

export { disposeAerialContextChunk, initStreamingAerialContext, loadAerialContextChunk };
