import { createLinearFeatureRuntime } from "./load-linear-runtime.js?v=9";
import { createWorldLandusePass } from "./load-landuse-pass.js?v=34";
import { createWorldRoadLoaderSupport } from "./load-roads-support.js?v=6";
import { findNearestBoatCandidate, isPointInsideWaterFootprint } from "../boat-mode/water-query.js?v=14";
import {
  createWorldLoadRuntimeSession,
  finishWorldLoadRuntimeSession,
  recordWorldSourceMetrics
} from "./load-runtime-session.js?v=11";
import { scheduleDeferredBuildingLoad } from "./load-building-detail.js?v=21";
async function waitForInitialTerrain(appCtx, startLoadPhase, endLoadPhase) {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return false;
  const waitForCoverage = appCtx.waitForTerrainCoverageAt;
  const waitForCenter = appCtx.waitForTerrainReadyAt;
  if (typeof waitForCoverage !== 'function' && typeof waitForCenter !== 'function') return false;
  startLoadPhase('waitForTerrainCoverage');
  try {
    const startedAt = performance.now();
    const centerReady = typeof waitForCenter === 'function' ? await waitForCenter(0, 0, 14000) : false;
    if (typeof waitForCoverage !== 'function') return centerReady;
    const remainingMs = Math.max(800, 16000 - (performance.now() - startedAt));
    const coverage = await waitForCoverage(0, 0, remainingMs, 0.72);
    return centerReady && coverage?.ready === true;
  } finally {
    endLoadPhase('waitForTerrainCoverage');
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
    fetchShortbreadBuildingData,
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
    scheduleDeferredWorldDetailPasses,
    scheduleDeferredLandmarkLoad,
    scheduleDeferredPoiLoad,
    scheduleDeferredStructureRefresh,
    scheduleDeferredWorldLinearFeatureLoad,
    signedPolygonAreaXZ,
    spawnOnRoad,
    syncLinearFeatureOverlayVisibility,
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
    buildFeatureRibbonEdges,
    classifyLinearFeatureTags,
    classifyStructureSemantics,
    cloneStructureSemantics,
    decimatePoints,
    enableLinearFeatures: ENABLE_LINEAR_FEATURES,
    linearFeatureVisualSpec,
    polylineBounds,
    refreshStructureAwareFeatureProfiles,
    sanitizeWorldPathPoints,
    syncLinearFeatureOverlayVisibility,
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
      addBuildingToSpatialIndex,
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
      locationSelection,
      lodThresholds,
      perfModeNow,
      phaseTotals,
      rdtLoadComplexity,
      releaseStageRollback,
      startLoadPhase,
      transaction,
      worldLoadStage,
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
      await finalizeLoadedWorld({
        buildTraversalNetworks,
        earthSceneSuppressed,
        hideEarthSceneMeshes,
        loadMetrics,
        markLoaded: () => { loaded = true; },
        reason,
        spawnOnRoad,
        updateWorldLod,
        commitWorldStage: worldLoadStage.commit,
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
    const { addLinearFeatureRibbon, buildImmediateLinearFeatureGeometryPass } = linearRuntime;
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
          deferredBuildingCacheMeta,
          deferredBuildingMetadataCacheMeta,
          deferredBuildingMetadataQuery,
          deferredBuildingQuery,
          deferredLandmarkCacheMeta,
          deferredLandmarkQuery,
          deferredLinearFeatureQuery,
          deferredPoiQuery,
          featureRadius,
          loadDeadline,
          overpassCacheMeta,
          primaryQuery
        } = overpassPlan;
        const geometryGuards = buildFeatureGeometryGuards(featureRadius);
        const buildingGeometryGuards = buildBuildingGeometryGuards(
          buildFeatureGeometryGuards(deferredBuildingCacheMeta.featureRadius)
        );
        const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
        buildWaterGeometryGuards(geometryGuards);
        const scheduleDeferredLinearFeatureLoad = () => {
          scheduleDeferredWorldLinearFeatureLoad({
            enabled: ENABLE_LINEAR_FEATURES,
            isActiveLoadContext,
            overpassTimeoutMs,
            deferredLinearFeatureQuery,
            fetchOverpassJSON,
            classifyLinearFeatureTags,
            limitWaysByTileBudget,
            tileBudgetCfg,
            useRdtBudgeting,
            linearFeaturePriority,
            geometryGuards,
            geoToWorld: appCtx.geoToWorld,
            sanitizeWorldPathPoints,
            addLinearFeatureRibbon,
            startLoadPhase,
            endLoadPhase,
            syncLinearFeatureOverlayVisibility,
            rebuildStructureVisualMeshes: appCtx.rebuildStructureVisualMeshes,
            invalidateTraversalNetworks,
            buildTraversalNetworks,
            safeLoadCall,
            updateWorldLod,
            recordLoadWarning
          });
        };
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
        recordWorldSourceMetrics(loadMetrics, data);
        if (earthSceneSuppressed()) {
          loaded = true;
          loadMetrics.recoveryReason = 'env_changed_during_fetch';
          loadMetrics.partialRecovery = true;
          hideEarthSceneMeshes();
          break;
        }
        let nodes = {};
        data.elements.filter((element) => element.type === 'node').forEach((node) => { nodes[node.id] = node; });
        appCtx._worldLoadNodes = nodes;
        const baselineFullWorld = perfModeNow === 'baseline';
        startLoadPhase('featureBudgeting');
        const selection = prepareWorldFeatureSelections({
          baselineFullWorld,
          centerLat: appCtx.LOC?.lat,
          classifyLinearFeatureTags,
          classifyStructureSemantics,
          classifyWorldSurfaceProfile,
          data,
          enableLinearFeatures: ENABLE_LINEAR_FEATURES,
          isDriveableHighwayTag,
          limitNodesByTileBudget,
          limitWaysByTileBudget,
          linearFeaturePriority,
          loadMetrics,
          maxBuildingWays,
          maxLanduseWays,
          maxPoiNodes,
          maxRoadWays,
          maxTreeNodes: MAX_TREE_NODES,
          maxTreeRowWays: MAX_TREE_ROW_WAYS,
          nodes,
          poiKeyFromTags,
          roadTypePriority: deps.roadTypePriority,
          tileBudgetCfg,
          useRdtBudgeting
        });
        endLoadPhase('featureBudgeting');
        const {
          roadWays,
          buildingWays,
          landuseWays,
          waterwayWays,
          railwayWays,
          footwayWays,
          cyclewayWays,
          structureConnectorWays,
          poiNodes,
          requestedCounts,
          worldSurfaceProfile
        } = selection;
        if (Array.isArray(appCtx.osmTreeRows)) {
          appCtx.osmTreeRows.forEach((way) => {
            if (!way || Array.isArray(way._worldPoints) || !Array.isArray(way.nodes)) return;
            way._worldPoints = way.nodes
              .map((id) => nodes[id])
              .filter(Boolean)
              .map((node) => appCtx.geoToWorld(node.lat, node.lon));
          });
        }
        if (
          roadWays.length < requestedCounts.roads ||
          buildingWays.length < requestedCounts.buildings ||
          landuseWays.length < requestedCounts.landuse ||
          poiNodes.length < requestedCounts.pois
        ) {
          console.warn(
            `[WorldLoad] Applied adaptive limits ` +
            `(roads ${roadWays.length}/${requestedCounts.roads}, ` +
            `buildings ${buildingWays.length}/${requestedCounts.buildings}, ` +
            `landuse ${landuseWays.length}/${requestedCounts.landuse}, ` +
            `pois ${poiNodes.length}/${requestedCounts.pois}).`
          );
        }
        terrainCoverageReady = await waitForInitialTerrain(appCtx, startLoadPhase, endLoadPhase);
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
          nodes,
          perfModeNow,
          polylineBounds,
          rdtDepthForFeatureTile,
          roadWays,
          sanitizeWorldPathPoints,
          showLoad: appCtx.showLoad,
          startLoadPhase,
          tileBudgetCfg,
          useRdtBudgeting,
          wayCenterLatLon,
          worldBaseTerrainY
        });
        if (buildingWays.length > 0) {
          buildBuildingGeometryPass({
            buildingGeometryGuards,
            buildingWays,
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            loadMetrics,
            lodThresholds,
            nodes,
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
          landuseWays,
          loadMetrics,
          nodes,
          startLoadPhase,
          waterwayWays,
          worldSurfaceProfile
        });
        buildImmediateLinearFeatureGeometryPass({
          cyclewayWays,
          endLoadPhase,
          footwayWays,
          geometryGuards,
          nodes,
          railwayWays,
          startLoadPhase,
          structureConnectorWays,
          deferStructureRefresh: true
        });
        void scheduleDeferredWorldDetailPasses({
          endLoadPhase,
          isActiveLoadContext,
          loadMetrics,
          lodMidDist,
          lodNearDist,
          poiKeyFromTags,
          poiNodes: poiNodes.slice(),
          startLoadPhase,
          updateWorldLod
        });
        const hasPrimaryPoiCoverage = poiNodes.length > 0;
        [
          roadWays,
          buildingWays,
          landuseWays,
          waterwayWays,
          railwayWays,
          footwayWays,
          cyclewayWays,
          structureConnectorWays,
          poiNodes
        ].forEach((items) => {
          if (Array.isArray(items)) items.length = 0;
        });
        if (Array.isArray(data?.elements)) data.elements.length = 0;
        data = null;
        appCtx._worldLoadNodes = null;
        nodes = null;

        if (appCtx.roads.length > 0) {
          scheduleDeferredLandmarkLoad({
            cacheMeta: deferredLandmarkCacheMeta,
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            fetchOverpassJSON,
            geometryGuards: buildingGeometryGuards,
            isActiveLoadContext,
            loadMetrics,
            query: deferredLandmarkQuery,
            recordLoadWarning,
            registerBuildingCollision,
            sanitizeWorldFootprintPoints,
            timeoutMs: overpassTimeoutMs,
            updateWorldLod
          });
          const schedulePoiDetail = () => scheduleDeferredPoiLoad({
            query: deferredPoiQuery,
            isActiveLoadContext,
            fetchOverpassJSON,
            timeoutMs: overpassTimeoutMs,
            poiKeyFromTags,
            limitNodesByTileBudget,
            maxPoiNodes,
            tileBudgetCfg,
            useRdtBudgeting,
            buildPoiGeometryPass,
            lodNearDist,
            lodMidDist,
            loadMetrics,
            startLoadPhase,
            endLoadPhase,
            updateWorldLod,
            recordLoadWarning
          });
          const scheduleBuildingDetail = (detailOptions = {}) => scheduleDeferredBuildingLoad({
            baselineFullWorld,
            buildingGeometryGuards,
            buildBuildingGeometryPass,
            cacheMeta: deferredBuildingCacheMeta,
            deadlineMs: performance.now() + Math.max(12000, overpassTimeoutMs + 2500),
            delayMs: detailOptions.delayMs,
            deferSurfaceSync: detailOptions.deferSurfaceSync === true,
            endLoadPhase,
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            fetchOverpassJSON,
            fetchPreferredMetadata: () => fetchBundledBuildingMetadata?.({ locationKey: appCtx.selLoc, lat: appCtx.LOC.lat, lon: appCtx.LOC.lon }),
            fetchPreferredData: () => fetchShortbreadBuildingData({
                lat: appCtx.LOC.lat,
                lon: appCtx.LOC.lon,
                radius: deferredBuildingCacheMeta.featureRadius
              }),
            isActiveLoadContext,
            location: { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon },
            limitWaysByTileBudget,
            loadMetrics,
            lodThresholds,
            maxBuildingWays,
            metadataCacheMeta: deferredBuildingMetadataCacheMeta,
            metadataDeadlineMs: performance.now() + 5000,
            metadataQuery: deferredBuildingMetadataQuery,
            metadataTimeoutMs: 4500,
            onSettled: hasPrimaryPoiCoverage ? () => {} : schedulePoiDetail,
            pickBuildingBaseColor,
            query: deferredBuildingQuery,
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
          if (appCtx.buildingMeshes.length > 0) {
            if (!hasPrimaryPoiCoverage) schedulePoiDetail();
          } else {
            appCtx.showLoad('Loading buildings and preparing the world...');
            startLoadPhase('loadBuildingsCritical');
            try {
              await scheduleBuildingDetail({ delayMs: 0, deferSurfaceSync: true });
            } finally {
              endLoadPhase('loadBuildingsCritical');
            }
          }
          await markLoaded('primary');
          if (!Array.isArray(appCtx.linearFeatures) || appCtx.linearFeatures.length === 0) {
            scheduleDeferredLinearFeatureLoad();
          }
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
      locationSelection,
      loaded,
      phaseTotals,
      releaseStageRollback,
      transaction,
      isActiveLoadContext
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
