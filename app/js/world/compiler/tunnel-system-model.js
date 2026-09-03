import {
  polylineDistances,
  segmentIntersection2D
} from '../../structure-semantics/geometry.js?v=2';
import { sampleTransportSurfaceAtDistance } from './transport-surface-model.js?v=27';

// A shell roof that merely touches the sampled terrain is visibly exposed by
// interpolation and precision differences. Require physical soil/road cover
// before publishing the enclosed shell.
const MINIMUM_TUNNEL_ROOF_COVER = 0.75;

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
    // Exact graph connectivity, tunnel semantics, and layer are the physical
    // continuity authority. OSM commonly changes the road name/ref within one
    // tunnel, so requiring matching names created false portals at way seams.
    return ownLayer === otherLayer;
  });
}

function linkedSurfaceAt(feature, endpoint) {
  const links = Array.isArray(feature?.connectedFeatures?.[endpoint])
    ? feature.connectedFeatures[endpoint]
    : [];
  return links.some((entry) => entry?.feature && !compatibleTunnelFeature(entry.feature));
}

function linkedTunnelFeaturesAt(feature, endpoint) {
  const links = Array.isArray(feature?.connectedFeatures?.[endpoint])
    ? feature.connectedFeatures[endpoint]
    : [];
  const ownLayer = Number(feature?.structureSemantics?.layer) || 0;
  const unique = new Set();
  const linked = [];
  for (const entry of links) {
    const other = entry?.feature;
    if (!compatibleTunnelFeature(other)) continue;
    if ((Number(other?.structureSemantics?.layer) || 0) !== ownLayer) continue;
    const identity = String(
      other?.transportRecord?.identity ||
      other?.sourceFeatureId ||
      other?.transportGraphRef?.featureId ||
      ''
    );
    if (identity && unique.has(identity)) continue;
    if (identity) unique.add(identity);
    linked.push(other);
  }
  return linked;
}

function compileTunnelJunctionZones(feature, total, width) {
  const zones = [];
  for (const endpoint of ['start', 'end']) {
    const linked = linkedTunnelFeaturesAt(feature, endpoint);
    // One linked tunnel is an ordinary way seam. Two or more linked tunnels
    // make a branch chamber where independent side walls must yield to the
    // graph-owned junction opening.
    if (linked.length < 2) continue;
    const widestBranch = linked.reduce(
      (maximum, other) => Math.max(maximum, Number(other?.width) || width),
      width
    );
    const cutback = Math.max(4.5, Math.min(16, width * 0.75 + widestBranch * 0.55));
    zones.push(Object.freeze({
      endpoint,
      distance: endpoint === 'start' ? 0 : total,
      start: endpoint === 'start' ? 0 : Math.max(0, total - cutback),
      end: endpoint === 'start' ? Math.min(total, cutback) : total,
      cutback,
      connectionCount: linked.length + 1,
      authority: 'compiled_tunnel_graph_junction'
    }));
  }
  return Object.freeze(zones);
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
    z: p1.z + (p2.z - p1.z) * t,
    tangentX: (p2.x - p1.x) / Math.max(1e-6, Math.hypot(p2.x - p1.x, p2.z - p1.z)),
    tangentZ: (p2.z - p1.z) / Math.max(1e-6, Math.hypot(p2.x - p1.x, p2.z - p1.z))
  };
}

function interpolateCoverBoundary(left, right) {
  const delta = right.cover - left.cover;
  if (Math.abs(delta) < 1e-6) return (left.distance + right.distance) * 0.5;
  const t = Math.max(0, Math.min(1, -left.cover / delta));
  return left.distance + (right.distance - left.distance) * t;
}

function contiguousCoveredRanges(samples, total, continuesAtStart, continuesAtEnd) {
  const ranges = [];
  let coveredStartIndex = null;
  for (let index = 0; index <= samples.length; index += 1) {
    const covered = index < samples.length && samples[index].cover >= 0;
    if (covered && coveredStartIndex === null) coveredStartIndex = index;
    if (covered || coveredStartIndex === null) continue;

    const coveredEndIndex = index - 1;
    let start = samples[coveredStartIndex].distance;
    let end = samples[coveredEndIndex].distance;
    if (coveredStartIndex === 0) {
      if (continuesAtStart) start = 0;
    } else {
      start = interpolateCoverBoundary(samples[coveredStartIndex - 1], samples[coveredStartIndex]);
    }
    if (coveredEndIndex === samples.length - 1) {
      if (continuesAtEnd) end = total;
    } else {
      end = interpolateCoverBoundary(samples[coveredEndIndex], samples[coveredEndIndex + 1]);
    }
    if (end - start > 1.2) ranges.push({ start, end });
    coveredStartIndex = null;
  }
  return ranges;
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

function surfaceIntersectionDistance(samples, portalDistance, endpoint, fallbackDistance) {
  if (!Array.isArray(samples) || samples.length === 0) return fallbackDistance;
  const ordered = endpoint === 'start' ? [...samples].reverse() : samples;
  for (const sample of ordered) {
    if (endpoint === 'start' && sample.distance >= portalDistance) continue;
    if (endpoint === 'end' && sample.distance <= portalDistance) continue;
    if (Number(sample.terrainGap) <= 0.12) return sample.distance;
  }
  return fallbackDistance;
}

function compilePortalZones(shellRanges, total, width, portalDistances = [], terrainSamples = []) {
  const portalSet = new Set(
    portalDistances.filter(Number.isFinite).map((distance) => Number(distance).toFixed(4))
  );
  const transitionLength = Math.max(4.5, Math.min(11, Number(width) * 1.05));
  const shellInset = Math.max(1.1, Math.min(2.4, Number(width) * 0.18));
  const zones = [];
  for (const range of shellRanges || []) {
    if (portalSet.has(Number(range.start).toFixed(4))) {
      const surfaceDistance = surfaceIntersectionDistance(
        terrainSamples,
        range.start,
        'start',
        Math.max(0, range.start - transitionLength)
      );
      zones.push(Object.freeze({
        distance: range.start,
        endpoint: 'start',
        approachStart: Math.max(0, surfaceDistance),
        approachEnd: range.start,
        shellInsetEnd: Math.min(range.end, range.start + shellInset),
        transitionLength: range.start - Math.max(0, surfaceDistance)
      }));
    }
    if (portalSet.has(Number(range.end).toFixed(4))) {
      const surfaceDistance = surfaceIntersectionDistance(
        terrainSamples,
        range.end,
        'end',
        Math.min(total, range.end + transitionLength)
      );
      zones.push(Object.freeze({
        distance: range.end,
        endpoint: 'end',
        approachStart: range.end,
        approachEnd: Math.min(total, surfaceDistance),
        shellInsetStart: Math.max(range.start, range.end - shellInset),
        transitionLength: Math.min(total, surfaceDistance) - range.end
      }));
    }
  }
  return Object.freeze(zones);
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
  const junctionZones = compileTunnelJunctionZones(feature, total, width);
  const clearance = Math.max(
    3.2,
    Math.min(5.2, (Number(feature?.structureSemantics?.cutDepth) || 4.6) - 0.25)
  );
  const roofThickness = 0.32;
  // Include the outside face of the published wall, not merely the interior
  // roof edge, so a shell cannot escape from a steep downhill cross-slope.
  const roofHalfWidth = width * 0.5 + 0.95;
  const stationStep = Math.max(1.5, Math.min(4, width * 0.42));
  const stationCount = Math.max(2, Math.ceil(total / stationStep));
  const samples = [];
  for (let index = 0; index <= stationCount; index += 1) {
    const distance = total * index / stationCount;
    const point = pointAtDistance(feature.pts, pathDistances, distance);
    if (!point) continue;
    const roadY = sampleTransportSurfaceAtDistance(profile, distance, 0);
    const normalX = -point.tangentZ;
    const normalZ = point.tangentX;
    const terrainSamples = [
      Number(sampleTerrainY(point.x, point.z)),
      Number(sampleTerrainY(point.x + normalX * roofHalfWidth, point.z + normalZ * roofHalfWidth)),
      Number(sampleTerrainY(point.x - normalX * roofHalfWidth, point.z - normalZ * roofHalfWidth))
    ];
    if (!Number.isFinite(roadY) || !terrainSamples.every(Number.isFinite)) continue;
    // The lowest terrain sample across the tunnel roof owns containment. A
    // centerline-only sample let a shell emerge from the downhill side of a
    // steep street even though its center remained underground.
    const terrainY = Math.min(...terrainSamples);
    samples.push({
      distance,
      cover: terrainY - (roadY + clearance + roofThickness) - MINIMUM_TUNNEL_ROOF_COVER,
      terrainGap: terrainY - roadY
    });
  }

  const coveredIndices = [];
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index].cover >= 0) coveredIndices.push(index);
  }
  const continuesAtStart = linkedTunnelAt(feature, 'start');
  const continuesAtEnd = linkedTunnelAt(feature, 'end');
  if (coveredIndices.length === 0) {
    if (feature?.transportRecord?.completeness === 'lossless') {
      // Exact tagging owns the centerline, but terrain cover owns whether a
      // tunnel shell is physically hidden. Publishing a full shell solely
      // because tunnel=yes is what exposed parking/access tunnels across
      // Monaco. With no measurable cover, keep the road surface-connected and
      // publish no shell rather than inventing an above-ground tube.
      return {
        version: 9,
        visualKind: 'tunnel',
        total,
        clearance,
        roofThickness,
        shellRanges: Object.freeze([]),
        portalDistances: Object.freeze([]),
        portalZones: Object.freeze([]),
        junctionZones,
        shellStart: null,
        shellEnd: null,
        portalStart: null,
        portalEnd: null
      };
    }
  }
  if (coveredIndices.length === 0 && !continuesAtStart && !continuesAtEnd) {
    const shellRanges = crossingShellRanges(
      feature,
      options.features,
      pathDistances,
      total
    );
    if (shellRanges.length > 0) {
      const portalDistances = Object.freeze(
        shellRanges.flatMap((range) => [range.start, range.end])
      );
      return {
        version: 3,
        visualKind: 'underpass',
        total,
        clearance,
        roofThickness,
        shellRanges,
        shellStart: shellRanges[0].start,
        shellEnd: shellRanges[shellRanges.length - 1].end,
        portalDistances,
        portalZones: compilePortalZones(shellRanges, total, width, portalDistances),
        junctionZones,
        portalStart: shellRanges[0].start,
        portalEnd: shellRanges[shellRanges.length - 1].end
      };
    }
    return {
      version: 3,
      visualKind: 'underpass',
      total,
      clearance,
      roofThickness,
      shellRanges: [],
      portalDistances: [],
      portalZones: Object.freeze([]),
      junctionZones,
      shellStart: null,
      shellEnd: null,
      portalStart: null,
      portalEnd: null
    };
  }

  const shellRanges = contiguousCoveredRanges(samples, total, continuesAtStart, continuesAtEnd);
  if (shellRanges.length === 0) {
    return {
      version: 3,
      visualKind: 'underpass',
      total,
      clearance,
      roofThickness,
      shellRanges: [],
      portalDistances: [],
      portalZones: Object.freeze([]),
      junctionZones,
      shellStart: null,
      shellEnd: null,
      portalStart: null,
      portalEnd: null
    };
  }

  // Portals belong only to real tunnel-to-surface graph endpoints. Terrain
  // cover can briefly dip inside a tagged tunnel (especially beneath steep
  // streets); treating each cover-range boundary as a portal created arches
  // and collision walls in the street above.
  const portalDistances = [];
  const firstRange = shellRanges[0];
  const lastRange = shellRanges[shellRanges.length - 1];
  if (!continuesAtStart && linkedSurfaceAt(feature, 'start')) {
    portalDistances.push(firstRange.start);
  }
  if (!continuesAtEnd && linkedSurfaceAt(feature, 'end')) {
    portalDistances.push(lastRange.end);
  }
  const shellStart = shellRanges[0].start;
  const shellEnd = shellRanges[shellRanges.length - 1].end;
  const portalStart = portalDistances.includes(shellStart) ? shellStart : null;
  const portalEnd = portalDistances.includes(shellEnd) ? shellEnd : null;
  return {
    version: feature?.transportRecord?.completeness === 'lossless' ? 9 : 6,
    visualKind: 'tunnel',
    total,
    clearance,
    roofThickness,
    shellRanges: Object.freeze(shellRanges.map((range) => Object.freeze(range))),
    shellStart,
    shellEnd,
    // A portal belongs at a real surface/tunnel boundary. Dataset clipping in
    // the middle of a tunnel has no connected surface way and gets no fake arch.
    portalDistances: Object.freeze(portalDistances),
    portalZones: compilePortalZones(shellRanges, total, width, portalDistances, samples),
    junctionZones,
    portalStart,
    portalEnd
  };
}

export function compileTunnelSystemModels(features = [], sampleTerrainY) {
  for (const feature of features) {
    feature.tunnelSystemModel = compileTunnelSystemModel(feature, sampleTerrainY, { features });
  }
}

export { compilePortalZones };
export { MINIMUM_TUNNEL_ROOF_COVER };
