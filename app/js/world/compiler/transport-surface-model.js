import {copyNumericArray, createNumericScratchPool} from '../../structure-semantics/numeric-scratch.js';
import { sampleSortedProfileAtDistance } from '../../structure-semantics/profile-sampling.js';
import {tunnelObstructionMaximumY, tunnelRoofHalfWidth} from './tunnel-envelope.js';
import {fitOrdinaryStreetProfile} from './ordinary-street-profile.js';
import {roadPlacementOffsetWorld} from '../road-units.js';
import {sampleRoadPavementSection,sampleRoadPavementHeight} from '../road-pavement-sections.js';
import {roadPavementFrameAtDistance} from '../road-pavement-coordinate-frame.js';
import {validateReviewedDeckProfile,validateReviewedPavementProfile,sampleReviewedDeckProfile} from './reviewed-deck-profile.js';
import {BANKED_ROAD_MODEL,BANKED_ROAD_MAXIMUM_CROSSFALL,BANKED_ROAD_MAXIMUM_GRADE} from '../../physics/road-plane-dynamics.js';
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

const transportScratch = createNumericScratchPool();
const TRANSPORT_SURFACE_SCHEMA_VERSION = 1;
// Weak ownership, not a cache of external/mutable profiles. Compilation creates
// sorted station distances; later reconciliation updates heights, not stations.
const compiledModels = new WeakSet();
const packedModels = new WeakSet();
const PROFILE_CHUNK_BYTES = 256 * 1024;
const PROFILE_FIELDS = ['distances', 'pathDistances', 'groundHeights', 'offsets',
  'leftGround', 'rightGround', 'centerHeights', 'leftHeights', 'rightHeights'];
const PAVEMENT_PROFILE_FIELDS=[...PROFILE_FIELDS,'pavementOffsets','pavementHeightDeltas','pavementCenterBounds'];
const profileFieldsFor=model=>model.pavementHeightDeltas?PAVEMENT_PROFILE_FIELDS:PROFILE_FIELDS;

// Final profiles share the compilation lifetime. Bound each backing store so
// retaining one road cannot keep a whole city's numeric storage alive. Do this
// after reconciliation, before tunnel/collision consumers capture any views.
// Never detach old profiles: diagnostics and prior publications may hold them.
function packCompiledTransportSurfaces(features) {
  // Preparation profiles are readable by the graph solver, but cannot escape
  // into terrain, meshes or contacts before every final cross-section passes.
  // Validate the whole group before replacing any feature/model aliases.
  for (const feature of features) validateReviewedSurfaceCrossfall(feature?.transportSurfaceModel);
  const pending = new Map();
  const chunks = [];
  let chunk = null;
  let sourceBytes = 0;
  for (const feature of features) {
    const model = feature?.transportSurfaceModel;
    if (!compiledModels.has(model) || packedModels.has(model) || pending.has(model)) continue;
    const bytes = profileFieldsFor(model).reduce((sum, field) => sum + model[field].byteLength, 0);
    const offset = chunk ? Math.ceil(chunk.bytes / 8) * 8 : 0;
    if (!chunk || offset + bytes > PROFILE_CHUNK_BYTES) {
      chunk = { bytes: 0, entries: [] };
      chunks.push(chunk);
    }
    const entry = { model, offset: Math.ceil(chunk.bytes / 8) * 8, bytes };
    chunk.entries.push(entry);
    chunk.bytes = entry.offset + bytes;
    pending.set(model, null);
    sourceBytes += bytes;
  }
  let storageBytes = 0;
  for (const group of chunks) {
    const storage = new ArrayBuffer(group.bytes);
    storageBytes += storage.byteLength;
    for (const { model, offset } of group.entries) {
      const next = { ...model, ...(model.reviewedSurfacePhase ? {reviewedSurfacePhase: 'accepted'} : {}) };
      let cursor = offset;
      for (const field of profileFieldsFor(model)) {
        const source = model[field];
        const view = new source.constructor(storage, cursor, source.length);
        // Copy bytes, preserving every Float32/Float64 bit, including -0.
        new Uint8Array(storage, cursor, source.byteLength).set(
          new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
        next[field] = view;
        cursor += source.byteLength;
      }
      Object.freeze(next);
      compiledModels.add(next);
      packedModels.add(next);
      pending.set(model, next);
    }
  }
  // Allocate/copy all replacements before publishing any of them. Duplicate
  // feature/model identities retain their aliases; unrelated models stay put.
  for (const feature of features) {
    const next = pending.get(feature?.transportSurfaceModel);
    if (next) attachCompiledTransportSurface(feature, next);
  }
  return Object.freeze({ profiles: pending.size, buffers: chunks.length, sourceBytes, storageBytes });
}

function validateReviewedSurfaceCrossfall(model) {
  if (model?.surveyedSurface && (!Number.isFinite(model.maximumReviewedCrossfall) ||
      model.maximumReviewedCrossfall > model.surveyedSurface.maximumCrossfall)) {
    throw new Error('reviewed_road_surface_crossfall_exceeded');
  }
  if(model?.surveyedSurface?.pavementProfile&&(!Number.isFinite(model.maximumReviewedPavementDepartureMeters)||
    model.maximumReviewedPavementDepartureMeters>model.surveyedSurface.pavementProfile.maximumAdjustmentMeters))throw Error('reviewed_road_pavement_conflict');
  if(model?.pavementHeightDeltas){
    if(model.pavementHeightDeltas.length!==model.distances.length*4||model.pavementOffsets?.length!==model.pavementHeightDeltas.length||
      !Number.isFinite(model.maximumReviewedApronCrossfall)||model.maximumReviewedApronCrossfall>.15)throw Error('reviewed_pavement_apron_crossfall_exceeded');
    if(model.pavementCenterBounds?.length!==model.distances.length*2)throw Error('reviewed_pavement_cut_fill_bounds_missing');
    for(let i=0;i<model.distances.length;i++)if(model.centerHeights[i]<model.pavementCenterBounds[i*2]-1e-5||model.centerHeights[i]>model.pavementCenterBounds[i*2+1]+1e-5)throw Error('reviewed_pavement_cut_fill_exceeded');
    // The graph may have reconciled centre heights since preparation. Relative
    // transects inherit that correction; validate the final common publication.
    for(let i=1;i<model.distances.length;i++)for(let k=0;k<4;k++){
      const delta=model.centerHeights[i]-model.centerHeights[i-1]+model.pavementHeightDeltas[i*4+k]-model.pavementHeightDeltas[(i-1)*4+k];
      if(!Number.isFinite(delta)||Math.abs(delta)/(model.distances[i]-model.distances[i-1])>model.maximumGrade+1e-6)throw Error('reviewed_pavement_longitudinal_grade_exceeded');
    }
  }
}

function assertReviewedSurfaceAccepted(model) {
  if (model?.reviewedSurfacePhase === 'preparation') throw new Error('reviewed_road_surface_not_finalized');
  validateReviewedSurfaceCrossfall(model);
}

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
  if (feature?.surfaceSurveyEvidence?.surfaceModel === BANKED_ROAD_MODEL) return BANKED_ROAD_MAXIMUM_GRADE;
  const type = featureRoadType(feature);
  if (semantics?.rampCandidate === true || /_link$/.test(type)) return 0.1;
  if (type === 'motorway' || type === 'trunk') return 0.06;
  return 0.085;
}

function mirroredScratch(Type, source, allocate) {
  const result = allocate(Type, source.length);
  for (let index = 0; index < source.length; index++) result[index] = -source[index];
  return result;
}

function smoothUpperBoundedGradeProfile(initialHeights, upperBounds, distances, maximumGrade, allocate = copyNumericArray) {
  // The shared smoother is lower-bounded because bridge clearance is a
  // minimum. Tunnels have the inverse physical invariant: their surface must
  // not rise above the local subgrade ceiling. Mirroring the profile lets the
  // same deterministic grade solver enforce that upper bound without a
  // second, divergent alignment algorithm.
  const mirroredInitial = mirroredScratch(Float64Array, initialHeights, allocate);
  const mirroredLowerBounds = mirroredScratch(Float64Array, upperBounds, allocate);
  const mirrored = smoothGradeLimitedProfile(
    mirroredInitial,
    mirroredLowerBounds,
    distances,
    maximumGrade,
    allocate
  );
  return mirroredScratch(Float32Array, mirrored, allocate);
}

function reconcileExactSubgradeGraphNodeConstraints(
  feature,
  heights,
  upperBounds,
  distances,
  maximumGrade,
  allocate = copyNumericArray
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
  const mirroredHeights = mirroredScratch(Float32Array, heights, allocate);
  const mirroredLowerBounds = mirroredScratch(Float64Array, upperBounds, allocate);
  const reconciled = reconcileExactGraphNodeConstraints(
    mirroredFeature,
    mirroredHeights,
    distances,
    mirroredLowerBounds,
    maximumGrade,
    allocate
  );
  return mirroredScratch(Float32Array, reconciled, allocate);
}

function compileTransportSurfaceModel(feature, sampleTerrainY, options = {}) {
  return transportScratch.withScratch(allocate => compileTransportSurfaceWithScratch(feature, sampleTerrainY, options, allocate));
}

function compileTransportSurfaceWithScratch(feature, sampleTerrainY, options, allocate) {
  if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) {
    throw new Error('Transport surface compilation requires a polyline with at least two points');
  }
  if (typeof sampleTerrainY !== 'function') {
    throw new Error('Transport surface compilation requires one accepted ground sampler');
  }

  const points = feature.pts;
  const semantics = feature.structureSemantics || { terrainMode: 'at_grade' };
  const { distances: sourcePathDistances, total } = polylineDistances(points, allocate);
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
  const sourceSampleDistances = createSampleDistances(
    total,
    options.sampleStep,
    exactGraphNodeDistances,
    (feature.ordinaryStreetAnchors||[]).map(a=>a.distance).concat(
      (Array.isArray(feature.surfaceSurveyEvidence?.deckProfile?.samples)?feature.surfaceSurveyEvidence.deckProfile.samples:[]).map(p=>p.t*total),
      (Array.isArray(feature.surfaceSurveyEvidence?.pavementProfile?.samples)?feature.surfaceSurveyEvidence.pavementProfile.samples:[]).map(p=>p.t*total),
      (feature.surfaceSurveyEvidence?.pavementSections?.samples||[]).map(p=>p.distance),
      (feature.tunnelObstructionLimits || []).flatMap(limit => [limit.start, limit.end])),
    allocate
  );
  // All nine published numeric fields have the model's lifetime. Use one
  // backing store with disjoint views rather than five native buffers per
  // road. Preserve Float64 station coordinates and every Float32 field.
  const sampleCount = sourceSampleDistances.length;
  const stationBytes = sampleCount * 8;
  const pathBytes = sourcePathDistances.byteLength;
  const publishedBytes = stationBytes + pathBytes + sampleCount * 7 * 4;
  const publication = options.publicationStorage?.allocate(publishedBytes) ||
    {buffer: new ArrayBuffer(publishedBytes), byteOffset: 0};
  const publishedStorage = publication.buffer, publishedOffset = publication.byteOffset;
  const sampleDistances = new Float64Array(publishedStorage, publishedOffset, sampleCount);
  const pathDistances = new Float32Array(publishedStorage, publishedOffset + stationBytes, sourcePathDistances.length);
  sampleDistances.set(sourceSampleDistances);
  pathDistances.set(sourcePathDistances);
  // Sources are borrowed scratch; published fields own the copy above.
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
  let maximumGrade = Number.isFinite(options.maximumGrade)
    ? Number(options.maximumGrade)
    : semantics?.terrainMode !== 'at_grade'
      ? engineeredMaximumGrade(feature, semantics)
      : feature.surfaceSurveyEvidence?.surfaceModel === BANKED_ROAD_MODEL
        ? BANKED_ROAD_MAXIMUM_GRADE
        : DEFAULT_MAX_GRADE;
  const pavementSections=feature.surfaceSurveyEvidence?.pavementSections;
  const pavementCenterReferences=pavementSections?allocate(Float64Array,sampleCount):null;
  const compiledWidth = pavementSections ? feature.surfaceSurveyEvidence.usableWidthMeters/Number(feature.metersPerWorldUnit||1) : Number.isFinite(options.width)
    ? Number(options.width)
    : finiteNumber(feature.width, 4);
  const halfWidth = Math.max(0.6, compiledWidth * 0.5);
  // Tunnel containment must sample the SAME outer roof extent as its shell
  // compiler, not just the carriageway edges on a steep cross-slope.
  const groundProbeHalfWidth = semantics.terrainMode === 'subgrade' && semantics.isTunnel
    ? tunnelRoofHalfWidth(compiledWidth)
    : halfWidth;
  const corridorCenterOffset = pavementSections ? 0 : roadPlacementOffsetWorld(feature);
  const anchors = normalizeAnchors(feature, semantics, total);
  // These four published profiles share a lifetime, but never overlap. One
  // backing allocation avoids four native buffers per compiled road.
  const groundStorage = new Float32Array(publishedStorage, publishedOffset + stationBytes + pathBytes, sampleCount * 4);
  const groundHeights = groundStorage.subarray(0, sampleCount);
  const offsets = groundStorage.subarray(sampleCount, sampleCount * 2);
  const leftGround = groundStorage.subarray(sampleCount * 2, sampleCount * 3);
  const rightGround = groundStorage.subarray(sampleCount * 3);
  // Compiler-only work must not keep storage alive through the published model.
  // Preserve each field's original Float64/Float32 rounding and zero fill.
  const centerInitial = allocate(Float64Array, sampleCount);
  const centerLowerBounds = allocate(Float64Array, sampleCount);
  const centerUpperBounds = allocate(Float64Array, sampleCount);
  const terrainEnvelope = allocate(Float32Array, sampleCount);
  const mode = semantics?.terrainMode || 'at_grade';
  const surfaceSurvey=feature.surfaceSurveyEvidence||null;
  const reviewedDeck=validateReviewedDeckProfile(surfaceSurvey,mode,total,maximumGrade);
  const reviewedPavement=validateReviewedPavementProfile(surfaceSurvey,mode,total,maximumGrade),reviewedProfile=reviewedDeck||reviewedPavement;
  if(reviewedDeck&&reviewedPavement)throw Error('reviewed_surface_profile_conflict');
  if(surfaceSurvey&&(surfaceSurvey.version!==1||(mode!=='at_grade'&&(!reviewedDeck||!semantics.isBridge))||
    surfaceSurvey.sourceFeatureId!==String(feature.sourceFeatureId)||!surfaceSurvey.groundArtifactId||
    !/^[a-f0-9]{64}$/.test(surfaceSurvey.groundContentSha256)||
    surfaceSurvey.surfaceModel!==undefined&&surfaceSurvey.surfaceModel!==BANKED_ROAD_MODEL||
    !(surfaceSurvey.maximumCrossfall>0&&surfaceSurvey.maximumCrossfall<=
      (surfaceSurvey.surfaceModel===BANKED_ROAD_MODEL?BANKED_ROAD_MAXIMUM_CROSSFALL:.15))))throw Error('invalid_reviewed_road_surface');
  if(reviewedProfile&&reviewedProfile.reconstructedWidthMeters+.02<compiledWidth*(Number(feature.metersPerWorldUnit)||1))throw Error(reviewedDeck?'reviewed_deck_width_unavailable':'reviewed_pavement_width_unavailable');
  const pavementCamberSpans=reviewedPavement?new Map(graphApproachAnchors.map(anchor=>{
    let span=24;
    for(const p of reviewedPavement.samples){const distance=Math.abs(p.t*total-anchor.distance);if(distance>1e-6)span=Math.min(span,distance);}
    return [anchor,span];
  })):null;
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
    const pavementFrame=pavementSections?roadPavementFrameAtDistance(pavementSections,distance):null;
    const normalX = pavementFrame?pavementFrame.x:-tangent.z;
    const normalZ = pavementFrame?pavementFrame.z:tangent.x;
    const groundY = sampleTerrainOrThrow(
      sampleTerrainY,
      point.x + normalX * corridorCenterOffset,
      point.z + normalZ * corridorCenterOffset
    );
    const leftY = sampleTerrainOrThrow(
      sampleTerrainY,
      point.x + normalX * (groundProbeHalfWidth + corridorCenterOffset),
      point.z + normalZ * (groundProbeHalfWidth + corridorCenterOffset)
    );
    const rightY = sampleTerrainOrThrow(
      sampleTerrainY,
      point.x + normalX * (-groundProbeHalfWidth + corridorCenterOffset),
      point.z + normalZ * (-groundProbeHalfWidth + corridorCenterOffset)
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
    let atGradeReferenceY = groundY;
    if(pavementSections){
      const section=sampleRoadPavementSection(pavementSections,distance);
      // A mapped line can sit near the retaining wall. Anchor the original
      // reconstruction inside its observed racing bank, using the same native
      // ground owner, then express the plane at the retained source line.
      if(section.apronSlope!==undefined){
        // Original drainage plane, anchored at the physical inner edge. This
        // resolves inconsistent bare-earth bank/apron alignments without
        // pretending they are a measured asphalt engineering survey.
        atGradeReferenceY=sampleTerrainOrThrow(sampleTerrainY,point.x-normalX*section.negative,point.z-normalZ*section.negative)+section.bankSlope*section.bankNegative+section.apronSlope*(section.negative-section.bankNegative);
      }else if(section.bankSlope!==undefined)atGradeReferenceY=sampleTerrainOrThrow(sampleTerrainY,point.x+normalX*section.bankOffset,point.z+normalZ*section.bankOffset)-section.bankSlope*section.bankOffset;
      pavementCenterReferences[index]=atGradeReferenceY;
    }
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
    offsets[index] = reviewedProfile?sampleReviewedDeckProfile(reviewedProfile,progress).centerY-groundY:pavementSections?atGradeReferenceY-groundY+offset:offset;
    centerInitial[index] = reviewedProfile?sampleReviewedDeckProfile(reviewedProfile,progress).centerY+surfaceBias:centerY;
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
      ? Math.min(lowestCrossSectionGround + offset + surfaceBias,
          tunnelObstructionMaximumY(feature.tunnelObstructionLimits, distance))
      : atGrade
      ? groundY + surfaceBias + maximumAtGradeFill
      : Number.POSITIVE_INFINITY;
  }

  const hasTransitionAnchors =
    Array.isArray(feature?.structureTransitionAnchors) &&
    feature.structureTransitionAnchors.length > 0;
  if (!reviewedDeck && !hasTransitionAnchors && mode !== 'at_grade') {
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

  let centerHeights = reviewedProfile
    ? allocate(Float32Array,centerInitial)
    : mode === 'at_grade'
    ? smoothSignedCutFillProfile(
        terrainEnvelope,
        centerLowerBounds,
        centerUpperBounds,
        sampleDistances,
        maximumGrade,
        options.verticalFitRadius,
        allocate,
        {preserveLinearTrend:surfaceSurvey?.surfaceModel===BANKED_ROAD_MODEL}
      )
    : mode === 'subgrade'
      ? smoothUpperBoundedGradeProfile(
          centerInitial,
          centerUpperBounds,
          sampleDistances,
          maximumGrade,
          allocate
        )
      : smoothGradeLimitedProfile(
        centerInitial,
        centerLowerBounds,
        sampleDistances,
        maximumGrade,
        allocate
      );
  if(mode==='at_grade'&&!engineeredApproach&&(!surfaceSurvey||surfaceSurvey.surfaceModel===BANKED_ROAD_MODEL)){
    const ordinaryFit=fitOrdinaryStreetProfile(sampleDistances,centerHeights,[
      {distance:0,targetSurfaceY:(reviewedPavement?sampleReviewedDeckProfile(reviewedPavement,0).centerY:endpointGroundStart)+surfaceBias},
      {distance:total,targetSurfaceY:(reviewedPavement?sampleReviewedDeckProfile(reviewedPavement,1).centerY:endpointGroundEnd)+surfaceBias},
      ...(feature.ordinaryStreetAnchors||[])
    ],maximumGrade,allocate);
    if(surfaceSurvey&&ordinaryFit.maximumGrade>BANKED_ROAD_MAXIMUM_GRADE+1e-6)throw Error('reviewed_road_surface_grade_exceeded');
    centerHeights=ordinaryFit.heights;
    maximumGrade=ordinaryFit.maximumGrade;
  }
  if (engineeredApproach) {
    // Graph identity and the complete grade cone are solved together below.
    // A separate pre-pass that pinned anchor samples could survive an
    // infeasible solve and recreate the vertical cliff the solver rejected.
    centerHeights = reconcileExactGraphNodeConstraints(
      feature,
      centerHeights,
      sampleDistances,
      centerLowerBounds,
      approachMaximumGrade,
      allocate
    );
    // The constrained solver above owns both graph identity and design grade.
    // Re-pinning nodes after it runs can recreate an infeasible one-sample
    // cliff on short OSM fragments, so no later writer may overwrite it.
  }
  if (!reviewedDeck && mode !== 'at_grade') {
    centerHeights = applyEndpointTieIns(
      feature,
      centerHeights,
      sampleDistances,
      endpointGroundStart,
      endpointGroundEnd,
      surfaceBias,
      maximumGrade,
      allocate
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
        maximumGrade,
        allocate
      );
    }
    if (mode === 'elevated') {
      centerHeights = reconcileExactGraphNodeConstraints(
        feature,
        centerHeights,
        sampleDistances,
        centerLowerBounds,
        maximumGrade,
        allocate
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
        maximumGrade,
        allocate
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
        maximumGrade,
        allocate
      );
      if (feature.tunnelObstructionLimits?.length) {
        // A portal can relax modeled terrain cover, but it cannot move through
        // a published building foundation. Propagate that hard clearance over
        // the full grade run. The shared corridor pass then reconciles any
        // affected graph joins against this physically feasible profile.
        const obstructionBounds = Float64Array.from(sampleDistances, distance =>
          tunnelObstructionMaximumY(feature.tunnelObstructionLimits, distance));
        if (centerHeights.some((height,index) => height > obstructionBounds[index] + 1e-5)) {
          centerHeights = smoothUpperBoundedGradeProfile(centerHeights, obstructionBounds, sampleDistances, maximumGrade, allocate);
        }
      }
      // The mirrored constrained solver is the final tunnel authority. A
      // post-solver exact write would satisfy one node by violating the
      // drivable grade/containment contract immediately beside it.
    }
  }
  // Publish the same accepted profile at both edges. All gameplay, markings,
  // sidewalks, and visuals then query one planar deck instead of recreating
  // incompatible lateral terrain folds.
  const solvedHeights = centerHeights;
  centerHeights = new Float32Array(publishedStorage, publishedOffset + stationBytes + pathBytes + sampleCount * 4 * 4, sampleCount);
  centerHeights.set(solvedHeights);
  // The scratch scope is returned only after every accepted field is copied.
  const edgeStorage = new Float32Array(publishedStorage, publishedOffset + stationBytes + pathBytes + sampleCount * 5 * 4, sampleCount * 2);
  const leftHeights = edgeStorage.subarray(0, centerHeights.length);
  const rightHeights = edgeStorage.subarray(centerHeights.length);
  leftHeights.set(centerHeights);
  rightHeights.set(centerHeights);
  let maximumReviewedCrossfall = 0,maximumReviewedPavementDepartureMeters=0;
  if(surfaceSurvey){
    for(let index=0;index<sampleCount;index++){
      let leftDelta=leftGround[index]-groundHeights[index],rightDelta=rightGround[index]-groundHeights[index];
      const authoredBank=pavementSections?sampleRoadPavementSection(pavementSections,sampleDistances[index]).bankSlope:undefined;
      if(authoredBank!==undefined){leftDelta=authoredBank*halfWidth;rightDelta=-leftDelta;}
      if(reviewedProfile){const crossfall=sampleReviewedDeckProfile(reviewedProfile,sampleDistances[index]/total).crossfall;leftDelta=crossfall*halfWidth;rightDelta=-leftDelta;}
      if(!reviewedDeck&&engineeredApproach){
        // A direct reviewed deck join transfers its crossfall into the same
        // approach profile, tapering back to the accepted ground cross-section.
        for(const anchor of graphApproachAnchors){
          if(!Number.isFinite(anchor.reviewedDeckCrossfall))continue;
          const influence=Math.max(0,1-Math.abs(sampleDistances[index]-anchor.distance)/(pavementCamberSpans?.get(anchor)||24));
          leftDelta=leftDelta*(1-influence)+anchor.reviewedDeckCrossfall*halfWidth*influence;
          rightDelta=rightDelta*(1-influence)-anchor.reviewedDeckCrossfall*halfWidth*influence;
        }
      }
      maximumReviewedCrossfall = Math.max(maximumReviewedCrossfall,
        Math.max(Math.abs(leftDelta),Math.abs(rightDelta))/halfWidth);
      leftHeights[index]+=leftDelta;rightHeights[index]+=rightDelta;
      if(reviewedPavement){
        const p=sampleReviewedDeckProfile(reviewedPavement,sampleDistances[index]/total),metersPerUnit=Number(feature.metersPerWorldUnit)||1,core=reviewedPavement.observedCoreWidthMeters/(2*metersPerUnit);
        const centerDeparture=centerHeights[index]-surfaceBias-p.centerY;
        maximumReviewedPavementDepartureMeters=Math.max(maximumReviewedPavementDepartureMeters,
          Math.abs(centerDeparture)*metersPerUnit,
          Math.abs(centerDeparture+(leftHeights[index]-centerHeights[index])*core/halfWidth-p.crossfall*core)*metersPerUnit,
          Math.abs(centerDeparture+(rightHeights[index]-centerHeights[index])*core/halfWidth+p.crossfall*core)*metersPerUnit);
      }
    }
    if (options.reviewedSurfacePhase !== 'preparation' && maximumReviewedCrossfall > surfaceSurvey.maximumCrossfall) {
      throw new Error('reviewed_road_surface_crossfall_exceeded');
    }
    if(options.reviewedSurfacePhase!=='preparation'&&reviewedPavement&&maximumReviewedPavementDepartureMeters>reviewedPavement.maximumAdjustmentMeters)throw Error('reviewed_road_pavement_conflict');
  }

  let pavementOffsets,pavementHeightDeltas,pavementCenterBounds,maximumReviewedApronCrossfall=0;
  if(pavementSections){
    if(mode!=='at_grade'||pavementSections.coordinateSpace!=='world'||pavementSections.sourceFeatureId!==String(feature.sourceFeatureId)||reviewedProfile)throw Error('reviewed_pavement_profile_conflict');
    const storage=new Float32Array(sampleCount*10);pavementOffsets=storage.subarray(0,sampleCount*4);pavementHeightDeltas=storage.subarray(sampleCount*4,sampleCount*8);pavementCenterBounds=storage.subarray(sampleCount*8);
    for(let i=0;i<sampleCount;i++){
      const d=sampleDistances[i],section=sampleRoadPavementSection(pavementSections,d),p=pointAtDistance(points,pathDistances,d),frame=roadPavementFrameAtDistance(pavementSections,d),
        rawAt=offset=>sampleTerrainOrThrow(sampleTerrainY,p.x+frame.x*offset,p.z+frame.z*offset)-pavementCenterReferences[i],
        positions=[-section.negative,-section.bankNegative,0,section.positive],deltas=[section.apronSlope===undefined?rawAt(-section.negative):-section.bankSlope*section.bankNegative-section.apronSlope*(section.negative-section.bankNegative),section.bankSlope===undefined?rawAt(-section.bankNegative):-section.bankSlope*section.bankNegative,0,section.bankSlope===undefined?rawAt(section.positive):section.bankSlope*section.positive];
      pavementOffsets.set(positions,i*4);pavementHeightDeltas.set(deltas,i*4);
      const terrain=positions.map(rawAt).map(y=>y+pavementCenterReferences[i]+surfaceBias);
      pavementCenterBounds.set([Math.max(...terrain.map((y,k)=>y-deltas[k]-maximumAtGradeCut)),Math.min(...terrain.map((y,k)=>y-deltas[k]+maximumAtGradeFill))],i*2);
      for(let k=1;k<4;k++)maximumReviewedCrossfall=Math.max(maximumReviewedCrossfall,Math.abs((deltas[k]-deltas[k-1])/(positions[k]-positions[k-1])));
      maximumReviewedApronCrossfall=Math.max(maximumReviewedApronCrossfall,Math.abs((deltas[1]-deltas[0])/(positions[1]-positions[0])));
    }
  }

  const stats = profileStats(
    sampleDistances,
    centerHeights,
    mode === 'at_grade' ? [groundHeights, leftGround, rightGround] : null,
    surfaceBias
  );
  const model = Object.freeze({
    schemaVersion: TRANSPORT_SURFACE_SCHEMA_VERSION,
    authority: 'compiled_transport_surface',
    sourceFeatureId: String(feature.sourceFeatureId || feature.id || ''),
    terrainMode: mode,
    engineeredApproach,
    surveyedSurface:surfaceSurvey?Object.freeze({...surfaceSurvey,...(reviewedDeck?{deckProfile:reviewedDeck}:{}),...(reviewedPavement?{pavementProfile:reviewedPavement}:{})}):null,
    ...(surfaceSurvey ? {maximumReviewedCrossfall,
      reviewedSurfacePhase: options.reviewedSurfacePhase === 'preparation' ? 'preparation' : 'accepted'} : {}),
    ...(reviewedPavement?{maximumReviewedPavementDepartureMeters}:{}),
    verticalGroup: String(semantics?.verticalGroup || `${mode}:0`),
    width: halfWidth * 2,
    surfaceBias,
    maximumGrade,
    approachMaximumGrade,
    endpointPolicy: reviewedDeck
      ? 'reviewed_deck_profile'
      : reviewedPavement
      ? 'reviewed_pavement_profile'
      : engineeredApproach
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
    ...(pavementSections?{pavementOffsets,pavementHeightDeltas,pavementCenterBounds,maximumReviewedApronCrossfall}:{}),
    stats
  });
  if(options.reviewedSurfacePhase!=='preparation')validateReviewedSurfaceCrossfall(model);
  compiledModels.add(model);
  return model;
}

function sampleTransportSurfaceAtDistance(model, distance, lateralOffset = 0) {
  if (!model?.distances?.length || !model?.centerHeights?.length) return NaN;
  if(model.pavementHeightDeltas)return sampleRoadPavementHeight(model,distance,lateralOffset);
  const sample = compiledModels.has(model) ? sampleSortedProfileAtDistance : sampleProfileAtDistance;
  const centerY = sample(model.distances, model.centerHeights, distance);
  if (!Number.isFinite(centerY)) return NaN;
  const halfWidth = Math.max(0.01, finiteNumber(model.width, 2) * 0.5);
  const lateral = clamp(finiteNumber(lateralOffset) / halfWidth, -1, 1);
  if (lateral > 0) {
    const leftY = sample(model.distances, model.leftHeights, distance);
    return centerY + (leftY - centerY) * lateral;
  }
  if (lateral < 0) {
    const rightY = sample(model.distances, model.rightHeights, distance);
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
  assertReviewedSurfaceAccepted,
  compileTransportSurfaceModel,
  packCompiledTransportSurfaces,
  roadSkirtDepth,
  sampleTransportSurfaceAtDistance
};
