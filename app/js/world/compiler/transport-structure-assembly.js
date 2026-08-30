import { polylineDistances } from '../../structure-semantics/geometry.js?v=2';
import {
  DEFAULT_MAX_AT_GRADE_FILL,
  sampleTransportSurfaceAtDistance
} from './transport-surface-model.js?v=25';

const TRANSPORT_STRUCTURE_ASSEMBLY_SCHEMA_VERSION = 1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pointAtDistance(points, distances, distance) {
  if (!Array.isArray(points) || points.length < 2 || !(distances instanceof Float32Array)) return null;
  const total = finite(distances[distances.length - 1]);
  const target = Math.max(0, Math.min(total, finite(distance)));
  let index = 0;
  while (index < distances.length - 2 && distances[index + 1] < target) index += 1;
  const start = points[index];
  const end = points[index + 1];
  const segmentStart = finite(distances[index]);
  const segmentLength = Math.max(1e-6, finite(distances[index + 1], segmentStart) - segmentStart);
  const t = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  return Object.freeze({
    x: start.x + dx * t,
    z: start.z + dz * t,
    tangentX: dx / length,
    tangentZ: dz / length
  });
}

function sourceTag(feature, key) {
  return String(
    feature?.transportRecord?.sourceTags?.[key] ??
    feature?.transportRecord?.rawTags?.[key] ??
    feature?.structureTags?.[key] ??
    ''
  ).trim().toLowerCase();
}

function bridgeStructureType(feature) {
  const explicit = sourceTag(feature, 'bridge:structure');
  if (explicit) return explicit;
  const bridge = sourceTag(feature, 'bridge');
  if (bridge === 'viaduct' || bridge === 'trestle') return bridge;
  return 'beam';
}

function supportSpacingFor(feature, specification) {
  const width = Math.max(2.5, finite(feature?.width, specification?.width || 6));
  const explicit = Math.max(0, finite(specification?.supportSpacing));
  const type = bridgeStructureType(feature);
  const typeSpacing =
    type === 'trestle' ? 18 :
    type === 'viaduct' ? 24 :
    type === 'arch' ? 34 :
    type === 'suspension' || type === 'cable-stayed' ? 48 :
    28;
  const generalized = feature?.transportRecord?.completeness === 'generalized';
  return generalized
    ? Math.max(32, explicit, typeSpacing * 1.25, width * 4.5)
    : Math.max(14, explicit, typeSpacing, width * 3.4);
}

function transitionExclusion(feature, width) {
  const ranges = [];
  for (const station of feature?.structureStations || []) {
    const center = finite(station?.distance, NaN);
    if (!Number.isFinite(center)) continue;
    const halfSpan = Math.max(width * 1.5, finite(station?.span) * 0.6, 8);
    ranges.push(Object.freeze({ start: center - halfSpan, end: center + halfSpan }));
  }
  return Object.freeze(ranges);
}

function inRanges(distance, ranges) {
  return ranges.some((range) => distance >= range.start && distance <= range.end);
}

function endpointHasCompiledConnection(feature, endpoint) {
  const connected = feature?.connectedFeatures?.[endpoint];
  if (Array.isArray(connected) && connected.length > 0) return true;
  const total = finite(feature?.transportGraphRef?.totalDistance);
  const tolerance = Math.max(0.2, Math.min(1.25, finite(feature?.width, 6) * 0.08));
  return (feature?.transportGraphRef?.stations || []).some((station) => {
    const distance = finite(station?.distanceAlong, NaN);
    if (!Number.isFinite(distance)) return false;
    return endpoint === 'start' ? distance <= tolerance : total - distance <= tolerance;
  });
}

function compileSupportColumns(
  feature,
  station,
  width,
  baseThickness,
  sampleTerrainY,
  supportConflict,
  minimumHeight = 1.6,
  allowRemoteOffsets = false
) {
  const pierWidth = Math.max(1, Math.min(2.5, width * 0.16));
  const topY = station.surfaceY - baseThickness;
  const nx = -station.tangentZ;
  const nz = station.tangentX;
  const internalOffset = Math.max(1.2, Math.min(width * 0.38, width * 0.5 - pierWidth * 0.62));
  const externalOffset = width * 0.5 + pierWidth * 0.78;
  const remoteOffset = width * 0.5 + pierWidth + 4.5;
  const farRemoteOffset = width * 0.5 + pierWidth + Math.max(12, width);
  const outerRemoteOffset = width * 0.5 + pierWidth + Math.max(22, width * 1.8);
  const layouts = (width >= 8
    ? [[-internalOffset, internalOffset], [-externalOffset, externalOffset], [0]]
    : [[0], [-externalOffset, externalOffset]])
    .concat(allowRemoteOffsets
      ? [
          [-remoteOffset, remoteOffset], [-remoteOffset], [remoteOffset],
          [-farRemoteOffset, farRemoteOffset], [-farRemoteOffset], [farRemoteOffset],
          [-outerRemoteOffset, outerRemoteOffset], [-outerRemoteOffset], [outerRemoteOffset]
        ]
      : []);
  for (const offsets of layouts) {
    const columns = [];
    let blocked = false;
    for (const offset of offsets) {
      const x = station.x + nx * offset;
      const z = station.z + nz * offset;
      const terrainY = finite(sampleTerrainY(x, z), NaN);
      const height = topY - terrainY;
      if (!(height > minimumHeight)) {
        blocked = true;
        break;
      }
      const candidate = Object.freeze({
        x,
        z,
        terrainY,
        topY,
        height,
        offset,
        width: pierWidth
      });
      if (typeof supportConflict === 'function' && supportConflict(feature, candidate)) {
        blocked = true;
        break;
      }
      columns.push(candidate);
    }
    if (!blocked && columns.length > 0) return Object.freeze(columns);
  }
  return Object.freeze([]);
}

function compileElevatedAssembly(feature, sampleTerrainY, options = {}) {
  const semantics = feature?.structureSemantics || {};
  const profile = feature?.transportSurfaceModel;
  const elevated = semantics.terrainMode === 'elevated';
  const engineeredApproach =
    semantics.terrainMode === 'at_grade' &&
    profile?.engineeredApproach === true &&
    Number(profile?.stats?.maximumFill) > DEFAULT_MAX_AT_GRADE_FILL;
  if (
    (!elevated && !engineeredApproach) ||
    !Array.isArray(feature?.pts) ||
    feature.pts.length < 2 ||
    !profile ||
    typeof sampleTerrainY !== 'function'
  ) return null;

  const path = polylineDistances(feature.pts);
  const total = path.total;
  if (!(total > 0.5)) return null;
  const specification = feature?.transportStructureRef?.specification || {};
  const width = Math.max(2.5, finite(feature.width, specification.width || 6));
  const baseThickness = Math.max(0.18, finite(specification.deckThickness, Math.min(1.2, width * 0.08)));
  const lossless = feature?.transportRecord?.completeness === 'lossless';
  const generalized = feature?.transportRecord?.completeness === 'generalized';
  const complete = feature?.transportRecord?.routeState !== 'incomplete';
  const publishBody = complete && (
    engineeredApproach
      ? lossless || generalized
      : lossless || (generalized && semantics.isBridge === true)
  );
  const visualSupportDetail = publishBody;
  const sampleStep = generalized ? 12 : Math.max(2, Math.min(6, width * 0.55));
  const sampleCount = Math.max(2, Math.ceil(total / sampleStep));
  const surfaceSamples = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const distance = total * index / sampleCount;
    const point = pointAtDistance(feature.pts, path.distances, distance);
    if (!point) continue;
    const surfaceY = sampleTransportSurfaceAtDistance(profile, distance, 0);
    const terrainY = finite(sampleTerrainY(point.x, point.z), NaN);
    if (!Number.isFinite(surfaceY) || !Number.isFinite(terrainY)) continue;
    const undersideClearance = surfaceY - terrainY;
    const endpointDistance = Math.min(distance, total - distance);
    const tieInLength = Math.max(6, Math.min(18, width * 1.4));
    const tieInWeight = Math.max(0, Math.min(1, endpointDistance / tieInLength));
    const availableThickness = Math.max(0.08, undersideClearance - 0.04);
    const thickness = Math.min(baseThickness, Math.max(0.08, availableThickness * (0.35 + tieInWeight * 0.65)));
    surfaceSamples.push(Object.freeze({
      distance,
      x: point.x,
      y: surfaceY,
      z: point.z,
      tangentX: point.tangentX,
      tangentZ: point.tangentZ,
      terrainY,
      undersideClearance,
      thickness,
      onMappedWater: typeof options.pointInMappedWater === 'function'
        ? options.pointInMappedWater(feature, point.x, point.z) === true
        : false
    }));
  }

  const exclusionRanges = transitionExclusion(feature, width);
  const supportSpacing = supportSpacingFor(feature, specification);
  const supportStations = [];
  const terminalSupports = [];
  if (visualSupportDetail) {
    const endpointSkip = Math.max(7, Math.min(18, width * 1.35));
    for (let distance = supportSpacing * 0.5; distance < total; distance += supportSpacing) {
      if (distance < endpointSkip || distance > total - endpointSkip || inRanges(distance, exclusionRanges)) continue;
      const point = pointAtDistance(feature.pts, path.distances, distance);
      if (!point) continue;
      const surfaceY = sampleTransportSurfaceAtDistance(profile, distance, 0);
      const terrainY = finite(sampleTerrainY(point.x, point.z), NaN);
      const height = surfaceY - baseThickness - terrainY;
      if (!(height > 1.6)) continue;
      const station = {
        distance,
        x: point.x,
        z: point.z,
        tangentX: point.tangentX,
        tangentZ: point.tangentZ,
        surfaceY,
        terrainY,
        height,
        kind: width >= 8 ? 'paired_pier' : 'single_pier'
      };
      const columns = compileSupportColumns(
        feature,
        station,
        width,
        baseThickness,
        sampleTerrainY,
        options.supportConflict
      );
      if (columns.length === 0) continue;
      const capHalfSpan = Math.max(
        width * 0.42,
        ...columns.map((column) => Math.abs(Number(column.offset) || 0) + column.width * 0.6)
      );
      if (typeof options.supportSpanConflict === 'function' && options.supportSpanConflict(feature, {
        x: station.x,
        z: station.z,
        tangentX: station.tangentX,
        tangentZ: station.tangentZ,
        bottomY: station.surfaceY - baseThickness - 0.35,
        topY: station.surfaceY - baseThickness,
        halfSpan: capHalfSpan
      })) continue;
      supportStations.push(Object.freeze({
        ...station,
        kind: columns.length >= 2 ? 'paired_pier' : 'single_pier',
        columns
      }));
    }
  }

  const abutments = [];
  if (visualSupportDetail) {
    const publishAbutment = (endpoint, sample) => {
      if (endpointHasCompiledConnection(feature, endpoint.replace('_tie_in', ''))) return true;
      const halfSpan = width * 0.46;
      if (typeof options.supportSpanConflict === 'function' && options.supportSpanConflict(feature, {
        x: sample.x,
        z: sample.z,
        tangentX: sample.tangentX,
        tangentZ: sample.tangentZ,
        bottomY: sample.terrainY,
        topY: sample.y - sample.thickness,
        halfSpan
      })) return false;
      abutments.push(Object.freeze({
        endpoint,
        distance: sample.distance,
        x: sample.x,
        z: sample.z,
        tangentX: sample.tangentX,
        tangentZ: sample.tangentZ,
        rotationY: Math.atan2(sample.tangentX, sample.tangentZ),
        surfaceY: sample.y,
        terrainY: sample.terrainY,
        height: Math.max(0.28, sample.y - sample.thickness - sample.terrainY),
        onMappedWater: sample.onMappedWater === true
      }));
      return true;
    };
    const hasEndpointSupport = (endpoint) => supportStations.some((station) =>
      endpoint === 'start'
        ? station.distance <= Math.max(18, width * 1.8)
        : total - station.distance <= Math.max(18, width * 1.8));
    const publishTerminalSupport = (endpoint) => {
      if (endpointHasCompiledConnection(feature, endpoint) || hasEndpointSupport(endpoint)) return true;
      const maximumSetback = Math.max(18, width * 1.8);
      const candidates = surfaceSamples.filter((sample) =>
        (endpoint === 'start'
          ? sample.distance <= maximumSetback
          : total - sample.distance <= maximumSetback) &&
        sample.undersideClearance > 0.55
      ).sort((left, right) => endpoint === 'start'
        ? right.distance - left.distance
        : left.distance - right.distance);
      for (const sample of candidates) {
        const station = {
          distance: sample.distance,
          x: sample.x,
          z: sample.z,
          tangentX: sample.tangentX,
          tangentZ: sample.tangentZ,
          surfaceY: sample.y,
          terrainY: sample.terrainY,
          height: sample.y - baseThickness - sample.terrainY,
          kind: 'terminal_pier',
          terminalFor: endpoint
        };
        const columns = compileSupportColumns(
          feature,
          station,
          width,
          baseThickness,
          sampleTerrainY,
          options.supportConflict,
          0.18,
          true
        );
        if (columns.length === 0) continue;
        terminalSupports.push(Object.freeze({
          ...station,
          columns: Object.freeze(columns)
        }));
        return true;
      }
      return false;
    };
    if (engineeredApproach) {
      for (const anchor of feature?.structureTransitionAnchors || []) {
        if (anchor?.engineeredApproach !== true || !['start', 'end'].includes(anchor?.endpoint)) continue;
        const endpoint = anchor.endpoint;
        const approachRun = Math.max(14, Math.min(total, finite(anchor.span, Math.max(14, width * 1.6))));
        const candidates = surfaceSamples.filter((entry) =>
          (endpoint === 'start' ? entry.distance <= approachRun : total - entry.distance <= approachRun) &&
          entry.onMappedWater !== true &&
          entry.undersideClearance > 0.3
        ).sort((left, right) => endpoint === 'start'
          ? right.distance - left.distance
          : left.distance - right.distance);
        const sample = candidates[0];
        if (sample) publishAbutment(`${endpoint}_tie_in`, sample);
      }
    } else {
      for (const endpoint of ['start', 'end']) {
        const endpointRef = feature?.transportStructureRef?.[endpoint];
        const structuralBoundary = ['surface_transition', 'open_boundary']
          .includes(String(endpointRef?.state || ''));
        if (!structuralBoundary) continue;
        const candidates = endpoint === 'start' ? surfaceSamples : [...surfaceSamples].reverse();
        const sample = candidates.find((entry) =>
          Math.min(entry.distance, total - entry.distance) <= Math.max(14, width * 1.6) &&
          entry.onMappedWater !== true &&
          entry.undersideClearance > 0.3
        );
        if (!sample || !publishAbutment(endpoint, sample)) publishTerminalSupport(endpoint);
      }
    }
  }

  const assembly = {
    schemaVersion: TRANSPORT_STRUCTURE_ASSEMBLY_SCHEMA_VERSION,
    authority: 'compiled_transport_structure_assembly',
    featureId: String(feature?.transportStructureRef?.featureId || feature?.sourceFeatureId || ''),
    family: engineeredApproach ? 'engineered_approach' : 'elevated_road',
    structureType: bridgeStructureType(feature),
    publishBody,
    engineeredDetail: lossless && publishBody,
    visualSupportDetail,
    width,
    total,
    baseThickness,
    supportSpacing,
    surfaceSamples: Object.freeze(surfaceSamples),
    supportStations: Object.freeze(supportStations),
    terminalSupports: Object.freeze(terminalSupports),
    abutments: Object.freeze(abutments),
    exclusionRanges,
    bodyCoverage: publishBody && surfaceSamples.length >= 2 ? 1 : 0
  };
  return Object.freeze(assembly);
}

export function compileTransportStructureAssemblies(features = [], sampleTerrainY, options = {}) {
  let elevatedCount = 0;
  let bodyCount = 0;
  let supportCount = 0;
  let abutmentCount = 0;
  let unsupportedExactCount = 0;
  for (const feature of features) {
    const assembly = compileElevatedAssembly(feature, sampleTerrainY, options);
    feature.transportStructureAssembly = assembly;
    if (!assembly) continue;
    elevatedCount += 1;
    if (assembly.publishBody) bodyCount += 1;
    supportCount += assembly.supportStations.length + assembly.terminalSupports.length;
    abutmentCount += assembly.abutments.length;
    if (assembly.engineeredDetail && assembly.bodyCoverage < 1) unsupportedExactCount += 1;
  }
  return Object.freeze({
    schemaVersion: TRANSPORT_STRUCTURE_ASSEMBLY_SCHEMA_VERSION,
    authority: 'compiled_transport_structure_assembly',
    elevatedCount,
    bodyCount,
    supportCount,
    abutmentCount,
    unsupportedExactCount
  });
}

export { TRANSPORT_STRUCTURE_ASSEMBLY_SCHEMA_VERSION, compileElevatedAssembly };
