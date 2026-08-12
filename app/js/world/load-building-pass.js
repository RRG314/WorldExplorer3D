import { ctx as appCtx } from "../shared-context.js?v=55";
import { classifyStructureSemantics } from "../structure-semantics.js?v=41";
import {
  buildingSeedFromIdentity,
  inferFallbackBuildingHeightMeters,
  interpretBuildingSemantics
} from "../building-semantics.js?v=4";
import { createMidLodBuildingMesh } from "./load-geometry.js?v=22";
import { geometryHasFinitePositions } from "./geometry-batching.js?v=4";
import { createRoofDetailMesh } from "./roof-details.js?v=2";
import {
  createMappedRoofMesh,
  resolveMappedRoof
} from "./mapped-roof-geometry.js?v=5";
import {
  batchMidLodBuildingMeshes,
  batchNearLodBuildingMeshes
} from "./building-batching.js?v=8";
import { curatedLandmarksNear } from "./landmark-catalog.js?v=9";
import { compileBuildingProvenance } from './building-provenance-model.js?v=1';
import { createBuildingRoadFootprintGuards } from './building-road-footprint.js?v=6';
import {
  classifyBuildingWaterRelationship,
  createWaterAreaSpatialIndex,
  createMappedVesselMesh
} from './water-adjacent-structures.js?v=3';
import { yieldToMainThread as defaultYieldToMainThread } from './cooperative-scheduling.js?v=1';
import { isImplausibleTallBuildingFootprint } from './building-geometry-quality.js?v=1';

export async function buildBuildingGeometryPass(options = {}) {
  const buildingWays = Array.isArray(options.buildingWays) ? options.buildingWays : [];
  const nodes = options.nodes || {};
  const buildingGeometryGuards = options.buildingGeometryGuards || {};
  const lodThresholds = options.lodThresholds || {};
  const loadMetrics = options.loadMetrics || {};
  loadMetrics.buildingDimensions ||= {
    total: 0,
    metadataMatched: 0,
    mappedHeight: 0,
    mappedLevels: 0,
    inferredHeight: 0,
    inferredFullHeight: 0,
    inferredFullMinHeight: null,
    inferredFullMaxHeight: null,
    inferredFullHeightBuckets: {},
    mappedType: 0,
    mappedRoof: 0,
    mappedName: 0,
    mappedFacadeColor: 0,
    overture: 0,
    overtureParts: 0,
    inferredFootprints: 0
  };
  loadMetrics.buildingPublication ||= {
    candidates: 0,
    invalidFootprint: 0,
    outsideRoadCoverage: 0,
    roadOverlap: 0,
    farLod: 0,
    implausibleGeometry: 0,
    provenanceRejected: 0,
    renderedFeatures: 0
  };
  loadMetrics.buildingWater ||= {
    vessels: 0,
    explicitOverwaterStructures: 0,
    suppressedOverlaps: 0
  };
  appCtx.buildingProvenanceRecords ||= [];
  appCtx.buildingProvenanceFeatureIds ||= new Set(
    appCtx.buildingProvenanceRecords
      .map((record) => record?.identity?.featureId)
      .filter(Boolean)
  );
  const useRdtBudgeting = options.useRdtBudgeting === true;
  const rdtLoadComplexity = Number(options.rdtLoadComplexity || 0);
  const featureMinPolygonArea = Number.isFinite(options.featureMinPolygonArea) ? options.featureMinPolygonArea : 8;
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const showLoad = typeof options.showLoad === 'function' ? options.showLoad : () => {};
  const sanitizeWorldFootprintPoints = options.sanitizeWorldFootprintPoints;
  const signedPolygonAreaXZ = options.signedPolygonAreaXZ;
  const pickBuildingBaseColor = options.pickBuildingBaseColor;
  const registerBuildingCollision = options.registerBuildingCollision;
  const yieldEveryBuildings = Math.max(1, Math.floor(Number(options.yieldEveryBuildings) || 8));
  const yieldToMainThread = typeof options.yieldToMainThread === 'function'
    ? options.yieldToMainThread
    : defaultYieldToMainThread;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const curatedLandmarkExclusions = curatedLandmarksNear(appCtx.LOC)
    .filter((landmark) => Number(landmark.hideRadiusMeters) > 0)
    .map((landmark) => ({
      id: landmark.id,
      radius: Number(landmark.hideRadiusMeters),
      world: appCtx.geoToWorld(landmark.lat, landmark.lon)
    }));
  const waterAreaIndex = createWaterAreaSpatialIndex(appCtx.waterAreas);

  showLoad(`Loading buildings... (${buildingWays.length})`);
  startLoadPhase('buildBuildingGeometry');

  startLoadPhase('buildBuildingRoadGuards');
  const {
    expandFootprintForGroundApron,
    footprintIntersectsRoadCenterline,
    isBuildingNearLoadedRoad,
    overlapsRoadCorridor,
    pointOnRoadCorridor,
    sampleFootprintCoverage
  } = await createBuildingRoadFootprintGuards({
    roads: appCtx.roads,
    useRdtBudgeting,
    rdtLoadComplexity,
    yieldToMainThread
  });
  endLoadPhase('buildBuildingRoadGuards');
  const lodNearDist = lodThresholds.near;
  const buildingDetailDist = Math.min(lodNearDist, 300);
  let buildingYieldCount = 0;
  let buildingYieldWaitMs = 0;
  let buildingWorkMs = 0;
  let maximumBuildingWorkChunkMs = 0;
  let buildingWorkChunkStartedAt = now();
  const buildingPhaseMs = {
    footprintPreparation: 0,
    waterClassification: 0,
    roadEligibility: 0,
    apronClassification: 0,
    terrainSampling: 0,
    provenanceCompilation: 0,
    meshCreation: 0,
    collisionPublication: 0,
    roofAndGroundDetail: 0
  };
  const measureBuildingPhase = (phase, operation) => {
    const startedAt = now();
    try {
      return operation();
    } finally {
      buildingPhaseMs[phase] += now() - startedAt;
    }
  };
  for (let buildingIndex = 0; buildingIndex < buildingWays.length; buildingIndex += 1) {
    const way = buildingWays[buildingIndex];
    try {
    loadMetrics.buildingPublication.candidates += 1;
    const pts = measureBuildingPhase('footprintPreparation', () => {
      const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
      return sanitizeWorldFootprintPoints(rawPts, featureMinPolygonArea, buildingGeometryGuards);
    });
    if (pts.length < 3) {
      loadMetrics.buildingPublication.invalidFootprint += 1;
      continue;
    }
    const waterRelationship = measureBuildingPhase('waterClassification', () =>
      classifyBuildingWaterRelationship(
        way.tags || {},
        pts,
        appCtx.waterAreas,
        { waterAreaIndex }
      )
    );
    // Ships are water-domain objects, not roadside building massing. Publish
    // them before road proximity/overlap guards so dense harbors and detached
    // piers cannot silently remove valid mapped vessels.
    if (waterRelationship.action === 'render_vessel') {
      const waterSurfaceY = Number(waterRelationship.coverage.primaryWater?.surfaceY);
      const vesselMesh = createMappedVesselMesh(pts, waterSurfaceY, way.tags || {});
      if (vesselMesh) {
        vesselMesh.userData.waterRelationship = waterRelationship.kind;
        appCtx.addEarthWorldObject(vesselMesh);
        appCtx.buildingMeshes.push(vesselMesh);
        loadMetrics.buildingWater.vessels += 1;
        loadMetrics.buildingPublication.renderedFeatures += 1;
      }
      continue;
    }
    const nearLoadedRoad = measureBuildingPhase('roadEligibility', () => isBuildingNearLoadedRoad(pts));
    if (!nearLoadedRoad) {
      loadMetrics.buildingPublication.outsideRoadCoverage += 1;
      continue;
    }
    const roadCoreConflict = measureBuildingPhase('roadEligibility', () => footprintIntersectsRoadCenterline(pts));
    if (roadCoreConflict) {
      loadMetrics.buildingsSkippedRoadOverlap = (loadMetrics.buildingsSkippedRoadOverlap || 0) + 1;
      loadMetrics.buildingPublication.roadOverlap += 1;
      continue;
    }
    let centerX = 0;
    let centerZ = 0;
    let minFootprintX = Infinity;
    let maxFootprintX = -Infinity;
    let minFootprintZ = Infinity;
    let maxFootprintZ = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      centerX += pts[i].x;
      centerZ += pts[i].z;
      minFootprintX = Math.min(minFootprintX, pts[i].x);
      maxFootprintX = Math.max(maxFootprintX, pts[i].x);
      minFootprintZ = Math.min(minFootprintZ, pts[i].z);
      maxFootprintZ = Math.max(maxFootprintZ, pts[i].z);
    }
    centerX /= pts.length;
    centerZ /= pts.length;
    const curatedExclusion = curatedLandmarkExclusions.find((landmark) =>
      Math.hypot(centerX - landmark.world.x, centerZ - landmark.world.z) <= landmark.radius
    );
    if (curatedExclusion) {
      loadMetrics.curatedLandmarkSuppressedBuildings =
        Number(loadMetrics.curatedLandmarkSuppressedBuildings || 0) + 1;
      continue;
    }
    const footprintWidth = Math.max(0, maxFootprintX - minFootprintX);
    const footprintDepth = Math.max(0, maxFootprintZ - minFootprintZ);
    const footprintArea = Math.abs(signedPolygonAreaXZ(pts));
    if (waterRelationship.action === 'suppress_water_overlap') {
      loadMetrics.buildingWater.suppressedOverlaps += 1;
      continue;
    }
    if (waterRelationship.action === 'render_structure') {
      loadMetrics.buildingWater.explicitOverwaterStructures += 1;
    }
    const centerDist = Math.hypot(centerX, centerZ);
    const lodTier = centerDist <= buildingDetailDist ? 'near' : centerDist <= lodThresholds.farVisible ? 'mid' : 'far';
    if (lodTier === 'far') {
      loadMetrics.lod.farSkipped += 1;
      loadMetrics.buildingPublication.farLod += 1;
      continue;
    }

    const bSeed = buildingSeedFromIdentity(way.tags?._sourceFeatureId || way.id, appCtx.rdtSeed);
    const br1 = appCtx.rand01FromInt(bSeed);
    const br2 = appCtx.rand01FromInt(bSeed ^ 0x9e3779b9);
    const bt = way.tags.building || way.tags['building:part'] || 'yes';
    const fallbackHeight = way.tags['building:part'] ?
      10 :
      inferFallbackBuildingHeightMeters(bt, footprintArea, footprintWidth, footprintDepth, br1);
    const structureSemantics = classifyStructureSemantics(way.tags || {}, { featureKind: 'building', subtype: bt });
    const buildingSemantics = interpretBuildingSemantics(way.tags || {}, {
      buildingType: bt,
      fallbackHeight,
      fallbackPartHeight: 3.4 + br1 * 1.6,
      footprintArea,
      footprintWidth,
      footprintDepth
    });
    const height = buildingSemantics.heightMeters;
    if (isImplausibleTallBuildingFootprint({
      heightMeters: height,
      widthMeters: footprintWidth,
      depthMeters: footprintDepth,
      footprintAreaMeters: footprintArea,
      intentionalVerticalStructure:
        buildingSemantics.intentionalVerticalStructure ||
        way.tags._mappedLandmark === 'yes'
    })) {
      loadMetrics.buildingPublication.implausibleGeometry += 1;
      continue;
    }
    const buildingLevels = Number.parseFloat(way.tags['building:levels']);
    const resolvedLevels = Number.isFinite(buildingLevels) ?
      Math.max(1, Math.round(buildingLevels)) :
      Math.max(1, Math.min(120, Math.round(height / Math.max(2.8, buildingSemantics.levelHeightMeters || 3.2))));
    const levelsSource = Number.isFinite(buildingLevels) ?
      'mapped_levels' :
      buildingSemantics.heightSource === 'explicit_height' ? 'estimated_from_mapped_height' : 'estimated_from_inferred_height';
    const roofShape = String(way.tags['roof:shape'] || '').trim().toLowerCase();
    const mappedFacadeColor = String(way.tags['building:colour'] || way.tags['building:color'] || '').trim();
    loadMetrics.buildingDimensions.total += 1;
    if (way.tags._buildingMetadataSourceId) loadMetrics.buildingDimensions.metadataMatched += 1;
    if (buildingSemantics.heightSource === 'explicit_height') loadMetrics.buildingDimensions.mappedHeight += 1;
    else if (buildingSemantics.heightSource === 'levels') loadMetrics.buildingDimensions.mappedLevels += 1;
    else {
      loadMetrics.buildingDimensions.inferredHeight += 1;
      if (!way.tags['building:part']) {
        const dimensions = loadMetrics.buildingDimensions;
        const bucket = String(Math.round(height * 2) / 2);
        dimensions.inferredFullHeight += 1;
        dimensions.inferredFullMinHeight = dimensions.inferredFullMinHeight === null ? height : Math.min(dimensions.inferredFullMinHeight, height);
        dimensions.inferredFullMaxHeight = dimensions.inferredFullMaxHeight === null ? height : Math.max(dimensions.inferredFullMaxHeight, height);
        dimensions.inferredFullHeightBuckets[bucket] = (dimensions.inferredFullHeightBuckets[bucket] || 0) + 1;
      }
    }
    if (bt !== 'yes') loadMetrics.buildingDimensions.mappedType += 1;
    if (roofShape) loadMetrics.buildingDimensions.mappedRoof += 1;
    if (way.tags.name) loadMetrics.buildingDimensions.mappedName += 1;
    if (mappedFacadeColor) loadMetrics.buildingDimensions.mappedFacadeColor += 1;
    if (way.tags._geometrySource === 'overture') {
      loadMetrics.buildingDimensions.overture += 1;
      if (way.tags['building:part']) loadMetrics.buildingDimensions.overtureParts += 1;
    }
    if (way.tags._geometrySource === 'inferred_road_frontage') {
      loadMetrics.buildingDimensions.inferredFootprints += 1;
    }
    const sourceBuildingId = String(
      way.tags?._sourceFeatureId ||
      way.id ||
      `osm-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`
    );
    const roadCorridorOverlap = measureBuildingPhase('apronClassification', () => {
      const expandedFootprint = expandFootprintForGroundApron(pts);
      const roadCorridorStats = sampleFootprintCoverage(expandedFootprint, pointOnRoadCorridor);
      return overlapsRoadCorridor(roadCorridorStats);
    });
    const denseUrbanContext =
      roadCorridorOverlap ||
      footprintArea >= 260 ||
      height >= 24 ||
      bt === 'commercial' ||
      bt === 'retail' ||
      bt === 'office' ||
      bt === 'apartments' ||
      bt === 'hotel';
    const suppressGroundApron =
      structureSemantics.terrainMode === 'elevated' ||
      roadCoreConflict;
    const colliderDetail = useRdtBudgeting && lodTier !== 'near' && !roadCoreConflict ? 'bbox' : 'full';

    const sampleTerrainY = (x, z) => {
      const meshHeight = typeof appCtx.terrainMeshHeightAt === 'function'
        ? Number(appCtx.terrainMeshHeightAt(x, z))
        : NaN;
      return Number.isFinite(meshHeight) ? meshHeight : Number(appCtx.elevationWorldYAtWorldXZ(x, z));
    };
    const { elevationValues, validElevationSamples, medianElevation } = measureBuildingPhase('terrainSampling', () => {
      const terrainSamples = [];
      let terrainCentroidX = 0, terrainCentroidZ = 0;
      for (let i = 0; i < pts.length; i++) {
        const point = pts[i];
        const next = pts[(i + 1) % pts.length];
        terrainCentroidX += point.x;
        terrainCentroidZ += point.z;
        terrainSamples.push(point);
        terrainSamples.push({ x: (point.x + next.x) * 0.5, z: (point.z + next.z) * 0.5 });
      }
      terrainSamples.push({ x: terrainCentroidX / pts.length, z: terrainCentroidZ / pts.length });
      const sampledElevations = [];
      let validSamples = 0;
      terrainSamples.forEach((p) => {
        const h = sampleTerrainY(p.x, p.z);
        if (!Number.isFinite(h)) return;
        sampledElevations.push(h);
        validSamples += 1;
      });
      sampledElevations.sort((a, b) => a - b);
      return {
        elevationValues: sampledElevations,
        validElevationSamples: validSamples,
        medianElevation: validSamples > 0 ? sampledElevations[Math.floor((validSamples - 1) * 0.5)] : 0
      };
    });
    const reliefLimit = Math.min(18, Math.max(4, height * 0.65, Math.min(footprintWidth, footprintDepth) * 0.4));
    const lowSample = validElevationSamples > 0 ? elevationValues[Math.floor((validElevationSamples - 1) * 0.15)] : medianElevation;
    const highSample = validElevationSamples > 0 ? elevationValues[Math.ceil((validElevationSamples - 1) * 0.85)] : medianElevation;
    const minElevation = Math.max(lowSample, medianElevation - reliefLimit);
    const maxElevation = Math.min(highSample, medianElevation + reliefLimit);
    const avgElevation = elevationValues.length > 0 ? elevationValues.reduce((sum, value) => sum + value, 0) / elevationValues.length : medianElevation;
    const slopeRange = Number.isFinite(minElevation) && Number.isFinite(maxElevation) ? maxElevation - minElevation : 0;
    const terrainFoundationRise = slopeRange >= 0.06 ? Math.min(12, slopeRange) : 0;
    const baseElevationRaw = terrainFoundationRise > 0 ? maxElevation - terrainFoundationRise + 0.03 : avgElevation;
    const structureBaseOffset = Number.isFinite(buildingSemantics.baseOffsetMeters) ? buildingSemantics.baseOffsetMeters : 0;
    const buildingProvenance = measureBuildingPhase('provenanceCompilation', () => compileBuildingProvenance(way.tags || {}, {
      fallbackIdentity: way.id,
      buildingType: bt,
      heightMeters: height,
      levels: resolvedLevels,
      baseOffsetMeters: structureBaseOffset,
      foundationBaseY: baseElevationRaw + structureBaseOffset,
      foundationGroundBaseY: baseElevationRaw,
      structureBaseOffsetMeters: structureBaseOffset,
      minimumGroundY: minElevation,
      maximumGroundY: maxElevation,
      foundationSampleCount: validElevationSamples,
      minLevel: Number.isFinite(buildingSemantics.buildingMinLevel)
        ? buildingSemantics.buildingMinLevel
        : null,
      inferenceMethods: {
        buildingType: 'source_type_fallback',
        heightMeters: buildingSemantics.heightSource,
        levels: levelsSource,
        minHeightMeters: 'zero_base_offset'
      }
    }));
    if (!buildingProvenance.valid) {
      loadMetrics.buildingsRejectedProvenance =
        Number(loadMetrics.buildingsRejectedProvenance || 0) + 1;
      loadMetrics.buildingPublication.provenanceRejected += 1;
      continue;
    }
    if (buildingProvenance.landmark.mapped) way.tags._mappedLandmark = 'yes';
    if (!appCtx.buildingProvenanceFeatureIds.has(buildingProvenance.identity.featureId)) {
      appCtx.buildingProvenanceRecords.push(buildingProvenance);
      appCtx.buildingProvenanceFeatureIds.add(buildingProvenance.identity.featureId);
    }
    const baseElevation = baseElevationRaw + structureBaseOffset;
    const collisionBaseElevation = maxElevation + 0.03 + structureBaseOffset;
    // Bound downhill foundations so cliff outliers cannot create towers.
    const mappedRoof = measureBuildingPhase('meshCreation', () => resolveMappedRoof(way.tags, height, buildingSemantics, pts));
    const bodyHeight = (mappedRoof ? Math.max(0.05, mappedRoof.wallHeight) : height) + terrainFoundationRise;
    const renderedHeight = height + terrainFoundationRise;
    const fallbackBaseColor = pickBuildingBaseColor(bt, bSeed ^ Math.floor(br2 * 0xffff));
    const baseColor = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(mappedFacadeColor) ?
      new THREE.Color(mappedFacadeColor).getHex() :
      fallbackBaseColor;
    let mesh = null;

    if (lodTier === 'mid') {
      mesh = measureBuildingPhase('meshCreation', () => createMidLodBuildingMesh(pts, bodyHeight, baseElevation, {
        colorHex: baseColor,
        buildingSeed: bSeed,
        buildingType: bt,
        denseUrban: denseUrbanContext,
        facadeMaterial: way.tags['building:material'] || '',
        roofMaterial: way.tags['roof:material'] || '',
        roofColor: way.tags['roof:colour'] || way.tags['roof:color'] || '',
        facadeColorMapped: /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(mappedFacadeColor),
        buildingSemantics
      }));
    } else {
      const meshCreationStartedAt = now();
      const shape = new THREE.Shape();
      pts.forEach((p, i) => {
        if (i === 0) shape.moveTo(p.x, -p.z);
        else shape.lineTo(p.x, -p.z);
      });
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: bodyHeight, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      if (!geometryHasFinitePositions(geo)) {
        geo.dispose();
        continue;
      }
      const bldgMat = typeof appCtx.getBuildingMaterial === 'function' ?
        appCtx.getBuildingMaterial(bt, bSeed, baseColor, {
          lodTier: 'near',
          heightMeters: bodyHeight,
          footprintWidth,
          footprintDepth,
          footprintArea,
          denseUrban: denseUrbanContext,
          facadeMaterial: way.tags['building:material'] || '',
          roofMaterial: way.tags['roof:material'] || '',
          roofColor: way.tags['roof:colour'] || way.tags['roof:color'] || '',
          facadeColorMapped: /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(mappedFacadeColor),
          structureSemantics,
          buildingSemantics
        }) :
        new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.85, metalness: 0.05 });

      mesh = new THREE.Mesh(geo, bldgMat);
      mesh.position.y = baseElevation;
      mesh.userData.buildingFootprint = pts;
      mesh.userData.avgElevation = baseElevation;
      mesh.userData.structureBaseOffset = structureBaseOffset;
      mesh.userData.structureSemantics = structureSemantics;
      mesh.userData.buildingSemantics = buildingSemantics;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      buildingPhaseMs.meshCreation += now() - meshCreationStartedAt;
    }

    if (!mesh) continue;
    mesh.userData.terrainAvgElevation = avgElevation;
    mesh.userData.lodTier = lodTier;
    mesh.userData.sourceBuildingId = sourceBuildingId;
    mesh.userData.buildingName = way.tags.name || '';
    mesh.userData.buildingType = bt;
    mesh.userData.baseColorHex = baseColor;
    mesh.userData.buildingSeed = bSeed;
    mesh.userData.heightMeters = height;
    mesh.userData.bodyHeightMeters = bodyHeight;
    mesh.userData.renderedHeightMeters = renderedHeight;
    mesh.userData.terrainFoundationRise = terrainFoundationRise;
    mesh.userData.collisionBaseElevation = collisionBaseElevation;
    mesh.userData.heightSource = buildingSemantics.heightSource;
    mesh.userData.levels = resolvedLevels;
    mesh.userData.levelsSource = levelsSource;
    mesh.userData.roofShape = mappedRoof?.shape || roofShape;
    mesh.userData.roofShapeSource = mappedRoof?.roofShapeSource || (roofShape ? 'mapped' : null);
    mesh.userData.facadeMaterial = way.tags['building:material'] || '';
    mesh.userData.roofMaterial = way.tags['roof:material'] || '';
    mesh.userData.geometrySource = way.tags._geometrySource || 'osm';
    mesh.userData.inferenceBasis = way.tags._inferenceBasis || '';
    mesh.userData.overtureBuildingId = way.tags._overtureBuildingId || '';
    mesh.userData.overtureParentBuildingId = way.tags._overtureParentBuildingId || '';
    mesh.userData.buildingMetadataSourceId = way.tags._buildingMetadataSourceId || '';
    mesh.userData.buildingProvenance = buildingProvenance;
    mesh.userData.footprintWidth = footprintWidth;
    mesh.userData.footprintDepth = footprintDepth;
    mesh.userData.footprintArea = footprintArea;
    mesh.userData.denseUrban = denseUrbanContext;
    mesh.userData.buildingFootprint = pts;
    mesh.userData.buildingPartKind = buildingSemantics.partKind;
    mesh.userData.collisionKind = buildingSemantics.collisionKind;
    mesh.userData.allowsPassageBelow = buildingSemantics.allowsPassageBelow;
    mesh.userData.buildingSemantics = buildingSemantics;
    mesh.userData.structureBaseOffset = structureBaseOffset;
    mesh.userData.structureSemantics = structureSemantics;

    const colliderRef = measureBuildingPhase('collisionPublication', () => registerBuildingCollision(pts, height, {
      detail: colliderDetail,
      centerX,
      centerZ,
      sourceBuildingId,
      name: way.tags.name || '',
      buildingType: bt,
      buildingPartKind: buildingSemantics.partKind,
      collisionKind: buildingSemantics.collisionKind,
      allowsPassageBelow: buildingSemantics.allowsPassageBelow,
      levels: resolvedLevels,
      levelsSource,
      heightSource: buildingSemantics.heightSource,
      roofShape: mappedRoof?.shape || roofShape,
      roofShapeSource: mappedRoof?.roofShapeSource || (roofShape ? 'mapped' : null),
      roofHeight: mappedRoof?.roofHeight,
      roofHeightSource: mappedRoof?.roofHeightSource || null,
      geometrySource: way.tags._geometrySource || 'osm',
      inferenceBasis: way.tags._inferenceBasis || '',
      overtureBuildingId: way.tags._overtureBuildingId || '',
      overtureParentBuildingId: way.tags._overtureParentBuildingId || '',
      metadataSourceId: way.tags._buildingMetadataSourceId || '',
      buildingProvenance,
      minLevels: Number.isFinite(buildingSemantics.buildingMinLevel) ? buildingSemantics.buildingMinLevel : null,
      baseY: collisionBaseElevation,
      buildingSemantics,
      structureSemantics
    }));
    if (colliderDetail === 'full') loadMetrics.colliders.full += 1;
    else loadMetrics.colliders.simplified += 1;
    if (colliderRef) {
      colliderRef.baseY = collisionBaseElevation;
      colliderRef.minY = collisionBaseElevation;
      colliderRef.maxY = collisionBaseElevation + height;
    }

    appCtx.addEarthWorldObject(mesh);
    appCtx.buildingMeshes.push(mesh);
    loadMetrics.buildingPublication.renderedFeatures += 1;

    const roofAndGroundStartedAt = now();
    const mappedRoofMesh = createMappedRoofMesh(
      pts,
      baseElevation,
      (mappedRoof?.wallHeight || 0) + terrainFoundationRise,
      mappedRoof,
      way.tags
    );
    if (mappedRoofMesh) {
      mappedRoofMesh.userData.sourceBuildingId = sourceBuildingId;
      mappedRoofMesh.userData.buildingFootprint = pts;
      mappedRoofMesh.userData.geometrySource = way.tags._geometrySource || 'osm';
      mappedRoofMesh.userData.buildingProvenance = buildingProvenance;
      mappedRoofMesh.userData.lodTier = lodTier;
      appCtx.addEarthWorldObject(mappedRoofMesh);
      appCtx.buildingMeshes.push(mappedRoofMesh);
    }

    const roofDetailMesh =
      !mappedRoofMesh &&
      buildingSemantics.shouldCreateRoofDetail &&
      buildingProvenance.landmark.genericOverrideAllowed ?
      createRoofDetailMesh(pts, renderedHeight, baseElevation, bSeed, bt, lodTier) :
      null;
    if (roofDetailMesh) {
      roofDetailMesh.userData.isRoofDetail = true;
      roofDetailMesh.userData.sourceBuildingId = sourceBuildingId;
      roofDetailMesh.userData.terrainAvgElevation = avgElevation;
      roofDetailMesh.userData.structureBaseOffset = structureBaseOffset;
      roofDetailMesh.userData.terrainFoundationRise = terrainFoundationRise;
      roofDetailMesh.userData.buildingSemantics = buildingSemantics;
      roofDetailMesh.userData.structureSemantics = structureSemantics;
      roofDetailMesh.userData.buildingProvenance = buildingProvenance;
      appCtx.addEarthWorldObject(roofDetailMesh);
      appCtx.buildingMeshes.push(roofDetailMesh);
    }

    if (lodTier === 'near') loadMetrics.lod.near += 1;
    else loadMetrics.lod.mid += 1;

    const shouldCreateGroundPatch =
      lodTier === 'near' &&
      buildingSemantics.shouldCreateGroundPatch &&
      typeof appCtx.createBuildingGroundPatch === 'function' &&
      !roadCorridorOverlap &&
      (
        denseUrbanContext ?
          (
            slopeRange >= 0.34 ||
            (footprintArea >= 420 && slopeRange >= 0.26)
          ) :
          (
            slopeRange >= 0.18 ||
            (footprintArea >= 180 && slopeRange >= 0.13)
          )
      );

    if (shouldCreateGroundPatch) {
      const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation, {
        buildingType: bt,
        heightMeters: renderedHeight,
        footprintArea,
        denseUrban: denseUrbanContext && !roadCorridorOverlap,
        roadside: false,
        allowFoundationSkirt: !denseUrbanContext || slopeRange >= 0.38
      });
      const groundPatches = Array.isArray(groundPatchesRaw) ? groundPatchesRaw : groundPatchesRaw ? [groundPatchesRaw] : [];
      groundPatches.forEach((groundPatch) => {
        if (groundPatch.userData?.isGroundApron && suppressGroundApron) {
          appCtx.urbanSurfaceStats.skippedBuildingAprons += 1;
          return;
        }
        groundPatch.userData.landuseFootprint = pts;
        groundPatch.userData.landuseType = 'buildingGround';
        groundPatch.userData.avgElevation = baseElevation;
        groundPatch.userData.terrainAvgElevation = avgElevation;
        groundPatch.userData.alwaysVisible = true;
        groundPatch.visible = true;
        appCtx.addEarthWorldObject(groundPatch);
        appCtx.landuseMeshes.push(groundPatch);
      });
    }
    buildingPhaseMs.roofAndGroundDetail += now() - roofAndGroundStartedAt;
    } finally {
      const endOfWorkChunk =
        (buildingIndex + 1) % yieldEveryBuildings === 0 ||
        buildingIndex + 1 === buildingWays.length;
      if (endOfWorkChunk) {
        const workChunkMs = now() - buildingWorkChunkStartedAt;
        buildingWorkMs += workChunkMs;
        maximumBuildingWorkChunkMs = Math.max(maximumBuildingWorkChunkMs, workChunkMs);
      }
      if (endOfWorkChunk && buildingIndex + 1 < buildingWays.length) {
        buildingYieldCount += 1;
        const yieldStartedAt = now();
        await yieldToMainThread();
        buildingYieldWaitMs += now() - yieldStartedAt;
        buildingWorkChunkStartedAt = now();
      }
    }
  }

  loadMetrics.buildings.geometryChunkSize = yieldEveryBuildings;
  loadMetrics.buildings.geometryYieldCount = buildingYieldCount;
  loadMetrics.buildings.geometryWorkMs = Number(buildingWorkMs.toFixed(2));
  loadMetrics.buildings.geometryYieldWaitMs = Number(buildingYieldWaitMs.toFixed(2));
  loadMetrics.buildings.maximumGeometryWorkChunkMs = Number(maximumBuildingWorkChunkMs.toFixed(2));
  loadMetrics.buildings.geometryPhaseMs = Object.freeze(Object.fromEntries(
    Object.entries(buildingPhaseMs).map(([phase, duration]) => [phase, Number(duration.toFixed(2))])
  ));
  loadMetrics.buildings.waterAreaIndex = waterAreaIndex.snapshot();
  endLoadPhase('buildBuildingGeometry');
  startLoadPhase('batchBuildingGeometry');
  const batchScheduling = { yieldToMainThread };
  const batchedNearCount = appCtx.disableNearBuildingBatching
    ? 0
    : await batchNearLodBuildingMeshes(batchScheduling);
  if (batchedNearCount > 0) loadMetrics.lod.nearBatched = batchedNearCount;
  const batchedMidCount = await batchMidLodBuildingMeshes(batchScheduling);
  if (batchedMidCount > 0) loadMetrics.lod.midBatched = batchedMidCount;
  if (appCtx._lastBuildingBatchStats) {
    loadMetrics.buildingBatching = { ...appCtx._lastBuildingBatchStats };
  }
  endLoadPhase('batchBuildingGeometry');
  return Object.freeze({
    candidateCount: buildingWays.length,
    renderedFeatureCount: Number(loadMetrics.buildingPublication.renderedFeatures || 0),
    yieldCount: buildingYieldCount
  });
}
