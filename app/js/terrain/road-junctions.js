import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=30";

const JUNCTION_SURFACE_LIFT = 0.006;

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}

function convexHull(points = []) {
  const unique = [];
  const seen = new Set();
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z) || !Number.isFinite(point?.y)) continue;
    const key = `${point.x.toFixed(4)}:${point.z.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  unique.sort((a, b) => a.x - b.x || a.z - b.z);
  if (unique.length < 3) return unique;
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 1e-7) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 1e-7) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function junctionBranchCorners(intersection, branch, roads) {
  const road = roads?.[branch?.roadIdx];
  const dirX = Number(branch?.dir?.x);
  const dirZ = Number(branch?.dir?.z);
  const directionLength = Math.hypot(dirX, dirZ);
  if (!road || !(directionLength > 1e-5)) return [];
  const tangentX = dirX / directionLength;
  const tangentZ = dirZ / directionLength;
  const normalX = -tangentZ;
  const normalZ = tangentX;
  const width = Math.max(2.4, Number(branch?.width) || Number(road.width) || 6);
  const halfWidth = width * 0.5 + 0.16;
  const setback = Math.max(2.2, Math.min(10, width * 0.62));
  const centerX = Number(intersection.x) + tangentX * setback;
  const centerZ = Number(intersection.z) + tangentZ * setback;
  const centerY = sampleFeatureSurfaceY(road, centerX, centerZ);
  if (!Number.isFinite(centerY)) return [];
  return [-1, 1].map((side) => ({
    x: centerX + normalX * halfWidth * side,
    y: centerY + JUNCTION_SURFACE_LIFT,
    z: centerZ + normalZ * halfWidth * side,
    road
  }));
}

function buildRoadJunctionEnvelope(intersection, roads = []) {
  if (!intersection) return null;
  const branches = Array.isArray(intersection.roads) ? intersection.roads : [];
  if (branches.length < 2) return null;
  const corners = branches.flatMap((branch) => junctionBranchCorners(intersection, branch, roads));
  const hull = convexHull(corners);
  if (hull.length < 3) return null;
  const centerSamples = [];
  const visitedRoads = new Set();
  for (const corner of corners) {
    if (!corner.road || visitedRoads.has(corner.road)) continue;
    visitedRoads.add(corner.road);
    const sample = sampleFeatureSurfaceY(corner.road, intersection.x, intersection.z);
    if (Number.isFinite(sample)) centerSamples.push(sample);
  }
  const centerY = centerSamples.length > 0
    ? centerSamples.reduce((sum, value) => sum + value, 0) / centerSamples.length
    : hull.reduce((sum, point) => sum + point.y, 0) / hull.length;
  return {
    center: {
      x: Number(intersection.x),
      y: centerY + JUNCTION_SURFACE_LIFT,
      z: Number(intersection.z)
    },
    polygon: hull,
    branchCount: branches.length
  };
}

function groupBranchesBySurfaceHeight(intersection, roads = [], tolerance = 0.7) {
  const samples = [];
  for (const branch of intersection?.roads || []) {
    const road = roads[branch?.roadIdx];
    if (!road) continue;
    const y = sampleFeatureSurfaceY(road, intersection.x, intersection.z);
    if (!Number.isFinite(y)) continue;
    samples.push({ branch, y });
  }
  samples.sort((a, b) => a.y - b.y);
  const groups = [];
  for (const sample of samples) {
    let group = groups.find((candidate) => Math.abs(candidate.meanY - sample.y) <= tolerance);
    if (!group) {
      group = { branches: [], meanY: sample.y };
      groups.push(group);
    }
    group.branches.push(sample.branch);
    group.meanY = group.branches.reduce((sum, branch) => {
      const road = roads[branch.roadIdx];
      return sum + sampleFeatureSurfaceY(road, intersection.x, intersection.z);
    }, 0) / group.branches.length;
  }
  return groups.filter((group) => group.branches.length >= 2);
}

function appendRoadJunctionGeometry({ intersections = [], roads = [], verts = [], indices = [] } = {}) {
  let count = 0;
  let triangleCount = 0;
  for (const intersection of intersections) {
    const envelopes = [];
    const groups = groupBranchesBySurfaceHeight(intersection, roads);
    for (const group of groups) {
      const envelope = buildRoadJunctionEnvelope({
        ...intersection,
        roads: group.branches,
        hasGradeSeparatedRoad: false
      }, roads);
      if (!envelope) continue;
      const base = verts.length / 3;
      verts.push(envelope.center.x, envelope.center.y, envelope.center.z);
      for (const point of envelope.polygon) verts.push(point.x, point.y, point.z);
      for (let index = 0; index < envelope.polygon.length; index += 1) {
        indices.push(base, base + 1 + index, base + 1 + ((index + 1) % envelope.polygon.length));
        triangleCount += 1;
      }
      envelopes.push(envelope);
      count += 1;
    }
    intersection.junctionEnvelopes = envelopes;
  }
  return { count, triangleCount };
}

export {
  JUNCTION_SURFACE_LIFT,
  appendRoadJunctionGeometry,
  buildRoadJunctionEnvelope,
  convexHull,
  groupBranchesBySurfaceHeight
};
