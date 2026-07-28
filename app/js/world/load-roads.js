import { createLinearFeatureRuntime } from "./load-linear-runtime.js?v=9";
import { createWorldLandusePass } from "./load-landuse-pass.js?v=25";
import { createWorldRoadLoaderSupport } from "./load-roads-support.js?v=6";
import { findNearestBoatCandidate, isPointInsideWaterFootprint } from "../boat-mode/water-query.js?v=14";
import { createWorldLoadRuntimeSession, finishWorldLoadRuntimeSession } from "./load-runtime-session.js?v=7";
import { loadBuildingDetailForPublication } from "./load-building-detail.js?v=11";
import {
  diagnoseDistrictGroundSource,
  prepareSelectedLocationSource
} from "./compiler/selected-location-source-adapter.js?v=2";
async function waitForInitialTerrain(appCtx, startLoadPhase, endLoadPhase) {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return false;
  const waitForCoverage = appCtx.waitForTerrainCoverageAt;
  const waitForCenter = appCtx.waitForTerrainReadyAt;
  if (typeof waitForCoverage !== 'function' && typeof waitForCenter !== 'function') return false;
  startLoadPhase('waitForTerrainCoverage');
  try {
    const startedAt = performance.now();
    const centerReady = typeof waitForCenter === 'function' ? await waitForCenter(0, 0, 3000) : false;
    if (typeof waitForCoverage !== 'function') return centerReady;
    const remainingMs = Math.max(800, 5000 - (performance.now() - startedAt));
    const coverage = await waitForCoverage(0, 0, remainingMs, 0.72);
    return centerReady || coverage?.ready === true;
  } finally {
    endLoadPhase('waitForTerrainCoverage');
  }
}

function selectedRoadGeographicBounds(roadWays = [], nodes = {}) {
  let latN = -Infinity;
  let latS = Infinity;
  const longitudes = [];
  for (const way of roadWays) {
    for (const nodeId of way?.nodes || []) {
      const node = nodes[nodeId];
      const lat = Number(node?.lat);
      const lon = Number(node?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      latN = Math.max(latN, lat);
      latS = Math.min(latS, lat);
      longitudes.push(((lon % 360) + 360) % 360);
    }
  }
  if (!Number.isFinite(latN) || !Number.isFinite(latS) || longitudes.length === 0) return null;

  longitudes.sort((left, right) => left - right);
  let largestGap = -Infinity;
  let gapIndex = 0;
  for (let index = 0; index < longitudes.length; index += 1) {
    const next = index === longitudes.length - 1
      ? longitudes[0] + 360
      : longitudes[index + 1];
    const gap = next - longitudes[index];
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = index;
    }
  }
  const arcStart = longitudes[(gapIndex + 1) % longitudes.length];
  const arcEnd = longitudes[gapIndex];
  const toSignedLongitude = (value) => value > 180 ? value - 360 : value;
  const padding = 0.00002;
  return {
    latN: Math.min(85.05112878, latN + padding),
    latS: Math.max(-85.05112878, latS - padding),
    lonW: toSignedLongitude((arcStart - padding + 360) % 360),
    lonE: toSignedLongitude((arcEnd + padding) % 360)
  };
}

async function waitForSelectedRoadTerrain(appCtx, roadWays, nodes, startLoadPhase, endLoadPhase) {
  if (!appCtx.terrainEnabled || appCtx.onMoon || typeof appCtx.waitForTerrainReadyBounds !== 'function') {
    return false;
  }
  const bounds = selectedRoadGeographicBounds(roadWays, nodes);
  if (!bounds) return false;
  startLoadPhase('waitForTransportGround');
  try {
    return await appCtx.waitForTerrainReadyBounds(bounds, 8000);
  } finally {
    endLoadPhase('waitForTransportGround');
  }
}

export function createWorldRoadLoader(deps = {}) {
  const {
    ENABLE_LINEAR_FEATURES = false,
    LINEAR_FEATURE_POLICY = {},
    FEATURE_MIN_HOLE_AREA = 6,
    FEATURE_MIN_POLYGON_AREA = 8,
    MAX_TREE_NODES = 0,
    MAX_TREE_ROW_WAYS = 0,
    WATER_VECTOR_TILE_ZOOM = 0,
    addBuildingToSpatialIndex,
    addWaterwayRibbon,
    appCtx,
    appendIndexedGeometry,
    applyBuildingContextSemanticsToFeature,
    batchLanduseMeshes,
    buildBuildingGeometryGuards,
    buildBuildingGeometryPass,
    buildFeatureGeometryGuards,
    buildFeatureRibbonEdges,
    buildLanduseGeometryGuards,
    buildPoiGeometryPass,
    buildRoadGeometryPass,
    buildStreetFurniturePass,
    buildTraversalNetworks,
    buildWaterGeometryGuards,
    buildWorldOverpassPlan,
    classifyLanduseType,
    classifyLinearFeatureTagsBase,
    classifyStructureSemantics,
    classifyWorldSurfaceProfile,
    clearBuildingSpatialIndex,
    cloneStructureSemantics,
    createSyntheticFallbackWorld,
    decimatePoints,
    decimateRoadCenterlineByDepth,
    earthSceneSuppressed,
    fetchOverpassJSON,
    fetchGlobalBuildingData,
    fetchBundledBuildingMetadata,
    fetchShortbreadWorldData,
    featureTileKeyForLatLon,
    fetchVectorTileWater,
    finalizeLoadedWorld,
    getAdaptiveLoadProfile,
    getPerfModeValue,
    getRoadSubdivisionStep,
    getRuntimeDynamicBudget,
    getWorldLoadSignature,
    getWorldLodThresholds,
    hideEarthSceneMeshes,
    inferWaterRenderContext,
    invalidateTraversalNetworks,
    isDriveableHighwayTag,
    limitNodesByTileBudget,
    limitWaysByTileBudget,
    linearFeaturePriority,
    linearFeatureVisualSpec,
    normalizeWorldRingFromLonLat,
    pickBuildingBaseColor,
    poiKeyFromTags,
    polylineBounds,
    prepareWorldFeatureSelections,
    rdtDepthForFeatureTile,
    recordWorldLoadWarning,
    refreshStructureAwareFeatureProfiles,
    registerWaterWaveMaterial,
    resetWorldForReload,
    resetWorldFurnitureCaches,
    resolveWaterSurfaceVisualProfile,
    safeWorldLoadCall,
    sameLocation,
    sanitizeWorldFootprintPoints,
    sanitizeWorldPathPoints,
    buildWorldDetailPasses,
    loadLandmarksForPublication,
    signedPolygonAreaXZ,
    spawnOnRoad,
    updateFeatureSurfaceProfile,
    updateWorldLod,
    vectorTileRangeForBounds,
    waterSurfaceBaseElevation,
    wayCenterLatLon,
    worldBaseTerrainY,
    worldLinePointsFromLonLat
  } = deps;
  let activeWorldLoad = null;
  const classifyLinearFeatureTags = (tags = {}, options = {}) => {
    const classification = classifyLinearFeatureTagsBase(tags, {
      ...options,
      linearFeaturesEnabled: ENABLE_LINEAR_FEATURES
    });
    if (!classification || options.force === true) return classification;
    return LINEAR_FEATURE_POLICY[classification.kind] === true ? classification : null;
  };
  const linearRuntime = createLinearFeatureRuntime({
    appCtx,
    applyBuildingContextSemanticsToFeature,
    classifyLinearFeatureTags,
    classifyStructureSemantics,
    cloneStructureSemantics,
    decimatePoints,
    enableLinearFeatures: ENABLE_LINEAR_FEATURES,
    linearFeatureVisualSpec,
    polylineBounds,
    refreshStructureAwareFeatureProfiles,
    sanitizeWorldPathPoints,
    updateFeatureSurfaceProfile,
    worldBaseTerrainY
  });
  const landusePass = createWorldLandusePass({
    FEATURE_MIN_HOLE_AREA,
    FEATURE_MIN_POLYGON_AREA,
    WATER_VECTOR_TILE_ZOOM,
    addWaterwayRibbon,
    appCtx,
    batchLanduseMeshes,
    decimatePoints,
    fetchVectorTileWater,
    inferWaterRenderContext,
    normalizeWorldRingFromLonLat,
    registerWaterWaveMaterial,
    resolveWaterSurfaceVisualProfile,
    sanitizeWorldFootprintPoints,
    signedPolygonAreaXZ,
    vectorTileRangeForBounds,
    waterSurfaceBaseElevation,
    worldLinePointsFromLonLat
  });
  const { isInsideWaterArea, isVehicleRoad, registerBuildingCollision } = createWorldRoadLoaderSupport({
    addBuildingToSpatialIndex,
    appCtx,
    pointInPolygon: deps.pointInPolygon
  });
  async function loadRoadsInternal(retryPass = 0) {
    const session = createWorldLoadRuntimeSession({
      appCtx,
      clearBuildingSpatialIndex,
      earthSceneSuppressed,
      getAdaptiveLoadProfile,
      getPerfModeValue,
      getRuntimeDynamicBudget,
      getWorldLodThresholds,
      invalidateTraversalNetworks,
      resetWorldForReload,
      resetWorldFurnitureCaches,
      retryPass,
      sameLocation
    });
    if (session.aborted) return;
    const {
      endLoadPhase,
      finalizePerfLoad,
      isActiveLoadContext,
      loadMetrics,
      loadProfile,
      lodThresholds,
      perfModeNow,
      phaseTotals,
      rdtLoadComplexity,
      runtimeState,
      startLoadPhase,
      useRdtBudgeting,
      useSyntheticFallbackRoads
    } = session;
    const radii = loadProfile.radii.slice();
    const featureRadiusScale = loadProfile.featureRadiusScale;
    const poiRadiusScale = loadProfile.poiRadiusScale;
    const maxRoadWays = loadProfile.maxRoadWays;
    const maxBuildingWays = loadProfile.maxBuildingWays;
    const maxLanduseWays = loadProfile.maxLanduseWays;
    const maxPoiNodes = loadProfile.maxPoiNodes;
    const tileBudgetCfg = loadProfile.tileBudgetCfg;
    const lodNearDist = lodThresholds.near;
    const lodMidDist = lodThresholds.mid;
    const overpassTimeoutMs = loadProfile.overpassTimeoutMs;
    const maxTotalLoadMs = loadProfile.maxTotalLoadMs;
    const loadStartedAt = performance.now();
    const recordLoadWarning = (label, err) => recordWorldLoadWarning(loadMetrics, label, err);
    const safeLoadCall = (label, fn) => safeWorldLoadCall(loadMetrics, label, fn);
    let loaded = false;
    let providerUnavailable = false;
    let terrainCoverageReady = false;
    const markLoaded = async (reason) => {
      if (!terrainCoverageReady && (appCtx.roads.length > 0 || appCtx.waterAreas.length > 0 || appCtx.waterways.length > 0)) {
        terrainCoverageReady = await waitForInitialTerrain(appCtx, startLoadPhase, endLoadPhase);
      }
      finalizeLoadedWorld({
        buildTraversalNetworks,
        earthSceneSuppressed,
        hideEarthSceneMeshes,
        loadMetrics,
        markLoaded: () => {
          loaded = true;
          if (runtimeState) {
            runtimeState.geometryReady = true;
            runtimeState.updatedAt = performance.now();
          }
        },
        finalizePresentation: false,
        reason,
        spawnOnRoad,
        updateWorldLod,
        startLoadPhase,
        endLoadPhase
      });
    };
    const createSyntheticWorld = () => {
      createSyntheticFallbackWorld({
        clearBuildingSpatialIndex,
        getRoadSubdivisionStep,
        invalidateTraversalNetworks,
        perfModeNow,
        polylineBounds,
        registerBuildingCollision
      });
    };
    const finalizeNoRoadsWorld = async ({
      sparseReason,
      sparseWarning = '',
      syntheticReason,
      syntheticWarning = ''
    }) => {
      if (!appCtx.worldSurfaceProfile) {
        const profile = classifyWorldSurfaceProfile({ centerLat: Number(appCtx.LOC?.lat || 0) });
        appCtx.setWorldSurfaceProfile?.(profile);
        appCtx.worldSurfaceProfile ||= profile;
      }
      if (useSyntheticFallbackRoads) {
        if (syntheticWarning) console.warn(syntheticWarning);
        createSyntheticWorld();
        await markLoaded(syntheticReason);
        return;
      }
      if (sparseWarning) console.warn(sparseWarning);
      await markLoaded(sparseReason);
    };
    const resolveWaterOnlyStartCandidate = () => {
      if (appCtx.selLoc !== 'custom') return null;
      if (!isPointInsideWaterFootprint(0, 0)) return null;
      const candidate =
        typeof appCtx.inspectBoatCandidate === 'function' ?
          appCtx.inspectBoatCandidate(0, 0, 220) :
          findNearestBoatCandidate(0, 0, 220);
      if (!candidate?.inside) return null;
      const waterKind = String(candidate.waterKind || '').toLowerCase();
      if (!waterKind) return null;
      return candidate;
    };
    const { addLinearFeatureRecord, buildImmediateLinearFeatureDataPass } = linearRuntime;
    for (const radius of radii) {
      if (loaded) break;
      loadMetrics.activeRadiusDeg = radius;
      try {
        if (performance.now() - loadStartedAt > maxTotalLoadMs) {
          console.warn('[Overpass] Max load budget reached, switching to fallback world.');
          break;
        }
        appCtx.showLoad('Loading map data...');
        const overpassPlan = buildWorldOverpassPlan({
          location: appCtx.LOC,
          roadsRadius: radius,
          featureRadiusScale,
          poiRadiusScale,
          overpassTimeoutMs,
          loadStartedAt,
          maxTotalLoadMs
        });
        const {
          buildingPublicationCacheMeta,
          buildingMetadataCacheMeta,
          buildingMetadataQuery,
          buildingPublicationQuery,
          featureRadius,
          loadDeadline,
          overpassCacheMeta,
          primaryQuery
        } = overpassPlan;
        const geometryGuards = buildFeatureGeometryGuards(featureRadius);
        const buildingGeometryGuards = buildBuildingGeometryGuards(
          buildFeatureGeometryGuards(buildingPublicationCacheMeta.featureRadius)
        );
        const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
        buildWaterGeometryGuards(geometryGuards);
        startLoadPhase('fetchOverpass');
        let data;
        try {
          try {
            data = await fetchShortbreadWorldData({
              lat: appCtx.LOC.lat,
              lon: appCtx.LOC.lon,
              radius: Math.max(radius, featureRadius),
              includeBuildings: false
            });
          } catch (vectorErr) {
            recordLoadWarning('vector map data', vectorErr);
            appCtx.showLoad('Loading alternate mapped data...');
            data = await fetchOverpassJSON(primaryQuery, overpassTimeoutMs, loadDeadline, overpassCacheMeta);
          }
        } finally {
          endLoadPhase('fetchOverpass');
        }
        if (data?._overpassSource) loadMetrics.overpassSource = data._overpassSource;
        if (data?._overpassEndpoint) loadMetrics.overpassEndpoint = data._overpassEndpoint;
        if (Number.isFinite(data?._overpassCacheAgeMs)) {
          loadMetrics.overpassCacheAgeMs = Math.floor(data._overpassCacheAgeMs);
        }
        if (earthSceneSuppressed()) {
          loaded = true;
          loadMetrics.recoveryReason = 'env_changed_during_fetch';
          loadMetrics.partialRecovery = true;
          hideEarthSceneMeshes();
          break;
        }
        const nodes = {};
        data.elements.filter((element) => element.type === 'node').forEach((node) => { nodes[node.id] = node; });
        const baselineFullWorld = perfModeNow === 'baseline';
        startLoadPhase('featureBudgeting');
        const normalized = prepareSelectedLocationSource({
          data,
          location: appCtx.LOC,
          nodes,
          prepareSelection: prepareWorldFeatureSelections,
          selectionOptions: {
            baselineFullWorld, classifyLinearFeatureTags,
            classifyStructureSemantics, classifyWorldSurfaceProfile,
            enableLinearFeatures: ENABLE_LINEAR_FEATURES,
            isDriveableHighwayTag, limitNodesByTileBudget,
            limitWaysByTileBudget, linearFeaturePriority, loadMetrics,
            maxBuildingWays, maxLanduseWays, maxPoiNodes, maxRoadWays,
            maxTreeNodes: MAX_TREE_NODES, maxTreeRowWays: MAX_TREE_ROW_WAYS,
            poiKeyFromTags, roadTypePriority: deps.roadTypePriority,
            tileBudgetCfg, useRdtBudgeting
          }
        });
        const selection = normalized.rawSelection;
        endLoadPhase('featureBudgeting');
        const { worldSurfaceProfile } = selection;
        const normalizedSelection = normalized.selection;
        appCtx._worldLoadNodes = normalizedSelection.nodes;
        if (runtimeState) {
          Object.assign(runtimeState, normalized.diagnostics);
        }
        loadMetrics.districtSource = normalized.diagnostics.districtSource;
        if (normalized.budgetWarning) console.warn(normalized.budgetWarning);
        const transportGroundCoverageReady = await waitForSelectedRoadTerrain(
          appCtx,
          normalizedSelection.roadWays,
          normalizedSelection.nodes,
          startLoadPhase,
          endLoadPhase
        );
        terrainCoverageReady = transportGroundCoverageReady ||
          await waitForInitialTerrain(appCtx, startLoadPhase, endLoadPhase);
        if (runtimeState) {
          runtimeState.transportGroundCoverageReady = transportGroundCoverageReady;
          const centerTerrainSource = appCtx.terrainSourceSampleAtLatLon?.(
            appCtx.LOC.lat,
            appCtx.LOC.lon
          ) || null;
          runtimeState.districtGroundModel =
            diagnoseDistrictGroundSource(centerTerrainSource);
        }
        buildRoadGeometryPass({
          appendIndexedGeometry,
          classifyStructureSemantics,
          cloneStructureSemantics,
          decimateRoadCenterlineByDepth,
          endLoadPhase,
          featureTileKeyForLatLon,
          geometryGuards,
          getRoadSubdivisionStep,
          loadMetrics,
          nodes: normalizedSelection.nodes,
          perfModeNow,
          polylineBounds,
          rdtDepthForFeatureTile,
          roadWays: normalizedSelection.roadWays,
          sanitizeWorldPathPoints,
          showLoad: appCtx.showLoad,
          startLoadPhase,
          tileBudgetCfg,
          useRdtBudgeting,
          wayCenterLatLon,
          worldBaseTerrainY
        });
        if (normalizedSelection.buildingWays.length > 0) {
          buildBuildingGeometryPass({
            buildingGeometryGuards,
            buildingWays: normalizedSelection.buildingWays,
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            loadMetrics,
            lodThresholds,
            nodes: normalizedSelection.nodes,
            pickBuildingBaseColor,
            rdtLoadComplexity,
            registerBuildingCollision,
            sanitizeWorldFootprintPoints,
            showLoad: appCtx.showLoad,
            signedPolygonAreaXZ,
            startLoadPhase,
            endLoadPhase,
            useRdtBudgeting
          });
        }
        await landusePass.buildLanduseGeometryPass({
          classifyLanduseType,
          endLoadPhase,
          featureRadius,
          landuseGeometryGuards,
          landuseWays: normalizedSelection.landuseWays,
          loadMetrics,
          nodes: normalizedSelection.nodes,
          startLoadPhase,
          waterwayWays: normalizedSelection.waterwayWays,
          worldSurfaceProfile
        });
        buildImmediateLinearFeatureDataPass({
          cyclewayWays: normalizedSelection.cyclewayWays,
          endLoadPhase,
          footwayWays: normalizedSelection.footwayWays,
          geometryGuards,
          nodes: normalizedSelection.nodes,
          railwayWays: normalizedSelection.railwayWays,
          startLoadPhase,
          structureConnectorWays: normalizedSelection.structureConnectorWays,
          deferStructureRefresh: false
        });
        buildWorldDetailPasses({
          endLoadPhase,
          isActiveLoadContext,
          loadMetrics,
          lodMidDist,
          lodNearDist,
          poiKeyFromTags,
          poiNodes: normalizedSelection.poiNodes,
          startLoadPhase,
        });

        if (appCtx.roads.length > 0) {
          const loadBuildingDetail = () => loadBuildingDetailForPublication({
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            baselineFullWorld,
            buildingGeometryGuards,
            buildBuildingGeometryPass,
            cacheMeta: buildingPublicationCacheMeta,
            deadlineMs: performance.now() + Math.max(12000, overpassTimeoutMs + 2500),
            endLoadPhase,
            fetchOverpassJSON,
            fetchPreferredMetadata: () => fetchBundledBuildingMetadata?.({ locationKey: appCtx.selLoc, lat: appCtx.LOC.lat, lon: appCtx.LOC.lon }),
            fetchPreferredData: () => fetchGlobalBuildingData({
                lat: appCtx.LOC.lat,
                lon: appCtx.LOC.lon,
                radius: buildingPublicationCacheMeta.featureRadius
              }, (error) => recordLoadWarning('Overture building massing fallback', error)),
            isActiveLoadContext,
            location: { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon },
            limitWaysByTileBudget,
            loadMetrics,
            lodThresholds,
            maxBuildingWays,
            metadataCacheMeta: buildingMetadataCacheMeta,
            metadataDeadlineMs: Infinity,
            metadataQuery: buildingMetadataQuery,
            metadataTimeoutMs: 9000,
            pickBuildingBaseColor,
            query: buildingPublicationQuery,
            rdtLoadComplexity,
            recordLoadWarning,
            refreshStructureAwareFeatureProfiles,
            registerBuildingCollision,
            sanitizeWorldFootprintPoints,
            signedPolygonAreaXZ,
            startLoadPhase,
            tileBudgetCfg,
            timeoutMs: overpassTimeoutMs,
            updateWorldLod,
            useRdtBudgeting
          });
          if (appCtx.buildingMeshes.length === 0) {
            appCtx.showLoad('Loading buildings and preparing the world...');
            await loadBuildingDetail();
          }
          await loadLandmarksForPublication({
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            geometryGuards: buildingGeometryGuards,
            isActiveLoadContext,
            loadMetrics,
            recordLoadWarning,
            registerBuildingCollision,
            sanitizeWorldFootprintPoints,
            updateWorldLod
          });
          await markLoaded('primary');
        } else {
          const waterOnlyCandidate = resolveWaterOnlyStartCandidate();
          if (waterOnlyCandidate) {
            console.warn(
              `[WorldLoad] No roads found, but confirmed ${waterOnlyCandidate.waterKind} start water. Finalizing water-only world.`
            );
            appCtx.showLoad('Open water detected. Finalizing water world...');
            await markLoaded('water_only_world');
            continue;
          }
          console.warn('No roads found in data, trying larger area...');
          appCtx.showLoad('No roads found, trying larger area...');
        }
      } catch (err) {
        if (String(err?.message || err).includes('All Overpass endpoints failed')) {
          providerUnavailable = true;
          loadMetrics.providerUnavailable = true;
          loadMetrics.error = err?.message || String(err);
          console.warn('[WorldLoad] Map providers unavailable; using cached or sparse recovery without enlarging the query.', err);
          break;
        }
        const isLastAttempt = radius === radii[radii.length - 1];
        if (appCtx.roads.length > 0) {
          console.warn('[WorldLoad] Recovering with partially loaded world data.');
          loadMetrics.error = err?.message || String(err);
          await markLoaded('partial_after_error');
          break;
        }
        if (!isLastAttempt) {
          console.warn('Road loading attempt failed, retrying with larger area...', err);
          appCtx.showLoad('Retrying map data...');
          continue;
        }

        console.error('Road loading failed after all attempts:', err);
        if (appCtx.roads.length === 0) {
          await finalizeNoRoadsWorld({
            sparseReason: 'no_roads_sparse',
            syntheticReason: 'synthetic_fallback'
          });
        }
      }
    }
    if (!loaded && appCtx.roads.length > 0) {
      console.warn('[WorldLoad] Completing with partially loaded roads.');
      await markLoaded('post_loop_partial');
    }
    if (!loaded && appCtx.roads.length === 0) {
      await finalizeNoRoadsWorld({
        sparseReason: 'no_roads_sparse',
        sparseWarning: '[WorldLoad] No road data found for this location. Loading sparse terrain-only world.',
        syntheticReason: 'synthetic_no_roads',
        syntheticWarning: '[WorldLoad] No road data found for this location. Using synthetic fallback world.'
      });
    }
    if (!loaded && retryPass < 1 && !providerUnavailable) {
      console.warn('[WorldLoad] Initial pass failed. Retrying once automatically...');
      appCtx.showLoad('Retrying map data...');
      appCtx.worldLoading = false;
      return loadRoadsInternal(retryPass + 1);
    }
    if (!loaded) {
      console.warn('[WorldLoad] Final load path failed. Entering fallback recovery mode.');
      if (appCtx.roads.length === 0) {
        await finalizeNoRoadsWorld({
          sparseReason: 'no_roads_final_recovery',
          syntheticReason: 'synthetic_final_recovery'
        });
      } else {
        await markLoaded('partial_final_recovery');
      }
    }

    finishWorldLoadRuntimeSession({
      appCtx,
      finalizePerfLoad,
      loadMetrics,
      loaded,
      phaseTotals,
      runtimeState
    });
  }

  async function loadRoads(retryPass = 0) {
    if (retryPass > 0) return loadRoadsInternal(retryPass);
    if (appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
      appCtx.stopBoatMode({ targetMode: 'walk' });
    }
    const signature = getWorldLoadSignature();
    if (activeWorldLoad && activeWorldLoad.signature === signature) {
      return activeWorldLoad.promise;
    }

    const promise = loadRoadsInternal(0).finally(() => {
      if (activeWorldLoad?.promise === promise) {
        activeWorldLoad = null;
      }
    });
    activeWorldLoad = { signature, promise };
    return promise;
  }

  return {
    isInsideWaterArea,
    isVehicleRoad,
    loadRoads
  };
}
