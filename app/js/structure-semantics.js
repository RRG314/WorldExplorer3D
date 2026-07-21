import { buildElevatedTerrainReference } from './structure-profile-grade.js';
import { classifyStructureSemantics, normalizedTagValue } from './structure-semantics/classification.js?v=1';
import {
  boundsIntersect,
  pointInPolygonXZ,
  polylineBounds,
  polylineDistances,
  sampleProfileAtDistance,
  segmentIntersection2D,
  smoothstep01
} from './structure-semantics/geometry.js?v=1';

function connectionEndpointKey(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return '';
  return `${Math.round(point.x * 10)},${Math.round(point.z * 10)}`;
}

function assignFeatureConnections(features = []) {
  const endpointGroups = new Map();
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    if (!points || points.length < 2) continue;
    feature.connectedFeatures = { start: [], end: [] };
    const endpoints = [
      { endpoint: 'start', endpointIndex: 0, point: points[0] },
      { endpoint: 'end', endpointIndex: points.length - 1, point: points[points.length - 1] }
    ];
    for (let e = 0; e < endpoints.length; e++) {
      const entry = endpoints[e];
      const key = connectionEndpointKey(entry.point);
      if (!key) continue;
      let bucket = endpointGroups.get(key);
      if (!bucket) {
        bucket = [];
        endpointGroups.set(key, bucket);
      }
      bucket.push({ feature, ...entry });
    }
  }

  endpointGroups.forEach((entries) => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const target = entry.feature?.connectedFeatures?.[entry.endpoint];
      if (!Array.isArray(target)) continue;
      target.length = 0;
      for (let j = 0; j < entries.length; j++) {
        const other = entries[j];
        if (other === entry || other.feature === entry.feature) continue;
        target.push({
          feature: other.feature,
          endpoint: other.endpoint,
          endpointIndex: other.endpointIndex,
          point: other.point
        });
      }
    }
  });
}

function buildFeatureStations(feature, context = {}) {
  const semantics = feature?.structureSemantics || null;
  const points = Array.isArray(feature?.pts) ? feature.pts : [];
  if (!semantics?.gradeSeparated || points.length < 2) return [];

  const { distances, total } = polylineDistances(points);
  const features = Array.isArray(context.features) ? context.features : [];
  const waterAreas = Array.isArray(context.waterAreas) ? context.waterAreas : [];
  const bounds = feature.bounds || polylineBounds(points, (Number(feature.width) || 4) + 24);
  const stations = [];
  const laneWidth = Math.max(1.2, Number(feature.width) || 4);
  const defaultTarget = semantics.terrainMode === 'subgrade' ? semantics.cutDepth : semantics.deckClearance;
  const defaultSpan = Math.max(18, laneWidth * 4.5, defaultTarget * 4.2);

  const addStation = (distance, targetOffset, span, source = 'crossing') => {
    if (!Number.isFinite(distance) || !Number.isFinite(targetOffset) || !(span > 0)) return;
    stations.push({
      distance: Math.max(0, Math.min(total, distance)),
      targetOffset,
      span,
      source
    });
  };

  for (let i = 0; i < features.length; i++) {
    const other = features[i];
    if (!other || other === feature || !Array.isArray(other.pts) || other.pts.length < 2) continue;
    const otherBounds = other.bounds || polylineBounds(other.pts, (Number(other.width) || 4) + 18);
    if (!boundsIntersect(bounds, otherBounds, 14)) continue;

    const otherSemantics = other.structureSemantics || null;
    const otherOrder = Number.isFinite(otherSemantics?.verticalOrder) ? otherSemantics.verticalOrder : 0;
    const ownOrder = Number.isFinite(semantics.verticalOrder) ? semantics.verticalOrder : 0;
    if (semantics.terrainMode === 'elevated' && otherOrder > ownOrder) continue;
    if (semantics.terrainMode === 'subgrade' && otherOrder < ownOrder) continue;

    for (let segA = 0; segA < points.length - 1; segA++) {
      const a1 = points[segA];
      const a2 = points[segA + 1];
      const segLen = Math.hypot(a2.x - a1.x, a2.z - a1.z);
      if (!(segLen > 0.01)) continue;
      for (let segB = 0; segB < other.pts.length - 1; segB++) {
        const intersection = segmentIntersection2D(a1, a2, other.pts[segB], other.pts[segB + 1]);
        if (!intersection) continue;
        const distance = distances[segA] + segLen * intersection.t;
        let target = defaultTarget;
        if (semantics.terrainMode === 'elevated') {
          const otherTarget = Number.isFinite(otherSemantics?.deckClearance) ? otherSemantics.deckClearance : 0;
          target = Math.max(defaultTarget, otherTarget + 2.2);
        } else if (semantics.terrainMode === 'subgrade') {
          const otherDepth = Number.isFinite(otherSemantics?.cutDepth) ? otherSemantics.cutDepth : 0;
          target = Math.max(defaultTarget, otherDepth + 1.4);
        }
        addStation(distance, target, defaultSpan, 'feature_crossing');
      }
    }
  }

  if (semantics.terrainMode === 'elevated' && waterAreas.length > 0) {
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const midpoint = i > 0 && i < points.length - 1 ? {
        x: (prev.x + next.x) * 0.5,
        z: (prev.z + next.z) * 0.5
      } : point;
      let insideWater = false;
      for (let w = 0; w < waterAreas.length; w++) {
        const polygon = waterAreas[w]?.pts;
        if (pointInPolygonXZ(midpoint.x, midpoint.z, polygon) || pointInPolygonXZ(point.x, point.z, polygon)) {
          insideWater = true;
          break;
        }
      }
      if (insideWater) {
        addStation(distances[i], Math.max(defaultTarget, semantics.deckClearance + 0.6), defaultSpan * 1.1, 'water_crossing');
      }
    }
  }

  if (stations.length === 0 && total > 6) {
    addStation(total * 0.5, defaultTarget, Math.max(defaultSpan, total * 0.45), 'fallback_center');
  }

  stations.sort((a, b) => a.distance - b.distance);
  const merged = [];
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.distance - station.distance) < Math.max(6, Math.min(previous.span, station.span) * 0.22)) {
      previous.distance = (previous.distance + station.distance) * 0.5;
      previous.targetOffset = Math.max(previous.targetOffset, station.targetOffset);
      previous.span = Math.max(previous.span, station.span);
      previous.source = `${previous.source}+${station.source}`;
    } else {
      merged.push({ ...station });
    }
  }
  return merged;
}

function featureEndpointSurfaceY(feature, endpointIndex, sampleTerrainY) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) return NaN;
  const lastIndex = feature.pts.length - 1;
  const clampedIndex = endpointIndex <= 0 ? 0 : lastIndex;
  const point = feature.pts[clampedIndex];
  if (!point) return NaN;
  if (feature.surfaceHeights instanceof Float32Array && feature.surfaceHeights.length > clampedIndex) {
    const value = Number(feature.surfaceHeights[clampedIndex]);
    if (Number.isFinite(value)) return value;
  }
  if (typeof sampleTerrainY !== 'function') return NaN;
  const terrainY = Number(sampleTerrainY(point.x, point.z));
  if (!Number.isFinite(terrainY)) return NaN;
  const surfaceBias = Number.isFinite(feature?.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
  return terrainY + surfaceBias;
}

function buildFeatureTransitionAnchors(feature, sampleTerrainY) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || typeof sampleTerrainY !== 'function') {
    feature.structureTransitionAnchors = [];
    return [];
  }

  const semantics = feature.structureSemantics || null;
  const connections = feature.connectedFeatures || null;
  const points = feature.pts;
  const totalDistance =
    feature.surfaceDistances instanceof Float32Array && feature.surfaceDistances.length > 0 ?
      Number(feature.surfaceDistances[feature.surfaceDistances.length - 1]) || 0 :
      polylineDistances(points).total;
  const featureLength = Math.max(0, totalDistance);
  const featureType = normalizedTagValue(feature?.type);
  const rampLike =
    semantics?.rampCandidate === true ||
    /_link$/.test(featureType) ||
    featureLength <= 120;

  const anchors = [];
  const endpoints = [
    { endpoint: 'start', index: 0, distance: 0 },
    { endpoint: 'end', index: points.length - 1, distance: featureLength }
  ];

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const point = points[endpoint.index];
    const linked = Array.isArray(connections?.[endpoint.endpoint]) ? connections[endpoint.endpoint] : [];
    if (!point || linked.length === 0) continue;

    const terrainY = Number(sampleTerrainY(point.x, point.z));
    if (!Number.isFinite(terrainY)) continue;

    let strongestOffset = 0;
    for (let j = 0; j < linked.length; j++) {
      const other = linked[j]?.feature || null;
      if (!other || other === feature || !Array.isArray(other.pts) || other.pts.length < 2) continue;
      const otherSemantics = other.structureSemantics || null;
      if (!otherSemantics) continue;
      const otherSurfaceY = featureEndpointSurfaceY(other, linked[j].endpointIndex, sampleTerrainY);
      if (!Number.isFinite(otherSurfaceY)) continue;
      const targetOffset = otherSurfaceY - terrainY;
      if (Math.abs(targetOffset) < 0.85) continue;
      if (!semantics?.gradeSeparated && !otherSemantics.gradeSeparated && !other.structureTransitionAnchors?.length) continue;
      if (Math.abs(targetOffset) > Math.abs(strongestOffset)) strongestOffset = targetOffset;
    }

    if (Math.abs(strongestOffset) < 0.85) continue;

    const blendDistance = Math.max(
      rampLike ? 20 : 10,
      Math.min(
        rampLike ? 96 : 44,
        featureLength > 0 ?
          featureLength * (rampLike ? 0.86 : 0.46) :
          (rampLike ? 32 : 18)
      )
    );

    anchors.push({
      distance: endpoint.distance,
      targetOffset: strongestOffset,
      span: blendDistance,
      endpoint: endpoint.endpoint,
      source: 'connected_feature'
    });
  }

  feature.structureTransitionAnchors = anchors;
  return anchors;
}

function buildFeatureProfileAnchors(feature, semantics, totalDistance) {
  const total = Math.max(0, Number(totalDistance) || 0);
  const endpointBaseOffset =
    semantics?.terrainMode === 'subgrade' ?
      -Math.max(0, Number(semantics.cutDepth) || 0) :
    semantics?.terrainMode === 'elevated' ?
      Math.max(0, Number(semantics.deckClearance) || Number(semantics.explicitBaseOffset) || 0) :
      0;
  const anchors = [
    { distance: 0, targetOffset: endpointBaseOffset, source: 'endpoint_default' },
    { distance: total, targetOffset: endpointBaseOffset, source: 'endpoint_default' }
  ];
  const transitionAnchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
  for (let i = 0; i < transitionAnchors.length; i++) {
    const anchor = transitionAnchors[i];
    const distance = Math.max(0, Math.min(total, Number(anchor?.distance) || 0));
    const targetOffset = Number(anchor?.targetOffset);
    if (!Number.isFinite(targetOffset)) continue;
    anchors.push({
      distance,
      targetOffset,
      source: String(anchor?.source || 'transition')
    });
  }

  if (semantics?.gradeSeparated) {
    const stations = Array.isArray(feature?.structureStations) ? feature.structureStations : [];
    if (stations.length > 0) {
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        const distance = Math.max(0, Math.min(total, Number(station?.distance) || 0));
        const magnitude = Number(station?.targetOffset);
        if (!Number.isFinite(magnitude)) continue;
        const targetOffset = semantics.terrainMode === 'subgrade' ? -Math.abs(magnitude) : Math.abs(magnitude);
        anchors.push({
          distance,
          targetOffset,
          source: String(station?.source || 'station')
        });
      }
    } else {
      const fallbackTarget =
        semantics.terrainMode === 'subgrade' ?
          -Math.max(0, Number(semantics.cutDepth) || 0) :
          Math.max(0, Number(semantics.deckClearance) || Number(semantics.explicitBaseOffset) || 0);
      if (Math.abs(fallbackTarget) > 0.01 && total > 4) {
        anchors.push({
          distance: total * 0.5,
          targetOffset: fallbackTarget,
          source: 'fallback_center'
        });
      }
    }
  }

  anchors.sort((a, b) => a.distance - b.distance);
  const merged = [];
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.distance - anchor.distance) < 0.25) {
      if (Math.abs(anchor.targetOffset) > Math.abs(previous.targetOffset)) {
        previous.targetOffset = anchor.targetOffset;
        previous.source = anchor.source;
      }
    } else {
      merged.push({ ...anchor });
    }
  }
  return merged;
}

function updateFeatureSurfaceProfile(feature, sampleTerrainY, options = {}) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || typeof sampleTerrainY !== 'function') return feature;

  const semantics = feature.structureSemantics || classifyStructureSemantics(feature.structureTags || {}, {
    featureKind: feature.networkKind || feature.kind || 'road',
    subtype: feature.type || feature.subtype || ''
  });
  const { distances, total } = polylineDistances(feature.pts);
  const surfaceBias = Number.isFinite(options.surfaceBias) ? options.surfaceBias : Number(feature.surfaceBias) || 0.08;
  const terrainHeights = feature.pts.map((point) => Number(sampleTerrainY(point.x, point.z)) || 0);
  const terrainReference = semantics.terrainMode === 'elevated' ?
    buildElevatedTerrainReference(terrainHeights, distances, total) :
    terrainHeights;
  const profileHeights = new Float32Array(feature.pts.length);
  const profileOffsets = new Float32Array(feature.pts.length);
  const stations = Array.isArray(feature.structureStations) ? feature.structureStations : [];
  const anchors = buildFeatureProfileAnchors(feature, semantics, total);
  const anchorDistances = new Float32Array(anchors.length);
  const anchorOffsets = new Float32Array(anchors.length);
  for (let i = 0; i < anchors.length; i++) {
    anchorDistances[i] = Number(anchors[i].distance) || 0;
    anchorOffsets[i] = Number(anchors[i].targetOffset) || 0;
  }

  for (let i = 0; i < feature.pts.length; i++) {
    let signedOffset = sampleProfileAtDistance(anchorDistances, anchorOffsets, distances[i]);
    if (!Number.isFinite(signedOffset)) signedOffset = 0;
    for (let s = 0; s < stations.length; s++) {
      const station = stations[s];
      const delta = Math.abs(distances[i] - station.distance);
      if (delta > station.span) continue;
      const weight = 1 - smoothstep01(delta / station.span);
      const contribution = station.targetOffset * weight * (semantics.terrainMode === 'subgrade' ? -1 : 1);
      if (contribution >= 0) {
        signedOffset = Math.max(signedOffset, contribution);
      } else {
        signedOffset = Math.min(signedOffset, contribution);
      }
    }

    // The grade-separated feature owns its ramp or portal transition. Carrying
    // that offset onto an ordinary road can pull the entire at-grade segment
    // above or below the terrain between sparse OSM endpoints.
    if (semantics.terrainMode === 'at_grade') signedOffset = 0;

    let profileY = terrainReference[i] + signedOffset + surfaceBias;
    const minimumSurfaceY = Number(feature.minimumStructureSurfaceY);
    if (semantics.terrainMode === 'elevated' && Number.isFinite(minimumSurfaceY)) {
      profileY = Math.max(profileY, minimumSurfaceY);
    }
    profileOffsets[i] = signedOffset;
    profileHeights[i] = profileY;
  }

  feature.structureSemantics = semantics;
  feature.surfaceBias = surfaceBias;
  feature.surfaceDistances = distances;
  feature.surfaceHeights = profileHeights;
  feature.surfaceOffsets = profileOffsets;
  feature.surfaceTerrainSampler = semantics.terrainMode === 'at_grade' ? sampleTerrainY : null;
  feature.structureSurfaceMinY = profileHeights.reduce((best, value) => Math.min(best, value), Infinity);
  feature.structureSurfaceMaxY = profileHeights.reduce((best, value) => Math.max(best, value), -Infinity);
  return feature;
}

function buildFeatureRibbonEdges(feature, points, halfWidth, sampleTerrainY, options = {}) {
  if (!feature || !Array.isArray(points) || points.length < 2 || typeof sampleTerrainY !== 'function') {
    return { leftEdge: [], rightEdge: [], centerlineHeights: [] };
  }

  const baseTopBias = Number.isFinite(options.surfaceBias) ? options.surfaceBias : Number(feature.surfaceBias) || 0.08;
  if (!(feature.surfaceDistances instanceof Float32Array) || !(feature.surfaceHeights instanceof Float32Array)) {
    updateFeatureSurfaceProfile(feature, sampleTerrainY, { surfaceBias: baseTopBias });
  }

  const { distances: pointDistances, total } = polylineDistances(points);
  const profileTotal = feature.surfaceDistances?.length ? feature.surfaceDistances[feature.surfaceDistances.length - 1] : total;
  const leftEdge = [];
  const rightEdge = [];
  const centerlineHeights = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    let dx;
    let dz;
    if (i === 0) {
      dx = points[1].x - point.x;
      dz = points[1].z - point.z;
    } else if (i === points.length - 1) {
      dx = point.x - points[i - 1].x;
      dz = point.z - points[i - 1].z;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dz = points[i + 1].z - points[i - 1].z;
    }

    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const distanceRatio = total > 1e-6 ? pointDistances[i] / total : 0;
    const profileDistance = profileTotal * distanceRatio;
    const atGrade = feature.structureSemantics?.terrainMode === 'at_grade';
    const terrainY = Number(sampleTerrainY(point.x, point.z));
    const surfaceOffset = feature.surfaceOffsets instanceof Float32Array ?
      Number(sampleProfileAtDistance(feature.surfaceDistances, feature.surfaceOffsets, profileDistance)) || 0 :
      0;
    const storedProfileY = Number(sampleProfileAtDistance(feature.surfaceDistances, feature.surfaceHeights, profileDistance));
    const centerY = atGrade && Number.isFinite(terrainY) ?
      terrainY + surfaceOffset + baseTopBias :
      Number.isFinite(storedProfileY) ? storedProfileY : terrainY + baseTopBias;
    centerlineHeights.push(centerY);

    const leftX = point.x + nx * halfWidth;
    const leftZ = point.z + nz * halfWidth;
    const rightX = point.x - nx * halfWidth;
    const rightZ = point.z - nz * halfWidth;
    const maxCrossfall = Math.max(0.12, Math.min(0.45, halfWidth * 0.08));
    const clampCrossfall = (terrainY) => centerY + Math.max(
      -maxCrossfall,
      Math.min(maxCrossfall, Number(terrainY) + baseTopBias - centerY)
    );
    const leftY = atGrade ? clampCrossfall(sampleTerrainY(leftX, leftZ)) : centerY;
    const rightY = atGrade ? clampCrossfall(sampleTerrainY(rightX, rightZ)) : centerY;
    leftEdge.push({
      x: leftX,
      y: Number.isFinite(leftY) ? leftY : centerY,
      z: leftZ
    });
    rightEdge.push({
      x: rightX,
      y: Number.isFinite(rightY) ? rightY : centerY,
      z: rightZ
    });
  }

  return { leftEdge, rightEdge, centerlineHeights };
}

function shouldRenderRoadSkirts(feature) {
  const semantics = feature?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated') return false;
  if (semantics?.terrainMode === 'subgrade') return true;
  // Ordinary roads are draped surfaces. Vertical skirts make them read as
  // elevated slabs and expose wall textures on normal terrain.
  return false;
}

function sampleFeatureSurfaceY(feature, x, z, projected = null) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) return NaN;
  const projection = projected || projectPointToFeature(feature, x, z);
  if (!projection) return NaN;
  const distances = feature.surfaceDistances instanceof Float32Array ? feature.surfaceDistances : null;
  const heights = feature.surfaceHeights instanceof Float32Array ? feature.surfaceHeights : null;
  if (!distances || !heights || !distances.length || !heights.length) return NaN;

  const p1 = feature.pts[projection.segIndex];
  const p2 = feature.pts[projection.segIndex + 1];
  const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  const distance = distances[projection.segIndex] + segLen * projection.t;
  if (
    feature.structureSemantics?.terrainMode === 'at_grade' &&
    typeof feature.surfaceTerrainSampler === 'function'
  ) {
    const terrainY = Number(feature.surfaceTerrainSampler(projection.x, projection.z));
    if (Number.isFinite(terrainY)) {
      const offsets = feature.surfaceOffsets instanceof Float32Array ? feature.surfaceOffsets : null;
      const structureOffset = offsets ? Number(sampleProfileAtDistance(distances, offsets, distance)) || 0 : 0;
      const surfaceBias = Number.isFinite(feature.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
      return terrainY + structureOffset + surfaceBias;
    }
  }
  return sampleProfileAtDistance(distances, heights, distance);
}

function areRoadsConnected(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const starts = Array.isArray(a?.connectedFeatures?.start) ? a.connectedFeatures.start : [];
  const ends = Array.isArray(a?.connectedFeatures?.end) ? a.connectedFeatures.end : [];
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]?.feature === b) return true;
  }
  for (let i = 0; i < ends.length; i++) {
    if (ends[i]?.feature === b) return true;
  }
  return false;
}

function roadSurfaceAttachmentThreshold(road, options = {}) {
  const semantics = road?.structureSemantics || null;
  let threshold =
    semantics?.terrainMode === 'elevated' ? 2.8 :
    semantics?.terrainMode === 'subgrade' ? 3.2 :
    4.4;
  if (semantics?.rampCandidate) threshold += 1.15;
  if (Number.isFinite(options?.extraVerticalAllowance)) {
    threshold += Number(options.extraVerticalAllowance);
  }
  return threshold;
}

function roadSurfaceLateralThreshold(road, options = {}) {
  const halfWidth = Number.isFinite(road?.width) ? Number(road.width) * 0.5 : 0;
  const semantics = road?.structureSemantics || null;
  let padding =
    semantics?.terrainMode === 'elevated' ? 1.05 :
    semantics?.terrainMode === 'subgrade' ? 1.15 :
    1.35;
  if (semantics?.rampCandidate) padding += 0.45;
  if (Number.isFinite(options?.extraLateralPadding)) {
    padding += Number(options.extraLateralPadding);
  }
  return Math.max(1.5, halfWidth + padding);
}

function roadSurfaceDirectLockThreshold(road) {
  const semantics = road?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated') return 1.25;
  if (semantics?.terrainMode === 'subgrade') return 1.35;
  return 4.4;
}

function roadSurfaceTransitionLockThreshold(road) {
  const semantics = road?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated') return 1.65;
  if (semantics?.terrainMode === 'subgrade') return 1.85;
  return 4.4;
}

function isRoadSurfaceReachable(nearestRoad, options = {}) {
  const road = nearestRoad?.road || null;
  if (!road || !Number.isFinite(nearestRoad?.dist)) return false;

  const semantics = road?.structureSemantics || null;
  const currentRoad = options?.currentRoad || null;
  const sameRoad = !!currentRoad && road === currentRoad;
  const connectedRoad = !!currentRoad && !sameRoad && areRoadsConnected(currentRoad, road);
  const sameVerticalGroup = !!(
    currentRoad?.structureSemantics?.verticalGroup &&
    road?.structureSemantics?.verticalGroup === currentRoad.structureSemantics.verticalGroup
  );
  const continuityAccess = sameRoad || connectedRoad || sameVerticalGroup;

  let maxDist = roadSurfaceLateralThreshold(road, options);
  if (sameRoad) maxDist += 0.55;
  else if (connectedRoad) maxDist += 0.35;
  if (nearestRoad.dist > maxDist) return false;

  const verticalDelta = Number(nearestRoad?.verticalDelta);
  if (!Number.isFinite(verticalDelta)) return true;

  if (semantics?.gradeSeparated && !continuityAccess) {
    const distanceToTransitionZone = Number(nearestRoad?.distanceToTransitionZone);
    const nearTransition = Number.isFinite(distanceToTransitionZone) && distanceToTransitionZone <= 1.2;
    const directLockThreshold = roadSurfaceDirectLockThreshold(road);
    const transitionLockThreshold = roadSurfaceTransitionLockThreshold(road);
    if (verticalDelta > directLockThreshold) {
      if (!(nearTransition && verticalDelta <= transitionLockThreshold)) {
        return false;
      }
    }
  }

  let maxVertical = roadSurfaceAttachmentThreshold(road, options);
  if (sameRoad) maxVertical += 1.7;
  else if (connectedRoad) maxVertical += 1.15;
  else if (sameVerticalGroup) maxVertical += 0.45;
  return verticalDelta <= maxVertical;
}

function projectPointToFeature(feature, x, z) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) return null;
  let best = null;
  for (let i = 0; i < feature.pts.length - 1; i++) {
    const p1 = feature.pts[i];
    const p2 = feature.pts[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 1e-9) continue;
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p1.x + dx * t;
    const pz = p1.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) {
      best = {
        x: px,
        z: pz,
        dist,
        segIndex: i,
        t
      };
    }
  }
  return best;
}

function featureTraversalKey(feature) {
  const semantics = feature?.structureSemantics || null;
  return semantics?.verticalGroup || 'grade:0';
}

export {
  areRoadsConnected,
  assignFeatureConnections,
  boundsIntersect,
  buildFeatureRibbonEdges,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  classifyStructureSemantics,
  featureTraversalKey,
  isRoadSurfaceReachable,
  pointInPolygonXZ,
  polylineBounds,
  polylineDistances,
  projectPointToFeature,
  roadSurfaceAttachmentThreshold,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
};
