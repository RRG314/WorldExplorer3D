import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  assignFeatureConnections,
  assignStructureStackRanks,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=25";
import { compileTunnelSystemModels } from "./compiler/tunnel-system-model.js?v=2";

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
  return appCtx.linearFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated);
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

  const stats = featureBuildingContainmentStats(feature);
  const embeddedInBuilding =
    baseSemantics.terrainMode === 'elevated' &&
    !baseSemantics.isBridge &&
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

export function refreshStructureAwareFeatureProfiles() {
  const roadFeatures = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  const connectorFeatures = structureAwareLinearFeatures();
  const transportFeatures = roadFeatures.concat(connectorFeatures);

  for (let i = 0; i < transportFeatures.length; i++) {
    applyBuildingContextSemanticsToFeature(transportFeatures[i]);
  }

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
  assignFeatureConnections(transportFeatures);
  assignStructureStackRanks(structureFeatures, worldBaseTerrainY);

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    if (!feature?.structureSemantics?.gradeSeparated) continue;
    feature.structureStations = buildFeatureStations(feature, {
      features: structureFeatures,
      waterAreas: appCtx.waterAreas
    });
  }

  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    if (feature.structureSemantics?.terrainMode === 'at_grade') {
      feature.structureTransitionAnchors = [];
      continue;
    }
    buildFeatureTransitionAnchors(feature, worldBaseTerrainY);
  }

  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    const sampleTerrainY = feature?.structureSemantics?.terrainMode === 'at_grade' ?
      worldRenderedTerrainY :
      worldBaseTerrainY;
    updateFeatureSurfaceProfile(feature, sampleTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
    });
  }

  compileTunnelSystemModels(transportFeatures, worldBaseTerrainY);
  appCtx.refreshBridgeGuardrails?.(roadFeatures);

  // Terrain remains the terrain roof above a tunnel. Portal placement and the
  // tunnel interior come from the compiled tunnel model; lowering an entire
  // corridor creates an open trench and exposes box geometry above ground.
  appCtx.structureTerrainCuts = [];
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
