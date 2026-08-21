import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=60";

const JUNCTION_SURFACE_LIFT = 0.006;
const JUNCTION_CAP_SEGMENTS = 16;

function computeIntersectionCapRadius(intersection) {
  const maxWidth = Number(intersection?.maxWidth || 8);
  const roads = Array.isArray(intersection?.roads) ? intersection.roads : [];
  const averageWidth = roads.length > 0
    ? roads.reduce((sum, branch) => sum + Number(branch?.width || maxWidth), 0) / roads.length
    : maxWidth;
  return Math.max(maxWidth * 0.22, Math.min(maxWidth * 0.34, averageWidth * 0.28));
}

function shouldBuildCompactIntersectionCap(intersection) {
  return !!(
    intersection &&
    intersection.hasGradeSeparatedRoad !== true &&
    Array.isArray(intersection.roads) &&
    intersection.roads.length >= 3
  );
}

function sampleJunctionSurfaceY(intersection, roads, x, z) {
  const samples = [];
  const visited = new Set();
  for (const branch of intersection?.roads || []) {
    const road = roads?.[branch?.roadIdx];
    if (!road || visited.has(road)) continue;
    visited.add(road);
    const y = sampleFeatureSurfaceY(road, x, z);
    if (Number.isFinite(y)) samples.push(y);
  }
  return samples.length > 0
    ? samples.reduce((sum, value) => sum + value, 0) / samples.length
    : 0;
}

function buildRoadJunctionEnvelope(intersection, roads = []) {
  if (!shouldBuildCompactIntersectionCap(intersection)) return null;
  const radius = computeIntersectionCapRadius(intersection);
  const centerY = sampleJunctionSurfaceY(intersection, roads, intersection.x, intersection.z);
  const polygon = [];
  for (let index = 0; index < JUNCTION_CAP_SEGMENTS; index += 1) {
    const angle = index / JUNCTION_CAP_SEGMENTS * Math.PI * 2;
    const x = Number(intersection.x) + Math.cos(angle) * radius;
    const z = Number(intersection.z) + Math.sin(angle) * radius;
    polygon.push({
      x,
      y: sampleJunctionSurfaceY(intersection, roads, x, z) + JUNCTION_SURFACE_LIFT,
      z
    });
  }
  return {
    center: {
      x: Number(intersection.x),
      y: centerY + JUNCTION_SURFACE_LIFT,
      z: Number(intersection.z)
    },
    polygon,
    branchCount: intersection.roads.length,
    radius
  };
}

function prepareRoadJunctionEnvelopes(intersections = [], roads = []) {
  for (const road of roads) {
    if (road) road.junctionTransitions = [];
  }
  let count = 0;
  for (const intersection of intersections) {
    const envelope = buildRoadJunctionEnvelope(intersection, roads);
    const envelopes = envelope ? [envelope] : [];
    if (envelope) count += 1;
    intersection.junctionEnvelopes = envelopes;
  }
  return count;
}

function appendRoadJunctionGeometry({ intersections = [], roads = [], verts = [], indices = [] } = {}) {
  let count = 0;
  let triangleCount = 0;
  for (const intersection of intersections) {
    const envelopes = Array.isArray(intersection.junctionEnvelopes)
      ? intersection.junctionEnvelopes
      : [];
    for (const envelope of envelopes) {
      const base = verts.length / 3;
      verts.push(envelope.center.x, envelope.center.y, envelope.center.z);
      for (const point of envelope.polygon) verts.push(point.x, point.y, point.z);
      for (let index = 0; index < envelope.polygon.length; index += 1) {
        indices.push(base, base + 1 + index, base + 1 + ((index + 1) % envelope.polygon.length));
        triangleCount += 1;
      }
      count += 1;
    }
  }
  return { count, triangleCount };
}

export {
  JUNCTION_SURFACE_LIFT,
  appendRoadJunctionGeometry,
  buildRoadJunctionEnvelope,
  computeIntersectionCapRadius,
  prepareRoadJunctionEnvelopes,
  shouldBuildCompactIntersectionCap
};
