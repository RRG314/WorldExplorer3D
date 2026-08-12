import {
  polylineDistances,
  sampleFeatureSurfaceY
} from "../structure-semantics.js?v=41";
import {
  addBuildingToSpatialIndex,
  removeBuildingsFromSpatialIndex
} from "./building-spatial-index.js?v=5";

const STRUCTURE_COLLIDER_POLICY = 'covered-only-tunnels-withheld-until-trustworthy-portals';

function pointAtDistance(feature, profile, distance) {
  const points = feature?.pts;
  if (!Array.isArray(points) || points.length < 2) return null;
  const target = Math.max(0, Math.min(profile.total, Number(distance) || 0));
  let index = 0;
  while (index < points.length - 2 && profile.distances[index + 1] < target) index += 1;
  const start = points[index];
  const end = points[index + 1];
  const segmentStart = Number(profile.distances[index]) || 0;
  const segmentLength = Math.max(
    1e-6,
    (Number(profile.distances[index + 1]) || segmentStart) - segmentStart
  );
  const t = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
    tangentX: dx / length,
    tangentZ: dz / length
  };
}

function rectangleFootprint(start, end, centerOffset, halfThickness) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0.05)) return null;
  const tx = dx / length;
  const tz = dz / length;
  const nx = -tz;
  const nz = tx;
  const startX = start.x + nx * centerOffset;
  const startZ = start.z + nz * centerOffset;
  const endX = end.x + nx * centerOffset;
  const endZ = end.z + nz * centerOffset;
  return [
    { x: startX - tx * 0.12 - nx * halfThickness, z: startZ - tz * 0.12 - nz * halfThickness },
    { x: endX + tx * 0.12 - nx * halfThickness, z: endZ + tz * 0.12 - nz * halfThickness },
    { x: endX + tx * 0.12 + nx * halfThickness, z: endZ + tz * 0.12 + nz * halfThickness },
    { x: startX - tx * 0.12 + nx * halfThickness, z: startZ - tz * 0.12 + nz * halfThickness }
  ];
}

function boundsFor(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z))
  };
}

function descriptor(feature, kind, points, minY, maxY, index) {
  const sourceIdentity = String(
    feature?.transportRecord?.identity ||
    feature?.sourceFeatureId ||
    'transport-structure'
  );
  return {
    pts: points,
    ...boundsFor(points),
    baseY: minY,
    minY,
    maxY,
    height: Math.max(0, maxY - minY),
    buildingType: 'transport_structure_collider',
    collisionKind: 'barrier',
    geometrySource: 'compiled_transport_structures',
    heightSource: 'compiled_transport_surface',
    levelsSource: 'not_applicable',
    colliderDetail: 'full',
    structureColliderKind: kind,
    sourceBuildingId: `${sourceIdentity}:structure-collider:${kind}:${index}`
  };
}

function colliderRanges(feature, profile) {
  const tunnel = feature?.tunnelSystemModel;
  if (Array.isArray(tunnel?.shellRanges) && tunnel.shellRanges.length > 0) {
    return tunnel.shellRanges;
  }
  const semantics = feature?.structureSemantics || {};
  if (semantics.structureKind === 'covered') return [{ start: 0, end: profile.total }];
  return [];
}

export function compileStructureColliderDescriptors(features = []) {
  const colliders = [];
  for (const feature of features) {
    if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;
    const semantics = feature.structureSemantics || {};
    // Tunnel collider shells share the same incomplete aperture geometry as
    // the withheld tunnel presentation. Do not publish invisible ceilings or
    // walls that can snag a vehicle while no trustworthy portal exists.
    const tunnelLike = false;
    const coveredLike = semantics.structureKind === 'covered';
    if (!tunnelLike && !coveredLike) continue;
    const profile = polylineDistances(feature.pts);
    if (!(profile.total > 0.5)) continue;
    const specification = feature?.transportStructureRef?.specification || {};
    const width = Math.max(3.4, Number(feature.width) || 6);
    const clearance = tunnelLike
      ? Math.max(3, Number(feature?.tunnelSystemModel?.clearance) || Number(specification.tunnelClearance) || 4.2)
      : Math.max(3, Math.min(5.2, Number(feature?.transportRecord?.maxHeightMeters) || 4.4));
    const wallOffset = Number(specification.tunnelWallOffset) || width * 0.5 + 0.72;
    const enclosedSides = tunnelLike || semantics.buildingPassage || semantics.indoor;
    let colliderIndex = 0;
    for (const range of colliderRanges(feature, profile)) {
      const startDistance = Math.max(0, Number(range.start) || 0);
      const endDistance = Math.min(profile.total, Number(range.end) || 0);
      if (!(endDistance - startDistance > 0.5)) continue;
      const stationCount = Math.max(1, Math.ceil((endDistance - startDistance) / 8));
      for (let station = 0; station < stationCount; station += 1) {
        const distanceA = startDistance + (endDistance - startDistance) * station / stationCount;
        const distanceB = startDistance + (endDistance - startDistance) * (station + 1) / stationCount;
        const start = pointAtDistance(feature, profile, distanceA);
        const end = pointAtDistance(feature, profile, distanceB);
        if (!start || !end) continue;
        const midX = (start.x + end.x) * 0.5;
        const midZ = (start.z + end.z) * 0.5;
        const roadY = sampleFeatureSurfaceY(feature, midX, midZ);
        if (!Number.isFinite(roadY)) continue;
        if (enclosedSides) {
          for (const side of [-1, 1]) {
            const footprint = rectangleFootprint(start, end, wallOffset * side, 0.16);
            if (!footprint) continue;
            colliders.push(descriptor(
              feature,
              'side_wall',
              footprint,
              roadY,
              roadY + clearance,
              colliderIndex++
            ));
          }
        }
        const ceilingFootprint = rectangleFootprint(start, end, 0, width * 0.5 + 0.55);
        if (ceilingFootprint) {
          colliders.push(descriptor(
            feature,
            'ceiling',
            ceilingFootprint,
            roadY + clearance,
            roadY + clearance + 0.4,
            colliderIndex++
          ));
        }
      }
    }
  }
  return colliders;
}

function removeArrayItems(source, removed) {
  if (!Array.isArray(source) || removed.size === 0) return;
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < source.length; readIndex += 1) {
    if (removed.has(source[readIndex])) continue;
    source[writeIndex++] = source[readIndex];
  }
  source.length = writeIndex;
}

export function refreshStructureColliders(appCtx, features = []) {
  const previous = Array.isArray(appCtx.transportStructureColliders)
    ? appCtx.transportStructureColliders
    : [];
  if (previous.length > 0) {
    const removed = new Set(previous);
    removeBuildingsFromSpatialIndex(previous);
    removeArrayItems(appCtx.buildings, removed);
  }
  const colliders = compileStructureColliderDescriptors(features);
  if (!Array.isArray(appCtx.buildings)) appCtx.replaceWorldCollection?.('buildings');
  for (const collider of colliders) {
    appCtx.buildings.push(collider);
    addBuildingToSpatialIndex(collider);
  }
  appCtx.transportStructureColliders = colliders;
  appCtx.transportStructureColliderPolicy = STRUCTURE_COLLIDER_POLICY;
  return colliders;
}
