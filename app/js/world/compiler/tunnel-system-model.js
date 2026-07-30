import {
  polylineDistances,
  segmentIntersection2D
} from '../../structure-semantics/geometry.js?v=1';
import { sampleTransportSurfaceAtDistance } from './transport-surface-model.js?v=4';

function compatibleTunnelFeature(feature) {
  const semantics = feature?.structureSemantics;
  return (
    semantics?.structureKind === 'tunnel' &&
    semantics?.isTunnel === true &&
    semantics?.culvert !== true &&
    Array.isArray(feature?.pts) &&
    feature.pts.length >= 2
  );
}

function linkedTunnelAt(feature, endpoint) {
  const links = Array.isArray(feature?.connectedFeatures?.[endpoint])
    ? feature.connectedFeatures[endpoint]
    : [];
  return links.some((entry) => {
    const other = entry?.feature;
    if (!compatibleTunnelFeature(other)) return false;
    const ownLayer = Number(feature?.structureSemantics?.layer) || 0;
    const otherLayer = Number(other?.structureSemantics?.layer) || 0;
    const ownName = String(feature?.name || '').trim().toLowerCase();
    const otherName = String(other?.name || '').trim().toLowerCase();
    return ownLayer === otherLayer && (!ownName || !otherName || ownName === otherName);
  });
}

function linkedSurfaceAt(feature, endpoint) {
  const links = Array.isArray(feature?.connectedFeatures?.[endpoint])
    ? feature.connectedFeatures[endpoint]
    : [];
  return links.some((entry) => entry?.feature && !compatibleTunnelFeature(entry.feature));
}

function pointAtDistance(points, distances, distance) {
  if (!Array.isArray(points) || points.length < 2 || !(distances instanceof Float32Array)) return null;
  const total = Number(distances[distances.length - 1]) || 0;
  const target = Math.max(0, Math.min(total, Number(distance) || 0));
  let index = 0;
  while (index < distances.length - 2 && distances[index + 1] < target) index += 1;
  const p1 = points[index];
  const p2 = points[index + 1];
  const segmentStart = Number(distances[index]) || 0;
  const segmentLength = Math.max(1e-6, (Number(distances[index + 1]) || segmentStart) - segmentStart);
  const t = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
  return {
    x: p1.x + (p2.x - p1.x) * t,
    z: p1.z + (p2.z - p1.z) * t
  };
}

function interpolateCoverBoundary(left, right) {
  const delta = right.cover - left.cover;
  if (Math.abs(delta) < 1e-6) return (left.distance + right.distance) * 0.5;
  const t = Math.max(0, Math.min(1, -left.cover / delta));
  return left.distance + (right.distance - left.distance) * t;
}

function crossingShellRanges(feature, features, pathDistances, total) {
  const ranges = [];
  const ownOrder = Number(feature?.structureSemantics?.verticalOrder) || -1;
  const width = Math.max(3.4, Number(feature?.width) || 6);
  for (const other of features || []) {
    if (!other || other === feature || !Array.isArray(other.pts) || other.pts.length < 2) continue;
    const otherOrder = Number(other?.structureSemantics?.verticalOrder) || 0;
    if (otherOrder <= ownOrder) continue;
    for (let ownIndex = 0; ownIndex < feature.pts.length - 1; ownIndex += 1) {
      const ownStart = feature.pts[ownIndex];
      const ownEnd = feature.pts[ownIndex + 1];
      const ownLength = Math.hypot(ownEnd.x - ownStart.x, ownEnd.z - ownStart.z);
      if (!(ownLength > 0.05)) continue;
      for (let otherIndex = 0; otherIndex < other.pts.length - 1; otherIndex += 1) {
        const crossing = segmentIntersection2D(
          ownStart,
          ownEnd,
          other.pts[otherIndex],
          other.pts[otherIndex + 1]
        );
        if (!crossing) continue;
        const atOwnEndpoint =
          (ownIndex === 0 && crossing.t <= 0.02) ||
          (ownIndex === feature.pts.length - 2 && crossing.t >= 0.98);
        if (atOwnEndpoint) continue;
        const distance = Number(pathDistances[ownIndex] || 0) + ownLength * crossing.t;
        const halfSpan = Math.max(6, width * 0.9, (Number(other.width) || 5) * 0.72);
        ranges.push({
          start: Math.max(0, distance - halfSpan),
          end: Math.min(total, distance + halfSpan)
        });
      }
    }
  }
  ranges.sort((left, right) => left.start - right.start);
  const merged = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 2) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function compileTunnelSystemModel(feature, sampleTerrainY, options = {}) {
  if (!compatibleTunnelFeature(feature) || typeof sampleTerrainY !== 'function') return null;
  const profile = feature.transportSurfaceModel;
  const pathDistances = profile?.pathDistances instanceof Float32Array
    ? profile.pathDistances
    : polylineDistances(feature.pts).distances;
  const total = Number(pathDistances[pathDistances.length - 1]) || 0;
  if (!(total > 0.5)) return null;

  const width = Math.max(3.4, Number(feature.width) || 6);
  const clearance = Math.max(
    3.2,
    Math.min(5.2, (Number(feature?.structureSemantics?.cutDepth) || 4.6) - 0.25)
  );
  const roofThickness = 0.32;
  const stationStep = Math.max(1.5, Math.min(4, width * 0.42));
  const stationCount = Math.max(2, Math.ceil(total / stationStep));
  const samples = [];
  for (let index = 0; index <= stationCount; index += 1) {
    const distance = total * index / stationCount;
    const point = pointAtDistance(feature.pts, pathDistances, distance);
    if (!point) continue;
    const roadY = sampleTransportSurfaceAtDistance(profile, distance, 0);
    const terrainY = Number(sampleTerrainY(point.x, point.z));
    if (!Number.isFinite(roadY) || !Number.isFinite(terrainY)) continue;
    samples.push({
      distance,
      cover: terrainY - (roadY + clearance + roofThickness)
    });
  }

  const coveredIndices = [];
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index].cover >= 0) coveredIndices.push(index);
  }
  const continuesAtStart = linkedTunnelAt(feature, 'start');
  const continuesAtEnd = linkedTunnelAt(feature, 'end');
  if (coveredIndices.length === 0 && !continuesAtStart && !continuesAtEnd) {
    const shellRanges = crossingShellRanges(
      feature,
      options.features,
      pathDistances,
      total
    );
    if (shellRanges.length > 0) {
      return {
        version: 2,
        visualKind: 'underpass',
        total,
        clearance,
        roofThickness,
        shellRanges,
        shellStart: shellRanges[0].start,
        shellEnd: shellRanges[shellRanges.length - 1].end,
        portalDistances: Object.freeze(
          shellRanges.flatMap((range) => [range.start, range.end])
        ),
        portalStart: shellRanges[0].start,
        portalEnd: shellRanges[shellRanges.length - 1].end
      };
    }
    return {
      version: 2,
      visualKind: 'underpass',
      total,
      clearance,
      roofThickness,
      shellRanges: [],
      portalDistances: [],
      shellStart: null,
      shellEnd: null,
      portalStart: null,
      portalEnd: null
    };
  }

  let firstCovered = coveredIndices.length > 0 ? coveredIndices[0] : 0;
  let lastCovered = coveredIndices.length > 0 ? coveredIndices[coveredIndices.length - 1] : samples.length - 1;
  let shellStart = continuesAtStart ? 0 : samples[firstCovered]?.distance ?? 0;
  let shellEnd = continuesAtEnd ? total : samples[lastCovered]?.distance ?? total;
  if (!continuesAtStart && firstCovered > 0) {
    shellStart = interpolateCoverBoundary(samples[firstCovered - 1], samples[firstCovered]);
  }
  if (!continuesAtEnd && lastCovered >= 0 && lastCovered < samples.length - 1) {
    shellEnd = interpolateCoverBoundary(samples[lastCovered], samples[lastCovered + 1]);
  }
  if (!(shellEnd - shellStart > 1.2)) {
    return {
      version: 2,
      visualKind: 'underpass',
      total,
      clearance,
      roofThickness,
      shellRanges: [],
      portalDistances: [],
      shellStart: null,
      shellEnd: null,
      portalStart: null,
      portalEnd: null
    };
  }

  const portalStart = !continuesAtStart && (shellStart > 1 || linkedSurfaceAt(feature, 'start')) ? shellStart : null;
  const portalEnd = !continuesAtEnd && (shellEnd < total - 1 || linkedSurfaceAt(feature, 'end')) ? shellEnd : null;
  return {
    version: 2,
    visualKind: 'tunnel',
    total,
    clearance,
    roofThickness,
    shellRanges: Object.freeze([{ start: shellStart, end: shellEnd }]),
    shellStart,
    shellEnd,
    // A portal belongs at a real surface/tunnel boundary. Dataset clipping in
    // the middle of a tunnel has no connected surface way and gets no fake arch.
    portalDistances: Object.freeze([portalStart, portalEnd].filter(Number.isFinite)),
    portalStart,
    portalEnd
  };
}

export function compileTunnelSystemModels(features = [], sampleTerrainY) {
  for (const feature of features) {
    feature.tunnelSystemModel = compileTunnelSystemModel(feature, sampleTerrainY, { features });
  }
}
