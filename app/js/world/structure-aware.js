import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  assignFeatureConnections,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  updateFeatureSurfaceProfile
} from "../structure-semantics.js?v=17";

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

function smoothstep01Local(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
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

function normalizeStructureEndpointHeights(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;
  const endpointGroups = new Map();

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    if (!semantics?.gradeSeparated || !points || points.length < 2 || !(heights instanceof Float32Array) || !(distances instanceof Float32Array)) continue;
    const entries = [
      { index: 0, point: points[0] },
      { index: points.length - 1, point: points[points.length - 1] }
    ];
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e];
      const point = entry.point;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      const key = `${Math.round(point.x * 10)},${Math.round(point.z * 10)}:${semantics.verticalGroup || semantics.terrainMode || 'structure'}`;
      let group = endpointGroups.get(key);
      if (!group) {
        group = [];
        endpointGroups.set(key, group);
      }
      group.push({ feature, endpointIndex: entry.index, y: Number(heights[entry.index]) || 0 });
    }
  }

  endpointGroups.forEach((entries) => {
    if (!Array.isArray(entries) || entries.length < 2) return;
    const averageY = entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length;
    for (let i = 0; i < entries.length; i++) {
      const { feature, endpointIndex } = entries[i];
      const heights = feature?.surfaceHeights;
      const distances = feature?.surfaceDistances;
      if (!(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length !== distances.length) continue;
      const lastIndex = heights.length - 1;
      const anchorIndex = endpointIndex === 0 ? 0 : lastIndex;
      const delta = averageY - (Number(heights[anchorIndex]) || 0);
      if (Math.abs(delta) < 0.01) continue;
      const blendDistance = Math.max(12, Math.min(28, (Number(feature.width) || 6) * 2.6));
      const totalDistance = Number(distances[lastIndex]) || 0;

      for (let h = 0; h < heights.length; h++) {
        const distanceFromEndpoint = endpointIndex === 0 ?
          (Number(distances[h]) || 0) :
          Math.max(0, totalDistance - (Number(distances[h]) || 0));
        if (distanceFromEndpoint > blendDistance) continue;
        const weight = 1 - smoothstep01Local(distanceFromEndpoint / Math.max(1, blendDistance));
        heights[h] += delta * weight;
      }
      feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
      feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
    }
  });
}

function smoothStructureSurfaceProfiles(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if ((!semantics?.gradeSeparated && !hasTransitionAnchors) || !(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length < 4) continue;

    const smoothed = new Float32Array(heights);
    const passes =
      semantics.terrainMode === 'elevated' ? 3 :
      semantics.terrainMode === 'subgrade' ? 2 :
      hasTransitionAnchors ? 2 :
      1;

    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(smoothed);
      const lastIndex = smoothed.length - 1;
      for (let h = 1; h < lastIndex; h++) {
        const current = smoothed[h];
        const neighborAverage = (smoothed[h - 1] + smoothed[h + 1]) * 0.5;
        let blend =
          semantics?.terrainMode === 'elevated' ? 0.46 :
          semantics?.terrainMode === 'subgrade' ? 0.4 :
          hasTransitionAnchors ? 0.26 :
          0.42;

        if (Array.isArray(feature.structureStations) && feature.structureStations.length > 0) {
          const distance = Number(distances[h]) || 0;
          let nearestWeight = Infinity;
          for (let s = 0; s < feature.structureStations.length; s++) {
            const station = feature.structureStations[s];
            const stationSpan = Math.max(1, Number(station?.span) || 1);
            const normalizedDistance = Math.abs(distance - (Number(station?.distance) || 0)) / stationSpan;
            nearestWeight = Math.min(nearestWeight, normalizedDistance);
          }
          if (nearestWeight < 0.35) blend = semantics?.terrainMode === 'elevated' ? 0.16 : 0.18;
          else if (nearestWeight < 0.7) blend = semantics?.terrainMode === 'elevated' ? 0.24 : 0.28;
        }

        next[h] = current * (1 - blend) + neighborAverage * blend;
      }
      smoothed.set(next);
    }
    heights.set(smoothed);
    const minimumSurfaceY = Number(feature.minimumStructureSurfaceY);
    if (semantics?.terrainMode === 'elevated' && Number.isFinite(minimumSurfaceY)) {
      for (let h = 0; h < heights.length; h++) {
        heights[h] = Math.max(heights[h], minimumSurfaceY);
      }
    }
    feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
    feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
  }
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

export function refreshStructureAwareFeatureProfiles(options = {}) {
  const includeStreaming = options.includeStreaming !== false;
  const roadFeatures = Array.isArray(appCtx.roads)
    ? appCtx.roads.filter((feature) => includeStreaming || !feature?._streamChunkKey)
    : [];
  const connectorFeatures = structureAwareLinearFeatures()
    .filter((feature) => includeStreaming || !feature?._streamChunkKey);
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

  const profiledFeatures = [];
  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    const hasTransitionAnchors = Array.isArray(feature.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    const sampleTerrainY = feature?.structureSemantics?.terrainMode === 'at_grade' ?
      worldRenderedTerrainY :
      worldBaseTerrainY;
    updateFeatureSurfaceProfile(feature, sampleTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.08
    });
    if (feature?.structureSemantics?.gradeSeparated || hasTransitionAnchors) {
      profiledFeatures.push(feature);
    }
  }

  normalizeStructureEndpointHeights(structureFeatures);
  smoothStructureSurfaceProfiles(profiledFeatures);
  appCtx.refreshBridgeGuardrails?.(roadFeatures);

  if (structureFeatures.length > 0) {
    appCtx.structureTerrainCuts = structureFeatures
      .filter((feature) => feature?.structureSemantics?.terrainMode === 'subgrade')
      .map((feature) => ({
        feature,
        pts: feature.pts,
        width: Math.max(6.2, (Number(feature.width) || 6) + 3.2),
        clearance: Math.max(3.8, Number(feature?.structureSemantics?.cutDepth) ? 3.35 + Math.min(3.4, Number(feature.structureSemantics.cutDepth) * 0.45) : 3.8),
        portalLength: Math.max(12, Math.min(34, (Number(feature.width) || 6) * 2.2)),
        bounds: feature.bounds
      }));
  } else {
    appCtx.structureTerrainCuts = [];
  }
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
