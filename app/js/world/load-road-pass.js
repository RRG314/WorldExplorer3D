import { ctx as appCtx } from "../shared-context.js?v=55";
import { updateFeatureSurfaceProfile } from "../structure-semantics.js?v=46";
// Installs the final-publication guardrail owner. Guardrails are compiled once
// after the complete transport graph and accepted terrain are ready.
import "./bridge-guardrails.js?v=13";
import { normalizeTransportSource } from "./compiler/transport-source-normalizer.js?v=3";
import { yieldToMainThread as defaultYieldToMainThread } from "./cooperative-scheduling.js?v=1";

const ROAD_SURFACE_BIAS = 0.18;

// This pass owns transport feature compilation only. Visual publication is
// intentionally deferred until accepted terrain and structure profiles are
// ready, when the final terrain authority creates the sole road mesh set.
export async function buildRoadGeometryPass(options = {}) {
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
  const yieldEveryRoads = Math.max(1, Math.floor(Number(options.yieldEveryRoads) || 32));
  const yieldToMainThread = typeof options.yieldToMainThread === 'function'
    ? options.yieldToMainThread
    : defaultYieldToMainThread;

  showLoad(`Loading roads... (${roadWays.length})`);
  startLoadPhase('buildRoadGeometry');

  let yieldCount = 0;
  const diagnostics = {
    rejectedMissingNodes: 0,
    rejectedByGeometryGuards: 0,
    maximumSourceRadius: 0,
    maximumPublishedRadius: 0
  };
  for (let roadIndex = 0; roadIndex < roadWays.length; roadIndex += 1) {
    const way = roadWays[roadIndex];
    try {
    const rawNodeRecords = way.nodes
      .map((id) => ({ id: String(id), node: nodes[id] }))
      .filter((entry) => entry.node);
    const rawPts = rawNodeRecords.map((entry) =>
      appCtx.geoToWorld(entry.node.lat, entry.node.lon)
    );
    if (rawPts.length < 2) {
      diagnostics.rejectedMissingNodes += 1;
      continue;
    }
    for (const point of rawPts) {
      diagnostics.maximumSourceRadius = Math.max(
        diagnostics.maximumSourceRadius,
        Math.hypot(Number(point?.x) || 0, Number(point?.z) || 0)
      );
    }
    const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
    if (pts.length < 2) {
      diagnostics.rejectedByGeometryGuards += 1;
      continue;
    }
    for (const point of pts) {
      diagnostics.maximumPublishedRadius = Math.max(
        diagnostics.maximumPublishedRadius,
        Math.hypot(Number(point?.x) || 0, Number(point?.z) || 0)
      );
    }

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
    const fixedRegionalRoad = way.tags?._regionalContext === 'fixed-location';
    const roadSubdivideStepBase = fixedRegionalRoad
      ? Math.max(20, getRoadSubdivisionStep(type, roadTileDepth, perfModeNow))
      : getRoadSubdivisionStep(type, roadTileDepth, perfModeNow);
    const engineeredRegionalStep = fixedRegionalRoad
      ? 5
      : 0.55;
    const regionalRampStep = fixedRegionalRoad ? 4 : 0.65;
    const roadSubdivideStep =
      structureSemantics?.terrainMode && structureSemantics.terrainMode !== 'at_grade'
        ? Math.min(roadSubdivideStepBase, engineeredRegionalStep)
        : structureSemantics?.rampCandidate
          ? Math.min(roadSubdivideStepBase, regionalRampStep)
          : roadSubdivideStepBase;
    const decimatedRoadPts = decimateRoadCenterlineByDepth(pts, type, roadTileDepth, perfModeNow);
    if (decimatedRoadPts.length < 2) continue;

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
      fixedRegionalContext: fixedRegionalRoad,
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
    loadMetrics.roads.sourcePoints += pts.length;
    loadMetrics.roads.decimatedPoints += decimatedRoadPts.length;
    } finally {
      if ((roadIndex + 1) % yieldEveryRoads === 0 && roadIndex + 1 < roadWays.length) {
        yieldCount += 1;
        await yieldToMainThread();
      }
    }
  }

  loadMetrics.roads.initialMeshPublications = 0;
  loadMetrics.roads.featureCompilationYieldCount = yieldCount;
  loadMetrics.roads.featureCompilationChunkSize = yieldEveryRoads;
  loadMetrics.roads.compilationDiagnostics = diagnostics;
  endLoadPhase('buildRoadGeometry');
  return Object.freeze({
    roadCount: appCtx.roads.length,
    meshCount: 0,
    authority: 'transport_feature_compiler',
    yieldCount
  });
}
