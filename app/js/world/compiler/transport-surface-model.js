import {
  polylineDistances,
  sampleProfileAtDistance
} from '../../structure-semantics/geometry.js?v=1';
import {
  DEFAULT_MAX_AT_GRADE_CUT,
  DEFAULT_MAX_AT_GRADE_FILL,
  DEFAULT_MAX_GRADE,
  DEFAULT_SURFACE_BIAS,
  DEFAULT_VERTICAL_FIT_RADIUS,
  applyEndpointTieIns,
  applyExactGraphNodeConstraints,
  applyStationInfluence,
  clamp,
  createSampleDistances,
  endpointTransitionGate,
  enforceMaximumGrade,
  finiteNumber,
  normalizeAnchors,
  pointAtDistance,
  profileStats,
  sampleSmoothAnchors,
  sampleTerrainOrThrow,
  smoothGradeLimitedProfile,
  smoothSignedCutFillProfile,
  tangentAtDistance
} from './transport-surface-profile.js?v=1';

const TRANSPORT_SURFACE_SCHEMA_VERSION = 1;

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
      total,
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
    const atGradeReferenceY = highestCrossSectionGround;
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
      // The current renderer does not publish a matching terrain cut. Until
      // it does, an at-grade ribbon must stay above the complete rendered
      // cross-section or the road and its actors can be buried by terrain.
      ? highestCrossSectionGround + surfaceBias
      : mode === 'elevated'
        // Crossing stations are structural minimums expressed in world
        // elevation. Smoothing may lift neighboring samples to satisfy grade,
        // but it must never average a required vehicle clearance back out.
        ? centerY
        : Number.NEGATIVE_INFINITY;
    centerUpperBounds[index] = atGrade
      ? Math.max(
          highestCrossSectionGround + surfaceBias,
          lowestCrossSectionGround + surfaceBias + maximumAtGradeFill
        )
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

  let centerHeights = mode === 'at_grade'
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
  if (mode !== 'at_grade') {
    centerHeights = applyEndpointTieIns(
      feature,
      centerHeights,
      sampleDistances,
      endpointGroundStart,
      endpointGroundEnd,
      surfaceBias,
      maximumGrade
    );
    const tiedProfileMaximumGrade = profileStats(sampleDistances, centerHeights).maximumGrade;
    const hasConnectedEndpointTieIn = Array.isArray(feature?.structureTransitionAnchors) &&
      feature.structureTransitionAnchors.some((anchor) => anchor?.source === 'connected_feature');
    if (
      Number.isFinite(minimumStructureSurfaceY) ||
      (hasConnectedEndpointTieIn && tiedProfileMaximumGrade > maximumGrade + 1e-6)
    ) {
      // Reconcile infeasible connected tie-ins without lowering structural bounds.
      centerHeights = smoothGradeLimitedProfile(
        centerHeights,
        centerLowerBounds,
        sampleDistances,
        maximumGrade
      );
    }
    centerHeights = applyExactGraphNodeConstraints(feature, centerHeights, sampleDistances);
  }
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
    endpointPolicy: mode === 'at_grade' ? 'terrain_draped' : 'hard_transition_tie_in',
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

function roadSkirtDepth(feature) {
  const semantics = feature?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated') return 0;
  if (semantics?.terrainMode === 'subgrade') return 0.3;
  // Ordinary streets follow their terrain profile. Tall vertical skirts made
  // steep city streets read as elevated slabs and are reserved for actual
  // grade-separated/subgrade structures.
  return 0;
}

export {
  DEFAULT_MAX_GRADE,
  DEFAULT_MAX_AT_GRADE_CUT,
  DEFAULT_MAX_AT_GRADE_FILL,
  TRANSPORT_SURFACE_SCHEMA_VERSION,
  attachCompiledTransportSurface,
  compileTransportSurfaceModel,
  roadSkirtDepth,
  sampleTransportSurfaceAtDistance
};
