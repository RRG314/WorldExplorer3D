import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  assignFeatureConnections,
  assignStructureStackRanks,
  areRoadsConnected,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  isPointWithinMappedWater,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=63";
import { compileTunnelSystemModels } from "./compiler/tunnel-system-model.js?v=15";
import { compileTransportStructureModel } from "./compiler/transport-structure-model.js?v=1";
import { compileTransportStructureAssemblies } from "./compiler/transport-structure-assembly.js?v=11";
import {
  auditTransportJunctionContinuity,
  buildExactTransportNodeFinalizationAnchors,
  buildIntegratedApproachContinuationAnchors,
  buildTransportContinuityRepairAnchors,
  buildTransportJunctionProfileAnchors
} from "./compiler/transport-junction-profile.js?v=15";
import {
  createDriveableRoadConflictIndex,
  supportPointConflictsWithDriveableRoad,
  supportSpanConflictsWithDriveableRoad
} from "./bridge-safety.js?v=13";
import { refreshStructureColliders } from "./structure-colliders.js?v=13";
import { yieldToMainThread } from "./cooperative-scheduling.js?v=1";
import { compileSharedTransportSurfacePresentations } from './transport-surface-controls.js?v=2';

const runtime = {
  enableLinearFeatures: () => false,
  getNearbyBuildings: () => [],
  pointInPolygon: () => false
};

export function initWorldStructureAwareness(options = {}) {
  if (typeof options.enableLinearFeatures === 'function') runtime.enableLinearFeatures = options.enableLinearFeatures;
  if (typeof options.getNearbyBuildings === 'function') runtime.getNearbyBuildings = options.getNearbyBuildings;
  if (typeof options.pointInPolygon === 'function') runtime.pointInPolygon = options.pointInPolygon;
}

export function cloneStructureSemantics(semantics) {
  return semantics ? { ...semantics } : null;
}

export function worldBaseTerrainY(x, z) {
  if (typeof appCtx.baseTerrainHeightAt === 'function') return appCtx.baseTerrainHeightAt(x, z);
  if (typeof appCtx.terrainMeshHeightAt === 'function') return appCtx.terrainMeshHeightAt(x, z);
  return appCtx.elevationWorldYAtWorldXZ(x, z);
}

function structureAwareLinearFeatures() {
  if (!Array.isArray(appCtx.linearFeatures)) return [];
  return appCtx.linearFeatures.filter((feature) =>
    feature?.structureSemantics?.gradeSeparated ||
    feature?.structureSemantics?.structureKind === 'covered'
  );
}

function publishAtGradeTerrainCorridors(roads = []) {
  const indexedFeatures = [];
  for (const feature of roads) {
    if (
      !feature ||
      feature.driveable === false ||
      feature?.structureSemantics?.terrainMode !== 'at_grade' ||
      !feature?.transportSurfaceModel ||
      !Array.isArray(feature.pts) ||
      feature.pts.length < 2
    ) continue;
    indexedFeatures.push(feature);
  }
  // Retain only references to the canonical road objects. Per-road wrapper
  // records and a second feature map duplicated an entire metropolitan road
  // set without adding authority or query value.
  appCtx.structureTerrainCuts = indexedFeatures;
  appCtx.structureTerrainCutByFeature = null;
  appCtx.structureTerrainCutIndex = createDriveableRoadConflictIndex(indexedFeatures, {
    cellSize: 72
  });
  appCtx.transportTerrainCorridorPublication = Object.freeze({
    authority: 'compiled_transport_surface',
    corridorCount: indexedFeatures.length,
    index: appCtx.structureTerrainCutIndex.snapshot()
  });
  return appCtx.transportTerrainCorridorPublication;
}

function createFeatureBoundsIndex(features = [], cellSize = 240) {
  const buckets = new Map();
  const boundsByFeature = new Map();
  const boundsFor = (feature) => {
    if (boundsByFeature.has(feature)) return boundsByFeature.get(feature);
    const points = Array.isArray(feature?.pts) ? feature.pts : [];
    const padding = (Number(feature?.width) || 4) + 24;
    const bounds = feature?.bounds || points.reduce((result, point) => ({
      minX: Math.min(result.minX, Number(point?.x) - padding),
      maxX: Math.max(result.maxX, Number(point?.x) + padding),
      minZ: Math.min(result.minZ, Number(point?.z) - padding),
      maxZ: Math.max(result.maxZ, Number(point?.z) + padding)
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    boundsByFeature.set(feature, bounds);
    return bounds;
  };
  for (const feature of features) {
    const bounds = boundsFor(feature);
    if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) continue;
    const minColumn = Math.floor(bounds.minX / cellSize);
    const maxColumn = Math.floor(bounds.maxX / cellSize);
    const minRow = Math.floor(bounds.minZ / cellSize);
    const maxRow = Math.floor(bounds.maxZ / cellSize);
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const key = `${column}:${row}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(feature);
      }
    }
  }
  return (feature) => {
    const bounds = boundsFor(feature);
    const candidates = new Set();
    const minColumn = Math.floor((bounds.minX - 14) / cellSize);
    const maxColumn = Math.floor((bounds.maxX + 14) / cellSize);
    const minRow = Math.floor((bounds.minZ - 14) / cellSize);
    const maxRow = Math.floor((bounds.maxZ + 14) / cellSize);
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        for (const candidate of buckets.get(`${column}:${row}`) || []) candidates.add(candidate);
      }
    }
    return [...candidates];
  };
}

function createWaterAreaBoundsFilter(waterAreas = []) {
  const entries = waterAreas.map((area) => {
    const points = Array.isArray(area?.pts) ? area.pts : [];
    const bounds = points.reduce((result, point) => ({
      minX: Math.min(result.minX, Number(point?.x)),
      maxX: Math.max(result.maxX, Number(point?.x)),
      minZ: Math.min(result.minZ, Number(point?.z)),
      maxZ: Math.max(result.maxZ, Number(point?.z))
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    return [area, bounds];
  }).filter(([, bounds]) => (
    [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
  ));
  const cache = new Map();
  return (feature) => {
    if (cache.has(feature)) return cache.get(feature);
    const points = Array.isArray(feature?.pts) ? feature.pts : [];
    const padding = (Number(feature?.width) || 4) + 8;
    const bounds = points.reduce((result, point) => ({
      minX: Math.min(result.minX, Number(point?.x) - padding),
      maxX: Math.max(result.maxX, Number(point?.x) + padding),
      minZ: Math.min(result.minZ, Number(point?.z) - padding),
      maxZ: Math.max(result.maxZ, Number(point?.z) + padding)
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const candidates = entries.filter(([, waterBounds]) => !(
      waterBounds.maxX < bounds.minX ||
      waterBounds.minX > bounds.maxX ||
      waterBounds.maxZ < bounds.minZ ||
      waterBounds.minZ > bounds.maxZ
    )).map(([area]) => area);
    cache.set(feature, candidates);
    return candidates;
  };
}

function featureBuildingContainmentStats(feature) {
  const points = Array.isArray(feature?.pts) ? feature.pts : null;
  if (!points || points.length < 2) {
    return { total: 0, inside: 0, near: 0, endpointInside: 0, insideRatio: 0, nearRatio: 0 };
  }

  const sampleIndices = new Set([
    0,
    points.length - 1,
    Math.floor((points.length - 1) * 0.25),
    Math.floor((points.length - 1) * 0.5),
    Math.floor((points.length - 1) * 0.75)
  ]);

  let total = 0;
  let inside = 0;
  let near = 0;
  let endpointInside = 0;

  for (const index of sampleIndices) {
    const point = points[index];
    if (!point) continue;
    const candidates = runtime.getNearbyBuildings(point.x, point.z, 16);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      total += 1;
      continue;
    }

    let insideBuilding = false;
    let nearBuilding = false;
    for (let i = 0; i < candidates.length; i++) {
      const building = candidates[i];
      if (!building) continue;
      const withinBounds =
        point.x >= (Number(building.minX) || 0) - 2.4 &&
        point.x <= (Number(building.maxX) || 0) + 2.4 &&
        point.z >= (Number(building.minZ) || 0) - 2.4 &&
        point.z <= (Number(building.maxZ) || 0) + 2.4;
      if (!withinBounds) continue;
      if (Array.isArray(building.pts) && building.pts.length >= 3 && runtime.pointInPolygon(point.x, point.z, building.pts)) {
        insideBuilding = true;
        break;
      }
      nearBuilding = true;
    }

    total += 1;
    if (insideBuilding) {
      inside += 1;
      if (index === 0 || index === points.length - 1) endpointInside += 1;
    } else if (nearBuilding) {
      near += 1;
    }
  }

  return {
    total,
    inside,
    near,
    endpointInside,
    insideRatio: total > 0 ? inside / total : 0,
    nearRatio: total > 0 ? near / total : 0
  };
}

export function applyBuildingContextSemanticsToFeature(feature) {
  if (!feature) return;
  if (!feature.baseStructureSemantics) {
    feature.baseStructureSemantics = cloneStructureSemantics(feature.structureSemantics);
  }

  const baseSemantics = feature.baseStructureSemantics || feature.structureSemantics || null;
  if (!baseSemantics) return;

  const canBeEmbeddedElevatedFeature =
    baseSemantics.terrainMode === 'elevated' &&
    !baseSemantics.isBridge;
  if (!canBeEmbeddedElevatedFeature) {
    feature.structureSemantics = {
      ...cloneStructureSemantics(baseSemantics),
      embeddedInBuilding: false
    };
    if (feature.isStructureConnector === true) {
      feature.isStructureConnector = feature.structureSemantics.gradeSeparated || feature.structureSemantics.skywalk === true;
    }
    return;
  }

  const stats = featureBuildingContainmentStats(feature);
  const embeddedInBuilding =
    stats.total > 0 &&
    (
      stats.insideRatio >= 0.62 ||
      (stats.endpointInside >= 1 && (stats.inside + stats.near) >= Math.max(3, Math.ceil(stats.total * 0.72)))
    );

  if (!embeddedInBuilding) {
    feature.structureSemantics = {
      ...cloneStructureSemantics(baseSemantics),
      embeddedInBuilding: false
    };
    if (feature.isStructureConnector === true) {
      feature.isStructureConnector = feature.structureSemantics.gradeSeparated || feature.structureSemantics.skywalk === true;
    }
    return;
  }

  const coveredLike = baseSemantics.covered || baseSemantics.indoor;
  feature.structureSemantics = {
    ...cloneStructureSemantics(baseSemantics),
    structureKind: coveredLike ? 'covered' : 'at_grade',
    terrainMode: 'at_grade',
    gradeSeparated: false,
    skywalk: false,
    verticalOrder: 0,
    deckClearance: 0,
    cutDepth: 0,
    embeddedInBuilding: true,
    verticalGroup: `at_grade:0:${coveredLike ? 'covered' : 'at_grade'}`
  };
  if (feature.isStructureConnector === true) feature.isStructureConnector = false;
}

function* compileStructureAwareFeatureProfileSteps() {
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const compilationStartedAt = now();
  const phaseDurationsMs = Object.create(null);
  const measure = (name, task) => {
    const startedAt = now();
    try {
      return task();
    } finally {
      phaseDurationsMs[name] = Number((now() - startedAt).toFixed(2));
    }
  };
  const roadFeatures = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  const connectorFeatures = structureAwareLinearFeatures();
  const transportFeatures = roadFeatures.concat(connectorFeatures);
  const nearbyTransportFeatures = createFeatureBoundsIndex(transportFeatures);

  measure('buildingContext', () => {
    for (let i = 0; i < transportFeatures.length; i++) {
      applyBuildingContextSemanticsToFeature(transportFeatures[i]);
    }
  });
  yield;

  if (Array.isArray(appCtx.linearFeatureMeshes)) {
    for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
      const mesh = appCtx.linearFeatureMeshes[i];
      const feature = mesh?.userData?.linearFeatureRef || null;
      if (!mesh || !feature) continue;
      mesh.userData.structureConnector = feature.isStructureConnector === true;
      mesh.userData.structureSemantics = feature.structureSemantics || null;
    }
  }

  const structureFeatures = transportFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated);
  const structureWaterAreas = []
    .concat(Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [])
    .concat(Array.isArray(appCtx.waterways) ? appCtx.waterways : [])
    .concat(Array.isArray(appCtx.fixedRegionalStructureWaterAreas)
      ? appCtx.fixedRegionalStructureWaterAreas
      : []);
  // A regional world can publish hundreds of complex water rings. Candidate
  // them once by bounds so station refinement does not run every structure
  // vertex through every remote polygon on each of the three profile passes.
  const nearbyStructureWaterAreas = createWaterAreaBoundsFilter(structureWaterAreas);
  measure('compileConnections', () => {
    appCtx.transportNetworkModel = assignFeatureConnections(transportFeatures);
    appCtx.transportStructureModel = compileTransportStructureModel(transportFeatures, {
      transportGraphId: appCtx.transportNetworkModel.id
    });
  });
  yield;
  if (appCtx.transportSurfacePublication?.authority === 'compiled_transport_surface') {
    appCtx.transportSurfacePublication = Object.freeze({
      ...appCtx.transportSurfacePublication,
      transportGraphId: appCtx.transportNetworkModel.id,
      roadCount: roadFeatures.length
    });
  }
  measure('assignStackRanks', () => assignStructureStackRanks(
    structureFeatures,
    worldBaseTerrainY,
    { areRoadsConnected }
  ));
  yield;

  measure('buildInitialStations', () => {
    for (let i = 0; i < structureFeatures.length; i++) {
      const feature = structureFeatures[i];
      if (!feature?.structureSemantics?.gradeSeparated) continue;
      feature.structureStations = buildFeatureStations(feature, {
        features: nearbyTransportFeatures(feature),
        waterAreas: nearbyStructureWaterAreas(feature),
        sampleTerrainY: worldBaseTerrainY
      });
    }
  });
  yield;

  // Connection anchors must read surfaces compiled from the current graph and
  // stack ranks. Reusing the pre-refresh models makes a merge target sample a
  // stale deck height and leaves visible steps or open-air ramp ends.
  measure('buildInitialProfiles', () => {
    for (let i = 0; i < transportFeatures.length; i++) {
      const feature = transportFeatures[i];
      if (!feature) continue;
      feature.structureTransitionAnchors = [];
      updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
        surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
      });
    }
  });
  yield;

  // Resolve crossing clearances once against the first compiled world-space
  // surfaces. Nominal layer offsets alone are insufficient when two ramps
  // have different endpoint-ground chords on sloped terrain.
  for (let refinement = 0; refinement < 3; refinement += 1) {
    const refinementPassStartedAt = now();
    try {
      for (let i = 0; i < structureFeatures.length; i++) {
        const feature = structureFeatures[i];
        feature.structureStations = buildFeatureStations(feature, {
          features: nearbyTransportFeatures(feature),
          waterAreas: nearbyStructureWaterAreas(feature),
          sampleTerrainY: worldBaseTerrainY
        });
      }
      for (let i = 0; i < structureFeatures.length; i++) {
        const feature = structureFeatures[i];
        updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
          surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
        });
      }
    } finally {
      phaseDurationsMs[`refineStructureProfilesPass${refinement + 1}`] = Number(
        (now() - refinementPassStartedAt).toFixed(2)
      );
    }
    // Dense cities must remain responsive while the shared stacked-structure
    // solver converges. Each pass is independent until the following pass.
    yield;
  }
  phaseDurationsMs.refineStructureProfiles = Number(
    [1, 2, 3].reduce((total, pass) => (
      total + Number(phaseDurationsMs[`refineStructureProfilesPass${pass}`] || 0)
    ), 0).toFixed(2)
  );

  // A ramp endpoint and the interior freeway segment it joins are one physical
  // surface. A single anchor pass reads the target's provisional profile and
  // then recompiles both roads independently, which left real merge steps over
  // two metres high. Compile one shared graph-node constraint set from the
  // refined profiles, then rebuild every road carrying a graph constraint.
  // Repeatedly deriving constraints from already-constrained profiles creates
  // positive feedback through stacked interchanges and lifts decks skyward.
  // Ordinary roads remain terrain-draped unless they receive an explicit
  // integrated-approach graph constraint.
  measure('compileJunctionProfiles', () => {
    const junctionPasses = 1;
    let junctionProfile = null;
    for (let pass = 0; pass < junctionPasses; pass += 1) {
      for (let i = 0; i < transportFeatures.length; i++) {
        const feature = transportFeatures[i];
        if (!feature) continue;
        if (feature.structureSemantics?.terrainMode === 'at_grade') {
          feature.structureTransitionAnchors = [];
          continue;
        }
        buildFeatureTransitionAnchors(feature, worldBaseTerrainY);
      }
      junctionProfile = buildTransportJunctionProfileAnchors(
        transportFeatures,
        appCtx.transportNetworkModel,
        worldBaseTerrainY,
        sampleFeatureSurfaceY
      );
      for (const [feature, anchors] of junctionProfile.anchorsByFeature) {
        feature.structureTransitionAnchors.push(...anchors);
      }
      const constrainedFeatures = new Set([
        ...structureFeatures,
        ...junctionProfile.anchorsByFeature.keys()
      ]);
      for (const feature of constrainedFeatures) {
        updateFeatureSurfaceProfile(
          feature,
          worldBaseTerrainY,
          {
          surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
          }
        );
      }
    }
    const corridorReconciliation = buildTransportContinuityRepairAnchors(
      transportFeatures,
      appCtx.transportNetworkModel,
      sampleFeatureSurfaceY,
      { sampleTerrainY: worldBaseTerrainY }
    );
    for (const [feature, anchors] of corridorReconciliation.anchorsByFeature) {
      const keyFor = (anchor) =>
        `${anchor?.endpoint || 'interior'}:${Number(anchor?.distance || 0).toFixed(2)}`;
      const replacements = new Map(anchors.map((anchor) => [keyFor(anchor), anchor]));
      feature.structureTransitionAnchors = (feature.structureTransitionAnchors || []).filter((anchor) =>
        anchor?.source !== 'transport_graph_node' || !replacements.has(keyFor(anchor))
      );
      feature.structureTransitionAnchors.push(...replacements.values());
      updateFeatureSurfaceProfile(
        feature,
        worldBaseTerrainY,
        { surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08 }
      );
    }

    let approachContinuationPasses = 0;
    let approachContinuationConnectionCount = 0;
    for (let pass = 0; pass < 8; pass += 1) {
      const continuation = buildIntegratedApproachContinuationAnchors(
        transportFeatures,
        appCtx.transportNetworkModel,
        sampleFeatureSurfaceY,
        worldBaseTerrainY
      );
      if (continuation.anchorsByFeature.size === 0) break;
      approachContinuationPasses += 1;
      approachContinuationConnectionCount += continuation.connectionCount;
      for (const [feature, anchors] of continuation.anchorsByFeature) {
        const replacements = new Map(anchors.map((anchor) => [anchor.endpoint, anchor]));
        feature.structureTransitionAnchors = (feature.structureTransitionAnchors || []).filter((anchor) =>
          anchor?.source !== 'transport_graph_node' || !replacements.has(anchor?.endpoint)
        );
        feature.structureTransitionAnchors.push(...replacements.values());
        updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
          surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
        });
      }
    }
    let finalNodePasses = 0;
    let finalNodeCount = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      const finalization = buildExactTransportNodeFinalizationAnchors(
        transportFeatures,
        appCtx.transportNetworkModel,
        sampleFeatureSurfaceY,
        worldBaseTerrainY
      );
      if (finalization.anchorsByFeature.size === 0) break;
      finalNodePasses += 1;
      finalNodeCount += finalization.nodeCount;
      for (const [feature, anchors] of finalization.anchorsByFeature) {
        const keyFor = (anchor) =>
          `${anchor?.endpoint || 'interior'}:${Number(anchor?.distance || 0).toFixed(2)}`;
        const replacements = new Map(anchors.map((anchor) => [keyFor(anchor), anchor]));
        feature.structureTransitionAnchors = (feature.structureTransitionAnchors || []).filter((anchor) =>
          anchor?.source !== 'transport_graph_node' || !replacements.has(keyFor(anchor))
        );
        feature.structureTransitionAnchors.push(...replacements.values());
        updateFeatureSurfaceProfile(
          feature,
          worldBaseTerrainY,
          { surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08 }
        );
      }
    }
    let postContinuationFeatureCount = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      const postContinuationReconciliation = buildTransportContinuityRepairAnchors(
        transportFeatures,
        appCtx.transportNetworkModel,
        sampleFeatureSurfaceY,
        { sampleTerrainY: worldBaseTerrainY }
      );
      if (postContinuationReconciliation.anchorsByFeature.size === 0) break;
      postContinuationFeatureCount += postContinuationReconciliation.anchorsByFeature.size;
      for (const [feature, anchors] of postContinuationReconciliation.anchorsByFeature) {
        const keyFor = (anchor) =>
          `${anchor?.endpoint || 'interior'}:${Number(anchor?.distance || 0).toFixed(2)}`;
        const replacements = new Map(anchors.map((anchor) => [keyFor(anchor), anchor]));
        feature.structureTransitionAnchors = (feature.structureTransitionAnchors || []).filter((anchor) =>
          anchor?.source !== 'transport_graph_node' || !replacements.has(keyFor(anchor))
        );
        feature.structureTransitionAnchors.push(...replacements.values());
        updateFeatureSurfaceProfile(
          feature,
          worldBaseTerrainY,
          { surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08 }
        );
      }
    }
    // Do not recursively promote ordinary streets into engineered approaches.
    // Exact structural tie-ins are owned by the graph/corridor/finalization
    // passes above. A residual surface-only pass made every downstream street
    // inherit a bridge-style hard elevation and amplified DEM differences
    // across whole city networks.
    const residualAtGradePasses = 0;
    const residualAtGradeConnectionCount = 0;
    const continuity = auditTransportJunctionContinuity(
      transportFeatures,
      appCtx.transportNetworkModel,
      sampleFeatureSurfaceY
    );
    appCtx.transportJunctionProfile = Object.freeze({
      authority: 'compiled_transport_graph_nodes',
      nodeCount: junctionProfile?.nodeCount || 0,
      constrainedFeatureCount: junctionProfile?.constrainedFeatureCount || 0,
      continuityRepair: approachContinuationPasses > 0
        ? Object.freeze({
            authority: 'exact_transport_corridor_reconciliation',
            passes: approachContinuationPasses,
            connectionCount: approachContinuationConnectionCount,
            corridorSeedNodeCount: corridorReconciliation.seedNodeCount,
            corridorFeatureCount: corridorReconciliation.anchorsByFeature.size +
              postContinuationFeatureCount,
            elevatedNodeCount: 0,
            elevatedFeatureCount: 0,
            finalNodePasses,
            finalNodeCount,
            residualAtGradePasses,
            residualAtGradeConnectionCount
          })
        : corridorReconciliation.anchorsByFeature.size > 0
          ? Object.freeze({
              authority: 'exact_transport_corridor_reconciliation',
              passes: 1,
              connectionCount: 0,
              corridorSeedNodeCount: corridorReconciliation.seedNodeCount,
              corridorFeatureCount: corridorReconciliation.anchorsByFeature.size,
              elevatedNodeCount: 0,
              elevatedFeatureCount: 0,
              finalNodePasses,
              finalNodeCount,
              residualAtGradePasses,
              residualAtGradeConnectionCount
            })
          : null,
      continuity,
      junctionPasses
    });
  });
  yield;

  measure('compileTunnels', () => compileTunnelSystemModels(transportFeatures, worldBaseTerrainY));
  yield;
  measure('compileSharedPhysicalSurfaces', () => {
    appCtx.sharedTransportSurfacePresentation = compileSharedTransportSurfacePresentations(
      roadFeatures,
      sampleFeatureSurfaceY
    );
  });
  yield;
  measure('compileStructureAssemblies', () => {
    const supportRoadIndex = createDriveableRoadConflictIndex(roadFeatures);
    appCtx.transportStructureAssembly = compileTransportStructureAssemblies(
      transportFeatures,
      worldBaseTerrainY,
      {
        pointInMappedWater: (feature, x, z) =>
          nearbyStructureWaterAreas(feature).some((area) => isPointWithinMappedWater(area, x, z)),
        supportConflict: (feature, column) => supportPointConflictsWithDriveableRoad(feature, {
          x: column.x,
          z: column.z,
          supportBottomY: column.terrainY,
          supportTopY: column.topY,
          columnRadius: column.width * 0.5,
          roadIndex: supportRoadIndex
        }),
        supportSpanConflict: (feature, span) => supportSpanConflictsWithDriveableRoad(feature, {
          ...span,
          roadIndex: supportRoadIndex
        })
      }
    );
  });
  yield;
  measure('refreshStructureColliders', () => refreshStructureColliders(appCtx, transportFeatures));
  yield;
  measure('refreshBridgeGuardrails', () => appCtx.refreshBridgeGuardrails?.(roadFeatures));

  // Tunnels remain below the unmodified terrain roof. At-grade carriageways,
  // however, are physical terrain corridors: publish their compiled surfaces
  // as the one bounded cut/fill authority used by the terrain mesh.
  publishAtGradeTerrainCorridors(roadFeatures);
  appCtx.structureProfileCompilation = Object.freeze({
    roadCount: roadFeatures.length,
    structureCount: structureFeatures.length,
    phaseDurationsMs: Object.freeze({
      ...phaseDurationsMs,
      total: Number((now() - compilationStartedAt).toFixed(2))
    })
  });
  // Regional mapped-water rings are compilation staging. Bridge/tunnel
  // profiles now own the derived elevations, so retaining the source polygons
  // would recreate the fixed-world memory regression.
  appCtx.fixedRegionalStructureWaterAreas = [];
  return appCtx.structureProfileCompilation;
}

export function refreshStructureAwareFeatureProfiles() {
  const steps = compileStructureAwareFeatureProfileSteps();
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

export async function refreshStructureAwareFeatureProfilesCooperatively() {
  const steps = compileStructureAwareFeatureProfileSteps();
  let result = steps.next();
  while (!result.done) {
    await yieldToMainThread();
    result = steps.next();
  }
  return result.value;
}

export function syncLinearFeatureOverlayVisibility() {
  const visible = runtime.enableLinearFeatures() && appCtx.showPathOverlays !== false;
  if (!Array.isArray(appCtx.linearFeatureMeshes)) return;
  for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
    const mesh = appCtx.linearFeatureMeshes[i];
    if (!mesh) continue;
    const alwaysVisible =
      mesh.userData?.structureConnector === true ||
      mesh.userData?.alwaysMappedPedestrian === true;
    mesh.visible = !mesh.userData?.boatSuppressed && (alwaysVisible || visible);
  }
}
