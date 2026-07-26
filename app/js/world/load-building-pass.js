import { ctx as appCtx } from "../shared-context.js?v=55";
import { classifyStructureSemantics } from "../structure-semantics.js?v=22";
import {
  buildingSeedFromIdentity,
  inferFallbackBuildingHeightMeters,
  interpretBuildingSemantics
} from "../building-semantics.js?v=4";
import { createMidLodBuildingMesh } from "./load-geometry.js?v=19";
import {
  appendGeometryWithTransform,
  buildMergedGeometry,
  geometryHasFinitePositions
} from "./geometry-batching.js?v=4";
import { createRoofDetailMesh } from "./roof-details.js?v=3";
import {
  createMappedRoofMesh,
  resolveMappedRoof
} from "./mapped-roof-geometry.js?v=2";
import {
  batchMidLodBuildingMeshes,
  batchNearLodBuildingMeshes
} from "./building-batching.js?v=4";

export function buildBuildingGeometryPass(options = {}) {
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
    inferredFootprints: 0
  };
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

  showLoad(`Loading buildings... (${buildingWays.length})`);
  startLoadPhase('buildBuildingGeometry');

  const roadBuildingCellSize = 120;
  const buildingRoadRadiusCells = useRdtBudgeting ? (rdtLoadComplexity >= 6 ? 5 : 4) : 3;
  const roadCoverageCells = new Set();
  const roadCoreCellSize = 6;
  const roadCoreCells = new Set();
  const roadCorridorCellSize = 4;
  const roadCorridorCells = new Set();
  const toRoadCoreCellKey = (x, z) => `${Math.floor(x / roadCoreCellSize)},${Math.floor(z / roadCoreCellSize)}`;
  const toRoadCorridorCellKey = (x, z) => `${Math.floor(x / roadCorridorCellSize)},${Math.floor(z / roadCorridorCellSize)}`;
  const markRoadCoreCell = (x, z, radiusCells) => {
    const cx = Math.floor(x / roadCoreCellSize);
    const cz = Math.floor(z / roadCoreCellSize);
    const r = Math.max(0, radiusCells | 0);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) roadCoreCells.add(`${cx + dx},${cz + dz}`);
    }
  };
  const markRoadCorridorCell = (x, z, radiusCells) => {
    const cx = Math.floor(x / roadCorridorCellSize);
    const cz = Math.floor(z / roadCorridorCellSize);
    const r = Math.max(0, radiusCells | 0);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) roadCorridorCells.add(`${cx + dx},${cz + dz}`);
    }
  };
  const markRoadCorridorSegment = (p0, p1, radiusCells) => {
    if (!p0 || !p1) return;
    const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const steps = Math.max(1, Math.ceil(segLen / Math.max(1.75, roadCorridorCellSize * 0.75)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      markRoadCorridorCell(
        p0.x + (p1.x - p0.x) * t,
        p0.z + (p1.z - p0.z) * t,
        radiusCells
      );
    }
  };
  const pointOnRoadCore = (x, z) => roadCoreCells.has(toRoadCoreCellKey(x, z));
  const pointOnRoadCorridor = (x, z) => roadCorridorCells.has(toRoadCorridorCellKey(x, z));
  const expandFootprintForGroundApron = (pts) => {
    if (!pts || pts.length < 3) return pts || [];
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < pts.length; i++) {
      sumX += pts[i].x;
      sumZ += pts[i].z;
    }
    const cx = sumX / pts.length;
    const cz = sumZ / pts.length;
    const maxRadius = pts.reduce((best, p) => Math.max(best, Math.hypot(p.x - cx, p.z - cz)), 0);
    const apronOutset = Math.min(1.5, Math.max(0.65, maxRadius * 0.08));
    return pts.map((p) => {
      const dx = p.x - cx;
      const dz = p.z - cz;
      const len = Math.hypot(dx, dz);
      if (!(len > 1e-4)) return { x: p.x, z: p.z };
      return { x: p.x + dx / len * apronOutset, z: p.z + dz / len * apronOutset };
    });
  };
  const sampleFootprintCoverage = (pts, tester) => {
    if (!pts || pts.length < 3 || typeof tester !== 'function') {
      return { total: 0, inside: 0, centroidInside: false };
    }
    let sumX = 0;
    let sumZ = 0;
    const samples = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      sumX += p.x;
      sumZ += p.z;
      samples.push(p);
      samples.push({ x: (p.x + n.x) * 0.5, z: (p.z + n.z) * 0.5 });
      samples.push({ x: p.x + (n.x - p.x) * 0.25, z: p.z + (n.z - p.z) * 0.25 });
      samples.push({ x: p.x + (n.x - p.x) * 0.75, z: p.z + (n.z - p.z) * 0.75 });
    }
    const centroid = { x: sumX / pts.length, z: sumZ / pts.length };
    samples.push(centroid);
    let inside = 0;
    for (let i = 0; i < samples.length; i++) {
      if (tester(samples[i].x, samples[i].z)) inside += 1;
    }
    return { total: samples.length, inside, centroidInside: tester(centroid.x, centroid.z) };
  };
  const overlapsRoadCore = (stats) => {
    if (!stats || stats.total <= 0) return false;
    const overlapRatio = stats.inside / stats.total;
    return stats.inside >= Math.max(4, Math.ceil(stats.total * 0.58)) && overlapRatio >= 0.55;
  };
  const overlapsRoadCorridor = (stats) => {
    if (!stats || stats.total <= 0) return false;
    const overlapRatio = stats.inside / stats.total;
    return stats.centroidInside || (stats.inside >= Math.max(3, Math.ceil(stats.total * 0.24)) && overlapRatio >= 0.18);
  };
  const insetFootprintForUpperMass = (pts, insetMeters) => {
    if (!Array.isArray(pts) || pts.length < 3 || !Number.isFinite(insetMeters) || insetMeters <= 0) return null;
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < pts.length; i++) {
      sumX += pts[i].x;
      sumZ += pts[i].z;
    }
    const cx = sumX / pts.length;
    const cz = sumZ / pts.length;
    const scaled = pts.map((point) => {
      const dx = cx - point.x;
      const dz = cz - point.z;
      const dist = Math.hypot(dx, dz) || 1;
      const push = Math.min(insetMeters, dist * 0.3);
      return {
        x: point.x + dx / dist * push,
        z: point.z + dz / dist * push
      };
    });
    const cleaned = sanitizeWorldFootprintPoints(scaled, Math.max(12, featureMinPolygonArea), buildingGeometryGuards);
    if (cleaned.length < 3) return null;
    const originalArea = Math.abs(signedPolygonAreaXZ(pts));
    const nextArea = Math.abs(signedPolygonAreaXZ(cleaned));
    if (!(nextArea > Math.max(18, originalArea * 0.32) && nextArea < originalArea * 0.94)) return null;
    return cleaned;
  };
  const shouldUseTieredMassing = (buildingType, height, footprintArea, footprintWidth, footprintDepth, denseUrbanContext, lodTier, buildingSemantics, tags = {}) => {
    if (lodTier !== 'near') return false;
    if (buildingSemantics?.partKind && buildingSemantics.partKind !== 'full') return false;
    const type = String(buildingType || '').toLowerCase();
    if (['industrial', 'warehouse', 'church', 'cathedral', 'stadium', 'school', 'hospital'].includes(type)) return false;
    const minSpan = Math.min(Math.max(0, footprintWidth || 0), Math.max(0, footprintDepth || 0));
    if (height < 11 || height > 34) return false;
    if (footprintArea < 720 || minSpan < 18) return false;
    if (!denseUrbanContext && footprintArea < 1100) return false;
    return ['yes', 'apartments', 'commercial', 'office', 'retail', 'residential', 'hotel'].includes(type);
  };
  const createTieredBuildingGeometry = (pts, height, options = {}) => {
    const footprintWidth = Number(options.footprintWidth || 0);
    const footprintDepth = Number(options.footprintDepth || 0);
    const footprintArea = Number(options.footprintArea || 0);
    const minSpan = Math.min(Math.max(0, footprintWidth), Math.max(0, footprintDepth));
    const insetMeters = Math.max(1.25, Math.min(4.6, minSpan * 0.085));
    const upperFootprint = insetFootprintForUpperMass(pts, insetMeters);
    if (!upperFootprint) return null;

    const podiumShare =
      footprintArea >= 1800 ? 0.3 :
      footprintArea >= 1100 ? 0.36 :
      0.42;
    const podiumHeight = Math.max(5.8, Math.min(15, height * podiumShare));
    const upperHeight = height - podiumHeight;
    if (upperHeight < 4.2) return null;

    const batch = { positions: [], normals: [], uvs: [], indices: [] };
    const appendExtrusion = (footprint, extrusionHeight, translateY = 0) => {
      const shape = new THREE.Shape();
      footprint.forEach((p, i) => {
        if (i === 0) shape.moveTo(p.x, -p.z);
        else shape.lineTo(p.x, -p.z);
      });
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, { depth: extrusionHeight, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      if (!geometryHasFinitePositions(geo)) {
        geo.dispose();
        return false;
      }
      const appended = appendGeometryWithTransform(batch, geo, new THREE.Matrix4().makeTranslation(0, translateY, 0));
      geo.dispose();
      return appended > 0;
    };

    if (!appendExtrusion(pts, podiumHeight, 0)) return null;
    if (!appendExtrusion(upperFootprint, upperHeight, podiumHeight)) return null;
    const merged = buildMergedGeometry(batch);
    if (!merged || !geometryHasFinitePositions(merged)) return null;
    return {
      geometry: merged,
      podiumHeight,
      upperHeight,
      upperFootprint,
      insetMeters
    };
  };

  appCtx.roads.forEach((rd) => {
    if (!rd || !rd.pts) return;
    const roadHalfWidth = Number.isFinite(rd.width) ? rd.width * 0.5 : 4;
    const roadCoreRadius = Math.max(0.8, Math.max(0, roadHalfWidth * 0.32 - 0.25));
    const roadCoreRadiusCells = Math.max(0, Math.floor((roadCoreRadius + 0.25) / roadCoreCellSize));
    const corridorRadius = Math.max(1.6, roadHalfWidth + 2.4);
    const corridorRadiusCells = Math.max(0, Math.ceil((corridorRadius + 0.25) / roadCorridorCellSize));
    for (let i = 0; i < rd.pts.length; i++) {
      const p = rd.pts[i];
      const cx = Math.floor(p.x / roadBuildingCellSize);
      const cz = Math.floor(p.z / roadBuildingCellSize);
      roadCoverageCells.add(`${cx},${cz}`);
      markRoadCoreCell(p.x, p.z, roadCoreRadiusCells);
      markRoadCorridorCell(p.x, p.z, corridorRadiusCells);
      if (i < rd.pts.length - 1) {
        markRoadCorridorSegment(p, rd.pts[i + 1], corridorRadiusCells);
      }
    }
  });

  const isBuildingNearLoadedRoad = (pts) => {
    if (useRdtBudgeting) return true;
    if (!pts || pts.length === 0 || roadCoverageCells.size === 0) return true;
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < pts.length; i++) {
      sumX += pts[i].x;
      sumZ += pts[i].z;
    }
    const cx = Math.floor(sumX / pts.length / roadBuildingCellSize);
    const cz = Math.floor(sumZ / pts.length / roadBuildingCellSize);
    for (let dx = -buildingRoadRadiusCells; dx <= buildingRoadRadiusCells; dx++) {
      for (let dz = -buildingRoadRadiusCells; dz <= buildingRoadRadiusCells; dz++) {
        if (roadCoverageCells.has(`${cx + dx},${cz + dz}`)) return true;
      }
    }
    return false;
  };

  const lodNearDist = lodThresholds.near;
  const buildingDetailDist = Math.min(lodNearDist, 300);
  let unbatchedNearBuildings = 0;
  let unbatchedMidBuildings = 0;
  buildingWays.forEach((way) => {
    const compactCoordinates = way?._coordinates;
    const rawPts = compactCoordinates?.length >= 6
      ? Array.from({ length: Math.floor(compactCoordinates.length / 2) }, (_, index) =>
        appCtx.geoToWorld(compactCoordinates[index * 2 + 1], compactCoordinates[index * 2]))
      : way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
    way._coordinates = null;
    const pts = sanitizeWorldFootprintPoints(rawPts, featureMinPolygonArea, buildingGeometryGuards);
    if (pts.length < 3 || !isBuildingNearLoadedRoad(pts)) return;
    const roadCoreStats = sampleFootprintCoverage(pts, pointOnRoadCore);
    if (overlapsRoadCore(roadCoreStats)) {
      loadMetrics.buildingsSkippedRoadOverlap = (loadMetrics.buildingsSkippedRoadOverlap || 0) + 1;
      return;
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
    const footprintWidth = Math.max(0, maxFootprintX - minFootprintX);
    const footprintDepth = Math.max(0, maxFootprintZ - minFootprintZ);
    const footprintArea = Math.abs(signedPolygonAreaXZ(pts));
    const centerDist = Math.hypot(centerX, centerZ);
    let lodTier = centerDist <= buildingDetailDist ? 'near' : centerDist <= lodThresholds.farVisible ? 'mid' : 'far';

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
    const buildingLevels = Number.parseFloat(way.tags['building:levels']);
    const resolvedLevels = Number.isFinite(buildingLevels) ?
      Math.max(1, Math.round(buildingLevels)) :
      Math.max(1, Math.min(120, Math.round(height / Math.max(2.8, buildingSemantics.levelHeightMeters || 3.2))));
    const levelsSource = Number.isFinite(buildingLevels) ?
      'mapped_levels' :
      buildingSemantics.heightSource === 'explicit_height' ? 'estimated_from_mapped_height' : 'estimated_from_inferred_height';
    const roofShape = String(way.tags['roof:shape'] || '').trim().toLowerCase();
    const mappedFacadeColor = String(way.tags['building:colour'] || way.tags['building:color'] || '').trim();
    const hasMappedDimension =
      buildingSemantics.heightSource === 'explicit_height' ||
      buildingSemantics.heightSource === 'levels';
    const skylinePriority = hasMappedDimension && (
      height >= 70 ||
      (height >= 40 && !!way.tags.name) ||
      (height >= 55 && !!way.tags['building:part']) ||
      ['tower', 'skyscraper'].includes(String(bt).toLowerCase())
    );
    if (lodTier === 'far' && skylinePriority && centerDist <= lodThresholds.farVisible + 1200) {
      lodTier = 'mid';
    }
    if (lodTier === 'far') {
      loadMetrics.lod.farSkipped += 1;
      return;
    }
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
    if (way.tags._geometrySource === 'inferred_road_frontage') {
      loadMetrics.buildingDimensions.inferredFootprints += 1;
    }
    const sourceBuildingId = String(
      way.tags?._sourceFeatureId ||
      way.id ||
      `osm-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`
    );
    const roomSourceId = appCtx.normalizeRoomBaseFeatureId?.({
      sourceBuildingId,
      overtureBuildingId: way.tags?._overtureBuildingId || ''
    }) || sourceBuildingId;
    if (appCtx.roomBaseSuppressionIds?.has?.(roomSourceId)) return;
    const apronFootprint = expandFootprintForGroundApron(pts);
    const roadCorridorStats = sampleFootprintCoverage(apronFootprint, pointOnRoadCorridor);
    const roadCorridorOverlap = overlapsRoadCorridor(roadCorridorStats);
    const denseUrbanContext =
      roadCorridorOverlap ||
      footprintArea >= 260 ||
      height >= 24 ||
      bt === 'commercial' ||
      bt === 'retail' ||
      bt === 'office' ||
      bt === 'apartments' ||
      bt === 'hotel';
    const roadCoreConflict =
      roadCoreStats.centroidInside ||
      (roadCoreStats.total > 0 && roadCoreStats.inside >= Math.max(3, Math.ceil(roadCoreStats.total * 0.22)));
    const suppressGroundApron =
      structureSemantics.terrainMode === 'elevated' ||
      roadCoreConflict;
    const colliderDetail = useRdtBudgeting && lodTier !== 'near' && !roadCoreConflict ? 'bbox' : 'full';

    let avgElevation = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    pts.forEach((p) => {
      const h = appCtx.SurfaceQuery?.terrainAt?.(p.x, p.z)?.position?.y ??
        appCtx.terrainMeshHeightAt?.(p.x, p.z) ??
        appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
      avgElevation += h;
      if (h < minElevation) minElevation = h;
      if (h > maxElevation) maxElevation = h;
    });
    avgElevation /= pts.length;
    const slopeRange = Number.isFinite(minElevation) && Number.isFinite(maxElevation) ? maxElevation - minElevation : 0;
    const baseElevationRaw = slopeRange >= 0.06 ? minElevation + 0.03 : avgElevation;
    const structureBaseOffset = Number.isFinite(buildingSemantics.baseOffsetMeters) ? buildingSemantics.baseOffsetMeters : 0;
    const baseElevation = baseElevationRaw + structureBaseOffset;
    const mappedRoof = resolveMappedRoof(way.tags, height, buildingSemantics, pts);
    const bodyHeight = mappedRoof ? Math.max(0.05, mappedRoof.wallHeight) : height;
    const fallbackBaseColor = pickBuildingBaseColor(bt, bSeed ^ Math.floor(br2 * 0xffff));
    const baseColor = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(mappedFacadeColor) ?
      new THREE.Color(mappedFacadeColor).getHex() :
      fallbackBaseColor;
    let mesh = null;

    if (lodTier === 'mid') {
      mesh = createMidLodBuildingMesh(pts, bodyHeight, baseElevation, {
        colorHex: baseColor,
        buildingSeed: bSeed,
        buildingType: bt,
        denseUrban: denseUrbanContext,
        facadeMaterial: way.tags['building:material'] || '',
        buildingSemantics
      });
    } else {
      let geo = null;
      let tieredMassing = null;
      if (shouldUseTieredMassing(bt, height, footprintArea, footprintWidth, footprintDepth, denseUrbanContext, lodTier, buildingSemantics, way.tags)) {
        tieredMassing = createTieredBuildingGeometry(pts, bodyHeight, {
          footprintArea,
          footprintWidth,
          footprintDepth
        });
      }
      if (tieredMassing?.geometry) {
        geo = tieredMassing.geometry;
      } else {
        const shape = new THREE.Shape();
        pts.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, -p.z);
          else shape.lineTo(p.x, -p.z);
        });
        shape.closePath();

        geo = new THREE.ExtrudeGeometry(shape, { depth: bodyHeight, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
      }
      if (!geometryHasFinitePositions(geo)) {
        geo.dispose();
        return;
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
      if (tieredMassing) {
        mesh.userData.massingStyle = 'tiered_podium';
        mesh.userData.podiumHeight = tieredMassing.podiumHeight;
        mesh.userData.upperHeight = tieredMassing.upperHeight;
        mesh.userData.massingInsetMeters = tieredMassing.insetMeters;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    if (!mesh) return;
    mesh.userData.terrainAvgElevation = avgElevation;
    mesh.userData.lodTier = lodTier;
    mesh.userData.sourceBuildingId = sourceBuildingId;
    mesh.userData.buildingName = way.tags.name || '';
    mesh.userData.buildingType = bt;
    mesh.userData.baseColorHex = baseColor;
    mesh.userData.buildingSeed = bSeed;
    mesh.userData.heightMeters = height;
    mesh.userData.bodyHeightMeters = bodyHeight;
    mesh.userData.heightSource = buildingSemantics.heightSource;
    mesh.userData.levels = resolvedLevels;
    mesh.userData.levelsSource = levelsSource;
    mesh.userData.roofShape = roofShape;
    mesh.userData.facadeMaterial = way.tags['building:material'] || '';
    mesh.userData.roofMaterial = way.tags['roof:material'] || '';
    mesh.userData.geometrySource = way.tags._geometrySource || 'osm';
    mesh.userData.inferenceBasis = way.tags._inferenceBasis || '';
    mesh.userData.overtureBuildingId = way.tags._overtureBuildingId || '';
    mesh.userData.overtureParentBuildingId = way.tags._overtureParentBuildingId || '';
    mesh.userData.buildingMetadataSourceId = way.tags._buildingMetadataSourceId || '';
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

    const colliderRef = registerBuildingCollision(pts, height, {
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
      roofShape,
      roofHeight: mappedRoof?.roofHeight,
      roofHeightSource: mappedRoof?.roofHeightSource || null,
      geometrySource: way.tags._geometrySource || 'osm',
      inferenceBasis: way.tags._inferenceBasis || '',
      overtureBuildingId: way.tags._overtureBuildingId || '',
      overtureParentBuildingId: way.tags._overtureParentBuildingId || '',
      metadataSourceId: way.tags._buildingMetadataSourceId || '',
      minLevels: Number.isFinite(buildingSemantics.buildingMinLevel) ? buildingSemantics.buildingMinLevel : null,
      baseY: baseElevation,
      buildingSemantics,
      structureSemantics
    });
    if (colliderDetail === 'full') loadMetrics.colliders.full += 1;
    else loadMetrics.colliders.simplified += 1;
    if (colliderRef) {
      colliderRef.baseY = baseElevation;
      colliderRef.minY = baseElevation;
      colliderRef.maxY = baseElevation + height;
    }

    appCtx.scene.add(mesh);
    appCtx.buildingMeshes.push(mesh);

    const mappedRoofMesh = createMappedRoofMesh(pts, baseElevation, mappedRoof?.wallHeight || 0, mappedRoof, way.tags);
    if (mappedRoofMesh) {
      mappedRoofMesh.userData.sourceBuildingId = sourceBuildingId;
      mappedRoofMesh.userData.buildingFootprint = pts;
      mappedRoofMesh.userData.geometrySource = way.tags._geometrySource || 'osm';
      mappedRoofMesh.userData.lodTier = lodTier;
      appCtx.scene.add(mappedRoofMesh);
      appCtx.buildingMeshes.push(mappedRoofMesh);
    }

    const roofDetailMesh = !mappedRoofMesh && buildingSemantics.shouldCreateRoofDetail ?
      createRoofDetailMesh(pts, height, baseElevation, bSeed, bt, lodTier) :
      null;
    if (roofDetailMesh) {
      roofDetailMesh.userData.isRoofDetail = true;
      roofDetailMesh.userData.sourceBuildingId = sourceBuildingId;
      roofDetailMesh.userData.terrainAvgElevation = avgElevation;
      roofDetailMesh.userData.structureBaseOffset = structureBaseOffset;
      roofDetailMesh.userData.buildingSemantics = buildingSemantics;
      roofDetailMesh.userData.structureSemantics = structureSemantics;
      appCtx.scene.add(roofDetailMesh);
      appCtx.buildingMeshes.push(roofDetailMesh);
    }

    if (lodTier === 'near') {
      loadMetrics.lod.near += 1;
      unbatchedNearBuildings += 1;
    } else {
      loadMetrics.lod.mid += 1;
    }

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
        heightMeters: height,
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
        appCtx.scene.add(groundPatch);
        appCtx.landuseMeshes.push(groundPatch);
      });
    }
    if (lodTier === 'mid') {
      unbatchedMidBuildings += 1;
      if (unbatchedMidBuildings >= 640) {
        batchMidLodBuildingMeshes();
        unbatchedMidBuildings = 0;
      }
    } else if (!appCtx.disableNearBuildingBatching && unbatchedNearBuildings >= 480) {
      batchNearLodBuildingMeshes();
      unbatchedNearBuildings = 0;
    }
  });

  endLoadPhase('buildBuildingGeometry');
  startLoadPhase('batchBuildingGeometry');
  const batchedNearCount = appCtx.disableNearBuildingBatching ? 0 : batchNearLodBuildingMeshes();
  if (batchedNearCount > 0) loadMetrics.lod.nearBatched = batchedNearCount;
  const batchedMidCount = batchMidLodBuildingMeshes();
  if (batchedMidCount > 0) loadMetrics.lod.midBatched = batchedMidCount;
  if (appCtx._lastBuildingBatchStats) {
    loadMetrics.buildingBatching = { ...appCtx._lastBuildingBatchStats };
  }
  endLoadPhase('batchBuildingGeometry');
}
