import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  assignFeatureConnections,
  assignStructureStackRanks,
  areRoadsConnected,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=47";
import { compileTunnelSystemModels } from "./compiler/tunnel-system-model.js?v=12";
import { compileTransportStructureModel } from "./compiler/transport-structure-model.js?v=1";
import { compileTransportStructureAssemblies } from "./compiler/transport-structure-assembly.js?v=4";
import { buildTransportJunctionProfileAnchors } from "./compiler/transport-junction-profile.js?v=2";
import {
  createDriveableRoadConflictIndex,
  supportPointConflictsWithDriveableRoad
} from "./bridge-safety.js?v=7";
import { refreshStructureColliders } from "./structure-colliders.js?v=8";
import { yieldToMainThread } from "./cooperative-scheduling.js?v=1";

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

function worldRenderedTerrainY(x, z) {
  if (typeof appCtx.terrainMeshHeightAt === 'function') return appCtx.terrainMeshHeightAt(x, z);
  return worldBaseTerrainY(x, z);
}

function structureAwareLinearFeatures() {
  if (!Array.isArray(appCtx.linearFeatures)) return [];
  return appCtx.linearFeatures.filter((feature) =>
    feature?.structureSemantics?.gradeSeparated ||
    feature?.structureSemantics?.structureKind === 'covered'
  );
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
        waterAreas: appCtx.waterAreas,
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
      const sampleTerrainY = feature?.structureSemantics?.terrainMode === 'at_grade'
        ? worldRenderedTerrainY
        : worldBaseTerrainY;
      updateFeatureSurfaceProfile(feature, sampleTerrainY, {
        surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
      });
    }
  });
  yield;

  // Resolve crossing clearances once against the first compiled world-space
  // surfaces. Nominal layer offsets alone are insufficient when two ramps
  // have different endpoint-ground chords on sloped terrain.
  measure('refineStructureProfiles', () => {
    for (let refinement = 0; refinement < 3; refinement += 1) {
      for (let i = 0; i < structureFeatures.length; i++) {
        const feature = structureFeatures[i];
        feature.structureStations = buildFeatureStations(feature, {
          features: nearbyTransportFeatures(feature),
          waterAreas: appCtx.waterAreas,
          sampleTerrainY: worldBaseTerrainY
        });
      }
      for (let i = 0; i < structureFeatures.length; i++) {
        const feature = structureFeatures[i];
        updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
          surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
        });
      }
    }
  });
  yield;

  // A ramp endpoint and the interior freeway segment it joins are one physical
  // surface. A single anchor pass reads the target's provisional profile and
  // then recompiles both roads independently, which left real merge steps over
  // two metres high. Compile one shared graph-node constraint set from the
  // refined profiles, then rebuild only the grade-separated roads once.
  // Repeatedly deriving constraints from already-constrained profiles creates
  // positive feedback through stacked interchanges and lifts decks skyward.
  // Ordinary roads are not rebuilt here.
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
      for (let i = 0; i < structureFeatures.length; i++) {
        const feature = structureFeatures[i];
        updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
          surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
        });
      }
    }
    appCtx.transportJunctionProfile = Object.freeze({
      authority: 'compiled_transport_graph_nodes',
      nodeCount: junctionProfile?.nodeCount || 0,
      constrainedFeatureCount: junctionProfile?.constrainedFeatureCount || 0,
      junctionPasses
    });
  });
  yield;

  measure('compileTunnels', () => compileTunnelSystemModels(transportFeatures, worldBaseTerrainY));
  yield;
  measure('compileStructureAssemblies', () => {
    const supportRoadIndex = createDriveableRoadConflictIndex(roadFeatures);
    appCtx.transportStructureAssembly = compileTransportStructureAssemblies(
      transportFeatures,
      worldBaseTerrainY,
      {
        supportConflict: (feature, column) => supportPointConflictsWithDriveableRoad(feature, {
          x: column.x,
          z: column.z,
          supportBottomY: column.terrainY,
          supportTopY: column.topY,
          columnRadius: column.width * 0.5,
          roadIndex: supportRoadIndex
        })
      }
    );
  });
  yield;
  measure('refreshStructureColliders', () => refreshStructureColliders(appCtx, transportFeatures));
  yield;
  measure('refreshBridgeGuardrails', () => appCtx.refreshBridgeGuardrails?.(roadFeatures));

  // Terrain remains the roof above tunnels. Road and tunnel renderers must not
  // mutate the shared ground surface.
  appCtx.structureTerrainCuts = [];
  appCtx.structureTerrainCutIndex = null;
  appCtx.structureProfileCompilation = Object.freeze({
    roadCount: roadFeatures.length,
    structureCount: structureFeatures.length,
    phaseDurationsMs: Object.freeze({
      ...phaseDurationsMs,
      total: Number((now() - compilationStartedAt).toFixed(2))
    })
  });
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
