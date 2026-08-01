import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  appendUpwardRibbonGeometry,
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials
} from "../road-render.js?v=2";
import {
  buildFeatureRibbonEdges,
  roadSkirtDepth,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=30";
import { registerBridgeGuardrails } from "./bridge-guardrails.js?v=9";
import { detectRoadIntersections } from "../terrain/intersections.js?v=1";
import { appendRoadJunctionGeometry } from "../terrain/road-junctions.js?v=1";
import {
  normalizeTransportSource
} from "./compiler/transport-source-normalizer.js?v=1";

const ROAD_SURFACE_BIAS = 0.08;

export function buildRoadGeometryPass(options = {}) {
  const roadWays = Array.isArray(options.roadWays) ? options.roadWays : [];
  const nodes = options.nodes || {};
  const geometryGuards = options.geometryGuards || {};
  const tileBudgetCfg = options.tileBudgetCfg || {};
  const loadMetrics = options.loadMetrics || {};
  const perfModeNow = options.perfModeNow || 'rdt';
  const useRdtBudgeting = options.useRdtBudgeting === true;
  const startLoadPhase = typeof options.startLoadPhase === 'function' ? options.startLoadPhase : () => {};
  const endLoadPhase = typeof options.endLoadPhase === 'function' ? options.endLoadPhase : () => {};
  const showLoad = typeof options.showLoad === 'function' ? options.showLoad : () => {};
  const classifyStructureSemantics = options.classifyStructureSemantics;
  const cloneStructureSemantics = options.cloneStructureSemantics;
  const sanitizeWorldPathPoints = options.sanitizeWorldPathPoints;
  const decimateRoadCenterlineByDepth = options.decimateRoadCenterlineByDepth;
  const wayCenterLatLon = options.wayCenterLatLon;
  const featureTileKeyForLatLon = options.featureTileKeyForLatLon;
  const rdtDepthForFeatureTile = options.rdtDepthForFeatureTile;
  const getRoadSubdivisionStep = options.getRoadSubdivisionStep;
  const polylineBounds = options.polylineBounds;
  const worldBaseTerrainY = options.worldBaseTerrainY;
  const appendIndexedGeometry = options.appendIndexedGeometry;

  showLoad(`Loading roads... (${roadWays.length})`);
  startLoadPhase('buildRoadGeometry');

  const roadMainBatchVerts = [];
  const roadMainBatchIdx = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadMarkBatchVerts = [];
  const roadMarkBatchIdx = [];

  const {
    roadMainMaterial,
    roadSkirtMaterial,
    roadMarkMaterial
  } = createRoadSurfaceMaterials({
    asphaltTex: appCtx.asphaltTex,
    asphaltNormal: appCtx.asphaltNormal,
    asphaltRoughness: appCtx.asphaltRoughness,
    includeMarkings: true
  });

  roadWays.forEach((way) => {
    const rawNodeRecords = way.nodes
      .map((id) => ({ id: String(id), node: nodes[id] }))
      .filter((entry) => entry.node);
    const rawPts = rawNodeRecords.map((entry) =>
      appCtx.geoToWorld(entry.node.lat, entry.node.lon)
    );
    const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
    if (pts.length < 2) return;

    const type = way.tags?.highway || 'residential';
    const structureSemantics = classifyStructureSemantics(way.tags || {}, {
      featureKind: 'road',
      subtype: type
    });
    const sourceFeatureId = String(way.tags?._sourceFeatureId || way.sourceId || way.id || '');
    const transportRecord = normalizeTransportSource({
      sourceId: sourceFeatureId,
      id: way.id,
      type: 'way',
      providerNamespace: sourceFeatureId.startsWith('shortbread:')
        ? 'shortbread'
        : 'osm',
      completeness: sourceFeatureId.startsWith('shortbread:')
        ? 'generalized'
        : 'lossless',
      geometryProvenance: sourceFeatureId.startsWith('shortbread:')
        ? 'shortbread-v1'
        : 'osm-overpass'
    }, way.tags || {});
    const width = transportRecord.crossSection.widthMeters;
    const limit = type.includes('motorway') ? 65 : type.includes('trunk') ? 55 : type.includes('primary') ? 40 : type.includes('secondary') ? 35 : 25;
    const name = way.tags?.name || type.charAt(0).toUpperCase() + type.slice(1);
    const centerLatLon = wayCenterLatLon(way, nodes);
    const roadTileKey = centerLatLon ? featureTileKeyForLatLon(centerLatLon.lat, centerLatLon.lon, tileBudgetCfg.tileDegrees) : null;
    const roadTileDepth = useRdtBudgeting && roadTileKey ? rdtDepthForFeatureTile(roadTileKey, tileBudgetCfg.tileDegrees) : 0;
    const roadSubdivideStepBase = getRoadSubdivisionStep(type, roadTileDepth, perfModeNow);
    const roadSubdivideStep =
      structureSemantics?.terrainMode && structureSemantics.terrainMode !== 'at_grade' ? Math.min(roadSubdivideStepBase, 0.55) :
      structureSemantics?.rampCandidate ? Math.min(roadSubdivideStepBase, 0.65) :
      roadSubdivideStepBase;
    const decimatedRoadPts = decimateRoadCenterlineByDepth(pts, type, roadTileDepth, perfModeNow);
    if (decimatedRoadPts.length < 2) return;

    const roadFeature = {
      pts: decimatedRoadPts,
      width,
      limit,
      name,
      sourceFeatureId: transportRecord.identity,
      sourceNodeIds: Object.freeze((way.nodes || []).map(String)),
      sourceTopologyNodes: Object.freeze(rawNodeRecords.map((entry, index) =>
        Object.freeze({
          id: entry.id,
          x: rawPts[index].x,
          z: rawPts[index].z
        })
      )),
      transportRecord,
      type,
      surfaceTag: String(way.tags?.surface || '').toLowerCase(),
      litTag: String(way.tags?.lit || '').toLowerCase(),
      sidewalkHint: String(way.tags?.sidewalk || '').toLowerCase(),
      networkKind: 'road',
      walkable: transportRecord.access.pedestrian !== 'prohibited',
      driveable: transportRecord.safeForDriving,
      structureTags: transportRecord.rawTags,
      structureSemantics,
      baseStructureSemantics: cloneStructureSemantics(structureSemantics),
      surfaceBias: ROAD_SURFACE_BIAS,
      lodDepth: roadTileDepth,
      subdivideMaxDist: roadSubdivideStep,
      bounds: polylineBounds(decimatedRoadPts, width * 0.5 + 18)
    };
    appCtx.roads.push(roadFeature);
    updateFeatureSurfaceProfile(roadFeature, worldBaseTerrainY, { surfaceBias: ROAD_SURFACE_BIAS });
    if (roadFeature.structureSemantics?.terrainMode === 'elevated') {
      registerBridgeGuardrails(roadFeature);
    }

    const hw = width / 2;
    const subdPts = typeof appCtx.subdivideRoadPoints === 'function' ?
      appCtx.subdivideRoadPoints(decimatedRoadPts, roadSubdivideStep) :
      decimatedRoadPts;
    loadMetrics.roads.sourcePoints += pts.length;
    loadMetrics.roads.decimatedPoints += decimatedRoadPts.length;
    loadMetrics.roads.subdividedPoints += subdPts.length;

    const verts = [];
    const indices = [];
    const { leftEdge, rightEdge } = buildFeatureRibbonEdges(roadFeature, subdPts, hw, worldBaseTerrainY, {
      surfaceBias: ROAD_SURFACE_BIAS
    });
    appendUpwardRibbonGeometry(leftEdge, rightEdge, verts, indices);
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
    loadMetrics.roads.vertices += verts.length / 3;

    if (typeof appCtx.buildRoadSkirts === 'function' && shouldRenderRoadSkirts(roadFeature)) {
      const skirtDepth = roadSkirtDepth(roadFeature);
      const skirtData = appCtx.buildRoadSkirts(
        leftEdge,
        rightEdge,
        skirtDepth,
        roadFeature.structureSemantics?.terrainMode === 'at_grade' ? worldBaseTerrainY : null
      );
      if (skirtData.verts.length > 0) {
        appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
        loadMetrics.roads.vertices += skirtData.verts.length / 3;
      }
    }

    if (
      roadFeature.structureSemantics?.terrainMode === 'at_grade' &&
      width >= 8.4 &&
      (type.includes('motorway') || type.includes('trunk') || type.includes('primary'))
    ) {
      const markVerts = [];
      const markIdx = [];
      const mw = 0.15;
      const dashLen = 6;
      const gapLen = 6;
      let dist = 0;
      for (let i = 0; i < decimatedRoadPts.length - 1; i++) {
        const p1 = decimatedRoadPts[i];
        const p2 = decimatedRoadPts[i + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const dx = (p2.x - p1.x) / segLen;
        const dz = (p2.z - p1.z) / segLen;
        const nx = -dz;
        const nz = dx;
        let segDist = 0;
        while (segDist < segLen) {
          if (Math.floor((dist + segDist) / (dashLen + gapLen)) % 2 === 0) {
            const x = p1.x + dx * segDist;
            const z = p1.z + dz * segDist;
            const len = Math.min(dashLen, segLen - segDist);
            const endX = x + dx * len;
            const endZ = z + dz * len;
            const y = sampleFeatureSurfaceY(roadFeature, x, z) + 0.01;
            const endY = sampleFeatureSurfaceY(roadFeature, endX, endZ) + 0.01;
            if (!Number.isFinite(y) || !Number.isFinite(endY)) {
              segDist += dashLen + gapLen;
              continue;
            }
            const vi = markVerts.length / 3;
            markVerts.push(
              x + nx * mw, y, z + nz * mw,
              x - nx * mw, y, z - nz * mw,
              endX + nx * mw, endY, endZ + nz * mw,
              endX - nx * mw, endY, endZ - nz * mw
            );
            markIdx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
          }
          segDist += dashLen + gapLen;
        }
        dist += segLen;
      }
      if (markVerts.length > 0) {
        appendIndexedGeometry(roadMarkBatchVerts, roadMarkBatchIdx, markVerts, markIdx);
        loadMetrics.roads.vertices += markVerts.length / 3;
      }
    }
  });

  const intersections = detectRoadIntersections(appCtx.roads);
  const junctionStats = appendRoadJunctionGeometry({
    intersections,
    roads: appCtx.roads,
    verts: roadMainBatchVerts,
    indices: roadMainBatchIdx
  });

  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadMainBatchVerts,
    indices: roadMainBatchIdx,
    material: roadMainMaterial,
    renderOrder: 2,
    userData: { isRoadBatch: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadSkirtBatchVerts,
    indices: roadSkirtBatchIdx,
    material: roadSkirtMaterial,
    renderOrder: 1,
    userData: { isRoadBatch: true, isRoadSkirt: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadMarkBatchVerts,
    indices: roadMarkBatchIdx,
    material: roadMarkMaterial,
    renderOrder: 3,
    userData: { isRoadBatch: true, isRoadMarking: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });

  appCtx.transportSurfacePublication = Object.freeze({
    authority: 'compiled_transport_surface',
    transportGraphId: appCtx.transportNetworkModel?.id || null,
    roadCount: appCtx.roads.length,
    meshCount: appCtx.roadMeshes.length,
    intersectionCount: junctionStats.count,
    topologyIntersectionCount: intersections.filter((intersection) =>
      !intersection?.hasGradeSeparatedRoad
    ).length,
    compiledSampleCount: appCtx.roads.reduce((total, road) =>
      total + Number(road?.transportSurfaceModel?.distances?.length || 0), 0),
    vertices:
      roadMainBatchVerts.length / 3 +
      roadSkirtBatchVerts.length / 3 +
      roadMarkBatchVerts.length / 3,
    triangles:
      roadMainBatchIdx.length / 3 +
      roadSkirtBatchIdx.length / 3 +
      roadMarkBatchIdx.length / 3,
    worldLoadSequence: appCtx._worldLoadSequence || 0
  });

  endLoadPhase('buildRoadGeometry');
}
