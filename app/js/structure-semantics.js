import {
  attachCompiledTransportSurface,
  compileTransportSurfaceModel,
  roadSkirtDepth,
  sampleTransportSurfaceAtDistance
} from './world/compiler/transport-surface-model.js?v=9';
import { classifyStructureSemantics, normalizedTagValue } from './structure-semantics/classification.js?v=2';
import {
  assignFeatureConnections,
  assignStructureStackRanks as assignStructureStackRanksByGraph
} from './structure-semantics/stacking.js?v=4';
import {
  boundsIntersect,
  pointInPolygonXZ,
  polylineBounds,
  polylineDistances,
  sampleProfileAtDistance,
  segmentIntersection2D,
  smoothstep01
} from './structure-semantics/geometry.js?v=1';

function assignStructureStackRanks(features = [], sampleTerrainY = null) {
  return assignStructureStackRanksByGraph(features, sampleTerrainY, {
    areRoadsConnected,
    areRoadsStackContinuous
  });
}

function areRoadsStackContinuous(a, b) {
  if (!a || !b || a === b) return a === b;
  const normalizedName = (feature) => String(feature?.name || '').trim().toLowerCase();
  const nameA = normalizedName(a);
  const nameB = normalizedName(b);
  if (
    nameA !== nameB ||
    String(a?.type || '') !== String(b?.type || '')
  ) return false;

  const endpointVector = (feature, endpoint) => {
    const points = Array.isArray(feature?.pts) ? feature.pts : [];
    if (points.length < 2) return null;
    const from = endpoint === 'start' ? points[0] : points[points.length - 1];
    const into = endpoint === 'start' ? points[1] : points[points.length - 2];
    const dx = into.x - from.x;
    const dz = into.z - from.z;
    const length = Math.hypot(dx, dz);
    return length > 1e-6 ? { x: dx / length, z: dz / length } : null;
  };
  const sides = ['start', 'end'];
  for (const side of sides) {
    const links = Array.isArray(a?.connectedFeatures?.[side]) ? a.connectedFeatures[side] : [];
    for (const link of links) {
      if (link?.feature !== b || link.endpoint === 'interior') continue;
      const aVector = endpointVector(a, side);
      const bVector = endpointVector(b, link.endpoint);
      if (!aVector || !bVector) continue;
      if (aVector.x * bVector.x + aVector.z * bVector.z <= -0.82) return true;
    }
  }
  return false;
}

function buildFeatureStations(feature, context = {}) {
  const semantics = feature?.structureSemantics || null;
  const points = Array.isArray(feature?.pts) ? feature.pts : [];
  if (!semantics?.gradeSeparated || points.length < 2) return [];

  const { distances, total } = polylineDistances(points);
  const features = Array.isArray(context.features) ? context.features : [];
  const waterAreas = Array.isArray(context.waterAreas) ? context.waterAreas : [];
  const sampleTerrainY = typeof context.sampleTerrainY === 'function'
    ? context.sampleTerrainY
    : null;
  const bounds = feature.bounds || polylineBounds(points, (Number(feature.width) || 4) + 24);
  const stations = [];
  const laneWidth = Math.max(1.2, Number(feature.width) || 4);
  const stackOffset = Math.max(0, Number(feature.structureStackOffset) || 0);
  const defaultTarget = semantics.terrainMode === 'subgrade'
    ? semantics.cutDepth + stackOffset
    : semantics.deckClearance + stackOffset;
  const defaultSpan = Math.max(18, laneWidth * 4.5, defaultTarget * 4.2);
  const approachProfileCache = new Map();
  const approachSurfaceAt = (candidate, segmentIndex, t) => {
    if (!sampleTerrainY || !Array.isArray(candidate?.pts) || candidate.pts.length < 2) {
      return NaN;
    }
    let profile = approachProfileCache.get(candidate);
    if (!profile) {
      const path = polylineDistances(candidate.pts);
      const first = candidate.pts[0];
      const last = candidate.pts[candidate.pts.length - 1];
      profile = {
        ...path,
        startY: Number(sampleTerrainY(first.x, first.z)),
        endY: Number(sampleTerrainY(last.x, last.z))
      };
      approachProfileCache.set(candidate, profile);
    }
    if (!Number.isFinite(profile.startY) || !Number.isFinite(profile.endY)) return NaN;
    const start = candidate.pts[segmentIndex];
    const end = candidate.pts[Math.min(candidate.pts.length - 1, segmentIndex + 1)];
    const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
    const distance = Number(profile.distances[segmentIndex] || 0) +
      segmentLength * Math.max(0, Math.min(1, Number(t) || 0));
    const progress = profile.total > 1e-6 ? distance / profile.total : 0;
    return profile.startY + (profile.endY - profile.startY) * progress;
  };
  const compiledSurfaceAt = (candidate, segmentIndex, t) => {
    const model = candidate?.transportSurfaceModel;
    if (!model) return NaN;
    let profile = approachProfileCache.get(candidate);
    if (!profile) {
      const path = polylineDistances(candidate.pts);
      profile = { ...path, startY: NaN, endY: NaN };
      approachProfileCache.set(candidate, profile);
    }
    const start = candidate.pts[segmentIndex];
    const end = candidate.pts[Math.min(candidate.pts.length - 1, segmentIndex + 1)];
    const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
    const distance = Number(profile.distances[segmentIndex] || 0) +
      segmentLength * Math.max(0, Math.min(1, Number(t) || 0));
    return sampleTransportSurfaceAtDistance(model, distance);
  };

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
        const atFeatureEndpointA =
          (segA === 0 && intersection.t <= 0.02) ||
          (segA === points.length - 2 && intersection.t >= 0.98);
        const atFeatureEndpointB =
          (segB === 0 && intersection.u <= 0.02) ||
          (segB === other.pts.length - 2 && intersection.u >= 0.98);
        if (
          atFeatureEndpointA &&
          atFeatureEndpointB &&
          areRoadsConnected(feature, other)
        ) {
          continue;
        }
        const distance = distances[segA] + segLen * intersection.t;
        let target = defaultTarget;
        if (semantics.terrainMode === 'elevated') {
          const otherTarget =
            (Number.isFinite(otherSemantics?.deckClearance) ? otherSemantics.deckClearance : 0) +
            Math.max(0, Number(other.structureStackOffset) || 0);
          const crossingClearance = semantics.featureCategory === 'road' ? 5.5 : 4.2;
          if (otherOrder < ownOrder) {
            const ownApproachY = approachSurfaceAt(feature, segA, intersection.t);
            const otherApproachY = approachSurfaceAt(other, segB, intersection.u);
            const otherSurfaceY = compiledSurfaceAt(other, segB, intersection.u);
            const worldSpaceTarget =
              Number.isFinite(ownApproachY) && Number.isFinite(otherSurfaceY)
                ? otherSurfaceY + crossingClearance - ownApproachY -
                  (Number(feature.surfaceBias) || 0.08)
                : Number.isFinite(ownApproachY) && Number.isFinite(otherApproachY)
                  ? otherApproachY + otherTarget + crossingClearance - ownApproachY
                : otherTarget + crossingClearance;
            target = Math.max(defaultTarget, worldSpaceTarget);
          }
        } else if (semantics.terrainMode === 'subgrade') {
          const otherDepth =
            (Number.isFinite(otherSemantics?.cutDepth) ? otherSemantics.cutDepth : 0) +
            Math.max(0, Number(other.structureStackOffset) || 0);
          const crossingClearance = semantics.featureCategory === 'road' ? 4.6 : 3;
          if (otherOrder > ownOrder) {
            const ownApproachY = approachSurfaceAt(feature, segA, intersection.t);
            const otherApproachY = approachSurfaceAt(other, segB, intersection.u);
            const otherSurfaceY = compiledSurfaceAt(other, segB, intersection.u);
            const worldSpaceTarget =
              Number.isFinite(ownApproachY) && Number.isFinite(otherSurfaceY)
                ? ownApproachY - otherSurfaceY + crossingClearance +
                  (Number(feature.surfaceBias) || 0.08)
                : Number.isFinite(ownApproachY) && Number.isFinite(otherApproachY)
                  ? ownApproachY - otherApproachY + otherDepth + crossingClearance
                : otherDepth + crossingClearance;
            target = Math.max(defaultTarget, worldSpaceTarget);
          }
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

  const requiresFallbackStructureHeight =
    semantics?.isBridge === true ||
    semantics?.isTunnel === true ||
    semantics?.culvert === true ||
    semantics?.skywalk === true ||
    semantics?.rampCandidate === true ||
    Math.abs(Number(semantics?.explicitBaseOffset) || 0) > 0.01;
  // OSM layer is a relative stacking/topology tag, not a height measurement.
  // Do not fabricate a full vehicle-clearance hump for a layer-only driveway
  // or walkway. Real crossings add clearance stations above; explicit
  // bridge/tunnel/level/height semantics retain a structural fallback.
  if (stations.length === 0 && total > 6 && requiresFallbackStructureHeight) {
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

function featureConnectionSurfaceY(feature, connection, sampleTerrainY) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) return NaN;
  const lastIndex = feature.pts.length - 1;
  const endpointIndex = Number(connection?.endpointIndex || 0);
  const clampedIndex = endpointIndex <= 0 ? 0 : lastIndex;
  const point = connection?.point || feature.pts[clampedIndex];
  if (!point) return NaN;
  if (feature.transportSurfaceModel) {
    const total = Number(
      feature.transportSurfaceModel.pathDistances?.[
        feature.transportSurfaceModel.pathDistances.length - 1
      ]
    ) || 0;
    const value = sampleTransportSurfaceAtDistance(
      feature.transportSurfaceModel,
      Number.isFinite(connection?.distanceAlong) ?
        Math.max(0, Math.min(total, Number(connection.distanceAlong))) :
        clampedIndex === 0 ? 0 : total
    );
    if (Number.isFinite(value)) return value;
  } else if (feature.surfaceHeights instanceof Float32Array && feature.surfaceHeights.length > clampedIndex) {
    const value = Number(feature.surfaceHeights[clampedIndex]);
    if (Number.isFinite(value)) return value;
  }
  if (typeof sampleTerrainY !== 'function') return NaN;
  const terrainY = Number(sampleTerrainY(point.x, point.z));
  if (!Number.isFinite(terrainY)) return NaN;
  const surfaceBias = Number.isFinite(feature?.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
  const semantics = feature.structureSemantics || null;
  const structureOffset =
    semantics?.terrainMode === 'subgrade'
      ? -Math.max(0, Number(semantics.cutDepth) || 0) - Math.max(0, Number(feature.structureStackOffset) || 0)
      : semantics?.terrainMode === 'elevated'
        ? Math.max(0, Number(semantics.deckClearance) || 0) + Math.max(0, Number(feature.structureStackOffset) || 0)
        : 0;
  return terrainY + structureOffset + surfaceBias;
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
    if (!point) continue;

    const terrainY = Number(sampleTerrainY(point.x, point.z));
    if (!Number.isFinite(terrainY)) continue;

    let strongestOffset = null;
    for (let j = 0; j < linked.length; j++) {
      const other = linked[j]?.feature || null;
      if (!other || other === feature || !Array.isArray(other.pts) || other.pts.length < 2) continue;
      const otherSemantics = other.structureSemantics || null;
      if (!otherSemantics) continue;
      const otherSurfaceY = featureConnectionSurfaceY(other, linked[j], sampleTerrainY);
      if (!Number.isFinite(otherSurfaceY)) continue;
      const targetOffset = otherSemantics.gradeSeparated
        ? otherSurfaceY - terrainY - (Number(feature.surfaceBias) || 0.08)
        : 0;
      if (!semantics?.gradeSeparated && !otherSemantics.gradeSeparated && !other.structureTransitionAnchors?.length) continue;
      if (
        strongestOffset === null ||
        Math.abs(targetOffset) > Math.abs(strongestOffset)
      ) {
        strongestOffset = targetOffset;
      }
    }

    // An incomplete grade-separated OSM way must return to the accepted
    // ground surface at its open end. A wall across a bridge or tunnel traps
    // the player and hides the real topology error. A zero-offset transition
    // produces the same engineered ramp/portal rule for every location.
    if (strongestOffset === null && linked.length === 0 && semantics?.gradeSeparated) {
      strongestOffset = 0;
    }
    if (strongestOffset === null) continue;

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
      source: linked.length > 0 ? 'connected_feature' : 'open_structure_transition'
    });
  }

  feature.structureTransitionAnchors = anchors;
  return anchors;
}

function updateFeatureSurfaceProfile(feature, sampleTerrainY, options = {}) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || typeof sampleTerrainY !== 'function') return feature;

  const semantics = feature.structureSemantics || classifyStructureSemantics(feature.structureTags || {}, {
    featureKind: feature.networkKind || feature.kind || 'road',
    subtype: feature.type || feature.subtype || ''
  });
  const surfaceBias = Number.isFinite(options.surfaceBias) ? options.surfaceBias : Number(feature.surfaceBias) || 0.08;
  feature.structureSemantics = semantics;
  feature.surfaceBias = surfaceBias;
  const compiledFeature = attachCompiledTransportSurface(
    feature,
    compileTransportSurfaceModel(feature, sampleTerrainY, {
      surfaceBias,
      width: Number.isFinite(options.width) ? Number(options.width) : undefined,
      sampleStep: Number.isFinite(feature.subdivideMaxDist)
        ? Math.min(2, Math.max(0.5, Number(feature.subdivideMaxDist)))
        : 2
    })
  );
  // Ordinary streets follow the live rendered terrain. Compiled profiles own
  // only grade-separated structures; forcing city streets onto an engineered
  // chord creates floating slabs and breaks steep terrain.
  compiledFeature.surfaceTerrainSampler = semantics.terrainMode === 'at_grade'
    ? sampleTerrainY
    : null;
  return compiledFeature;
}

function applyJunctionTransitionY(feature, x, z, baseY) {
  if (!Number.isFinite(baseY) || !Array.isArray(feature?.junctionTransitions)) return baseY;
  let resolvedY = baseY;
  let strongestWeight = 0;
  for (const transition of feature.junctionTransitions) {
    const radius = Math.max(0.1, Number(transition?.radius) || 0);
    const distance = Math.hypot(Number(x) - Number(transition?.x), Number(z) - Number(transition?.z));
    if (distance >= radius) continue;
    const weight = 1 - smoothstep01(distance / radius);
    if (weight <= strongestWeight) continue;
    const plane = transition?.plane;
    const planeY = Number(plane?.centerY) +
      Number(plane?.slopeX || 0) * (Number(x) - Number(transition.x)) +
      Number(plane?.slopeZ || 0) * (Number(z) - Number(transition.z)) +
      0.006;
    if (!Number.isFinite(planeY)) continue;
    resolvedY = baseY + (planeY - baseY) * weight;
    strongestWeight = weight;
  }
  return resolvedY;
}

function buildFeatureRibbonEdges(feature, points, halfWidth, sampleTerrainY, options = {}) {
  if (!feature || !Array.isArray(points) || points.length < 2 || typeof sampleTerrainY !== 'function') {
    return { leftEdge: [], rightEdge: [], centerlineHeights: [] };
  }

  const baseTopBias = Number.isFinite(options.surfaceBias) ? options.surfaceBias : Number(feature.surfaceBias) || 0.08;
  if (!(feature.surfaceDistances instanceof Float32Array) || !(feature.surfaceHeights instanceof Float32Array)) {
    updateFeatureSurfaceProfile(feature, sampleTerrainY, {
      surfaceBias: baseTopBias,
      width: halfWidth * 2
    });
  }

  const { distances: pointDistances, total } = polylineDistances(points);
  const profileTotal = feature.surfaceDistances?.length ? feature.surfaceDistances[feature.surfaceDistances.length - 1] : total;
  const corridorCenterOffset = Number(
    feature?.transportRecord?.crossSection?.placement?.centerlineOffsetMeters
  ) || 0;
  const leftEdge = [];
  const rightEdge = [];
  const centerlineHeights = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    let nx;
    let nz;
    let joinFactor = 1;
    if (i === 0) {
      const dx = points[1].x - point.x;
      const dz = points[1].z - point.z;
      const length = Math.hypot(dx, dz) || 1;
      nx = -dz / length;
      nz = dx / length;
    } else if (i === points.length - 1) {
      const dx = point.x - points[i - 1].x;
      const dz = point.z - points[i - 1].z;
      const length = Math.hypot(dx, dz) || 1;
      nx = -dz / length;
      nz = dx / length;
    } else {
      const previousDx = point.x - points[i - 1].x;
      const previousDz = point.z - points[i - 1].z;
      const nextDx = points[i + 1].x - point.x;
      const nextDz = points[i + 1].z - point.z;
      const previousLength = Math.hypot(previousDx, previousDz) || 1;
      const nextLength = Math.hypot(nextDx, nextDz) || 1;
      const previousNormalX = -previousDz / previousLength;
      const previousNormalZ = previousDx / previousLength;
      const nextNormalX = -nextDz / nextLength;
      const nextNormalZ = nextDx / nextLength;
      const miterX = previousNormalX + nextNormalX;
      const miterZ = previousNormalZ + nextNormalZ;
      const miterLength = Math.hypot(miterX, miterZ);
      if (miterLength > 1e-5) {
        nx = miterX / miterLength;
        nz = miterZ / miterLength;
        const denominator = nx * nextNormalX + nz * nextNormalZ;
        if (Math.abs(denominator) >= 0.25) {
          joinFactor = Math.max(-2.25, Math.min(2.25, 1 / denominator));
        } else {
          nx = nextNormalX;
          nz = nextNormalZ;
        }
      } else {
        nx = nextNormalX;
        nz = nextNormalZ;
      }
    }
    const distanceRatio = total > 1e-6 ? pointDistances[i] / total : 0;
    const profileDistance = profileTotal * distanceRatio;
    const model = feature.transportSurfaceModel || null;
    const atGrade = feature.structureSemantics?.terrainMode === 'at_grade';
    const terrainY = Number(sampleTerrainY(point.x, point.z));
    const surfaceOffset = feature.surfaceOffsets instanceof Float32Array ?
      Number(sampleProfileAtDistance(feature.surfaceDistances, feature.surfaceOffsets, profileDistance)) || 0 :
      0;
    const storedProfileY = Number(sampleProfileAtDistance(feature.surfaceDistances, feature.surfaceHeights, profileDistance));
    const rawCenterY = atGrade && Number.isFinite(terrainY)
      ? terrainY + surfaceOffset + baseTopBias
      : model
        ? sampleTransportSurfaceAtDistance(model, profileDistance, 0)
        : Number.isFinite(storedProfileY)
          ? storedProfileY
          : terrainY + baseTopBias;
    const centerY = applyJunctionTransitionY(feature, point.x, point.z, rawCenterY);
    centerlineHeights.push(centerY);

    const leftX = point.x + nx * (halfWidth + corridorCenterOffset) * joinFactor;
    const leftZ = point.z + nz * (halfWidth + corridorCenterOffset) * joinFactor;
    const rightX = point.x + nx * (-halfWidth + corridorCenterOffset) * joinFactor;
    const rightZ = point.z + nz * (-halfWidth + corridorCenterOffset) * joinFactor;
    const rawLeftY = atGrade
      ? Number(sampleTerrainY(leftX, leftZ)) + baseTopBias
      : model
        ? sampleTransportSurfaceAtDistance(model, profileDistance, halfWidth)
        : centerY;
    const rawRightY = atGrade
      ? Number(sampleTerrainY(rightX, rightZ)) + baseTopBias
      : model
        ? sampleTransportSurfaceAtDistance(model, profileDistance, -halfWidth)
        : centerY;
    const leftY = applyJunctionTransitionY(feature, leftX, leftZ, rawLeftY);
    const rightY = applyJunctionTransitionY(feature, rightX, rightZ, rawRightY);
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
  // Ordinary draped roads remain skirt-free. Steep engineered fill receives
  // a retaining face deep enough to meet its rendered terrain envelope.
  return roadSkirtDepth(feature) > 0;
}

function sampleFeatureSurfaceY(feature, x, z, projected = null) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) return NaN;
  const projection = projected || projectPointToFeature(feature, x, z);
  if (!projection) return NaN;
  const model = feature.transportSurfaceModel || null;
  const distances = model?.distances instanceof Float32Array
    ? model.distances
    : feature.surfaceDistances instanceof Float32Array
      ? feature.surfaceDistances
      : null;
  const heights = model?.centerHeights instanceof Float32Array
    ? model.centerHeights
    : feature.surfaceHeights instanceof Float32Array
      ? feature.surfaceHeights
      : null;
  if (!distances || !heights || !distances.length || !heights.length) return NaN;

  const segIndex = Number(projection.segIndex);
  if (
    !Number.isInteger(segIndex) ||
    segIndex < 0 ||
    segIndex >= feature.pts.length - 1
  ) return NaN;
  const p1 = feature.pts[segIndex];
  const p2 = feature.pts[segIndex + 1];
  const projectionT = Number.isFinite(Number(projection.t))
    ? Math.max(0, Math.min(1, Number(projection.t)))
    : 0;
  const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  const pathDistances = model?.pathDistances instanceof Float32Array
    ? model.pathDistances
    : distances;
  const distance = pathDistances[segIndex] + segLen * projectionT;
  if (
    feature.structureSemantics?.terrainMode === 'at_grade' &&
    typeof feature.surfaceTerrainSampler === 'function'
  ) {
    const sampleX = Number.isFinite(Number(projection.x))
      ? Number(projection.x)
      : Number.isFinite(Number(projection.pt?.x))
        ? Number(projection.pt.x)
        : p1.x + (p2.x - p1.x) * projectionT;
    const sampleZ = Number.isFinite(Number(projection.z))
      ? Number(projection.z)
      : Number.isFinite(Number(projection.pt?.z))
        ? Number(projection.pt.z)
        : p1.z + (p2.z - p1.z) * projectionT;
    const terrainY = Number(feature.surfaceTerrainSampler(sampleX, sampleZ));
    if (Number.isFinite(terrainY)) {
      const offsets = feature.surfaceOffsets instanceof Float32Array ? feature.surfaceOffsets : null;
      const structureOffset = offsets
        ? Number(sampleProfileAtDistance(distances, offsets, distance)) || 0
        : 0;
      const surfaceBias = Number.isFinite(feature.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
      return applyJunctionTransitionY(
        feature,
        sampleX,
        sampleZ,
        terrainY + structureOffset + surfaceBias
      );
    }
  }
  if (model) {
    const sampleX = Number.isFinite(Number(projection.x))
      ? Number(projection.x)
      : p1.x + (p2.x - p1.x) * projectionT;
    const sampleZ = Number.isFinite(Number(projection.z))
      ? Number(projection.z)
      : p1.z + (p2.z - p1.z) * projectionT;
    const tangentX = (p2.x - p1.x) / Math.max(1e-6, segLen);
    const tangentZ = (p2.z - p1.z) / Math.max(1e-6, segLen);
    const lateralOffset = (x - sampleX) * -tangentZ + (z - sampleZ) * tangentX;
    return applyJunctionTransitionY(
      feature,
      x,
      z,
      sampleTransportSurfaceAtDistance(model, distance, lateralOffset)
    );
  }
  return sampleProfileAtDistance(distances, heights, distance);
}

function areRoadsConnected(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const hasLink = (source, target) => {
    const starts = Array.isArray(source?.connectedFeatures?.start) ? source.connectedFeatures.start : [];
    const ends = Array.isArray(source?.connectedFeatures?.end) ? source.connectedFeatures.end : [];
    for (let i = 0; i < starts.length; i++) {
      if (starts[i]?.feature === target) return true;
    }
    for (let i = 0; i < ends.length; i++) {
      if (ends[i]?.feature === target) return true;
    }
    return false;
  };
  if (hasLink(a, b) || hasLink(b, a)) return true;
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
  // A vertical group describes a class of surface, not network connectivity.
  // Treating every layer-1 bridge as continuous lets unrelated stacked
  // overpasses capture an actor or vehicle at their planar crossing.
  const continuityAccess = sameRoad || connectedRoad;

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
  assignStructureStackRanks,
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
  roadSkirtDepth,
  roadSurfaceAttachmentThreshold,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
};
