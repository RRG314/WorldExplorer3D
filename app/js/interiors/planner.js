import { INTERIOR_SHELL_CLEARANCE, INTERIOR_WALL_THICKNESS } from "./constants.js?v=1";
import {
  cleanLinePoints,
  cleanRingPoints,
  finiteNumber,
  footprintBounds,
  pointInPolygonSafe,
  polygonCentroid,
  polygonSamplePoints,
  projectPointToPolygonRing,
  ringAreaAbs
} from "./core.js?v=4";

export function polygonEdgeClearance(point, polygon) {
  const hit = projectPointToPolygonRing(point, polygon);
  return Number.isFinite(hit?.dist) ? hit.dist : 0;
}

function buildEdgeSamplePoints(points, samplesPerEdge = 3) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    out.push({ x: a.x, z: a.z });
    for (let step = 1; step <= samplesPerEdge; step++) {
      const t = step / (samplesPerEdge + 1);
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t
      });
    }
  }
  return out;
}

export function footprintFullyContained(inner, outer, minClearance = 0.05) {
  if (!Array.isArray(inner) || inner.length < 3 || !Array.isArray(outer) || outer.length < 3) return false;
  const samples = buildEdgeSamplePoints(inner, 3);
  if (samples.length === 0) return false;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (!pointInPolygonSafe(point.x, point.z, outer)) return false;
    if (polygonEdgeClearance(point, outer) < minClearance) return false;
  }
  return true;
}

export function footprintMinimumClearance(inner, outer) {
  if (!Array.isArray(inner) || inner.length < 3 || !Array.isArray(outer) || outer.length < 3) return 0;
  const samples = buildEdgeSamplePoints(inner, 3);
  if (samples.length === 0) return 0;
  let minClearance = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (!pointInPolygonSafe(point.x, point.z, outer)) return 0;
    minClearance = Math.min(minClearance, polygonEdgeClearance(point, outer));
  }
  return Number.isFinite(minClearance) ? minClearance : 0;
}

export function findInteriorAnchor(footprint) {
  if (!Array.isArray(footprint) || footprint.length < 3) return null;
  const bounds = footprintBounds(footprint);
  const centroid = polygonCentroid(footprint);
  const candidates = [];

  if (centroid) candidates.push({ x: centroid.x, z: centroid.z });
  candidates.push({
    x: (bounds.minX + bounds.maxX) * 0.5,
    z: (bounds.minZ + bounds.maxZ) * 0.5
  });
  polygonSamplePoints(footprint).forEach((point) => candidates.push({ x: point.x, z: point.z }));

  const steps = 5;
  for (let gx = 0; gx <= steps; gx++) {
    for (let gz = 0; gz <= steps; gz++) {
      candidates.push({
        x: bounds.minX + bounds.width * (gx / steps),
        z: bounds.minZ + bounds.depth * (gz / steps)
      });
    }
  }

  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const point = candidates[i];
    if (!pointInPolygonSafe(point.x, point.z, footprint)) continue;
    const clearance = polygonEdgeClearance(point, footprint);
    if (!best || clearance > best.clearance) best = { point, clearance };
  }

  return best?.point || centroid || {
    x: (bounds.minX + bounds.maxX) * 0.5,
    z: (bounds.minZ + bounds.maxZ) * 0.5
  };
}

export function buildInteriorCandidateCenters(footprint, preferredCenter = null) {
  if (!Array.isArray(footprint) || footprint.length < 3) return [];
  const bounds = footprintBounds(footprint);
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    if (!pointInPolygonSafe(point.x, point.z, footprint)) return;
    const key = `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x: point.x, z: point.z });
  };

  pushCandidate(preferredCenter);
  pushCandidate(findInteriorAnchor(footprint));
  pushCandidate(polygonCentroid(footprint));
  polygonSamplePoints(footprint).forEach((point) => pushCandidate(point));

  const gridSteps = 6;
  for (let gx = 0; gx <= gridSteps; gx++) {
    for (let gz = 0; gz <= gridSteps; gz++) {
      pushCandidate({
        x: bounds.minX + bounds.width * (gx / Math.max(1, gridSteps)),
        z: bounds.minZ + bounds.depth * (gz / Math.max(1, gridSteps))
      });
    }
  }

  candidates.sort((a, b) => polygonEdgeClearance(b, footprint) - polygonEdgeClearance(a, footprint));
  return candidates;
}

export function buildContainedRectFootprint(footprint, center, minClearance = INTERIOR_SHELL_CLEARANCE) {
  if (!Array.isArray(footprint) || footprint.length < 3 || !center) return [];
  const bounds = footprintBounds(footprint);
  const maxHalfWidth = Math.max(0, bounds.width * 0.5 - minClearance);
  const maxHalfDepth = Math.max(0, bounds.depth * 0.5 - minClearance);
  if (!(maxHalfWidth > 0.75) || !(maxHalfDepth > 0.75)) return [];

  const baseHalfWidth = Math.min(Math.max(1.4, bounds.width * 0.42), maxHalfWidth);
  const baseHalfDepth = Math.min(Math.max(1.4, bounds.depth * 0.42), maxHalfDepth);
  const scales = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4, 0.34, 0.28, 0.22];
  const candidateCenters = buildInteriorCandidateCenters(footprint, center);

  for (let c = 0; c < candidateCenters.length; c++) {
    const candidate = candidateCenters[c];
    const localClearance = polygonEdgeClearance(candidate, footprint) - minClearance;
    const emergencyHalf = Math.max(0.72, Math.min(localClearance * 0.62, Math.min(maxHalfWidth, maxHalfDepth)));
    const baseSizes = [];

    if (emergencyHalf > 0.72) {
      baseSizes.push({ halfWidth: emergencyHalf, halfDepth: emergencyHalf });
      baseSizes.push({ halfWidth: Math.min(baseHalfWidth, emergencyHalf * 1.2), halfDepth: emergencyHalf });
      baseSizes.push({ halfWidth: emergencyHalf, halfDepth: Math.min(baseHalfDepth, emergencyHalf * 1.2) });
    }

    baseSizes.push({ halfWidth: baseHalfWidth, halfDepth: baseHalfDepth });

    for (let b = 0; b < baseSizes.length; b++) {
      const size = baseSizes[b];
      for (let i = 0; i < scales.length; i++) {
        const scale = scales[i];
        const halfWidth = Math.max(0.72, Math.min(size.halfWidth * scale, maxHalfWidth));
        const halfDepth = Math.max(0.72, Math.min(size.halfDepth * scale, maxHalfDepth));
        const rect = [
          { x: candidate.x - halfWidth, z: candidate.z - halfDepth },
          { x: candidate.x + halfWidth, z: candidate.z - halfDepth },
          { x: candidate.x + halfWidth, z: candidate.z + halfDepth },
          { x: candidate.x - halfWidth, z: candidate.z + halfDepth }
        ];
        if (footprintFullyContained(rect, footprint, minClearance) && ringAreaAbs(rect) >= 4.5) {
          return rect;
        }
      }
    }
  }

  return [];
}

export function buildUsableFootprint(points) {
  const footprint = cleanRingPoints(points);
  if (footprint.length < 3) return [];
  const centroid = findInteriorAnchor(footprint);
  if (!centroid) return footprint;

  const bounds = footprintBounds(footprint);
  const minDimension = Math.min(bounds.width, bounds.depth);
  const inset = Math.max(0.35, Math.min(1.25, minDimension * 0.06));
  const scaled = footprint.map((point) => {
    const dx = centroid.x - point.x;
    const dz = centroid.z - point.z;
    const dist = Math.hypot(dx, dz) || 1;
    const push = Math.min(inset, dist * 0.24);
    return {
      x: point.x + dx / dist * push,
      z: point.z + dz / dist * push
    };
  });

  const cleaned = cleanRingPoints(scaled);
  if (cleaned.length < 3) return footprint;
  const originalArea = ringAreaAbs(footprint);
  const nextArea = ringAreaAbs(cleaned);
  if (
    nextArea > 10 &&
    nextArea < originalArea * 0.97 &&
    footprintFullyContained(cleaned, footprint, INTERIOR_SHELL_CLEARANCE)
  ) {
    return cleaned;
  }

  const rectFallback = buildContainedRectFootprint(footprint, centroid, INTERIOR_SHELL_CLEARANCE);
  if (rectFallback.length >= 3) return rectFallback;
  return footprint;
}

export function constrainPointToFootprint(point, footprint, centroid, margin = 0.28) {
  if (!point || !Array.isArray(footprint) || footprint.length < 3) return null;
  const center = centroid || polygonCentroid(footprint) || point;
  let candidate = { x: finiteNumber(point.x, center.x), z: finiteNumber(point.z, center.z) };
  const ringHit = projectPointToPolygonRing(candidate, footprint);
  if (!ringHit) return candidate;
  if (pointInPolygonSafe(candidate.x, candidate.z, footprint) && ringHit.dist >= margin) return candidate;

  const base = { x: ringHit.x, z: ringHit.z };
  const dx = center.x - base.x;
  const dz = center.z - base.z;
  const len = Math.hypot(dx, dz) || 1;
  candidate = {
    x: base.x + dx / len * Math.max(0.22, margin),
    z: base.z + dz / len * Math.max(0.22, margin)
  };
  return pointInPolygonSafe(candidate.x, candidate.z, footprint) ? candidate : center;
}

export function fitLineToFootprint(points, footprint, centroid) {
  const fitted = cleanLinePoints(points.map((point) => constrainPointToFootprint(point, footprint, centroid, 0.24)).filter(Boolean));
  return fitted.length >= 2 ? fitted : [];
}

export function fitRingToFootprint(points, footprint, centroid) {
  const fitted = cleanRingPoints(points.map((point) => constrainPointToFootprint(point, footprint, centroid, 0.28)).filter(Boolean));
  if (fitted.length < 3) return [];
  if (ringAreaAbs(fitted) < 4) return [];
  return fitted;
}

export function makeLineFeature(points, width, indoorKind = 'corridor', name = '') {
  const pts = cleanLinePoints(points);
  if (pts.length < 2) return null;
  return {
    kind: 'line',
    indoorKind,
    level: 0,
    name,
    width,
    pts
  };
}

function footprintAxisFrame(footprint, centroid) {
  let longest = null;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!longest || length > longest.length) longest = { a, b, length };
  }
  const ux = longest?.length > 0 ? (longest.b.x - longest.a.x) / longest.length : 1;
  const uz = longest?.length > 0 ? (longest.b.z - longest.a.z) / longest.length : 0;
  const vx = -uz;
  const vz = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  footprint.forEach((point) => {
    const dx = point.x - centroid.x;
    const dz = point.z - centroid.z;
    const u = dx * ux + dz * uz;
    const v = dx * vx + dz * vz;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  });
  return { ux, uz, vx, vz, minU, maxU, minV, maxV };
}

function axisPoint(frame, centroid, u, v) {
  return {
    x: centroid.x + frame.ux * u + frame.vx * v,
    z: centroid.z + frame.uz * u + frame.vz * v
  };
}

function segmentInsideFootprint(segment, footprint) {
  if (!Array.isArray(segment) || segment.length < 2) return false;
  const a = segment[0];
  const b = segment[1];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    if (!pointInPolygonSafe(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, footprint)) return false;
  }
  return true;
}

export function buildGeneratedPartitions(footprint, centroid, options = {}) {
  const frame = footprintAxisFrame(footprint, centroid);
  const longSpan = frame.maxU - frame.minU;
  const shortSpan = frame.maxV - frame.minV;
  const partitions = [];
  if (longSpan < 8 || shortSpan < 4.8) return partitions;

  const buildingType = String(options.buildingType || '').toLowerCase();
  const openPlan = /warehouse|industrial|hangar|garage|parking|supermarket|stadium/.test(buildingType);
  const residential = /house|residential|apartments|terrace|detached|semidetached/.test(buildingType);
  const targetRoomLength = openPlan ? 15 : residential ? 6.5 : 8.5;
  const partitionCount = Math.max(1, Math.min(openPlan ? 3 : 8, Math.floor(longSpan / targetRoomLength)));
  const doorway = Math.max(1.5, Math.min(2.5, shortSpan * 0.24));
  const edgeMargin = Math.max(0.45, Math.min(0.9, shortSpan * 0.06));

  const addSegment = (u, fromV, toV) => {
    const fitted = fitLineToFootprint([
      axisPoint(frame, centroid, u, fromV),
      axisPoint(frame, centroid, u, toV)
    ], footprint, centroid);
    if (
      fitted.length >= 2 &&
      Math.hypot(fitted[1].x - fitted[0].x, fitted[1].z - fitted[0].z) > 1.4 &&
      segmentInsideFootprint(fitted, footprint)
    ) partitions.push(fitted);
  };

  const addCrossSegment = (v, fromU, toU) => {
    const fitted = fitLineToFootprint([
      axisPoint(frame, centroid, fromU, v),
      axisPoint(frame, centroid, toU, v)
    ], footprint, centroid);
    if (
      fitted.length >= 2 &&
      Math.hypot(fitted[1].x - fitted[0].x, fitted[1].z - fitted[0].z) > 1.4 &&
      segmentInsideFootprint(fitted, footprint)
    ) partitions.push(fitted);
  };

  for (let i = 1; i <= partitionCount; i++) {
    const u = frame.minU + longSpan * (i / (partitionCount + 1));
    addSegment(u, frame.minV + edgeMargin, -doorway * 0.5);
    addSegment(u, doorway * 0.5, frame.maxV - edgeMargin);
  }

  if (!openPlan && shortSpan >= targetRoomLength * 1.45) {
    const crossCount = Math.max(1, Math.min(6, Math.floor(shortSpan / targetRoomLength)));
    const crossDoorway = Math.max(1.7, Math.min(3, longSpan * 0.04));
    const longEdgeMargin = Math.max(0.45, Math.min(0.9, longSpan * 0.025));
    for (let i = 1; i <= crossCount; i++) {
      const v = frame.minV + shortSpan * (i / (crossCount + 1));
      addCrossSegment(v, frame.minU + longEdgeMargin, -crossDoorway * 0.5);
      addCrossSegment(v, crossDoorway * 0.5, frame.maxU - longEdgeMargin);
    }
  }
  return partitions;
}

export function createGeneratedInteriorPlan(definition, footprint) {
  const centroid = findInteriorAnchor(footprint) || polygonCentroid(footprint);
  const buildingType = String(definition?.building?.buildingType || definition?.support?.building?.buildingType || 'building');
  return {
    features: [
      {
        kind: 'polygon',
        indoorKind: 'room',
        level: finiteNumber(definition?.selectedLevel, 0),
        name: definition.label || 'Interior',
        pts: footprint
      }
    ],
    partitions: centroid ? buildGeneratedPartitions(footprint, centroid, { buildingType }) : [],
    layoutKind: /warehouse|industrial|hangar|garage|parking/.test(buildingType.toLowerCase()) ? 'open_plan' : 'room_plan'
  };
}

export function prepareInteriorFeaturePlan(definition, shellFootprint, centroid) {
  if (definition.mode === 'mapped' && Array.isArray(definition.features) && definition.features.length > 0) {
    const fittedFeatures = [];
    for (let i = 0; i < definition.features.length; i++) {
      const feature = definition.features[i];
      if (feature.kind === 'polygon') {
        const pts = fitRingToFootprint(feature.pts, shellFootprint, centroid);
        if (pts.length >= 3) fittedFeatures.push({ ...feature, pts });
        continue;
      }
      if (feature.kind === 'line') {
        const pts = fitLineToFootprint(feature.pts, shellFootprint, centroid);
        if (pts.length >= 2) fittedFeatures.push({ ...feature, pts });
      }
    }
    if (fittedFeatures.length > 0) {
      return {
        mode: 'mapped',
        features: fittedFeatures,
        // Sparse source geometry is still mapped geometry. Inventing room
        // partitions here changes what the provider described and makes a
        // generated plan look mapped. Preserve the source layout as-is.
        partitions: [],
        layoutKind: 'mapped'
      };
    }
  }

  const generated = createGeneratedInteriorPlan(definition, shellFootprint);
  return {
    mode: 'generated',
    features: generated.features,
    partitions: generated.partitions,
    layoutKind: generated.layoutKind
  };
}
