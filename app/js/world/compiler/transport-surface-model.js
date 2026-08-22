import {
  polylineDistances,
  sampleProfileAtDistance
} from '../../structure-semantics/geometry.js?v=2';
import {
  DEFAULT_MAX_AT_GRADE_CUT,
  DEFAULT_MAX_AT_GRADE_FILL,
  DEFAULT_MAX_GRADE,
  DEFAULT_SURFACE_BIAS,
  DEFAULT_VERTICAL_FIT_RADIUS,
  applyEndpointTieIns,
  applyStationInfluence,
  clamp,
  createSampleDistances,
  endpointTransitionGate,
  enforceMaximumGrade,
  finiteNumber,
  normalizeAnchors,
  pointAtDistance,
  profileStats,
  reconcileExactGraphNodeConstraints,
  sampleSmoothAnchors,
  sampleTerrainOrThrow,
  smoothGradeLimitedProfile,
  smoothSignedCutFillProfile,
  tangentAtDistance
} from './transport-surface-profile.js?v=12';

const TRANSPORT_SURFACE_SCHEMA_VERSION = 1;

function featureRoadType(feature) {
  return String(
    feature?.transportRecord?.sourceTags?.highway ||
    feature?.transportRecord?.rawTags?.highway ||
    feature?.type ||
    ''
  ).toLowerCase();
}

function engineeredMaximumGrade(feature, semantics = feature?.structureSemantics || {}) {
  // Tunnel containment/portal reconciliation has a separate mirrored solver.
  // Preserve its established envelope; this pass changes exposed bridge and
  // elevated-road approaches only.
  if (semantics?.terrainMode === 'subgrade') return 0.135;
  const type = featureRoadType(feature);
  if (semantics?.rampCandidate === true || /_link$/.test(type)) return 0.1;
  if (type === 'motorway' || type === 'trunk') return 0.06;
  return 0.085;
}

function smoothUpperBoundedGradeProfile(initialHeights, upperBounds, distances, maximumGrade) {
  // The shared smoother is lower-bounded because bridge clearance is a
  // minimum. Tunnels have the inverse physical invariant: their surface must
  // not rise above the local subgrade ceiling. Mirroring the profile lets the
  // same deterministic grade solver enforce that upper bound without a
  // second, divergent alignment algorithm.
  const mirroredInitial = Float64Array.from(initialHeights, (height) => -height);
  const mirroredLowerBounds = Float64Array.from(upperBounds, (height) => -height);
  const mirrored = smoothGradeLimitedProfile(
    mirroredInitial,
    mirroredLowerBounds,
    distances,
    maximumGrade
  );
  return Float32Array.from(mirrored, (height) => -height);
}

function reconcileExactSubgradeGraphNodeConstraints(
  feature,
  heights,
  upperBounds,
  distances,
  maximumGrade
) {
  const transitionAnchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors
    : [];
  const totalDistance = finiteNumber(distances?.[distances.length - 1]);
  const portalTransitionRanges = transitionAnchors
    .filter((anchor) =>
      anchor?.source === 'transport_graph_node' &&
      (anchor?.endpoint === 'start' || anchor?.endpoint === 'end'))
    .map((anchor) => {
      const span = Math.max(1, finiteNumber(anchor?.span, 1));
      return anchor.endpoint === 'start'
        ? { start: 0, end: Math.min(totalDistance, span) }
        : { start: Math.max(0, totalDistance - span), end: totalDistance };
    });
  const hardStructureStations = (Array.isArray(feature?.structureStations)
    ? feature.structureStations
    : []).filter((station) => {
      const stationDistance = clamp(finiteNumber(station?.distance), 0, totalDistance);
      const stationSpan = Math.max(1, finiteNumber(station?.span, 1));
      return !portalTransitionRanges.some((range) =>
        stationDistance + stationSpan >= range.start &&
        stationDistance - stationSpan <= range.end);
    });
  const mirroredFeature = {
    ...feature,
    minimumStructureSurfaceY: undefined,
    // Mapped graph endpoints are the tunnel portals. A river/crossing station
    // whose influence overlaps that compiled portal approach cannot remain a
    // hard cover constraint all the way to the shared surface node; the same
    // station has already been tapered by endpointTransitionGate. Stations
    // away from a portal remain hard and still outrank an impossible join.
    structureStations: hardStructureStations,
    structureTransitionAnchors: transitionAnchors.map((anchor) => ({
      ...anchor,
      targetSurfaceY: Number.isFinite(Number(anchor?.targetSurfaceY))
        ? -Number(anchor.targetSurfaceY)
        : anchor?.targetSurfaceY
    }))
  };
  const mirroredHeights = Float32Array.from(heights, (height) => -height);
  const mirroredLowerBounds = Float64Array.from(upperBounds, (height) => -height);
  const reconciled = reconcileExactGraphNodeConstraints(
    mirroredFeature,
    mirroredHeights,
    distances,
    mirroredLowerBounds,
    maximumGrade
  );
  return Float32Array.from(reconciled, (height) => -height);
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
  const exactGraphNodeDistances = (Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors
    : [])
    .filter((anchor) =>
      anchor?.source === 'transport_graph_node' &&
      Number.isFinite(Number(anchor?.targetSurfaceY)))
    .map((anchor) => finiteNumber(anchor?.distance));
  // Interior freeway/ramp merges are real mapped stations, not visual hints.
  // Make them samples in the authoritative profile so the shared elevation is
  // represented exactly rather than rounded to the nearest regular interval.
  const sampleDistances = createSampleDistances(
    total,
    options.sampleStep,
    exactGraphNodeDistances
  );
  const surfaceBias = Number.isFinite(options.surfaceBias)
    ? Number(options.surfaceBias)
    : Number.isFinite(feature.surfaceBias)
      ? Number(feature.surfaceBias)
      : DEFAULT_SURFACE_BIAS;
  const graphApproachAnchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors.filter((anchor) =>
        anchor?.source === 'transport_graph_node' &&
        anchor?.engineeredApproach === true &&
        Number.isFinite(Number(anchor?.targetSurfaceY)))
    : [];
  const engineeredApproach = semantics?.terrainMode === 'at_grade' && graphApproachAnchors.length > 0;
  const approachMaximumGrade = engineeredApproach
    ? engineeredMaximumGrade(feature, semantics)
    : null;
  const maximumGrade = Number.isFinite(options.maximumGrade)
    ? Number(options.maximumGrade)
    : semantics?.terrainMode !== 'at_grade'
      ? engineeredMaximumGrade(feature, semantics)
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
    // samples. Its mapped centerline is the terrain-fit reference; the final
    // terrain publication reconciles the carriageway corridor to this one
    // compiled profile. Lifting the road to the highest lateral DEM sample
    // turned coarse hillside cells into false ramps tens of metres high.
    const highestCrossSectionGround = Math.max(groundY, leftY, rightY);
    const lowestCrossSectionGround = Math.min(groundY, leftY, rightY);
    const atGradeReferenceY = groundY;
    const referenceY =
      mode === 'at_grade'
        ? atGradeReferenceY
        : mode === 'subgrade'
          // A tunnel follows a below-ground corridor, not the straight chord
          // between two portal elevations. Across a river that chord can sit
          // above the water even though both endpoints are correctly on land.
          // Use the lower of the engineered endpoint chord and the complete
          // local terrain cross-section so every interior sample remains
          // subgrade without introducing a separate city/tunnel renderer.
          ? Math.min(approachReference, lowestCrossSectionGround)
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
      ? groundY + surfaceBias - maximumAtGradeCut
      : mode === 'elevated'
        // Crossing stations are structural minimums expressed in world
        // elevation. Smoothing may lift neighboring samples to satisfy grade,
        // but it must never average a required vehicle clearance back out.
        ? centerY
        : Number.NEGATIVE_INFINITY;
    centerUpperBounds[index] = mode === 'subgrade'
      // Tunnel containment is an upper bound. If the approach elevations and
      // the maximum grade are mutually infeasible, staying underground is
      // safer and visually correct; a compiled portal transition can still
      // own the deliberate emergence at a mapped entrance.
      ? lowestCrossSectionGround + offset + surfaceBias
      : atGrade
      ? groundY + surfaceBias + maximumAtGradeFill
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
    : mode === 'subgrade'
      ? smoothUpperBoundedGradeProfile(
          centerInitial,
          centerUpperBounds,
          sampleDistances,
          maximumGrade
        )
      : smoothGradeLimitedProfile(
        centerInitial,
        centerLowerBounds,
        sampleDistances,
        maximumGrade
      );
  if (engineeredApproach) {
    // Graph identity and the complete grade cone are solved together below.
    // A separate pre-pass that pinned anchor samples could survive an
    // infeasible solve and recreate the vertical cliff the solver rejected.
    centerHeights = reconcileExactGraphNodeConstraints(
      feature,
      centerHeights,
      sampleDistances,
      centerLowerBounds,
      approachMaximumGrade
    );
    // The constrained solver above owns both graph identity and design grade.
    // Re-pinning nodes after it runs can recreate an infeasible one-sample
    // cliff on short OSM fragments, so no later writer may overwrite it.
  }
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
    if (mode === 'elevated') {
      centerHeights = reconcileExactGraphNodeConstraints(
        feature,
        centerHeights,
        sampleDistances,
        centerLowerBounds,
        maximumGrade
      );
    }
    if (mode === 'subgrade') {
      // Endpoint and graph constraints may only expose a tunnel where an
      // explicit compiled transition permits it. Reconcile the completed
      // profile with the local subgrade ceiling everywhere else.
      centerHeights = smoothUpperBoundedGradeProfile(
        centerHeights,
        centerUpperBounds,
        sampleDistances,
        maximumGrade
      );
      // Tunnel containment is the mirrored bridge problem: the terrain cover
      // is an upper bound, but a feasible graph-owned portal still has to meet
      // its connected surface exactly. Reconcile after the upper-bound pass so
      // the portal cannot be moved back underground and leave a vertical step.
      centerHeights = reconcileExactSubgradeGraphNodeConstraints(
        feature,
        centerHeights,
        centerUpperBounds,
        sampleDistances,
        maximumGrade
      );
      // The mirrored constrained solver is the final tunnel authority. A
      // post-solver exact write would satisfy one node by violating the
      // drivable grade/containment contract immediately beside it.
    }
  }
  // Publish the same accepted profile at both edges. All gameplay, markings,
  // sidewalks, and visuals then query one planar deck instead of recreating
  // incompatible lateral terrain folds.
  const leftHeights = new Float32Array(centerHeights);
  const rightHeights = new Float32Array(centerHeights);

  const stats = profileStats(
    sampleDistances,
    centerHeights,
    mode === 'at_grade' ? [groundHeights, leftGround, rightGround] : null,
    surfaceBias
  );
  return Object.freeze({
    schemaVersion: TRANSPORT_SURFACE_SCHEMA_VERSION,
    authority: 'compiled_transport_surface',
    sourceFeatureId: String(feature.sourceFeatureId || feature.id || ''),
    terrainMode: mode,
    engineeredApproach,
    verticalGroup: String(semantics?.verticalGroup || `${mode}:0`),
    width: halfWidth * 2,
    surfaceBias,
    maximumGrade,
    approachMaximumGrade,
    endpointPolicy: engineeredApproach
      ? 'graph_owned_integrated_approach'
      : mode === 'at_grade'
        ? 'compiled_centerline_terrain_fit'
        : 'hard_transition_tie_in',
    cutFillPolicy: Object.freeze({
      signed: mode === 'at_grade',
      maximumCutMeters: mode === 'at_grade' ? maximumAtGradeCut : 0,
      maximumFillMeters: mode === 'at_grade'
        ? Math.max(maximumAtGradeFill, engineeredApproach ? stats.maximumFill : 0)
        : 0,
      verticalFitRadiusMeters: mode === 'at_grade'
        ? finiteNumber(options.verticalFitRadius, DEFAULT_VERTICAL_FIT_RADIUS)
        : 0
    }),
    pathDistances,
    distances: sampleDistances,
    groundHeights,
    leftGround,
    rightGround,
    offsets,
    centerHeights,
    leftHeights,
    rightHeights,
    stats
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
  feature.retainingSkirtDepth = model.engineeredApproach
    ? Math.max(0, model.stats.maximumFill + 0.5)
    : model.terrainMode === 'subgrade'
      ? 0.3
      : 0;
  return feature;
}

function roadSkirtDepth(feature) {
  const semantics = feature?.structureSemantics || null;
  if (semantics?.terrainMode === 'elevated') return 0;
  if (semantics?.terrainMode === 'subgrade') return 0.3;
  if (feature?.transportSurfaceModel?.engineeredApproach === true) {
    if (
      feature?.transportStructureAssembly?.family === 'engineered_approach' &&
      feature.transportStructureAssembly.publishBody === true
    ) return 0;
    return Math.max(
      0.5,
      finiteNumber(feature?.retainingSkirtDepth),
      finiteNumber(feature?.transportSurfaceModel?.stats?.maximumFill) + 0.5
    );
  }
  // Ordinary streets follow their terrain profile. Tall vertical skirts made
  // steep city streets read as elevated slabs and are reserved for actual
  // grade-separated/subgrade structures.
  return 0;
}

export {
  DEFAULT_MAX_GRADE,
  DEFAULT_MAX_AT_GRADE_CUT,
  DEFAULT_MAX_AT_GRADE_FILL,
  engineeredMaximumGrade,
  TRANSPORT_SURFACE_SCHEMA_VERSION,
  attachCompiledTransportSurface,
  compileTransportSurfaceModel,
  roadSkirtDepth,
  sampleTransportSurfaceAtDistance
};
