import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  appendUpwardRibbonGeometry,
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials
} from "../road-render.js?v=2";
import { estimateDriveableRoadWidth } from "./load-style.js?v=3";
import {
  buildFeatureRibbonEdges,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=19";
import { registerBridgeGuardrails } from "./bridge-guardrails.js?v=7";

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
    const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
    const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
    if (pts.length < 2) return;

    const type = way.tags?.highway || 'residential';
    const structureSemantics = classifyStructureSemantics(way.tags || {}, {
      featureKind: 'road',
      subtype: type
    });
    const width = estimateDriveableRoadWidth(way.tags || {});
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
      sourceFeatureId: String(way.tags?._sourceFeatureId || way.id || ''),
      type,
      surfaceTag: String(way.tags?.surface || '').toLowerCase(),
      litTag: String(way.tags?.lit || '').toLowerCase(),
      sidewalkHint: String(way.tags?.sidewalk || '').toLowerCase(),
      networkKind: 'road',
      walkable: true,
      driveable: true,
      structureTags: {
        bridge: way.tags?.bridge || '',
        tunnel: way.tags?.tunnel || '',
        layer: way.tags?.layer || '',
        level: way.tags?.level || '',
        placement: way.tags?.placement || '',
        ramp: way.tags?.ramp || '',
        covered: way.tags?.covered || '',
        indoor: way.tags?.indoor || '',
        location: way.tags?.location || '',
        min_height: way.tags?.min_height || '',
        man_made: way.tags?.man_made || ''
      },
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
      const skirtDepth = roadFeature.structureSemantics?.terrainMode === 'subgrade' ? 0.3 : 3.6;
      const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
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
            const y = (typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z)) + ROAD_SURFACE_BIAS + 0.01;
            const vi = markVerts.length / 3;
            markVerts.push(
              x + nx * mw, y, z + nz * mw,
              x - nx * mw, y, z - nz * mw,
              x + dx * len + nx * mw, y, z + dz * len + nz * mw,
              x + dx * len - nx * mw, y, z + dz * len - nz * mw
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

  endLoadPhase('buildRoadGeometry');
}
