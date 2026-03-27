function normalizedTagValue(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isTruthyTag(value = '') {
  const normalized = normalizedTagValue(value);
  if (!normalized) return false;
  return !/^(no|false|0|none)$/i.test(normalized);
}

function parseNumericTag(value, fallback = NaN) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const first = raw.split(/[;,]/)[0]?.trim();
  const parsed = Number.parseFloat(first);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntegerTag(value, fallback = 0) {
  const parsed = parseNumericTag(value, fallback);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function featureTypeCategory(featureKind = 'road', subtype = '') {
  const kind = normalizedTagValue(featureKind);
  const type = normalizedTagValue(subtype);
  if (kind === 'railway') return 'railway';
  if (kind === 'building') return 'building';
  if (kind === 'connector') return 'connector';
  if (kind === 'footway' || kind === 'cycleway') return kind;
  if (kind === 'road') return 'road';
  if (/^(footway|pedestrian|path|steps|corridor)$/.test(type)) return 'footway';
  if (type === 'cycleway') return 'cycleway';
  if (/^(rail|light_rail|tram|subway|narrow_gauge)$/.test(type)) return 'railway';
  return kind || 'road';
}

function baseClearanceForCategory(category = 'road') {
  switch (category) {
    case 'railway':
      return 6.2;
    case 'cycleway':
      return 4.5;
    case 'footway':
    case 'connector':
      return 4.2;
    case 'building':
      return 0;
    default:
      return 5.5;
  }
}

function baseDepthForCategory(category = 'road') {
  switch (category) {
    case 'railway':
      return 5.2;
    case 'cycleway':
      return 3.4;
    case 'footway':
    case 'connector':
      return 3.0;
    case 'building':
      return 0;
    default:
      return 4.6;
  }
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

function maxTransitionAnchorOffset(feature) {
  const anchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
  let maxOffset = 0;
  for (let i = 0; i < anchors.length; i++) {
    maxOffset = Math.max(maxOffset, Math.abs(Number(anchors[i]?.targetOffset) || 0));
  }
  return maxOffset;
}

function roadBehavesGradeSeparated(road) {
  const semantics = road?.structureSemantics || null;
  if (semantics?.gradeSeparated) return true;
  const maxOffset = maxTransitionAnchorOffset(road);
  const roadType = String(road?.type || semantics?.subtype || '').toLowerCase();
  const connectedStart = Array.isArray(road?.connectedFeatures?.start) ? road.connectedFeatures.start : [];
  const connectedEnd = Array.isArray(road?.connectedFeatures?.end) ? road.connectedFeatures.end : [];
  const connectedFeatures = connectedStart.concat(connectedEnd).map((entry) => entry?.feature).filter(Boolean);
  const hasGradeSeparatedNeighbor = connectedFeatures.some((feature) => {
    const neighborSemantics = feature?.structureSemantics || null;
    return neighborSemantics?.gradeSeparated || neighborSemantics?.terrainMode === 'elevated';
  });
  const hasAnchoredNeighbor = connectedFeatures.some((feature) => maxTransitionAnchorOffset(feature) >= 2.4);
  const isLinkRoad =
    roadType.includes('motorway_link') ||
    roadType.includes('trunk_link') ||
    roadType.includes('primary_link') ||
    roadType.includes('secondary_link') ||
    roadType.includes('tertiary_link') ||
    roadType === 'link';
  if (semantics?.rampCandidate) {
    if (maxOffset >= 2.4) return true;
    if (maxOffset >= 0.75 && (isLinkRoad || hasGradeSeparatedNeighbor || hasAnchoredNeighbor)) return true;
  }
  if (!(maxOffset >= 2.6)) return false;
  if (!hasGradeSeparatedNeighbor) return false;

  const distances = road?.surfaceDistances;
  const totalDistance =
    distances instanceof Float32Array && distances.length > 0 ?
      Number(distances[distances.length - 1]) || 0 :
      polylineDistances(Array.isArray(road?.pts) ? road.pts : []).total;
  return totalDistance > 0 && totalDistance <= 180;
}

function polylineDistances(points = []) {
  const distances = new Float32Array(points.length);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    distances[i] = total;
  }
  return { distances, total };
}

function sampleProfileAtDistance(distances, values, distance) {
  if (!(distances instanceof Float32Array) || !Array.isArray(values) && !(values instanceof Float32Array)) return NaN;
  if (distances.length === 0 || values.length === 0) return NaN;
  if (distance <= 0) return Number(values[0]) || NaN;
  const lastIndex = Math.min(distances.length, values.length) - 1;
  if (distance >= distances[lastIndex]) return Number(values[lastIndex]) || NaN;

  for (let i = 0; i < lastIndex; i++) {
    const start = distances[i];
    const end = distances[i + 1];
    if (distance < start || distance > end) continue;
    const span = end - start;
    const t = span > 1e-6 ? (distance - start) / span : 0;
    const from = Number(values[i]) || 0;
    const to = Number(values[i + 1]) || from;
    return from + (to - from) * t;
  }
  return Number(values[lastIndex]) || NaN;
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

function polylineBounds(points = [], padding = 0) {
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
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
  const pad = Math.max(0, Number(padding) || 0);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad
  };
}

function boundsIntersect(a, b, padding = 0) {
  if (!a || !b) return false;
  const pad = Math.max(0, Number(padding) || 0);
  return !(
    a.maxX < b.minX - pad ||
    a.minX > b.maxX + pad ||
    a.maxZ < b.minZ - pad ||
    a.minZ > b.maxZ + pad
  );
}

function pointInPolygonXZ(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = (zi > z) !== (zj > z) &&
      x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

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
  const surfaceBias = Number.isFinite(feature?.surfaceBias) ? Number(feature.surfaceBias) : 0.42;
  return terrainY + surfaceBias;
}

function featureInheritedContinuationSurfaceY(feature, endpointIndex, sampleTerrainY, blendFactor = 0.78) {
  const endpointY = featureEndpointSurfaceY(feature, endpointIndex, sampleTerrainY);
  if (!Number.isFinite(endpointY)) return NaN;
  if (!(feature?.structureSemantics?.gradeSeparated || roadBehavesGradeSeparated(feature))) return endpointY;

  const distances = feature?.surfaceDistances instanceof Float32Array ? feature.surfaceDistances : null;
  const heights = feature?.surfaceHeights instanceof Float32Array ? feature.surfaceHeights : null;
  if (!distances || !heights || distances.length === 0 || distances.length !== heights.length) return endpointY;

  const totalDistance = Number(distances[distances.length - 1]) || 0;
  if (!(totalDistance > 0)) return endpointY;

  const lookaheadDistance = Math.min(22, Math.max(10, totalDistance * 0.2));
  const profileDistance =
    endpointIndex <= 0 ?
      lookaheadDistance :
      Math.max(0, totalDistance - lookaheadDistance);
  const innerY = sampleProfileAtDistance(distances, heights, profileDistance);
  if (!Number.isFinite(innerY)) return endpointY;
  return endpointY + (innerY - endpointY) * Math.max(0, Math.min(1, Number(blendFactor) || 0));
}

function featureStableInheritedOffsetLimit(feature) {
  if (!feature) return 0;
  const semantics = feature?.structureSemantics || null;
  let maxOffset = 0;

  if (semantics?.terrainMode === 'elevated') {
    maxOffset = Math.max(
      maxOffset,
      Math.abs(Number(semantics?.deckClearance) || 0),
      Math.abs(Number(semantics?.explicitBaseOffset) || 0)
    );
  } else if (semantics?.terrainMode === 'subgrade') {
    maxOffset = Math.max(maxOffset, Math.abs(Number(semantics?.cutDepth) || 0));
  }

  const stations = Array.isArray(feature?.structureStations) ? feature.structureStations : [];
  for (let i = 0; i < stations.length; i++) {
    maxOffset = Math.max(maxOffset, Math.abs(Number(stations[i]?.targetOffset) || 0));
  }

  const anchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
  for (let i = 0; i < anchors.length; i++) {
    const source = String(anchors[i]?.source || '');
    if (source === 'connected_feature') continue;
    maxOffset = Math.max(maxOffset, Math.abs(Number(anchors[i]?.targetOffset) || 0));
  }

  if (maxOffset < 0.01 && roadBehavesGradeSeparated(feature)) {
    for (let i = 0; i < anchors.length; i++) {
      maxOffset = Math.max(maxOffset, Math.min(12, Math.abs(Number(anchors[i]?.targetOffset) || 0)));
    }
  }

  return maxOffset;
}

function featureTypeFamily(feature = null) {
  return normalizedTagValue(feature?.type || feature?.subtype || feature?.structureTags?.highway || '').replace(/_link$/i, '');
}

function featureNameKey(feature = null) {
  return normalizedTagValue(feature?.name || feature?.structureTags?.name || '');
}

function endpointDirectionVector(feature, endpointIndex) {
  const points = Array.isArray(feature?.pts) ? feature.pts : null;
  if (!points || points.length < 2) return null;
  const lastIndex = points.length - 1;
  const from = endpointIndex <= 0 ? points[0] : points[lastIndex];
  const toward = endpointIndex <= 0 ? points[1] : points[lastIndex - 1];
  if (!from || !toward) return null;
  const dx = toward.x - from.x;
  const dz = toward.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-5)) return null;
  return { x: dx / length, z: dz / length };
}

function endpointContinuationAlignment(feature, endpointIndex, other, otherEndpointIndex) {
  const a = endpointDirectionVector(feature, endpointIndex);
  const b = endpointDirectionVector(other, otherEndpointIndex);
  if (!a || !b) return -1;
  return Math.abs(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
}

function canInheritTransitionAnchor(feature, endpoint, other, otherEndpointIndex, featureLength, linkedCount) {
  if (!feature || !other || other === feature) return false;
  const semantics = feature?.structureSemantics || null;
  const otherSemantics = other?.structureSemantics || null;
  if (!otherSemantics) return false;

  const featureLinkLike =
    semantics?.rampCandidate === true ||
    /_link$/i.test(String(feature?.type || '')) ||
    normalizedTagValue(semantics?.placement) === 'transition';
  const otherLinkLike =
    otherSemantics?.rampCandidate === true ||
    /_link$/i.test(String(other?.type || '')) ||
    normalizedTagValue(otherSemantics?.placement) === 'transition';
  const sameName = (() => {
    const a = featureNameKey(feature);
    const b = featureNameKey(other);
    return !!a && a === b;
  })();
  const sameFamily = (() => {
    const a = featureTypeFamily(feature);
    const b = featureTypeFamily(other);
    return !!a && a === b;
  })();
  const alignment = endpointContinuationAlignment(feature, endpoint.index, other, otherEndpointIndex);
  const otherGradeSeparatedLike = otherSemantics?.gradeSeparated === true || roadBehavesGradeSeparated(other);
  const directGradeSeparatedContinuation =
    !semantics?.gradeSeparated &&
    !featureLinkLike &&
    otherGradeSeparatedLike &&
    linkedCount <= 4 &&
    (sameName || sameFamily);
  const sameFamilyLinkContinuation =
    !semantics?.gradeSeparated &&
    featureLinkLike &&
    otherGradeSeparatedLike &&
    sameFamily &&
    linkedCount <= 5;
  const alignedRampApproach =
    !semantics?.gradeSeparated &&
    !featureLinkLike &&
    otherGradeSeparatedLike &&
    otherLinkLike &&
    linkedCount <= 3;
  const alignedShortRampContinuation =
    !semantics?.gradeSeparated &&
    !featureLinkLike &&
    otherLinkLike &&
    linkedCount <= 4 &&
    featureLength <= 84;

  if (!featureLinkLike && !otherLinkLike && !sameName && !sameFamily) return false;

  const minimumAlignment =
    directGradeSeparatedContinuation ? (sameName ? 0.42 : 0.58) :
    sameFamilyLinkContinuation ? (sameName ? 0.42 : 0.6) :
    alignedRampApproach ? 0.68 :
    alignedShortRampContinuation ? 0.72 :
    featureLinkLike || otherLinkLike ? 0.18 :
    sameName ? 0.58 :
    0.78;
  if (!(alignment >= minimumAlignment)) return false;

  if (!semantics?.gradeSeparated && !featureLinkLike) {
    if (directGradeSeparatedContinuation || alignedRampApproach || alignedShortRampContinuation) return true;
    if (!otherLinkLike) return false;
    if (!sameName && !sameFamily) return false;
    if (linkedCount > 2) return false;
    if (featureLength > 64) return false;
  }

  return true;
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
    /_link$/.test(featureType);

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
      if (!canInheritTransitionAnchor(feature, endpoint, other, linked[j].endpointIndex, featureLength, linked.length)) continue;
      const sameName = featureNameKey(feature) && featureNameKey(feature) === featureNameKey(other);
      const sameFamily = featureTypeFamily(feature) && featureTypeFamily(feature) === featureTypeFamily(other);
      const otherLinkLike =
        otherSemantics?.rampCandidate === true ||
        /_link$/i.test(String(other?.type || '')) ||
        normalizedTagValue(otherSemantics?.placement) === 'transition';
      const directGradeSeparatedContinuation =
        !semantics?.gradeSeparated &&
        !rampLike &&
        (otherSemantics?.gradeSeparated === true || roadBehavesGradeSeparated(other)) &&
        (sameName || sameFamily);
      const sameFamilyLinkContinuation =
        !semantics?.gradeSeparated &&
        rampLike &&
        (otherSemantics?.gradeSeparated === true || roadBehavesGradeSeparated(other)) &&
        sameFamily;
      const alignedRampApproach =
        !semantics?.gradeSeparated &&
        !rampLike &&
        (otherSemantics?.gradeSeparated === true || roadBehavesGradeSeparated(other)) &&
        otherLinkLike &&
        linked.length <= 3;
      const otherSurfaceY =
        (directGradeSeparatedContinuation || alignedRampApproach || sameFamilyLinkContinuation) ?
          featureInheritedContinuationSurfaceY(other, linked[j].endpointIndex, sampleTerrainY) :
          featureEndpointSurfaceY(other, linked[j].endpointIndex, sampleTerrainY);
      if (!Number.isFinite(otherSurfaceY)) continue;
      let targetOffset = otherSurfaceY - terrainY;
      const inheritedLimit = featureStableInheritedOffsetLimit(other);
      if (inheritedLimit > 0.01) {
        const inheritedSlack =
          otherSemantics?.terrainMode === 'elevated' ? 3.6 :
          otherSemantics?.terrainMode === 'subgrade' ? 3.2 :
          otherSemantics?.rampCandidate ? 2.8 :
          2.4;
        const cappedMagnitude = Math.min(Math.abs(targetOffset), inheritedLimit + inheritedSlack);
        targetOffset = Math.sign(targetOffset || 1) * cappedMagnitude;
      }
      if (!semantics?.gradeSeparated && rampLike) {
        const rampOffsetCap = Math.max(4.5, Math.min(18, featureLength * 0.15 + 3));
        const cappedMagnitude = Math.min(Math.abs(targetOffset), rampOffsetCap);
        targetOffset = Math.sign(targetOffset || 1) * cappedMagnitude;
      }
      const minimumRequiredOffset =
        semantics?.gradeSeparated && !otherSemantics.gradeSeparated ?
          0.12 :
        sameFamilyLinkContinuation ?
          0.55 :
          0.85;
      if (Math.abs(targetOffset) < minimumRequiredOffset) continue;
      if (!semantics?.gradeSeparated && !otherSemantics.gradeSeparated && !other.structureTransitionAnchors?.length) continue;
      if (Math.abs(targetOffset) > Math.abs(strongestOffset)) strongestOffset = targetOffset;
    }

    const endpointMinimumRequiredOffset =
      semantics?.gradeSeparated ?
        0.12 :
      rampLike && linked.length > 0 ?
        0.55 :
        0.85;
    if (Math.abs(strongestOffset) < endpointMinimumRequiredOffset) continue;

    const strongRampAnchor = rampLike && Math.abs(strongestOffset) >= 2.6;
    const strongApproachAnchor =
      !rampLike &&
      !semantics?.gradeSeparated &&
      Math.abs(strongestOffset) >= 2.6;
    const blendDistance = Math.max(
      rampLike ? (strongRampAnchor ? 56 : 36) :
      strongApproachAnchor ? 26 :
      10,
      Math.min(
        rampLike ? (strongRampAnchor ? 300 : 200) :
        strongApproachAnchor ? 144 :
        44,
        featureLength > 0 ?
          featureLength * (
            rampLike ? (strongRampAnchor ? 1.35 : 1.12) :
            strongApproachAnchor ? 0.82 :
            0.46
          ) :
          (
            rampLike ? (strongRampAnchor ? 70 : 52) :
            strongApproachAnchor ? 54 :
            18
          )
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
  const anchors = [];
  const transitionAnchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
  let hasStartTransitionAnchor = false;
  let hasEndTransitionAnchor = false;
  for (let i = 0; i < transitionAnchors.length; i++) {
    const anchor = transitionAnchors[i];
    const distance = Math.max(0, Math.min(total, Number(anchor?.distance) || 0));
    const targetOffset = Number(anchor?.targetOffset);
    if (!Number.isFinite(targetOffset)) continue;
    if (distance <= 0.25) hasStartTransitionAnchor = true;
    if (Math.abs(distance - total) <= 0.25) hasEndTransitionAnchor = true;
    anchors.push({
      distance,
      targetOffset,
      source: String(anchor?.source || 'transition')
    });
  }

  if (!hasStartTransitionAnchor) {
    anchors.push({ distance: 0, targetOffset: endpointBaseOffset, source: 'endpoint_default' });
  }
  if (!hasEndTransitionAnchor) {
    anchors.push({ distance: total, targetOffset: endpointBaseOffset, source: 'endpoint_default' });
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
  const surfaceBias = Number.isFinite(options.surfaceBias) ? options.surfaceBias : Number(feature.surfaceBias) || 0.42;
  const terrainHeights = feature.pts.map((point) => Number(sampleTerrainY(point.x, point.z)) || 0);
  const profileHeights = new Float32Array(feature.pts.length);
  const stations = Array.isArray(feature.structureStations) ? feature.structureStations : [];
  const anchors = buildFeatureProfileAnchors(feature, semantics, total);
  const anchorDistances = new Float32Array(anchors.length);
  const anchorOffsets = new Float32Array(anchors.length);
  const featureType = normalizedTagValue(feature?.type || feature?.subtype || '');
  const rampLike =
    semantics?.rampCandidate === true ||
    /_link$/i.test(featureType) ||
    normalizedTagValue(semantics?.placement) === 'transition';
  const strongRampProfile =
    rampLike &&
    anchors.length === 2 &&
    Math.max(Math.abs(Number(anchors[0]?.targetOffset) || 0), Math.abs(Number(anchors[1]?.targetOffset) || 0)) >= 2.6;
  for (let i = 0; i < anchors.length; i++) {
    anchorDistances[i] = Number(anchors[i].distance) || 0;
    anchorOffsets[i] = Number(anchors[i].targetOffset) || 0;
  }

  for (let i = 0; i < feature.pts.length; i++) {
    let signedOffset;
    if (strongRampProfile) {
      const startDistance = anchorDistances[0];
      const endDistance = anchorDistances[1];
      const span = Math.max(1e-6, endDistance - startDistance);
      const t = Math.max(0, Math.min(1, (distances[i] - startDistance) / span));
      const easedT =
        total <= 72 ?
          t :
        total <= 140 ?
          smoothstep01(t) :
          smoothstep01(smoothstep01(t));
      signedOffset = anchorOffsets[0] + (anchorOffsets[1] - anchorOffsets[0]) * easedT;
    } else {
      signedOffset = sampleProfileAtDistance(anchorDistances, anchorOffsets, distances[i]);
    }
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

    profileHeights[i] = terrainHeights[i] + signedOffset + surfaceBias;
  }

  feature.structureSemantics = semantics;
  feature.surfaceBias = surfaceBias;
  feature.surfaceDistances = distances;
  feature.surfaceHeights = profileHeights;
  feature.structureSurfaceMinY = profileHeights.reduce((best, value) => Math.min(best, value), Infinity);
  feature.structureSurfaceMaxY = profileHeights.reduce((best, value) => Math.max(best, value), -Infinity);
  return feature;
}

function buildFeatureRibbonEdges(feature, points, halfWidth, sampleTerrainY, options = {}) {
  if (!feature || !Array.isArray(points) || points.length < 2 || typeof sampleTerrainY !== 'function') {
    return { leftEdge: [], rightEdge: [], centerlineHeights: [] };
  }

  const semantics = feature.structureSemantics || classifyStructureSemantics(feature.structureTags || {}, {
    featureKind: feature.networkKind || feature.kind || 'road',
    subtype: feature.type || feature.subtype || ''
  });
  const baseTopBias = Number.isFinite(options.surfaceBias) ? options.surfaceBias : Number(feature.surfaceBias) || 0.42;
  if (!(feature.surfaceDistances instanceof Float32Array) || !(feature.surfaceHeights instanceof Float32Array)) {
    updateFeatureSurfaceProfile(feature, sampleTerrainY, { surfaceBias: baseTopBias });
  }

  const { distances: pointDistances, total } = polylineDistances(points);
  const profileTotal = feature.surfaceDistances?.length ? feature.surfaceDistances[feature.surfaceDistances.length - 1] : total;
  const leftEdge = [];
  const rightEdge = [];
  const centerlineHeights = [];
  const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;

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
    const centerY = Number(sampleProfileAtDistance(feature.surfaceDistances, feature.surfaceHeights, profileDistance)) || sampleTerrainY(point.x, point.z) + baseTopBias;
    centerlineHeights.push(centerY);

    const leftX = point.x + nx * halfWidth;
    const leftZ = point.z + nz * halfWidth;
    const rightX = point.x - nx * halfWidth;
    const rightZ = point.z - nz * halfWidth;
    const terrainSnappedEdges = semantics.terrainMode === 'at_grade' && !hasTransitionAnchors && options.terrainSnappedEdges !== false;
    const edgeBias = terrainSnappedEdges ? baseTopBias : 0;

    leftEdge.push({
      x: leftX,
      y: terrainSnappedEdges ? sampleTerrainY(leftX, leftZ) + edgeBias : centerY,
      z: leftZ
    });
    rightEdge.push({
      x: rightX,
      y: terrainSnappedEdges ? sampleTerrainY(rightX, rightZ) + edgeBias : centerY,
      z: rightZ
    });
  }

  return { leftEdge, rightEdge, centerlineHeights };
}

function shouldRenderRoadSkirts(feature) {
  const semantics = feature?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated') return false;
  if (semantics?.terrainMode === 'subgrade') return true;

  const hasTransitionAnchors =
    Array.isArray(feature?.structureTransitionAnchors) &&
    feature.structureTransitionAnchors.length > 0;
  if (!hasTransitionAnchors) return true;
  if (semantics?.rampCandidate) return false;

  // Transition roads are where skirts read as detached bridge walls.
  // Prefer a little terrain peeking over visible slabs on ramp approaches.
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
  const gradeSeparatedLike = roadBehavesGradeSeparated(road);
  let threshold =
    semantics?.terrainMode === 'elevated' || gradeSeparatedLike ? 2.8 :
    semantics?.terrainMode === 'subgrade' ? 3.2 :
    4.4;
  if (semantics?.rampCandidate && gradeSeparatedLike) threshold += 0.35;
  else if (semantics?.rampCandidate) threshold += 1.15;
  if (Number.isFinite(options?.extraVerticalAllowance)) {
    threshold += Number(options.extraVerticalAllowance);
  }
  return threshold;
}

function roadSurfaceLateralThreshold(road, options = {}) {
  const halfWidth = Number.isFinite(road?.width) ? Number(road.width) * 0.5 : 0;
  const semantics = road?.structureSemantics || null;
  const gradeSeparatedLike = roadBehavesGradeSeparated(road);
  let padding =
    semantics?.terrainMode === 'elevated' || gradeSeparatedLike ? 1.05 :
    semantics?.terrainMode === 'subgrade' ? 1.15 :
    1.35;
  if (semantics?.rampCandidate) padding += gradeSeparatedLike ? 0.95 : 0.45;
  if (Number.isFinite(options?.extraLateralPadding)) {
    padding += Number(options.extraLateralPadding);
  }
  return Math.max(1.5, halfWidth + padding);
}

function roadSurfaceDirectLockThreshold(road) {
  const semantics = road?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated' || roadBehavesGradeSeparated(road)) return 1.25;
  if (semantics?.terrainMode === 'subgrade') return 1.35;
  return 4.4;
}

function roadSurfaceTransitionLockThreshold(road) {
  const semantics = road?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated' || roadBehavesGradeSeparated(road)) return 1.65;
  if (semantics?.terrainMode === 'subgrade') return 1.85;
  return 4.4;
}

function roadSurfaceSameRoadTransitionRetentionThreshold(road, nearestRoad = null) {
  const semantics = road?.structureSemantics || null;
  const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
  if (!(anchors.length > 0 || semantics?.rampCandidate)) return NaN;
  let maxAnchorOffset = 0;
  for (let i = 0; i < anchors.length; i++) {
    maxAnchorOffset = Math.max(maxAnchorOffset, Math.abs(Number(anchors[i]?.targetOffset) || 0));
  }
  const nearTransition =
    Number.isFinite(nearestRoad?.distanceToTransitionZone) &&
    nearestRoad.distanceToTransitionZone <= Math.max(8, maxAnchorOffset * 1.4 + 2);
  const nearEndpoint =
    Number.isFinite(nearestRoad?.distanceToEndpoint) &&
    nearestRoad.distanceToEndpoint <= (semantics?.rampCandidate ? 18 : 12);
  if (!(nearTransition || nearEndpoint)) return NaN;
  return Math.max(8, maxAnchorOffset * 3.2 + 2.5);
}

function retainRoadSurfaceContact(currentRoad, x, z, currentSurfaceY = NaN, options = {}) {
  if (!currentRoad) return null;
  const projection = projectPointToFeature(currentRoad, x, z);
  if (!projection) return null;
  const lateralPadding = Number.isFinite(options?.extraLateralPadding) ? Number(options.extraLateralPadding) : 0.95;
  const maxDist = roadSurfaceLateralThreshold(currentRoad, { extraLateralPadding: lateralPadding });
  if (!Number.isFinite(projection.dist) || projection.dist > maxDist) return null;
  const roadY = sampleFeatureSurfaceY(currentRoad, x, z, projection);
  if (!Number.isFinite(roadY)) return null;
  const distances = currentRoad.surfaceDistances instanceof Float32Array ? currentRoad.surfaceDistances : null;
  const totalDistance = distances && distances.length > 0 ? Number(distances[distances.length - 1]) || 0 : 0;
  let distanceAlong = NaN;
  let distanceToEndpoint = Infinity;
  let distanceToTransitionZone = Infinity;
  if (distances && Array.isArray(currentRoad.pts)) {
    const p1 = currentRoad.pts[projection.segIndex];
    const p2 = currentRoad.pts[projection.segIndex + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    distanceAlong = (Number(distances[projection.segIndex]) || 0) + segLen * projection.t;
    distanceToEndpoint = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
    const anchors = Array.isArray(currentRoad.structureTransitionAnchors) ? currentRoad.structureTransitionAnchors : [];
    for (let i = 0; i < anchors.length; i++) {
      const anchorDistance = Number(anchors[i]?.distance);
      if (!Number.isFinite(anchorDistance)) continue;
      const span = Math.max(0, Number(anchors[i]?.span) || 0);
      const zoneDistance = Math.max(0, Math.abs(distanceAlong - anchorDistance) - span);
      if (zoneDistance < distanceToTransitionZone) distanceToTransitionZone = zoneDistance;
    }
  }
  const transitionRetention = roadSurfaceSameRoadTransitionRetentionThreshold(currentRoad, {
    distanceToEndpoint,
    distanceToTransitionZone
  });
  const extraVerticalAllowance = Number.isFinite(options?.extraVerticalAllowance) ? Number(options.extraVerticalAllowance) : 1.45;
  const minimumRetentionVerticalDelta =
    Number.isFinite(options?.minimumRetentionVerticalDelta) ?
      Number(options.minimumRetentionVerticalDelta) :
      NaN;
  let maxVertical = roadSurfaceAttachmentThreshold(currentRoad, { extraVerticalAllowance });
  if (Number.isFinite(transitionRetention)) {
    maxVertical = Math.max(maxVertical, transitionRetention);
  }
  if (Number.isFinite(minimumRetentionVerticalDelta)) {
    maxVertical = Math.max(maxVertical, minimumRetentionVerticalDelta);
  }
  const verticalDelta = Number.isFinite(currentSurfaceY) ? Math.abs(roadY - currentSurfaceY) : 0;
  if (Number.isFinite(currentSurfaceY) && verticalDelta > maxVertical) return null;
  return {
    road: currentRoad,
    dist: projection.dist,
    pt: projection.pt ? { x: projection.pt.x, z: projection.pt.z } : { x, z },
    y: roadY,
    verticalDelta,
    distanceAlong,
    distanceToEndpoint,
    distanceToTransitionZone
  };
}

function shouldLockRetainedRoadContact(retainedRoad) {
  const road = retainedRoad?.road || null;
  if (!road) return false;
  const semantics = road?.structureSemantics || null;
  const anchored =
    semantics?.terrainMode === 'elevated' ||
    semantics?.terrainMode === 'subgrade' ||
    semantics?.rampCandidate === true ||
    (Array.isArray(road?.structureTransitionAnchors) && road.structureTransitionAnchors.length > 0);
  if (!anchored) return false;
  const nearEndpoint =
    Number.isFinite(retainedRoad?.distanceToEndpoint) &&
    retainedRoad.distanceToEndpoint <= (semantics?.rampCandidate ? 4.8 : 3.2);
  const nearTransition =
    Number.isFinite(retainedRoad?.distanceToTransitionZone) &&
    retainedRoad.distanceToTransitionZone <= 2.0;
  return !(nearEndpoint || nearTransition);
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

  if ((semantics?.gradeSeparated || roadBehavesGradeSeparated(road)) && !continuityAccess) {
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
  const sameRoadTransitionRetention = sameRoad ? roadSurfaceSameRoadTransitionRetentionThreshold(road, nearestRoad) : NaN;
  if (Number.isFinite(sameRoadTransitionRetention)) {
    maxVertical = Math.max(maxVertical, sameRoadTransitionRetention);
  }
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

function classifyStructureSemantics(tags = {}, options = {}) {
  const featureCategory = featureTypeCategory(options.featureKind, options.subtype || tags?.highway || tags?.railway || tags?.building);
  const highway = normalizedTagValue(tags?.highway);
  const bridgeTag = normalizedTagValue(tags?.bridge);
  const tunnelTag = normalizedTagValue(tags?.tunnel);
  const coveredTag = normalizedTagValue(tags?.covered);
  const indoorTag = normalizedTagValue(tags?.indoor);
  const location = normalizedTagValue(tags?.location);
  const manMade = normalizedTagValue(tags?.man_made);
  const placement = normalizedTagValue(tags?.placement);
  const rampTag = normalizedTagValue(tags?.ramp);
  const passage = normalizedTagValue(tags?.passage || tags?.building_passage);
  const layer = parseIntegerTag(tags?.layer, 0);
  const level = parseNumericTag(tags?.level, NaN);
  const minHeight = parseNumericTag(tags?.min_height, NaN);
  const buildingMinLevel = parseNumericTag(tags?.['building:min_level'], NaN);
  const culvert = tunnelTag === 'culvert' || normalizedTagValue(tags?.culvert) === 'yes';
  const isBridge = isTruthyTag(bridgeTag) || manMade === 'bridge';
  const isTunnel = (isTruthyTag(tunnelTag) && tunnelTag !== 'building_passage') || location === 'underground' || location === 'underwater';
  const isCovered = isTruthyTag(coveredTag) || tunnelTag === 'building_passage' || passage === 'yes';
  const isIndoor = !!indoorTag;
  const isPedestrianConnector = /^(footway|pedestrian|path|corridor|steps)$/.test(highway) || featureCategory === 'connector';
  const rampCandidate =
    rampTag === 'yes' ||
    placement === 'transition' ||
    /_link$/.test(highway);
  const explicitBaseOffset =
    Number.isFinite(minHeight) ? minHeight :
    Number.isFinite(buildingMinLevel) ? buildingMinLevel * 3.4 :
    Number.isFinite(level) && level > 0 ? level * 3.4 :
    0;

  const baseClearance = baseClearanceForCategory(featureCategory);
  const baseDepth = baseDepthForCategory(featureCategory);
  const verticalOrder =
    layer !== 0 ? layer :
    isTunnel || culvert ? -1 :
    isBridge || explicitBaseOffset > 2.5 || (Number.isFinite(level) && level > 0) ? 1 :
    0;

  const deckClearance = Math.max(
    explicitBaseOffset,
    verticalOrder > 0 ? baseClearance + Math.max(0, verticalOrder - 1) * 3.4 : 0
  );
  const cutDepth = Math.max(
    verticalOrder < 0 ? baseDepth + Math.max(0, Math.abs(verticalOrder) - 1) * 3.2 : 0,
    culvert ? 2.4 : 0
  );

  const elevatedConnectorCandidate =
    isPedestrianConnector &&
    !isTunnel &&
    !culvert &&
    (
      isBridge ||
      verticalOrder > 0 ||
      explicitBaseOffset > 2.5 ||
      location === 'roof' ||
      location === 'overground'
    );

  const skywalk =
    elevatedConnectorCandidate &&
    (isBridge || isIndoor || isCovered || location === 'roof' || location === 'overground' || explicitBaseOffset > 2.5);

  let structureKind = 'at_grade';
  let terrainMode = 'at_grade';
  if (culvert) {
    structureKind = 'culvert';
    terrainMode = 'subgrade';
  } else if (isTunnel) {
    structureKind = 'tunnel';
    terrainMode = 'subgrade';
  } else if (skywalk) {
    structureKind = 'skywalk';
    terrainMode = 'elevated';
  } else if (isBridge) {
    structureKind = 'bridge';
    terrainMode = 'elevated';
  } else if (verticalOrder > 0 || explicitBaseOffset > 2.5 || location === 'overground' || location === 'roof') {
    structureKind = isPedestrianConnector ? 'connector' : 'elevated';
    terrainMode = 'elevated';
  } else if (isCovered || isIndoor) {
    structureKind = 'covered';
  }

  return {
    featureCategory,
    structureKind,
    terrainMode,
    gradeSeparated: terrainMode !== 'at_grade',
    isBridge,
    isTunnel,
    culvert,
    covered: isCovered,
    indoor: isIndoor,
    skywalk,
    placement,
    layer,
    level: Number.isFinite(level) ? level : null,
    verticalOrder,
    deckClearance,
    cutDepth,
    explicitBaseOffset,
    elevatedConnectorCandidate,
    rampCandidate,
    verticalGroup: `${terrainMode}:${verticalOrder}:${structureKind}`
  };
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
  roadBehavesGradeSeparated,
  roadSurfaceLateralThreshold,
  roadSurfaceSameRoadTransitionRetentionThreshold,
  retainRoadSurfaceContact,
  sampleProfileAtDistance,
  sampleFeatureSurfaceY,
  shouldLockRetainedRoadContact,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
};
