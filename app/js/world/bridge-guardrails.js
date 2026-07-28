import { ctx as appCtx } from "../shared-context.js?v=55";
import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=28";
import { addBuildingToSpatialIndex, removeBuildingsFromSpatialIndex } from "./building-spatial-index.js?v=5";
import { elevatedSegmentSafety, isProtectedRoadFeature } from "./bridge-safety.js?v=2";

function removeArrayItemsInPlace(source, removed) {
  if (!Array.isArray(source) || !(removed instanceof Set) || removed.size === 0) return source || [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < source.length; readIndex += 1) {
    const value = source[readIndex];
    if (removed.has(value)) continue;
    source[writeIndex] = value;
    writeIndex += 1;
  }
  source.length = writeIndex;
  return source;
}

function barrierFootprint(x, z, dx, dz, length, thickness) {
  const nx = -dz / length;
  const nz = dx / length;
  const halfLength = length * 0.5;
  const halfThickness = thickness * 0.5;
  const tx = dx / length;
  const tz = dz / length;
  return [
    { x: x - tx * halfLength - nx * halfThickness, z: z - tz * halfLength - nz * halfThickness },
    { x: x + tx * halfLength - nx * halfThickness, z: z + tz * halfLength - nz * halfThickness },
    { x: x + tx * halfLength + nx * halfThickness, z: z + tz * halfLength + nz * halfThickness },
    { x: x - tx * halfLength + nx * halfThickness, z: z - tz * halfLength + nz * halfThickness }
  ];
}

function colliderBounds(points) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs)
  };
}

export function registerBridgeGuardrails(road, owner = null) {
  if (!isProtectedRoadFeature(road) || !Array.isArray(road.pts) || road.pts.length < 2) return [];
  if (road._guardrailsRegistered) return road.guardrailColliders || [];
  if (Array.isArray(road.guardrailColliders) && road.guardrailColliders.length > 0) return road.guardrailColliders;
  const colliders = [];
  const width = Math.max(3, Number(road.width) || 5);
  const offset = width * 0.5 + 0.3;
  const thickness = 0.24;
  const distances = new Float32Array(road.pts.length);
  for (let i = 1; i < road.pts.length; i += 1) {
    distances[i] = distances[i - 1] + Math.hypot(
      road.pts[i].x - road.pts[i - 1].x,
      road.pts[i].z - road.pts[i - 1].z
    );
  }
  const total = Number(distances[distances.length - 1]) || 0;
  for (let i = 0; i < road.pts.length - 1; i += 1) {
    const a = road.pts[i];
    const b = road.pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.4)) continue;
    const nx = -dz / length;
    const nz = dx / length;
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;
    const surfaceY = sampleFeatureSurfaceY(road, midX, midZ);
    const terrainY = appCtx.baseTerrainHeightAt?.(midX, midZ) ?? appCtx.terrainMeshHeightAt?.(midX, midZ) ?? 0;
    const safety = elevatedSegmentSafety(road, {
      x: midX,
      z: midZ,
      deckY: surfaceY,
      terrainY,
      distance: (distances[i] + distances[i + 1]) * 0.5,
      total,
      waterAreas: appCtx.waterAreas
    });
    if (!safety.protected) continue;
    for (const side of [-1, 1]) {
      const x = midX + nx * offset * side;
      const z = midZ + nz * offset * side;
      const pts = barrierFootprint(x, z, dx, dz, length + 0.3, thickness);
      const collider = {
        pts,
        ...colliderBounds(pts),
        baseY: surfaceY,
        minY: surfaceY,
        maxY: surfaceY + 1.25,
        height: 1.25,
        buildingType: 'bridge_guardrail',
        collisionKind: 'barrier',
        geometrySource: 'road_guardrail',
        heightSource: 'infrastructure',
        levelsSource: 'not_applicable',
        colliderDetail: 'full',
        sourceBuildingId: `${road.sourceFeatureId}:guardrail:${i}:${side}`,
        guardrailReason: safety.reason
      };
      colliders.push(collider);
      appCtx.buildings.push(collider);
      addBuildingToSpatialIndex(collider);
    }
  }
  road._guardrailsRegistered = true;
  road.guardrailColliders = colliders;
  road._guardrailOwner = owner || null;
  if (owner) {
    if (!Array.isArray(owner.bridgeGuardrails)) owner.bridgeGuardrails = [];
    if (!Array.isArray(owner.buildings)) owner.buildings = [];
    owner.bridgeGuardrails.push(...colliders);
    owner.buildings.push(...colliders);
  }
  return colliders;
}

function clearRoadGuardrails(road) {
  const colliders = Array.isArray(road?.guardrailColliders) ? road.guardrailColliders : [];
  if (colliders.length > 0) {
    const colliderSet = new Set(colliders);
    removeBuildingsFromSpatialIndex(colliders);
    removeArrayItemsInPlace(appCtx.buildings, colliderSet);
    const owner = road._guardrailOwner;
    if (owner) {
      removeArrayItemsInPlace(owner.bridgeGuardrails, colliderSet);
      removeArrayItemsInPlace(owner.buildings, colliderSet);
    }
  }
  road.guardrailColliders = [];
  road._guardrailsRegistered = false;
}

export function refreshBridgeGuardrails(roads = appCtx.roads) {
  if (!Array.isArray(roads)) return 0;
  let count = 0;
  roads.forEach((road) => {
    const owner = road?._guardrailOwner || null;
    clearRoadGuardrails(road);
    count += registerBridgeGuardrails(road, owner).length;
  });
  return count;
}

export function removeBridgeGuardrails(owner) {
  const colliders = Array.isArray(owner?.bridgeGuardrails) ? owner.bridgeGuardrails : [];
  if (colliders.length === 0) return;
  const colliderSet = new Set(colliders);
  removeBuildingsFromSpatialIndex(colliders);
  removeArrayItemsInPlace(appCtx.buildings, colliderSet);
  owner.bridgeGuardrails = [];
  (owner.roads || []).forEach((road) => {
    road.guardrailColliders = [];
    road._guardrailsRegistered = false;
    road._guardrailOwner = null;
  });
}

Object.assign(appCtx, { refreshBridgeGuardrails });
