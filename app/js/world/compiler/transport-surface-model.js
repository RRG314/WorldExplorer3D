import {
  polylineDistances,
  sampleProfileAtDistance,
  smoothstep01
} from '../../structure-semantics/geometry.js?v=1';

const TRANSPORT_SURFACE_SCHEMA_VERSION = 1;
const DEFAULT_SURFACE_BIAS = 0.08;
const DEFAULT_SAMPLE_STEP = 2;
const DEFAULT_MAX_GRADE = 0.12;
const DEFAULT_MAX_AT_GRADE_CUT = 4;
const DEFAULT_MAX_AT_GRADE_FILL = 4;
const DEFAULT_VERTICAL_FIT_RADIUS = 14;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pointAtDistance(points, pathDistances, distance) {
  const total = finiteNumber(pathDistances[pathDistances.length - 1]);
  const target = clamp(finiteNumber(distance), 0, total);
  let segmentIndex = 0;
  while (
    segmentIndex < pathDistances.length - 2 &&
    finiteNumber(pathDistances[segmentIndex + 1]) < target
  ) {
    segmentIndex += 1;
  }
  const start = points[segmentIndex];
  const end = points[Math.min(points.length - 1, segmentIndex + 1)];
  const segmentStart = finiteNumber(pathDistances[segmentIndex]);
  const segmentEnd = finiteNumber(pathDistances[Math.min(pathDistances.length - 1, segmentIndex + 1)]);
  const segmentLength = Math.max(1e-6, segmentEnd - segmentStart);
  const t = clamp((target - segmentStart) / segmentLength, 0, 1);
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
    segmentIndex,
    t
  };
}

function tangentAtDistance(points, pathDistances, distance) {
  const point = pointAtDistance(points, pathDistances, distance);
  const start = points[point.segmentIndex];
  const end = points[Math.min(points.length - 1, point.segmentIndex + 1)];
  const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  return {
    x: (end.x - start.x) / length,
    z: (end.z - start.z) / length
  };
}

function createSampleDistances(totalDistance, sampleStep) {
  const total = Math.max(0, finiteNumber(totalDistance));
  const step = Math.max(0.5, finiteNumber(sampleStep, DEFAULT_SAMPLE_STEP));
  const segmentCount = Math.max(1, Math.ceil(total / step));
  const distances = new Float32Array(segmentCount + 1);
  for (let index = 0; index <= segmentCount; index += 1) {
    distances[index] = total * index / segmentCount;
  }
  return distances;
}

function normalizeAnchors(feature, semantics, totalDistance) {
  const total = Math.max(0, finiteNumber(totalDistance));
  const defaultOffset =
    semantics?.terrainMode === 'subgrade'
      ? -Math.max(0, finiteNumber(semantics?.cutDepth) + finiteNumber(feature?.structureStackOffset))
      : semantics?.terrainMode === 'elevated'
        ? Math.max(
            0,
            finiteNumber(semantics?.deckClearance, semantics?.explicitBaseOffset) +
              finiteNumber(feature?.structureStackOffset)
          )
        : 0;
  const anchors = [
    { distance: 0, offset: defaultOffset, priority: 0 },
    { distance: total, offset: defaultOffset, priority: 0 }
  ];

  const transitionAnchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors
    : [];
  for (const anchor of transitionAnchors) {
    const offset = Number(anchor?.targetOffset);
    if (!Number.isFinite(offset)) continue;
    anchors.push({
      distance: clamp(finiteNumber(anchor?.distance), 0, total),
      offset,
      priority: 2
    });
  }

  const stations = Array.isArray(feature?.structureStations)
    ? feature.structureStations
    : [];
  for (const station of stations) {
    const magnitude = Number(station?.targetOffset);
    if (!Number.isFinite(magnitude)) continue;
    anchors.push({
      distance: clamp(finiteNumber(station?.distance), 0, total),
      offset: semantics?.terrainMode === 'subgrade' ? -Math.abs(magnitude) : Math.abs(magnitude),
      priority: 1
    });
  }

  anchors.sort((left, right) => left.distance - right.distance);
  const merged = [];
  for (const anchor of anchors) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.distance - anchor.distance) < 0.25) {
      if (
        anchor.priority > previous.priority ||
        (
          anchor.priority === previous.priority &&
          Math.abs(anchor.offset) > Math.abs(previous.offset)
        )
      ) {
        previous.offset = anchor.offset;
        previous.priority = anchor.priority;
      }
    } else {
      merged.push({ ...anchor });
    }
  }
  return merged;
}

function sampleSmoothAnchors(anchors, distance) {
  if (!Array.isArray(anchors) || anchors.length === 0) return 0;
  if (anchors.length === 1 || distance <= anchors[0].distance) return anchors[0].offset;
  const last = anchors[anchors.length - 1];
  if (distance >= last.distance) return last.offset;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index];
    const right = anchors[index + 1];
    if (distance > right.distance) continue;
    const span = Math.max(1e-6, right.distance - left.distance);
    const t = smoothstep01((distance - left.distance) / span);
    return left.offset + (right.offset - left.offset) * t;
  }
  return last.offset;
}

function applyStationInfluence(feature, semantics, distance, initialOffset) {
  let offset = initialOffset;
  const stations = Array.isArray(feature?.structureStations) ? feature.structureStations : [];
  for (const station of stations) {
    const span = Math.max(1, finiteNumber(station?.span, 1));
    const delta = Math.abs(distance - finiteNumber(station?.distance));
    if (delta > span) continue;
    const weight = 1 - smoothstep01(delta / span);
    const magnitude = Math.abs(finiteNumber(station?.targetOffset)) * weight;
    const contribution = semantics?.terrainMode === 'subgrade' ? -magnitude : magnitude;
    offset = contribution >= 0
      ? Math.max(offset, contribution)
      : Math.min(offset, contribution);
  }
  return semantics?.terrainMode === 'at_grade' ? 0 : offset;
}

function enforceMaximumGrade(heights, lowerBounds, distances, maximumGrade) {
  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < heights.length; index += 1) {
      const run = Math.max(1e-6, distances[index] - distances[index - 1]);
      heights[index] = Math.max(
        finiteNumber(lowerBounds?.[index], -Infinity),
        heights[index],
        heights[index - 1] - grade * run
      );
    }
    for (let index = heights.length - 2; index >= 0; index -= 1) {
      const run = Math.max(1e-6, distances[index + 1] - distances[index]);
      heights[index] = Math.max(
        finiteNumber(lowerBounds?.[index], -Infinity),
        heights[index],
        heights[index + 1] - grade * run
      );
    }
  }
}

function smoothGradeLimitedProfile(initialHeights, lowerBounds, distances, maximumGrade) {
  const heights = new Float64Array(initialHeights);
  enforceMaximumGrade(heights, lowerBounds, distances, maximumGrade);
  for (let pass = 0; pass < 6; pass += 1) {
    const next = new Float64Array(heights);
    for (let index = 1; index < heights.length - 1; index += 1) {
      const neighborAverage = (heights[index - 1] + heights[index + 1]) * 0.5;
      next[index] = Math.max(
        finiteNumber(lowerBounds?.[index], -Infinity),
        heights[index] * 0.58 + neighborAverage * 0.42
      );
    }
    heights.set(next);
    enforceMaximumGrade(heights, lowerBounds, distances, maximumGrade);
  }
  return new Float32Array(heights);
}

function smoothSignedCutFillProfile(
  terrainEnvelope,
  lowerBounds,
  upperBounds,
  distances,
  maximumGrade,
  fitRadius
) {
  const radius = Math.max(4, finiteNumber(fitRadius, DEFAULT_VERTICAL_FIT_RADIUS));
  const heights = new Float64Array(terrainEnvelope.length);
  for (let index = 0; index < terrainEnvelope.length; index += 1) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let candidate = 0; candidate < terrainEnvelope.length; candidate += 1) {
      const delta = Math.abs(distances[candidate] - distances[index]);
      if (delta > radius) continue;
      const weight = 1 - delta / radius;
      weightedSum += terrainEnvelope[candidate] * weight;
      weightTotal += weight;
    }
    const target = weightTotal > 0
      ? weightedSum / weightTotal
      : terrainEnvelope[index];
    heights[index] = clamp(target, lowerBounds[index], upperBounds[index]);
  }

  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  for (let pass = 0; pass < 8; pass += 1) {
    for (let index = 1; index < heights.length; index += 1) {
      const run = Math.max(1e-6, distances[index] - distances[index - 1]);
      heights[index] = clamp(
        heights[index],
        Math.max(lowerBounds[index], heights[index - 1] - grade * run),
        Math.min(upperBounds[index], heights[index - 1] + grade * run)
      );
    }
    for (let index = heights.length - 2; index >= 0; index -= 1) {
      const run = Math.max(1e-6, distances[index + 1] - distances[index]);
      heights[index] = clamp(
        heights[index],
        Math.max(lowerBounds[index], heights[index + 1] - grade * run),
        Math.min(upperBounds[index], heights[index + 1] + grade * run)
      );
    }
    const next = new Float64Array(heights);
    for (let index = 1; index < heights.length - 1; index += 1) {
      next[index] = clamp(
        heights[index] * 0.45 + (heights[index - 1] + heights[index + 1]) * 0.275,
        lowerBounds[index],
        upperBounds[index]
      );
    }
    heights.set(next);
  }
  return new Float32Array(heights);
}

function profileStats(distances, heights, terrainSamples = null, surfaceBias = 0) {
  let minimumY = Infinity;
  let maximumY = -Infinity;
  let maximumGrade = 0;
  let maximumGradeDelta = 0;
  let maximumCut = 0;
  let maximumFill = 0;
  let previousGrade = null;
  for (let index = 0; index < heights.length; index += 1) {
    minimumY = Math.min(minimumY, heights[index]);
    maximumY = Math.max(maximumY, heights[index]);
    if (terrainSamples?.length) {
      for (const samples of terrainSamples) {
        if (samples?.length !== heights.length) continue;
        const cutFill = heights[index] - (samples[index] + surfaceBias);
        maximumCut = Math.max(maximumCut, -cutFill);
        maximumFill = Math.max(maximumFill, cutFill);
      }
    }
    if (index === 0) continue;
    const run = Math.max(1e-6, distances[index] - distances[index - 1]);
    const grade = (heights[index] - heights[index - 1]) / run;
    maximumGrade = Math.max(maximumGrade, Math.abs(grade));
    if (previousGrade !== null) {
      maximumGradeDelta = Math.max(maximumGradeDelta, Math.abs(grade - previousGrade) / run);
    }
    previousGrade = grade;
  }
  return Object.freeze({
    minimumY,
    maximumY,
    maximumGrade,
    maximumGradeDelta,
    maximumCut,
    maximumFill
  });
}

function sampleTerrainOrThrow(sampleTerrainY, x, z) {
  const value = Number(sampleTerrainY(x, z));
  if (!Number.isFinite(value)) {
    throw new Error(`Transport surface ground sample unavailable at ${x},${z}`);
  }
  return value;
}

function compileTransportSurfaceModel(feature, sampleTerrainY, options = {}) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) {
    throw new Error('Transport surface compilation requires a polyline with at least two points');
  }
  if (typeof sampleTerrainY !== 'function') {
    throw new Error('Transport surface compilation requires one accepted ground sampler');
  }

  const points = feature.pts;
  const semantics = feature.structureSemantics || { terrainMode: 'at_grade' };
  const { distances: pathDistances, total } = polylineDistances(points);
  const sampleDistances = createSampleDistances(total, options.sampleStep);
  const surfaceBias = Number.isFinite(options.surfaceBias)
    ? Number(options.surfaceBias)
    : Number.isFinite(feature.surfaceBias)
      ? Number(feature.surfaceBias)
      : DEFAULT_SURFACE_BIAS;
  const maximumGrade = Number.isFinite(options.maximumGrade)
    ? Number(options.maximumGrade)
    : semantics?.rampCandidate
      ? 0.1
      : DEFAULT_MAX_GRADE;
  const compiledWidth = Number.isFinite(options.width)
    ? Number(options.width)
    : finiteNumber(feature.width, 4);
  const halfWidth = Math.max(0.6, compiledWidth * 0.5);
  const corridorCenterOffset = finiteNumber(
    feature?.transportRecord?.crossSection?.placement?.centerlineOffsetMeters
  );
  const anchors = normalizeAnchors(feature, semantics, total);
  const groundHeights = new Float32Array(sampleDistances.length);
  const offsets = new Float32Array(sampleDistances.length);
  const centerInitial = new Float64Array(sampleDistances.length);
  const centerLowerBounds = new Float64Array(sampleDistances.length);
  const centerUpperBounds = new Float64Array(sampleDistances.length);
  const terrainEnvelope = new Float32Array(sampleDistances.length);
  const leftGround = new Float32Array(sampleDistances.length);
  const rightGround = new Float32Array(sampleDistances.length);
  const mode = semantics?.terrainMode || 'at_grade';
  const minimumStructureSurfaceY = Number(feature.minimumStructureSurfaceY);
  const maximumAtGradeCut = Math.max(
    0,
    finiteNumber(options.maximumAtGradeCut, DEFAULT_MAX_AT_GRADE_CUT)
  );
  const maximumAtGradeFill = Math.max(
    0,
    finiteNumber(options.maximumAtGradeFill, DEFAULT_MAX_AT_GRADE_FILL)
  );

  const endpointGroundStart = sampleTerrainOrThrow(sampleTerrainY, points[0].x, points[0].z);
  const endpointGroundEnd = sampleTerrainOrThrow(
    sampleTerrainY,
    points[points.length - 1].x,
    points[points.length - 1].z
  );

  for (let index = 0; index < sampleDistances.length; index += 1) {
    const distance = sampleDistances[index];
    const point = pointAtDistance(points, pathDistances, distance);
    const tangent = tangentAtDistance(points, pathDistances, distance);
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const groundY = sampleTerrainOrThrow(
      sampleTerrainY,
      point.x + normalX * corridorCenterOffset,
      point.z + normalZ * corridorCenterOffset
    );
    const leftY = sampleTerrainOrThrow(
      sampleTerrainY,
      point.x + normalX * (halfWidth + corridorCenterOffset),
      point.z + normalZ * (halfWidth + corridorCenterOffset)
    );
    const rightY = sampleTerrainOrThrow(
      sampleTerrainY,
      point.x + normalX * (-halfWidth + corridorCenterOffset),
      point.z + normalZ * (-halfWidth + corridorCenterOffset)
    );
    const progress = total > 1e-6 ? distance / total : 0;
    const approachReference = endpointGroundStart + (endpointGroundEnd - endpointGroundStart) * progress;
    const offset = applyStationInfluence(
      feature,
      semantics,
      distance,
      sampleSmoothAnchors(anchors, distance)
    );
    // Grade-separated structures have an engineered vertical alignment.
    // Their endpoint chord and explicit transition/station offsets own that
    // alignment; sampling terrain here would make every DEM bump appear in a
    // bridge deck or tunnel floor.
    // A road is an engineered cross-section, not three independent terrain
    // samples. Using separate center/left/right DEM profiles folds the asphalt
    // into visible triangles on side slopes. Lift one level cross-section to
    // the highest accepted ground sample instead; this is the minimal cut/fill
    // surface that cannot clip into the rendered terrain.
    const highestCrossSectionGround = Math.max(groundY, leftY, rightY);
    const lowestCrossSectionGround = Math.min(groundY, leftY, rightY);
    const atGradeReferenceY = (groundY + leftY + rightY) / 3;
    const referenceY =
      mode === 'at_grade'
        ? atGradeReferenceY
        : approachReference;
    const unconstrainedCenterY = referenceY + offset + surfaceBias;
    const centerY =
      mode === 'elevated' && Number.isFinite(minimumStructureSurfaceY)
        ? Math.max(unconstrainedCenterY, minimumStructureSurfaceY)
        : unconstrainedCenterY;
    const atGrade = mode === 'at_grade';

    groundHeights[index] = groundY;
    leftGround[index] = leftY;
    rightGround[index] = rightY;
    offsets[index] = offset;
    centerInitial[index] = centerY;
    terrainEnvelope[index] = atGradeReferenceY + surfaceBias;
    centerLowerBounds[index] = atGrade
      ? highestCrossSectionGround + surfaceBias - maximumAtGradeCut
      : Number.NEGATIVE_INFINITY;
    centerUpperBounds[index] = atGrade
      ? lowestCrossSectionGround + surfaceBias + maximumAtGradeFill
      : Number.POSITIVE_INFINITY;
  }

  const hasTransitionAnchors =
    Array.isArray(feature?.structureTransitionAnchors) &&
    feature.structureTransitionAnchors.length > 0;
  if (!hasTransitionAnchors && mode !== 'at_grade') {
    let structuralShift = 0;
    for (let index = 0; index < centerInitial.length; index += 1) {
      const controllingGround = mode === 'elevated'
        ? Math.max(groundHeights[index], leftGround[index], rightGround[index])
        : Math.min(groundHeights[index], leftGround[index], rightGround[index]);
      const requiredSurface = controllingGround + offsets[index] + surfaceBias;
      if (mode === 'elevated') {
        structuralShift = Math.max(structuralShift, requiredSurface - centerInitial[index]);
      } else {
        structuralShift = Math.min(structuralShift, requiredSurface - centerInitial[index]);
      }
    }
    if (Math.abs(structuralShift) > 1e-6) {
      for (let index = 0; index < centerInitial.length; index += 1) {
        centerInitial[index] += structuralShift;
      }
    }
  }

  const centerHeights = mode === 'at_grade'
    ? smoothSignedCutFillProfile(
        terrainEnvelope,
        centerLowerBounds,
        centerUpperBounds,
        sampleDistances,
        maximumGrade,
        options.verticalFitRadius
      )
    : smoothGradeLimitedProfile(
        centerInitial,
        centerLowerBounds,
        sampleDistances,
        maximumGrade
      );
  // Publish the same accepted profile at both edges. All gameplay, markings,
  // sidewalks, and visuals then query one planar deck instead of recreating
  // incompatible lateral terrain folds.
  const leftHeights = new Float32Array(centerHeights);
  const rightHeights = new Float32Array(centerHeights);

  return Object.freeze({
    schemaVersion: TRANSPORT_SURFACE_SCHEMA_VERSION,
    authority: 'compiled_transport_surface',
    sourceFeatureId: String(feature.sourceFeatureId || feature.id || ''),
    terrainMode: mode,
    verticalGroup: String(semantics?.verticalGroup || `${mode}:0`),
    width: halfWidth * 2,
    surfaceBias,
    maximumGrade,
    cutFillPolicy: Object.freeze({
      signed: mode === 'at_grade',
      maximumCutMeters: mode === 'at_grade' ? maximumAtGradeCut : 0,
      maximumFillMeters: mode === 'at_grade' ? maximumAtGradeFill : 0,
      verticalFitRadiusMeters: mode === 'at_grade'
        ? finiteNumber(options.verticalFitRadius, DEFAULT_VERTICAL_FIT_RADIUS)
        : 0
    }),
    pathDistances,
    distances: sampleDistances,
    groundHeights,
    offsets,
    centerHeights,
    leftHeights,
    rightHeights,
    stats: profileStats(
      sampleDistances,
      centerHeights,
      mode === 'at_grade' ? [groundHeights, leftGround, rightGround] : null,
      surfaceBias
    )
  });
}

function sampleTransportSurfaceAtDistance(model, distance, lateralOffset = 0) {
  if (!model?.distances?.length || !model?.centerHeights?.length) return NaN;
  const centerY = sampleProfileAtDistance(model.distances, model.centerHeights, distance);
  if (!Number.isFinite(centerY)) return NaN;
  const halfWidth = Math.max(0.01, finiteNumber(model.width, 2) * 0.5);
  const lateral = clamp(finiteNumber(lateralOffset) / halfWidth, -1, 1);
  if (lateral > 0) {
    const leftY = sampleProfileAtDistance(model.distances, model.leftHeights, distance);
    return centerY + (leftY - centerY) * lateral;
  }
  if (lateral < 0) {
    const rightY = sampleProfileAtDistance(model.distances, model.rightHeights, distance);
    return centerY + (rightY - centerY) * -lateral;
  }
  return centerY;
}

function attachCompiledTransportSurface(feature, model) {
  feature.transportSurfaceModel = model;
  feature.surfaceDistances = model.distances;
  feature.surfaceHeights = model.centerHeights;
  feature.surfaceOffsets = model.offsets;
  feature.surfaceTerrainSampler = null;
  feature.structureSurfaceMinY = model.stats.minimumY;
  feature.structureSurfaceMaxY = model.stats.maximumY;
  return feature;
}

export {
  DEFAULT_MAX_GRADE,
  DEFAULT_MAX_AT_GRADE_CUT,
  DEFAULT_MAX_AT_GRADE_FILL,
  TRANSPORT_SURFACE_SCHEMA_VERSION,
  attachCompiledTransportSurface,
  compileTransportSurfaceModel,
  sampleTransportSurfaceAtDistance
};
