import {
  polylineDistances,
  sampleFeatureSurfaceY
} from "../structure-semantics.js?v=63";
import {
  addBuildingToSpatialIndex,
  removeBuildingsFromSpatialIndex
} from "./building-spatial-index.js?v=7";
import { canPublishTunnelGeometry } from './compiler/tunnel-envelope.js';
import { tunnelWallIsOpen } from './compiler/tunnel-junction-openings.js';

const STRUCTURE_COLLIDER_POLICY = 'published-tunnel-geometry-solid-on-all-provider-paths';

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
    isTransportCollider: true,
    collisionKind: 'barrier',
    geometrySource: 'compiled_transport_structures',
    heightSource: 'compiled_transport_surface',
    levelsSource: 'not_applicable',
    colliderDetail: 'full',
    structureColliderKind: kind,
    transportTerrainMode: String(feature?.structureSemantics?.terrainMode || ''),
    transportStructureKind: String(feature?.structureSemantics?.structureKind || ''),
    structureSurfaceY: kind === 'side_wall' ? minY + 0.2 : minY,
    structureClearance: Math.max(0, maxY - minY),
    sourceBuildingId: `${sourceIdentity}:structure-collider:${kind}:${index}`
  };
}

function colliderRanges(feature, profile) {
  const tunnel = feature?.tunnelSystemModel;
  const shellRanges = Array.isArray(tunnel?.shellRanges)
    ? tunnel.shellRanges.filter((range) => Number(range?.end) - Number(range?.start) > 0.5)
    : [];
  const ranges = shellRanges.map((range) => ({
    start: Math.max(0, Number(range.start)),
    end: Math.min(profile.total, Number(range.end))
  }));
  // Excavation retaining walls are part of the same traversable enclosure.
  ranges.push(...(tunnel?.portalZones || []).map((zone) => ({
    start: Math.max(0, zone.approachStart), end: Math.min(profile.total, zone.approachEnd), approach: true
  })));
  return ranges;
}

export function compileStructureColliderDescriptors(features = [], options = {}) {
  const colliders = [];
  const publishedSolids = new Set();
  for (const feature of features) {
    if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;
    const semantics = feature.structureSemantics || {};
    // A published representative tunnel is still solid gameplay geometry.
    // Provider precision affects provenance, not whether its walls exist.
    const tunnelLike =
      semantics.terrainMode === 'subgrade' &&
      canPublishTunnelGeometry(feature) &&
      feature?.tunnelSystemModel?.visualKind === 'tunnel' &&
      Array.isArray(feature?.tunnelSystemModel?.shellRanges) &&
      feature.tunnelSystemModel.shellRanges.length > 0;
    if (!tunnelLike) continue;
    const profile = polylineDistances(feature.pts);
    if (!(profile.total > 0.5)) continue;
    const specification = feature?.transportStructureRef?.specification || {};
    const width = Math.max(3.4, Number(feature.width) || 6);
    const clearance = Math.max(
      3,
      Number(feature?.tunnelSystemModel?.clearance) || Number(specification.tunnelClearance) || 4.2
    );
    // Inner collision face must coincide with the visible lower lining.
    const wallOffset = width * 0.5 + 0.02 + 0.16;
    const enclosedSides = tunnelLike || semantics.buildingPassage || semantics.indoor;
    let colliderIndex = 0;
    const solid = feature.tunnelSolidBoundary;
    if (solid && !publishedSolids.has(solid)) {
      publishedSolids.add(solid);
      for (const wall of solid.walls) {
        const normalLength = Math.hypot(wall.normal[0], wall.normal[2]);
        const nx = wall.normal[0] / normalLength * .32, nz = wall.normal[2] / normalLength * .32;
        const a = { x: wall.a[0] + solid.origin.x, z: wall.a[2] + solid.origin.z };
        const b = { x: wall.b[0] + solid.origin.x, z: wall.b[2] + solid.origin.z };
        colliders.push(descriptor(feature, 'side_wall', [a, b,
          {x:b.x+nx,z:b.z+nz},{x:a.x+nx,z:a.z+nz}], wall.minY-.05, wall.maxY+.05, colliderIndex++));
      }
    }
    for (const range of colliderRanges(feature, profile)) {
      if (solid && !range.approach) continue;
      const startDistance = Math.max(0, Number(range.start) || 0);
      const endDistance = Math.min(profile.total, Number(range.end) || 0);
      if (!(endDistance - startDistance > 0.5)) continue;
      const stationCount = Math.max(1, Math.ceil((endDistance - startDistance) / 4));
      const stations = [...Array.from({ length: stationCount + 1 }, (_, i) =>
        startDistance + (endDistance - startDistance) * i / stationCount),
        ...(feature.tunnelSystemModel.wallOpenings || []).flatMap(o => [o.start, o.end])
          .filter(d => d > startDistance && d < endDistance),
        ...Array.from(profile.distances).filter((d) => d > startDistance && d < endDistance)]
        .sort((a, b) => a - b);
      for (let station = 0; station < stations.length - 1; station += 1) {
        const distanceA = stations[station];
        const distanceB = stations[station + 1];
        const start = pointAtDistance(feature, profile, distanceA);
        const end = pointAtDistance(feature, profile, distanceB);
        if (!start || !end) continue;
        const midX = (start.x + end.x) * 0.5;
        const midZ = (start.z + end.z) * 0.5;
        const roadY = sampleFeatureSurfaceY(feature, midX, midZ);
        if (!Number.isFinite(roadY)) continue;
        if (enclosedSides) {
          for (const side of [-1, 1]) {
            if (tunnelWallIsOpen(feature.tunnelSystemModel, side, (distanceA + distanceB) * 0.5)) continue;
            const footprint = rectangleFootprint(start, end, wallOffset * side, 0.16);
            if (!footprint) continue;
            let wallTop = roadY + clearance;
            if (range.approach && typeof options.sampleTerrain === 'function') {
              const edgeX = midX - start.tangentZ * (width * 0.5 + 0.02) * side;
              const edgeZ = midZ + start.tangentX * (width * 0.5 + 0.02) * side;
              const terrainY = options.sampleTerrain(edgeX, edgeZ);
              if (Number.isFinite(terrainY)) wallTop = Math.max(roadY + 0.18, terrainY + 0.08);
            }
            colliders.push(descriptor(
              feature,
              'side_wall',
              footprint,
              roadY - 0.2,
              wallTop,
              colliderIndex++
            ));
          }
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
  const colliders = compileStructureColliderDescriptors(features, {
    sampleTerrain: (x, z) => appCtx.terrainMeshHeightAt?.(x, z, { ignorePortalCuts: true })
  });
  for (const collider of colliders) {
    // Obstacles share the collision broadphase, not the mapped-property list.
    addBuildingToSpatialIndex(collider);
  }
  appCtx.transportStructureColliders = colliders;
  appCtx.transportStructureColliderPolicy = STRUCTURE_COLLIDER_POLICY;
  return colliders;
}
