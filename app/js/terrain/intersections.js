import { roadWidthAtSegment } from '../world/road-cross-section-profile.js?v=1';

const INTERSECTION_GRID_SIZE = 96;
const INTERSECTION_CLUSTER_SIZE = 4;
const INTERSECTION_MERGE_RADIUS = 1.2;
const INTERSECTION_ENDPOINT_EPSILON = 1e-3;

function pointsBoundsLocal(points = [], padding = 0) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  const pad = Math.max(0, Number(padding) || 0);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad
  };
}

function boundsIntersectLocal(a, b, padding = 0) {
  if (!a || !b) return false;
  const pad = Math.max(0, Number(padding) || 0);
  return !(
    a.maxX < b.minX - pad ||
    a.minX > b.maxX + pad ||
    a.maxZ < b.minZ - pad ||
    a.minZ > b.maxZ + pad
  );
}

function segmentIntersection2D(a1, a2, b1, b2) {
  const x1 = a1.x;
  const z1 = a1.z;
  const x2 = a2.x;
  const z2 = a2.z;
  const x3 = b1.x;
  const z3 = b1.z;
  const x4 = b2.x;
  const z4 = b2.z;
  const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(denom) < 1e-7) return null;

  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
  const u = ((x1 - x3) * (z1 - z2) - (z1 - z3) * (x1 - x2)) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    x: x1 + (x2 - x1) * t,
    z: z1 + (z2 - z1) * t,
    t,
    u
  };
}

function roadIsAtGrade(road) {
  const semantics = road?.structureSemantics;
  return (!semantics?.terrainMode || semantics.terrainMode === "at_grade") &&
    semantics?.topologySeparated !== true;
}

function normalizeBranchDirection(dx, dz) {
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-5)) return null;
  return { x: dx / len, z: dz / len };
}

function addIntersectionBranch(intersection, roadIdx, road, key, ptIdx, dx, dz, width = null) {
  if (!intersection || !road || !key) return;
  if (!intersection._branchKeys) intersection._branchKeys = new Set();
  if (intersection._branchKeys.has(key)) return;
  const dir = normalizeBranchDirection(dx, dz);
  if (!dir) return;
  const branchWidth = Number.isFinite(Number(width))
    ? Number(width)
    : Number(road.width) || 8;
  intersection._branchKeys.add(key);
  intersection.roads.push({
    roadIdx,
    ptIdx,
    width: branchWidth,
    dir
  });
  intersection.maxWidth = Math.max(Number(intersection.maxWidth) || 0, branchWidth);
  if (!roadIsAtGrade(road)) intersection.hasGradeSeparatedRoad = true;
}

function registerRoadIntersectionBranches(intersection, road, roadIdx, segIndex, t, point) {
  if (!intersection || !road || !Array.isArray(road.pts) || road.pts.length < 2) return;
  const points = road.pts;
  const lastIndex = points.length - 1;
  const clampedSegIndex = Math.max(0, Math.min(lastIndex - 1, Number(segIndex) || 0));
  const safeT = Math.max(0, Math.min(1, Number(t) || 0));
  const branchWidth = roadWidthAtSegment(road, clampedSegIndex, safeT);
  const startPoint = points[0];
  const endPoint = points[lastIndex];
  const nearStart =
    clampedSegIndex === 0 &&
    (safeT <= INTERSECTION_ENDPOINT_EPSILON ||
      Math.hypot(point.x - startPoint.x, point.z - startPoint.z) <= INTERSECTION_MERGE_RADIUS * 0.5);
  const nearEnd =
    clampedSegIndex === lastIndex - 1 &&
    (safeT >= 1 - INTERSECTION_ENDPOINT_EPSILON ||
      Math.hypot(point.x - endPoint.x, point.z - endPoint.z) <= INTERSECTION_MERGE_RADIUS * 0.5);

  if (nearStart) {
    addIntersectionBranch(intersection, roadIdx, road, `${roadIdx}:start`, 0, points[1].x - startPoint.x, points[1].z - startPoint.z, branchWidth);
    return;
  }

  if (nearEnd) {
    addIntersectionBranch(intersection, roadIdx, road, `${roadIdx}:end`, lastIndex, points[lastIndex - 1].x - endPoint.x, points[lastIndex - 1].z - endPoint.z, branchWidth);
    return;
  }

  let vertexIndex = null;
  if (safeT <= INTERSECTION_ENDPOINT_EPSILON && clampedSegIndex > 0) {
    vertexIndex = clampedSegIndex;
  } else if (safeT >= 1 - INTERSECTION_ENDPOINT_EPSILON && clampedSegIndex < lastIndex - 1) {
    vertexIndex = clampedSegIndex + 1;
  }

  if (vertexIndex !== null) {
    const vertex = points[vertexIndex];
    addIntersectionBranch(intersection, roadIdx, road, `${roadIdx}:vertex:${vertexIndex}:prev`, vertexIndex, points[vertexIndex - 1].x - vertex.x, points[vertexIndex - 1].z - vertex.z, branchWidth);
    addIntersectionBranch(intersection, roadIdx, road, `${roadIdx}:vertex:${vertexIndex}:next`, vertexIndex, points[vertexIndex + 1].x - vertex.x, points[vertexIndex + 1].z - vertex.z, branchWidth);
    return;
  }

  const p1 = points[clampedSegIndex];
  const p2 = points[clampedSegIndex + 1];
  addIntersectionBranch(intersection, roadIdx, road, `${roadIdx}:seg:${clampedSegIndex}:a`, null, p1.x - point.x, p1.z - point.z, branchWidth);
  addIntersectionBranch(intersection, roadIdx, road, `${roadIdx}:seg:${clampedSegIndex}:b`, null, p2.x - point.x, p2.z - point.z, branchWidth);
}

function roadWidthAtWorldPoint(road, point) {
  if (!road || !point || !Array.isArray(road.pts)) return Number(road?.width) || 8;
  let best = null;
  for (let index = 0; index < road.pts.length - 1; index += 1) {
    const start = road.pts[index];
    const end = road.pts[index + 1];
    const dx = Number(end.x) - Number(start.x);
    const dz = Number(end.z) - Number(start.z);
    const lengthSquared = dx * dx + dz * dz;
    if (!(lengthSquared > 1e-8)) continue;
    const t = Math.max(0, Math.min(1,
      ((Number(point.x) - Number(start.x)) * dx + (Number(point.z) - Number(start.z)) * dz) /
      lengthSquared
    ));
    const distance = Math.hypot(
      Number(point.x) - (Number(start.x) + dx * t),
      Number(point.z) - (Number(start.z) + dz * t)
    );
    if (!best || distance < best.distance) best = { distance, index, t };
  }
  return best ? roadWidthAtSegment(road, best.index, best.t) : Number(road.width) || 8;
}

function collectRoadCandidatePairs(roadInfos = []) {
  const grid = new Map();
  const pairs = [];
  const seenPairs = new Set();

  for (let i = 0; i < roadInfos.length; i++) {
    const info = roadInfos[i];
    if (!info?.bounds) continue;
    const minCellX = Math.floor(info.bounds.minX / INTERSECTION_GRID_SIZE);
    const maxCellX = Math.floor(info.bounds.maxX / INTERSECTION_GRID_SIZE);
    const minCellZ = Math.floor(info.bounds.minZ / INTERSECTION_GRID_SIZE);
    const maxCellZ = Math.floor(info.bounds.maxZ / INTERSECTION_GRID_SIZE);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = `${cx},${cz}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(info.index);
      }
    }
  }

  grid.forEach((bucket) => {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = Math.min(bucket[i], bucket[j]);
        const b = Math.max(bucket[i], bucket[j]);
        const key = `${a}:${b}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        pairs.push([a, b]);
      }
    }
  });

  return pairs;
}

function getOrCreateIntersection(intersections, spatialMap, x, z, surfaceGroup = 'at_grade') {
  const cellX = Math.floor(x / INTERSECTION_CLUSTER_SIZE);
  const cellZ = Math.floor(z / INTERSECTION_CLUSTER_SIZE);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const key = `${surfaceGroup}:${cellX + ox},${cellZ + oz}`;
      const bucket = spatialMap.get(key);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const intersection = bucket[i];
        if (Math.hypot(intersection.x - x, intersection.z - z) <= INTERSECTION_MERGE_RADIUS) {
          const sampleCount = Number(intersection.samples) || 1;
          intersection.x = (intersection.x * sampleCount + x) / (sampleCount + 1);
          intersection.z = (intersection.z * sampleCount + z) / (sampleCount + 1);
          intersection.samples = sampleCount + 1;
          return intersection;
        }
      }
    }
  }

  const intersection = { x, z, roads: [], maxWidth: 0, hasGradeSeparatedRoad: false, samples: 1, surfaceGroup, _branchKeys: new Set() };
  const key = `${surfaceGroup}:${cellX},${cellZ}`;
  let bucket = spatialMap.get(key);
  if (!bucket) {
    bucket = [];
    spatialMap.set(key, bucket);
  }
  bucket.push(intersection);
  intersections.push(intersection);
  return intersection;
}

function nearbyAtGradeIntersection(intersections, x, z) {
  return intersections.find((intersection) =>
    !intersection.hasGradeSeparatedRoad &&
    Math.hypot(intersection.x - x, intersection.z - z) <= INTERSECTION_MERGE_RADIUS
  ) || null;
}

export function detectRoadIntersections(roads) {
  const intersections = [];
  const spatialMap = new Map();
  const sourceNodeIntersections = new Map();
  const sourceTopologyOccurrences = new Map();
  const roadInfos = [];

  roads.forEach((road, roadIdx) => {
    const topology = Array.isArray(road?.sourceTopologyNodes)
      ? road.sourceTopologyNodes
      : [];
    topology.forEach((node, topologyIndex) => {
      const id = String(node?.id || '');
      if (!id || !Number.isFinite(node?.x) || !Number.isFinite(node?.z)) return;
      const occurrences = sourceTopologyOccurrences.get(id) || [];
      occurrences.push({ road, roadIdx, topology, topologyIndex, node });
      sourceTopologyOccurrences.set(id, occurrences);
    });
  });

  roads.forEach((road, roadIdx) => {
    if (!Array.isArray(road?.pts) || road.pts.length < 2) return;
    const pad = Math.max(8, Number(road.width) || 0);
    // Fixed regional centerlines already retain their canonical source-node
    // junctions below. Pairwise geometric crossing discovery is only needed
    // in the detailed location core; running it again over thousands of
    // metropolitan LOD roads spent seconds finding junction caps that are too
    // distant to resolve and duplicated the transport topology authority.
    if (road.fixedRegionalContext !== true) {
      roadInfos.push({
        index: roadInfos.length,
        roadIdx,
        road,
        bounds: pointsBoundsLocal(road.pts, pad),
        width: Number(road.width) || 8,
        atGrade: roadIsAtGrade(road)
      });
    }

    [0, road.pts.length - 1].forEach((idx) => {
      const point = road.pts[idx];
      const sourceNodeId = String(
        idx === 0 ? road.sourceNodeIds?.[0] || '' : road.sourceNodeIds?.at(-1) || ''
      );
      // Shared source topology is registered below with all incoming/outgoing
      // branches, including a side road that terminates at an internal node of
      // a longer road. Registering only this endpoint here would duplicate the
      // branch and still lose the internal main-road surface.
      if (sourceNodeId && new Set(
        (sourceTopologyOccurrences.get(sourceNodeId) || []).map((entry) => entry.roadIdx)
      ).size >= 2) return;
      let intersection = sourceNodeId ? sourceNodeIntersections.get(sourceNodeId) : null;
      if (!intersection) {
        const semantics = road.structureSemantics || {};
        const surfaceGroup = sourceNodeId
          ? `source:${sourceNodeId}`
          : roadIsAtGrade(road)
            ? 'at_grade'
            : String(semantics.verticalGroup || `${semantics.terrainMode || 'structure'}:${semantics.verticalOrder || 0}`);
        intersection = getOrCreateIntersection(intersections, spatialMap, point.x, point.z, surfaceGroup);
        if (sourceNodeId) sourceNodeIntersections.set(sourceNodeId, intersection);
      }
      registerRoadIntersectionBranches(intersection, road, roadIdx, idx === 0 ? 0 : road.pts.length - 2, idx === 0 ? 0 : 1, point);
    });
  });

  for (const [sourceNodeId, occurrences] of sourceTopologyOccurrences) {
    const roadIds = new Set(occurrences.map((entry) => entry.roadIdx));
    if (roadIds.size < 2) continue;
    const center = occurrences.reduce((result, entry) => ({
      x: result.x + Number(entry.node.x),
      z: result.z + Number(entry.node.z)
    }), { x: 0, z: 0 });
    center.x /= occurrences.length;
    center.z /= occurrences.length;
    let intersection = sourceNodeIntersections.get(sourceNodeId);
    if (!intersection) {
      intersection = getOrCreateIntersection(
        intersections,
        spatialMap,
        center.x,
        center.z,
        `source:${sourceNodeId}`
      );
      sourceNodeIntersections.set(sourceNodeId, intersection);
    }
    for (const occurrence of occurrences) {
      const { road, roadIdx, topology, topologyIndex, node } = occurrence;
      const branchWidth = roadWidthAtWorldPoint(road, node);
      const previous = topology[topologyIndex - 1];
      const next = topology[topologyIndex + 1];
      if (previous) {
        addIntersectionBranch(
          intersection,
          roadIdx,
          road,
          `${roadIdx}:source:${sourceNodeId}:previous`,
          null,
          Number(previous.x) - Number(node.x),
          Number(previous.z) - Number(node.z),
          branchWidth
        );
      }
      if (next) {
        addIntersectionBranch(
          intersection,
          roadIdx,
          road,
          `${roadIdx}:source:${sourceNodeId}:next`,
          null,
          Number(next.x) - Number(node.x),
          Number(next.z) - Number(node.z),
          branchWidth
        );
      }
    }
  }

  const candidatePairs = collectRoadCandidatePairs(roadInfos);
  for (let i = 0; i < candidatePairs.length; i++) {
    const [aIndex, bIndex] = candidatePairs[i];
    const roadA = roadInfos[aIndex];
    const roadB = roadInfos[bIndex];
    if (!roadA?.atGrade || !roadB?.atGrade) continue;
    if (!boundsIntersectLocal(roadA.bounds, roadB.bounds, Math.max(roadA.width, roadB.width) + 6)) continue;

    for (let segA = 0; segA < roadA.road.pts.length - 1; segA++) {
      const a1 = roadA.road.pts[segA];
      const a2 = roadA.road.pts[segA + 1];
      const segABounds = pointsBoundsLocal([a1, a2], roadA.width);
      for (let segB = 0; segB < roadB.road.pts.length - 1; segB++) {
        const b1 = roadB.road.pts[segB];
        const b2 = roadB.road.pts[segB + 1];
        if (!boundsIntersectLocal(segABounds, pointsBoundsLocal([b1, b2], roadB.width), 2)) continue;
        const intersectionPoint = segmentIntersection2D(a1, a2, b1, b2);
        if (!intersectionPoint) continue;

        const sharedEndpointA =
          (segA === 0 && intersectionPoint.t <= INTERSECTION_ENDPOINT_EPSILON) ||
          (segA === roadA.road.pts.length - 2 && intersectionPoint.t >= 1 - INTERSECTION_ENDPOINT_EPSILON);
        const sharedEndpointB =
          (segB === 0 && intersectionPoint.u <= INTERSECTION_ENDPOINT_EPSILON) ||
          (segB === roadB.road.pts.length - 2 && intersectionPoint.u >= 1 - INTERSECTION_ENDPOINT_EPSILON);
        if (sharedEndpointA && sharedEndpointB) continue;

        const intersection = nearbyAtGradeIntersection(
          intersections,
          intersectionPoint.x,
          intersectionPoint.z
        ) || getOrCreateIntersection(
          intersections,
          spatialMap,
          intersectionPoint.x,
          intersectionPoint.z,
          'at_grade'
        );
        registerRoadIntersectionBranches(intersection, roadA.road, roadA.roadIdx, segA, intersectionPoint.t, intersectionPoint);
        registerRoadIntersectionBranches(intersection, roadB.road, roadB.roadIdx, segB, intersectionPoint.u, intersectionPoint);
      }
    }
  }

  return intersections
    .filter((intersection) => intersection.roads.length >= 2)
    .map((intersection) => ({
      x: intersection.x,
      z: intersection.z,
      roads: intersection.roads,
      maxWidth: Math.max(...intersection.roads.map((road) => road.width || 0), intersection.maxWidth || 0),
      hasGradeSeparatedRoad: !!intersection.hasGradeSeparatedRoad
    }));
}
