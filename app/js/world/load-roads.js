import { createLinearFeatureRuntime } from "./load-linear-runtime.js?v=11";
import { createWorldLandusePass } from "./load-landuse-pass.js?v=39";
import { createWorldRoadLoaderSupport } from "./load-roads-support.js?v=9";
import { findNearestBoatCandidate, isPointInsideWaterFootprint } from "../boat-mode/water-query.js?v=18";
import {
  createWorldLoadRuntimeSession,
  finishSupersededWorldLoadRuntimeSession,
  finishWorldLoadRuntimeSession
} from "./load-runtime-session.js?v=60";
import { loadBuildingDetailForPublication } from "./load-building-detail.js?v=25";
import { activateAcceptedGroundForWorldLoad } from "./accepted-ground-activation.js?v=7";
import { createWorldLoadPlan } from "../earth-core/world-load-plan.js?v=1";
import { diagnoseDistrictGroundSource, prepareSelectedLocationSource } from "./compiler/selected-location-source-adapter.js?v=15";
import { shouldLoadDetailedBuildings } from "./settlement-density-policy.js?v=1";
import {
  waitForInitialTerrain,
  waitForTerrainSurfaceMaterials,
  waitForSelectedRoadTerrain
} from "./load-terrain-readiness.js?v=2";
import {
  createWorldLoadCancellationSlot,
  createWorldLoadCoordinator
} from "./world-load-coordinator.js?v=2";
import {
  beginFixedRegionalTransportLoad,
  completeFixedRegionalTransportLoad,
  fixedRegionalRoadGeometryGuards,
  sampleFixedRegionalGround,
  waitForFixedRegionalGround
} from "./fixed-regional-context.js?v=8";
import {
  beginFixedRegionalStructureLoad,
  completeFixedRegionalStructureLoad
} from "./fixed-regional-structures.js?v=15";
import { reviewedCivicFacilitiesForLocation } from "./regional-civic-facilities.js?v=2";

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
    fetchShortbreadBuildingData,
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
    spawnPlayer,
    updateFeatureSurfaceProfile,
    publishLocationWorld,
    vectorTileRangeForBounds,
    waterSurfaceBaseElevation,
    wayCenterLatLon,
    worldBaseTerrainY,
    worldLinePointsFromLonLat
  } = deps;
  const cancellationSlot = createWorldLoadCancellationSlot();
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
    await appCtx.ensureEditableWorldRuntime?.();
    const session = createWorldLoadRuntimeSession({
      appCtx,
      clearBuildingSpatialIndex,
      earthSceneSuppressed,
      getAdaptiveLoadProfile,
      getPerfModeValue,
      getRuntimeDynamicBudget,
      getWorldLodThresholds,
      invalidateTraversalNetworks,
      registerWorldLoadCancellation: cancellationSlot.register,
      resetWorldForReload,
      resetWorldFurnitureCaches,
      retryPass,
      sameLocation
    });
    if (session.aborted) return;
    appCtx.showGroundFallbackPlaceholder?.();
    const {
      endLoadPhase,
      finalizePerfLoad,
      isActiveLoadContext,
      loadMetrics,
      loadProfile,
      lodThresholds,
      perfModeNow,
      phaseTotals,
      releaseWorldLoadCancellation,
      rdtLoadComplexity,
      runtimeState,
      restoreRequestedSelection,
      runProviderWork,
      startLoadPhase,
      syncWorldSessionState,
      useRdtBudgeting,
      useSyntheticFallbackRoads,
      worldSession
    } = session;
    let acceptedGroundReady = false;
    try {
      acceptedGroundReady = await runProviderWork('accepted-ground', 'activate', (signal) =>
        activateAcceptedGroundForWorldLoad({
          appCtx, endLoadPhase, finalizePerfLoad, loadMetrics, runtimeState,
          signal, startLoadPhase
        })
      );
    } catch (error) {
      // A location replacement can arrive while the initial ground catalog is
      // still activating. Cancellation is an expected terminal state for that
      // load, not an exception that should escape through the public loader.
      if (!isActiveLoadContext()) {
        return finishSupersededWorldLoadRuntimeSession(session, 'superseded-during-ground-activation');
      }
      throw error;
    }
    if (!isActiveLoadContext()) return finishSupersededWorldLoadRuntimeSession(session, 'superseded-during-ground-activation');
    if (!acceptedGroundReady) return;
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
        markLoaded: () => {
          // A late title/session restoration must not replace the location
          // that this load actually published.
          restoreRequestedSelection();
          loaded = true;
          if (runtimeState) {
            runtimeState.geometryReady = true;
            runtimeState.updatedAt = performance.now();
          }
        },
        finalizePresentation: false,
        reason,
        spawnPlayer,
        publishLocationWorld,
        startLoadPhase,
        endLoadPhase
      });
      loadMetrics.terrainSurfaceMaterials = await waitForTerrainSurfaceMaterials(
        appCtx,
        startLoadPhase,
        endLoadPhase,
        { radiusWorld: 1500, timeoutMs: 7000 }
      );
      // Terrain classification can debounce a vegetation rebuild. Drain that
      // bounded refinement before the immutable world publication snapshot so
      // runtime collections cannot change one frame after readiness.
      if (typeof appCtx.flushWorldCoverVegetationRefresh === 'function') {
        appCtx.flushWorldCoverVegetationRefresh();
      }
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
    const worldLoadPlan = createWorldLoadPlan({
      surfaceDomain: runtimeState?.surfaceDomain
    });
    loadMetrics.worldLoadPlan = worldLoadPlan;
    runtimeState.worldLoadPlan = worldLoadPlan;
    if (worldLoadPlan.surfaceOnly) {
      worldSession.transition('compiling', worldLoadPlan.id);
      syncWorldSessionState();
      appCtx.worldTraversalRadiusWorld = runtimeState?.surfaceDomain?.kind === 'cryosphere'
        ? 16900
        : null;
      appCtx.showLoad(
        runtimeState?.surfaceDomain?.kind === 'cryosphere'
          ? 'Preparing fixed polar surface...'
          : 'Preparing verified open-ocean surface...'
      );
      await markLoaded('primary');
      return finishWorldLoadRuntimeSession({
        appCtx,
        finalizePerfLoad,
        loadMetrics,
        loaded,
        phaseTotals,
        releaseWorldLoadCancellation,
        runtimeState,
        syncWorldSessionState,
        worldSession
      });
    }
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
      worldSession.transition('fetching', 'fetch-location-providers');
      syncWorldSessionState();
      loadMetrics.activeRadiusDeg = radius;
      // Keep travel actors just inside the district that is actually loaded;
      // this does not change world loading, the visible horizon, map coverage,
      // atmosphere, or sky; it only keeps controllers off clipped data edges.
      const loadedRadiusWorld = radius * Number(appCtx.SCALE || 100000);
      appCtx.worldTraversalRadiusWorld = Math.max(
        900,
        loadedRadiusWorld - Math.max(45, Math.min(80, loadedRadiusWorld * 0.03))
      );
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
          buildingVisibleRadiusWorld: lodThresholds.farVisible,
          overpassTimeoutMs,
          loadStartedAt,
          maxTotalLoadMs
        });
        const {
          buildingPublicationCacheMeta,
          buildingMetadataCacheMeta,
          buildingMetadataQuery,
          buildingPublicationQuery,
          civicFacilityCacheMeta,
          civicFacilityQuery,
          waterStructureCacheMeta,
          waterStructureQuery,
          featureRadius,
          loadDeadline,
          overpassCacheMeta,
          primaryQuery
        } = overpassPlan;
        const geometryGuards = buildFeatureGeometryGuards(featureRadius);
        const regionalRoadGeometryGuards = fixedRegionalRoadGeometryGuards(geometryGuards);
        const buildingGeometryGuards = buildBuildingGeometryGuards(
          buildFeatureGeometryGuards(buildingPublicationCacheMeta.featureRadius)
        );
        const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
        const waterGeometryGuards = buildWaterGeometryGuards(geometryGuards);
        startLoadPhase('fetchFixedRegionalContext');
        const regionalRequest = beginFixedRegionalTransportLoad({ fetchWorldData: fetchShortbreadWorldData, location: appCtx.LOC, runProviderWork });
        startLoadPhase('fetchFixedRegionalStructures');
        const regionalStructureRequest = beginFixedRegionalStructureLoad({
          deadlineMs: loadDeadline,
          fetchOverpassJSON,
          location: appCtx.LOC,
          runProviderWork,
          timeoutMs: Math.min(22000, overpassTimeoutMs)
        });
        const civicFacilityRequest = runProviderWork(
          'osm-overpass',
          'civic-facilities',
          (signal) => fetchOverpassJSON(
            civicFacilityQuery,
            Math.min(12000, overpassTimeoutMs),
            loadDeadline,
            civicFacilityCacheMeta,
            { signal }
          )
        ).then((facilityData) => ({ facilityData, error: null }))
          .catch((error) => ({ facilityData: null, error }));
        startLoadPhase('fetchOverpass');
        let data;
        let exactTransportLoaded = false;
        let mappedWaterStructureCoverageComplete = false;
        try {
          try {
            // Do not hold an empty world behind the full publication timeout.
            // Dense responses normally win quickly; after this bounded probe,
            // the global vector source supplies deterministic sparse coverage.
            const primaryTransportTimeoutMs = Math.min(overpassTimeoutMs, 9000);
            data = await runProviderWork(
              'osm-overpass',
              'transport-and-surface',
              (signal) => fetchOverpassJSON(
                primaryQuery,
                primaryTransportTimeoutMs,
                loadDeadline,
                overpassCacheMeta,
                { signal }
              )
            );
            exactTransportLoaded = true;
            mappedWaterStructureCoverageComplete = true;
          } catch (overpassErr) {
            if (!isActiveLoadContext()) throw overpassErr;
            recordLoadWarning('lossless OpenStreetMap transport data', overpassErr);
            appCtx.showLoad('Loading generalized mapped data...');
          }
        } finally {
          endLoadPhase('fetchOverpass');
        }
        try {
          data = await completeFixedRegionalTransportLoad({
            appCtx,
            coreRadiusMeters: loadedRadiusWorld * Number(appCtx.METERS_PER_WORLD_UNIT || 1),
            exactData: data,
            exactTransportLoaded,
            loadMetrics,
            request: regionalRequest
          });
        } catch (regionalError) {
          if (!isActiveLoadContext()) throw regionalError;
          recordLoadWarning('fixed regional OpenStreetMap context', regionalError);
          if (!data) throw regionalError;
        } finally {
          endLoadPhase('fetchFixedRegionalContext');
        }
        const transportProviderDecision = Object.freeze({
          primaryProvider: 'shortbread-vector',
          optionalExactProvider: 'osm-overpass',
          selected: exactTransportLoaded
            ? 'shortbread-vector+osm-overpass-exact'
            : 'shortbread-vector',
          exactTransportLoaded,
          optionalExactActive: exactTransportLoaded,
          optionalExactUnavailable: !exactTransportLoaded,
          deterministicPriority: Object.freeze(['shortbread-vector', 'osm-overpass-exact-gap-fill'])
        });
        runtimeState.transportProviderDecision = transportProviderDecision;
        loadMetrics.transportProviderDecision = transportProviderDecision;
        try {
          data = await completeFixedRegionalStructureLoad({
            data,
            loadMetrics,
            request: regionalStructureRequest
          });
        } catch (regionalStructureError) {
          if (!isActiveLoadContext()) throw regionalStructureError;
          recordLoadWarning('exact fixed regional bridge and tunnel data', regionalStructureError);
        } finally {
          endLoadPhase('fetchFixedRegionalStructures');
        }
        const civicFacilityResult = await civicFacilityRequest;
        if (civicFacilityResult.facilityData?.elements?.length) {
          const merged = new Map((data?.elements || []).map((element) => [`${element.type}:${element.id}`, element]));
          civicFacilityResult.facilityData.elements.forEach((element) => merged.set(`${element.type}:${element.id}`, element));
          data = { ...data, elements: [...merged.values()] };
          loadMetrics.civicFacilities = {
            provider: 'osm-overpass',
            mapped: civicFacilityResult.facilityData.elements.length,
            status: 'loaded'
          };
        } else {
          loadMetrics.civicFacilities = { provider: 'osm-overpass', mapped: 0, status: 'unavailable' };
          if (civicFacilityResult.error) recordLoadWarning('mapped civic facilities', civicFacilityResult.error);
        }
        const reviewedCivicFacilities = reviewedCivicFacilitiesForLocation(appCtx.LOC);
        if (reviewedCivicFacilities.length) {
          const merged = new Map((data?.elements || []).map((element) => [`${element.type}:${element.id}`, element]));
          reviewedCivicFacilities.forEach((element) => merged.set(`${element.type}:${element.id}`, element));
          data = { ...data, elements: [...merged.values()] };
          loadMetrics.civicFacilities.reviewedRegionalRecords = reviewedCivicFacilities.length;
          loadMetrics.civicFacilities.reviewedRegionalPack = reviewedCivicFacilities[0].regionalPackId;
        }
        runtimeState.regionalStructures = loadMetrics.regionalStructures || null;
        if (data?._overpassSource) loadMetrics.overpassSource = data._overpassSource;
        if (data?._overpassEndpoint) loadMetrics.overpassEndpoint = data._overpassEndpoint;
        if (Number.isFinite(data?._overpassCacheAgeMs)) {
          loadMetrics.overpassCacheAgeMs = Math.floor(data._overpassCacheAgeMs);
        }
        if (!isActiveLoadContext()) {
          loadMetrics.recoveryReason = 'env_changed_during_fetch';
          loadMetrics.partialRecovery = true;
          hideEarthSceneMeshes();
          return finishSupersededWorldLoadRuntimeSession(session, 'superseded-during-provider-fetch');
        }
        await waitForFixedRegionalGround(appCtx, loadMetrics, startLoadPhase, endLoadPhase);
        const nodes = {};
        data.elements.filter((element) => element.type === 'node').forEach((node) => { nodes[node.id] = node; });
        const baselineFullWorld = perfModeNow === 'baseline';
        worldSession.transition('compiling', 'compile-selected-location');
        syncWorldSessionState();
        startLoadPhase('featureBudgeting');
        const normalized = prepareSelectedLocationSource({
          allowWorldwideTerrainFallback:
            runtimeState?.groundMode === 'worldwide-terrain-fallback',
          data,
          location: appCtx.LOC,
          nodes,
          sampleGroundAtLatLon: appCtx.sampleAcceptedGroundAtLatLon,
          sampleRegionalGroundAtLatLon: (latitude, longitude) =>
            sampleFixedRegionalGround(appCtx, loadMetrics, latitude, longitude),
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
        const buildingLoadPolicy = shouldLoadDetailedBuildings(data, {
          worldSurfaceProfile
        });
        loadMetrics.buildings.loadPolicy = buildingLoadPolicy;
        const normalizedSelection = normalized.selection;
        appCtx._worldLoadNodes = normalizedSelection.nodes;
        if (runtimeState) {
          Object.assign(runtimeState, normalized.diagnostics);
          const summarizeReviewedStructures = (ways = []) => ways
            .filter((way) => way?.tags?._fixedRegionalStructure === 'exact')
            .map((way) => ({
              id: String(way.tags?._sourceFeatureId || `osm:way:${way.id}`),
              name: String(way.tags?.name || ''),
              highway: String(way.tags?.highway || ''),
              nodeCount: Number(way.nodes?.length || 0)
            }));
          runtimeState.regionalTransportSelection = loadMetrics.regionalTransportSelection || null;
          runtimeState.reviewedStructureSelection = {
            input: summarizeReviewedStructures(data.elements),
            selected: summarizeReviewedStructures(normalizedSelection.roadWays),
            selectedNamedStructures: normalizedSelection.roadWays
              .filter((way) => {
                const tags = way?.tags || {};
                const engineered = String(tags.bridge || tags.tunnel || tags.covered || '').trim();
                return engineered && String(tags.name || tags['bridge:name'] || tags['tunnel:name'] || tags.ref || '').trim();
              })
              .map((way) => ({
                id: String(way.tags?._sourceFeatureId || `osm:way:${way.id}`),
                name: String(way.tags?.name || way.tags?.['bridge:name'] || way.tags?.['tunnel:name'] || way.tags?.ref || ''),
                sourceCompleteness: String(way.tags?._sourceCompleteness || ''),
                fixedAuthority: String(way.tags?._fixedRegionalStructure || way.tags?._fallbackStructureAuthority || ''),
                nodeCount: Number(way.nodes?.length || 0)
              }))
          };
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
          const worldwideFallback =
            runtimeState.groundMode === 'worldwide-terrain-fallback';
          const centerTerrainSource = worldwideFallback
            ? appCtx.terrainSourceSampleAtLatLon?.(appCtx.LOC.lat, appCtx.LOC.lon) || null
            : appCtx.sampleAcceptedGroundAtLatLon?.(appCtx.LOC.lat, appCtx.LOC.lon) || null;
          runtimeState.districtGroundModel =
            diagnoseDistrictGroundSource(centerTerrainSource, {
              allowWorldwideTerrainFallback: worldwideFallback
            });
        }
        const roadFeatureCompilation = await buildRoadGeometryPass({
          classifyStructureSemantics,
          cloneStructureSemantics,
          decimateRoadCenterlineByDepth,
          endLoadPhase,
          featureTileKeyForLatLon,
          geometryGuards: regionalRoadGeometryGuards,
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
        if (roadFeatureCompilation?.meshCount !== 0 || appCtx.roadMeshes.length !== 0) {
          throw new Error('Road feature compilation published visual meshes before final terrain authority');
        }
        if (runtimeState) {
          runtimeState.roadFeatureCompilation = roadFeatureCompilation;
        }
        // Building publication is deferred to the Phase 4 authority pass.
        // Publishing the district-source footprints here and then appending an
        // Overture/OSM detail pass creates two owners for the same buildings.
        loadMetrics.buildings.deferredSourceWays = normalizedSelection.buildingWays.length;
        await landusePass.buildLanduseGeometryPass({
          classifyLanduseType,
          endLoadPhase,
          featureRadius,
          landuseGeometryGuards,
          waterGeometryGuards,
          landuseWays: normalizedSelection.landuseWays,
          loadMetrics,
          nodes: normalizedSelection.nodes,
          isActiveLoadContext,
          runProviderWork,
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
          // Roads, connectors, and buildings are all known only at finalization.
          // Compiling here would publish a graph that is immediately discarded.
          deferStructureRefresh: true
        });
        buildWorldDetailPasses({
          endLoadPhase,
          isActiveLoadContext,
          loadMetrics,
          lodMidDist,
          lodNearDist,
          mappedFurnitureNodes: Object.values(normalizedSelection.nodes || {}).filter((node) => {
            const highway = String(node?.tags?.highway || '').toLowerCase();
            const amenity = String(node?.tags?.amenity || '').toLowerCase();
            return /^(traffic_signals|stop|give_way|street_lamp)$/.test(highway) || amenity === 'waste_basket';
          }),
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
            fetchOverpassJSON: (...args) => runProviderWork(
              'osm-overpass', 'building-detail', (signal) => fetchOverpassJSON(...args, { signal })
            ),
            fetchPreferredMetadata: () => runProviderWork(
              'bundled-building-pack',
              'building-metadata',
              (signal) => fetchBundledBuildingMetadata?.({
                coverageRadiusDegrees: buildingPublicationCacheMeta.featureRadius,
                locationKey: appCtx.selLoc,
                lat: appCtx.LOC.lat,
                lon: appCtx.LOC.lon,
                signal
              })
            ),
            fetchPreferredData: buildingLoadPolicy.shouldLoad
              ? () => runProviderWork('overture', 'building-detail', (signal) =>
                  fetchGlobalBuildingData({
                    lat: appCtx.LOC.lat,
                    lon: appCtx.LOC.lon,
                    radius: buildingPublicationCacheMeta.featureRadius,
                    bounds: buildingPublicationCacheMeta.bounds,
                    visibilityRadiusWorld: buildingPublicationCacheMeta.visibleRadiusWorld,
                    signal
                  })
                )
              : null,
            fetchFallbackData: buildingLoadPolicy.shouldLoad
              ? () => runProviderWork('openstreetmap-shortbread', 'building-detail-fallback', async (signal) => {
                  const fallback = await fetchShortbreadBuildingData({
                    lat: appCtx.LOC.lat,
                    lon: appCtx.LOC.lon,
                    radius: buildingPublicationCacheMeta.featureRadius,
                    bounds: buildingPublicationCacheMeta.bounds,
                    signal
                  });
                  if (fallback?._shortbreadTiles?.coverageComplete !== true) {
                    throw new Error(
                      `Shortbread building coverage incomplete: ` +
                      `${fallback?._shortbreadTiles?.loaded || 0}/${fallback?._shortbreadTiles?.requested || 0} tiles`
                    );
                  }
                  fallback._buildingProviderDecision = {
                    selected: 'shortbread',
                    authority: 'generalized',
                    status: fallback._shortbreadTiles?.status || 'available',
                    fallbackStarted: true,
                    reason: 'overture-unavailable'
                  };
                  return fallback;
                })
              : null,
            skipReason: buildingLoadPolicy.shouldLoad
              ? ''
              : 'no-settlement-evidence',
            isActiveLoadContext,
            location: { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon },
            limitWaysByTileBudget,
            loadMetrics,
            lodThresholds,
            mappedWaterStructureData: data,
            mappedWaterStructureCoverageComplete,
            maxBuildingWays,
            metadataCacheMeta: buildingMetadataCacheMeta,
            metadataDeadlineMs: Infinity,
            metadataQuery: buildingMetadataQuery,
            metadataTimeoutMs: 9000,
            pickBuildingBaseColor,
            query: buildingPublicationQuery,
            rdtLoadComplexity,
            recordLoadWarning,
            registerBuildingCollision,
            sanitizeWorldFootprintPoints,
            signedPolygonAreaXZ,
            startLoadPhase,
            tileBudgetCfg,
            timeoutMs: overpassTimeoutMs,
            waterStructureCacheMeta,
            waterStructureDeadlineMs: Infinity,
            waterStructureQuery,
            waterStructureTimeoutMs: 9000,
            useRdtBudgeting
          });
          appCtx.showLoad('Loading buildings and preparing the world...');
          await loadBuildingDetail();
          if (!isActiveLoadContext()) {
            return finishSupersededWorldLoadRuntimeSession(session, 'superseded-during-building-publication');
          }
          await loadLandmarksForPublication({
            featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
            geometryGuards: buildingGeometryGuards,
            isActiveLoadContext,
            loadMetrics,
            recordLoadWarning,
            registerBuildingCollision,
            runProviderWork,
            sanitizeWorldFootprintPoints
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
          if (!buildingLoadPolicy.shouldLoad) {
            console.warn(
              '[WorldLoad] No transport or settlement evidence found. Finalizing sparse terrain without expanding the query.'
            );
            await finalizeNoRoadsWorld({
              sparseReason: 'no_settlement_sparse',
              sparseWarning: '[WorldLoad] Sparse real-data location detected; skipping larger settlement queries.',
              syntheticReason: 'synthetic_no_settlement'
            });
            continue;
          }
          console.warn('No roads found in data, trying larger area...');
          appCtx.showLoad('No roads found, trying larger area...');
        }
      } catch (err) {
        if (!isActiveLoadContext()) {
          return finishSupersededWorldLoadRuntimeSession(session, 'superseded-after-provider-error');
        }
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
      worldSession.fail('automatic-retry');
      syncWorldSessionState();
      releaseWorldLoadCancellation();
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

    if (!isActiveLoadContext()) {
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-before-publication');
    }
    return finishWorldLoadRuntimeSession({
      appCtx,
      finalizePerfLoad,
      loadMetrics,
      loaded,
      phaseTotals,
      releaseWorldLoadCancellation,
      runtimeState,
      syncWorldSessionState,
      worldSession
    });
  }

  const { loadWorld: loadRoads } = createWorldLoadCoordinator({
    appCtx,
    cancelActive: cancellationSlot.cancel,
    getWorldLoadSignature,
    loadWorld: loadRoadsInternal
  });

  return {
    isInsideWaterArea,
    isVehicleRoad,
    loadRoads
  };
}
