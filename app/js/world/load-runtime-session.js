import { createBuildingProvenanceSnapshot } from './building-provenance-model.js?v=1';
import {
  markFirstPlayReady,
  scheduleAfterFirstPlay
} from '../runtime/workload-policy.js?v=1';
import {
  createSelectionRestoreCommand,
  createWorldLoadRequest,
  isWorldLoadRequestActive
} from '../earth-core/world-load-request.js?v=1';
import { createWorldLoadSession } from '../earth-core/world-load-session.js?v=1';
import { WORLD_COLLECTION_NAMES } from './collection-registry.js?v=1';
import { compileWorldLayerProducts } from './compiler/world-layer-products.js?v=4';
import { publishWorldPublicationSnapshot } from './world-snapshot-adapter.js?v=4';

export function createWorldLoadRuntimeSession(options = {}) {
  const {
    appCtx,
    clearBuildingSpatialIndex,
    earthSceneSuppressed,
    getAdaptiveLoadProfile,
    getPerfModeValue,
    getRuntimeDynamicBudget,
    getWorldLodThresholds,
    invalidateTraversalNetworks,
    registerWorldLoadCancellation,
    resetWorldForReload,
    resetWorldFurnitureCaches,
    retryPass = 0,
    sameLocation
  } = options;

  const locationSelection = appCtx.resolveLocationSelection?.() || null;
  const nextLoadSequence = Number(appCtx._worldLoadSequence || 0) + 1;
  const loadRequest = createWorldLoadRequest(locationSelection, nextLoadSequence);
  const locName = loadRequest?.name || 'Unknown location';
  const perfModeNow = getPerfModeValue();
  const useRdtBudgeting = perfModeNow === 'rdt';
  const loadMetrics = {
    mode: perfModeNow,
    location: locName,
    retryPass,
    success: false,
    lod: { near: 0, mid: 0, midSkipped: 0, farSkipped: 0 },
    roads: { requested: 0, selected: 0, sourcePoints: 0, decimatedPoints: 0, subdividedPoints: 0, vertices: 0 },
    buildings: { requested: 0, selected: 0 },
    colliders: { full: 0, simplified: 0 },
    landuse: { requested: 0, selected: 0 },
    linearFeatures: {
      railway: { requested: 0, selected: 0 },
      footway: { requested: 0, selected: 0 },
      cycleway: { requested: 0, selected: 0 }
    },
    vegetation: {
      treesRequested: 0,
      treesSelected: 0,
      treeRowsRequested: 0,
      treeRowsSelected: 0,
      generated: 0
    },
    pois: { requested: 0, selected: 0, near: 0, mid: 0, far: 0 },
    commercePlaces: { provider: 'osm-overpass', mapped: 0, status: 'pending', inventoryAuthority: 'world-explorer-gameplay' },
    transportFacilities: { provider: 'osm-overpass', mapped: 0, aviation: 0, maritime: 0, status: 'pending', bounded: true },
    phases: {}
  };
  const traceWorldLoad = typeof globalThis.location?.search === 'string' &&
    new URLSearchParams(globalThis.location.search).get('worldLoadTrace') === '1';
  const traceLoadPhase = (event, name, details = {}) => {
    if (!traceWorldLoad) return;
    console.warn(`[WorldLoadTrace] ${event} ${name}`, JSON.stringify(details));
  };

  appCtx._lastBuildingBatchStats = null;
  appCtx._lastLanduseBatchStats = null;
  if (typeof appCtx.startPerfLoad === 'function') {
    appCtx.startPerfLoad('world-load', { mode: perfModeNow, location: locName });
  }

  let perfLoadFinalized = false;
  const finalizePerfLoad = (success, extra = {}) => {
    if (perfLoadFinalized) return;
    perfLoadFinalized = true;
    loadMetrics.success = !!success;
    const payload = { ...loadMetrics, ...extra };
    if (typeof appCtx.finishPerfLoad === 'function') appCtx.finishPerfLoad(payload);
  };

  const phaseStartedAt = Object.create(null);
  const phaseTotals = Object.create(null);
  let runtimeState = null;
  const startLoadPhase = (name) => {
    if (!name) return;
    phaseStartedAt[name] = performance.now();
    traceLoadPhase('start', name, {
      roads: Number(appCtx.roads?.length || 0),
      roadMeshes: Number(appCtx.roadMeshes?.length || 0)
    });
    if (runtimeState) {
      runtimeState.activePhases = Object.keys(phaseStartedAt);
      runtimeState.updatedAt = performance.now();
    }
  };
  const endLoadPhase = (name) => {
    if (!name) return;
    const startedAt = phaseStartedAt[name];
    if (!Number.isFinite(startedAt)) return;
    const dt = performance.now() - startedAt;
    phaseTotals[name] = (phaseTotals[name] || 0) + dt;
    traceLoadPhase('end', name, { durationMs: Math.round(dt) });
    delete phaseStartedAt[name];
    if (runtimeState) {
      runtimeState.activePhases = Object.keys(phaseStartedAt);
      runtimeState.lastCompletedPhase = name;
      runtimeState.updatedAt = performance.now();
    }
  };

  resetWorldForReload({
    clearBuildingSpatialIndex,
    invalidateTraversalNetworks,
    loadSequence: nextLoadSequence,
    locName,
    resetWorldFurnitureCaches
  });
  appCtx.initialEarthWorldReady = false;
  appCtx.worldDetailState = {};
  appCtx.buildingProvenanceRecords = [];
  appCtx.buildingProvenanceFeatureIds = new Set();
  appCtx.buildingProvenanceModel = null;
  appCtx.waterSurfaceRegistry = null;
  appCtx.waterSurfaceRegistrySnapshot = null;
  appCtx.transportFacilityGraph = null;

  if (!loadRequest) {
    appCtx.showLoad('Choose a valid location');
    appCtx.worldLoading = false;
    appCtx.discardEarthWorldSceneLoad?.(nextLoadSequence);
    appCtx.enforceEnvironmentSceneOwnership?.();
    finalizePerfLoad(false, { reason: 'invalid_location_selection' });
    return { aborted: true };
  }
  appCtx.LOC = { ...loadRequest.location };
  if (loadRequest.selection.key === 'custom') {
    appCtx.setCustomLocation?.(loadRequest.selection, { syncInputs: false });
  }
  appCtx.setTravelMode?.('walk', {
    source: 'location_load',
    force: true,
    emitTutorial: false
  });

  const loadLocation = loadRequest.location;
  const worldSession = createWorldLoadSession(loadRequest, { now: () => performance.now() });
  const providerAbortController = new AbortController();
  const restoreCommand = createSelectionRestoreCommand(loadRequest);
  const restoreRequestedSelection = () => {
    if (restoreCommand?.method === 'setCustomLocation') {
      appCtx.setCustomLocation?.(restoreCommand.selection, restoreCommand.options);
    } else if (restoreCommand?.method === 'selectPresetLocation') {
      appCtx.selectPresetLocation?.(restoreCommand.key);
    }
  };
  const loadSequence = appCtx._worldLoadSequence = loadRequest.sequence;
  runtimeState = appCtx.worldLoadRuntimeState = {
    sequence: loadSequence,
    status: 'loading',
    location: { ...loadLocation, name: locName },
    retryPass,
    startedAt: performance.now(),
    updatedAt: performance.now(),
    activePhases: [],
    lastCompletedPhase: '',
    geometryReady: false,
    session: worldSession.snapshot()
  };
  const syncWorldSessionState = () => {
    if (runtimeState) runtimeState.session = worldSession.snapshot();
    return runtimeState?.session || null;
  };
  worldSession.transition('fetching', 'world-load-started');
  syncWorldSessionState();
  const isActiveLoadContext = () => {
    const active = isWorldLoadRequestActive(loadRequest, {
      activeSequence: appCtx._worldLoadSequence,
      activeLocation: appCtx.LOC,
      sameLocation,
      suppressed: earthSceneSuppressed()
    });
    if (!active && worldSession.isActive()) {
      providerAbortController.abort('world-load-context-changed');
      worldSession.supersede('world-load-context-changed');
      syncWorldSessionState();
    }
    return active;
  };
  const runProviderWork = async (provider, operation, task) => {
    const token = worldSession.beginProviderWork(provider, operation);
    syncWorldSessionState();
    try {
      const result = await task(providerAbortController.signal);
      if (token) worldSession.settleProviderWork(token, isActiveLoadContext() ? 'completed' : 'discarded');
      syncWorldSessionState();
      return result;
    } catch (error) {
      const outcome = providerAbortController.signal.aborted || error?.name === 'AbortError'
        ? 'aborted'
        : 'failed';
      if (token) worldSession.settleProviderWork(token, outcome);
      syncWorldSessionState();
      throw error;
    }
  };
  const releaseWorldLoadCancellation = typeof registerWorldLoadCancellation === 'function'
    ? registerWorldLoadCancellation((reason = 'superseded') => {
        if (!worldSession.isActive()) return false;
        providerAbortController.abort(reason);
        worldSession.supersede(reason);
        syncWorldSessionState();
        return true;
      })
    : () => {};

  appCtx.car.x = 0;
  appCtx.car.z = 0;
  appCtx.car.vx = 0;
  appCtx.car.vz = 0;
  appCtx.car.vy = 0;
  if (appCtx.drone) {
    appCtx.drone.x = 0;
    appCtx.drone.z = 0;
  }
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
    appCtx.Walk.state.walker.x = 0;
    appCtx.Walk.state.walker.z = 0;
    appCtx.Walk.state.walker.vy = 0;
  }

  appCtx.rdtSeed = appCtx.hashGeoToInt(
    appCtx.LOC.lat,
    appCtx.LOC.lon,
    appCtx.gameMode === 'trial' ? 1 :
    appCtx.gameMode === 'checkpoint' ? 2 :
    appCtx.gameMode === 'painttown' ? 3 :
    0
  );
  const sharedSeedOverrideRaw = Number(appCtx.sharedSeedOverride);
  if (Number.isFinite(sharedSeedOverrideRaw)) {
    appCtx.rdtSeed = (Math.floor(sharedSeedOverrideRaw) | 0) >>> 0;
  }
  const rawRdtComplexity = appCtx.rdtDepth(appCtx.rdtSeed, 1.5);
  const rdtLoadComplexity = appCtx.rdtDepth(appCtx.rdtSeed % 1000000 + 2, 1.5);
  appCtx.rdtComplexity = useRdtBudgeting ? rawRdtComplexity : 0;

  const dynamicBudgetState = getRuntimeDynamicBudget(perfModeNow);
  const loadProfile = getAdaptiveLoadProfile(
    rdtLoadComplexity,
    perfModeNow,
    dynamicBudgetState.budgetScale,
    dynamicBudgetState.deviceClass
  );
  const lodThresholds = getWorldLodThresholds(rdtLoadComplexity, perfModeNow, dynamicBudgetState.lodScale);
  const plannedDetailRadiusDeg = Number(loadProfile.radii?.[0]);
  appCtx.plannedEarthDetailRadiusWorld = Number.isFinite(plannedDetailRadiusDeg)
    ? Math.max(800, Math.round(plannedDetailRadiusDeg * (appCtx.SCALE || 100000) * 0.92))
    : 1050;
  appCtx.dynamicBudgetScale = dynamicBudgetState.budgetScale;
  appCtx.dynamicLodScale = dynamicBudgetState.lodScale;

  loadMetrics.rdtLoadComplexity = rdtLoadComplexity;
  appCtx.rdtLoadComplexity = rdtLoadComplexity;
  loadMetrics.rdtComplexity = rawRdtComplexity;
  loadMetrics.radii = loadProfile.radii.slice();
  loadMetrics.lodThresholds = lodThresholds;
  loadMetrics.loadProfile = {
    dynamicBudgetScale: dynamicBudgetState.budgetScale,
    dynamicLodScale: dynamicBudgetState.lodScale,
    maxRoadWays: loadProfile.maxRoadWays,
    maxBuildingWays: loadProfile.maxBuildingWays,
    maxLanduseWays: loadProfile.maxLanduseWays,
    maxPoiNodes: loadProfile.maxPoiNodes,
    tileBudgetCfg: loadProfile.tileBudgetCfg,
    overpassTimeoutMs: loadProfile.overpassTimeoutMs,
    optionalProviderTimeoutMs: loadProfile.optionalProviderTimeoutMs,
    fixedRegionalGroundTimeoutMs: loadProfile.fixedRegionalGroundTimeoutMs,
    regionalContextRadiusMeters: loadProfile.regionalContextRadiusMeters,
    maxTotalLoadMs: loadProfile.maxTotalLoadMs
  };
  runtimeState.loadProfile = { ...loadMetrics.loadProfile };
  loadMetrics.dynamicBudget = {
    auto: !!dynamicBudgetState.auto,
    tier: dynamicBudgetState.tier || 'balanced',
    budgetScale: dynamicBudgetState.budgetScale,
    lodScale: dynamicBudgetState.lodScale,
    reason: dynamicBudgetState.reason || null
  };

  return {
    appCtx,
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
    restoreRequestedSelection,
    releaseWorldLoadCancellation,
    runProviderWork,
    startLoadPhase,
    syncWorldSessionState,
    useRdtBudgeting,
    useSyntheticFallbackRoads:
      appCtx.gameMode === 'trial' ||
      appCtx.gameMode === 'checkpoint' ||
      appCtx.gameMode === 'painttown',
    worldSession
  };
}

export function worldPublicationCounts(appCtx = {}) {
  return Object.freeze(Object.fromEntries(
    WORLD_COLLECTION_NAMES.map((name) => [
      name,
      Array.isArray(appCtx[name]) ? appCtx[name].length : 0
    ])
  ));
}

export function verifyWorldPublicationStable(appCtx = {}, publication = null) {
  const expected = publication?.counts || null;
  const actual = worldPublicationCounts(appCtx);
  if (!expected) {
    return Object.freeze({
      stable: false,
      reason: 'publication-snapshot-missing',
      changes: Object.freeze([]),
      actual
    });
  }
  const changes = WORLD_COLLECTION_NAMES
    .filter((name) => Number(expected[name]) !== Number(actual[name]))
    .map((name) => Object.freeze({
      collection: name,
      expected: Number(expected[name]),
      actual: Number(actual[name])
    }));
  return Object.freeze({
    stable: changes.length === 0,
    reason: changes.length === 0 ? null : 'published-world-mutated',
    changes: Object.freeze(changes),
    actual
  });
}

function gameplayRuntimeMatchesPublication(runtime, publication) {
  if (!runtime || !publication) return false;
  const sequence = Number(runtime.sequence ?? runtime.publication?.sequence);
  const requestId = String(runtime.requestId ?? runtime.publication?.requestId ?? '');
  return sequence === Number(publication.sequence) && requestId === String(publication.requestId || '');
}

function disposeGameplayRuntimesForPublication(appCtx, publication, reason) {
  if (gameplayRuntimeMatchesPublication(appCtx.worldDiscoveryRuntime, publication)) {
    appCtx.disposeWorldDiscoveryRuntime?.(reason);
  }
  if (gameplayRuntimeMatchesPublication(appCtx.urbanSandboxRuntime, publication)) {
    appCtx.disposeUrbanSandboxRuntime?.(reason);
  }
  if (gameplayRuntimeMatchesPublication(appCtx.aviationRuntime, publication)) {
    appCtx.disposeAviationRuntime?.(reason);
  }
  if (gameplayRuntimeMatchesPublication(appCtx.maritimeRuntime, publication)) {
    appCtx.disposeMaritimeRuntime?.(reason);
  }
  if (gameplayRuntimeMatchesPublication(appCtx.livingWorldRuntime, publication)) {
    appCtx.disposeLivingWorldRuntime?.(reason);
  }
}

export async function finishWorldLoadRuntimeSession(session = {}) {
  const {
    appCtx, finalizePerfLoad, loadMetrics, phaseTotals, releaseWorldLoadCancellation,
    runtimeState, syncWorldSessionState, worldSession, loaded = false
  } = session;
  if (!appCtx) return;

  const loadedRadiusDeg = Number(loadMetrics?.activeRadiusDeg);
  appCtx.initialEarthDetailRadius = Number.isFinite(loadedRadiusDeg)
    ? Math.max(800, Math.round(loadedRadiusDeg * (appCtx.SCALE || 100000) * 0.92))
    : 1050;

  appCtx.initialEarthWorldReady = !!loaded;
  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: loadMetrics.lod.near, mid: loadMetrics.lod.mid });
    appCtx.setPerfLiveStat('worldCounts', {
      roads: appCtx.roads.length,
      buildings: appCtx.buildingMeshes.length,
      poiMeshes: appCtx.poiMeshes.length,
      landuseMeshes: appCtx.landuseMeshes.length
    });
  }
  if (phaseTotals && typeof phaseTotals === 'object') {
    loadMetrics.phases = Object.fromEntries(
      Object.entries(phaseTotals).map(([name, ms]) => [name, Math.round(ms)])
    );
    if (runtimeState) runtimeState.phaseTotals = { ...loadMetrics.phases };
  }
  loadMetrics.initialEarthDetailRadius = appCtx.initialEarthDetailRadius;
  appCtx.buildingProvenanceModel = createBuildingProvenanceSnapshot(
    appCtx.buildingProvenanceRecords || []
  );
  appCtx.waterSurfaceRegistrySnapshot =
    appCtx.waterSurfaceRegistry?.snapshot?.() || null;
  appCtx.reconcileActorsAfterSurfaceRebuild?.();
  const publicationCounts = worldPublicationCounts(appCtx);
  const terrainCount = Array.isArray(appCtx.terrainGroup?.children)
    ? appCtx.terrainGroup.children.filter((mesh) => mesh?.userData?.isTerrainMesh).length
    : 0;
  const layerProducts = compileWorldLayerProducts({
    request: worldSession?.request,
    counts: publicationCounts,
    runtimeState,
    loadMetrics,
    detailRadiusWorld: appCtx.initialEarthDetailRadius,
    terrainCount,
    artifacts: {
      transportSurfacePublication: appCtx.transportSurfacePublication,
      buildingProvenanceModel: appCtx.buildingProvenanceModel,
      waterSurfaceRegistrySnapshot: appCtx.waterSurfaceRegistrySnapshot
    }
  });
  if (runtimeState) runtimeState.layerProducts = layerProducts;
  const publication = publishWorldPublicationSnapshot(appCtx, {
    request: worldSession?.request,
    layerProducts,
    createdAt: performance.now()
  });
  // Publish the completed scene while it is still hidden by worldLoading. The
  // living-world, interaction, and Explorer runtimes all compile against this
  // immutable publication and are required for a playable Earth session. They
  // used to start from an idle callback after the loading screen disappeared,
  // which made city changes report ready and then freeze for seconds while the
  // main thread built navigation graphs and encounter plans.
  appCtx.publishEarthWorldSceneLoad?.(publication.sequence);
  if (runtimeState) {
    runtimeState.status = 'starting-gameplay';
    runtimeState.gameplayRuntimesReady = false;
    runtimeState.updatedAt = performance.now();
  }
  const gameplayRuntimeStartedAt = performance.now();
  let livingWorld = null;
  let urbanSandbox = null;
  let aviation = null;
  let maritime = null;
  let worldDiscovery = null;
  const gameplayStartupDurationsMs = Object.create(null);
  const measureGameplayStartup = async (name, task) => {
    const startedAt = performance.now();
    try {
      return await task();
    } finally {
      gameplayStartupDurationsMs[name] = Math.round(performance.now() - startedAt);
    }
  };
  const startupIsCurrent = () => !!(
    worldSession?.isActive?.() &&
    appCtx.worldPublication?.requestId === publication.requestId &&
    appCtx.worldPublication?.sequence === publication.sequence
  );
  try {
    // Fetch and evaluate independent runtime modules as one dependency stage.
    // Runtime construction remains deliberately ordered below because urban
    // interaction consumes Living World and Explorer consumes the published
    // interaction authorities.
    const moduleLoadStartedAt = performance.now();
    const [
      livingWorldModule,
      urbanSandboxModule,
      aviationModule,
      maritimeModule,
      worldDiscoveryModule
    ] = await Promise.all([
      import('../living-world/runtime.js?v=26'),
      import('../urban-sandbox/runtime.js?v=65'),
      import('../transport/aviation-runtime.js?v=17'),
      import('../transport/maritime-runtime.js?v=16'),
      import('../discovery/runtime.js?v=29')
    ]);
    gameplayStartupDurationsMs.moduleLoad = Math.round(performance.now() - moduleLoadStartedAt);
    if (!startupIsCurrent()) {
      disposeGameplayRuntimesForPublication(appCtx, publication, 'superseded-gameplay-startup');
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-before-living-world-startup');
    }
    livingWorld = await measureGameplayStartup('livingWorld', () => livingWorldModule.startLivingWorldRuntime(appCtx, {
      snapshot: publication,
      request: worldSession?.request
    }));
    if (!livingWorld) throw new Error('Living World did not start for the active publication.');
    if (!startupIsCurrent()) {
      disposeGameplayRuntimesForPublication(appCtx, publication, 'superseded-gameplay-startup');
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-before-urban-sandbox-startup');
    }
    urbanSandbox = await measureGameplayStartup('urbanSandbox', () => urbanSandboxModule.startUrbanSandboxRuntime({
      snapshot: publication,
      request: worldSession?.request,
      livingWorld
    }));
    if (!urbanSandbox) throw new Error('Urban Sandbox did not start for the active publication.');
    if (!startupIsCurrent()) {
      disposeGameplayRuntimesForPublication(appCtx, publication, 'superseded-gameplay-startup');
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-before-aviation-startup');
    }
    aviation = await measureGameplayStartup('aviation', () => aviationModule.startAviationRuntime({
      snapshot: publication,
      request: worldSession?.request
    }));
    if (!aviation) throw new Error('Aviation runtime did not start for the active publication.');
    if (!startupIsCurrent()) {
      disposeGameplayRuntimesForPublication(appCtx, publication, 'superseded-gameplay-startup');
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-before-maritime-startup');
    }
    maritime = await measureGameplayStartup('maritime', () => maritimeModule.startMaritimeRuntime({
      snapshot: publication,
      request: worldSession?.request
    }));
    if (!maritime) throw new Error('Maritime runtime did not start for the active publication.');
    if (!startupIsCurrent()) {
      disposeGameplayRuntimesForPublication(appCtx, publication, 'superseded-gameplay-startup');
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-before-explorer-startup');
    }
    worldDiscovery = await measureGameplayStartup('worldDiscovery', () => worldDiscoveryModule.startWorldDiscoveryRuntime(appCtx, {
      snapshot: publication,
      request: worldSession?.request
    }));
    if (!worldDiscovery) throw new Error('Explorer runtime did not start for the active publication.');
  } catch (error) {
    disposeGameplayRuntimesForPublication(appCtx, publication, 'gameplay-startup-failed');
    if (worldSession?.isActive?.() === false) {
      return finishSupersededWorldLoadRuntimeSession(session, 'superseded-during-gameplay-runtime-startup');
    }
    if (runtimeState) {
      runtimeState.status = 'failed';
      runtimeState.gameplayRuntimesReady = false;
      runtimeState.gameplayRuntimeError = String(error?.message || error);
      runtimeState.updatedAt = performance.now();
      runtimeState.finishedAt = runtimeState.updatedAt;
    }
    console.warn('[WorldLoad] Essential Earth gameplay runtime startup failed:', error);
    worldSession?.fail?.('essential-gameplay-runtime-startup-failed');
    syncWorldSessionState?.();
    appCtx.worldLoading = false;
    appCtx.enforceEnvironmentSceneOwnership?.();
    appCtx.hideLoad?.();
    appCtx.showToast?.('This location could not finish loading. Try switching locations or reload.');
    finalizePerfLoad(false, { reason: 'essential-gameplay-runtime-startup-failed' });
    releaseWorldLoadCancellation?.();
    return worldSession?.snapshot?.() || null;
  }
  if (runtimeState) {
    runtimeState.gameplayRuntimesReady = !!(
      livingWorld && urbanSandbox && aviation && maritime && worldDiscovery &&
      appCtx.livingWorldRuntime && appCtx.urbanSandboxRuntime && appCtx.aviationRuntime && appCtx.maritimeRuntime && appCtx.worldDiscoveryRuntime
    );
    runtimeState.gameplayRuntimeDurationMs = Math.round(performance.now() - gameplayRuntimeStartedAt);
    runtimeState.gameplayStartupDurationsMs = Object.freeze({ ...gameplayStartupDurationsMs });
    runtimeState.updatedAt = performance.now();
  }
  if (worldSession?.isActive?.() === false) {
    disposeGameplayRuntimesForPublication(appCtx, publication, 'superseded-gameplay-startup');
    return finishSupersededWorldLoadRuntimeSession(session, 'superseded-during-gameplay-runtime-startup');
  }
  appCtx.worldLoading = false;
  appCtx.enforceEnvironmentSceneOwnership?.();
  appCtx.hideLoad?.();
  scheduleAfterFirstPlay(`earth-ambient-state-${publication.sequence}`, () => {
    appCtx.refreshAstronomicalSky?.(true);
    return appCtx.refreshLiveWeather?.(true);
  }, { timeout: 1200 });
  markFirstPlayReady({
    environment: 'earth',
    loadDurationMs: Math.round(performance.now() - Number(runtimeState?.startedAt || performance.now())),
    publicationSequence: publication.sequence
  });
  if (runtimeState) {
    runtimeState.status = loaded ? 'ready' : 'failed';
    runtimeState.updatedAt = performance.now();
    runtimeState.finishedAt = runtimeState.updatedAt;
    runtimeState.activePhases = [];
    runtimeState.geometryReady = !!loaded;
    runtimeState.publication = publication;
  }
  if (worldSession?.isActive()) {
    if (loaded) worldSession.publish('world-publication-committed');
    else worldSession.fail('world-publication-failed');
    syncWorldSessionState?.();
  }
  finalizePerfLoad(loaded, {
    roadsFinal: appCtx.roads.length,
    roadVertices: Math.round(loadMetrics.roads.vertices || 0),
    buildingMeshes: appCtx.buildingMeshes.length,
    buildingColliders: appCtx.buildings.length,
    buildingCollidersFull: loadMetrics.colliders.full,
    buildingCollidersSimplified: loadMetrics.colliders.simplified,
    linearFeaturesFinal: Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.length : 0,
    linearFeatureMeshes: Array.isArray(appCtx.linearFeatureMeshes) ? appCtx.linearFeatureMeshes.length : 0,
    poiMeshes: appCtx.poiMeshes.length,
    landuseMeshes: appCtx.landuseMeshes.length
  });
  releaseWorldLoadCancellation?.();
  return worldSession?.snapshot?.() || null;
}

export function finishSupersededWorldLoadRuntimeSession(session = {}, reason = 'superseded') {
  const {
    appCtx, finalizePerfLoad, releaseWorldLoadCancellation, runtimeState,
    syncWorldSessionState, worldSession
  } = session;
  if (worldSession?.isActive()) worldSession.supersede(reason);
  const snapshot = syncWorldSessionState?.() || worldSession?.snapshot?.() || null;
  if (runtimeState) {
    runtimeState.status = 'superseded';
    runtimeState.updatedAt = performance.now();
    runtimeState.finishedAt = runtimeState.updatedAt;
    runtimeState.activePhases = [];
  }
  finalizePerfLoad?.(false, { reason });
  releaseWorldLoadCancellation?.();
  if (appCtx?.worldLoadRuntimeState === runtimeState) {
    appCtx.worldLoading = false;
    appCtx.discardEarthWorldSceneLoad?.(runtimeState?.sequence);
    appCtx.enforceEnvironmentSceneOwnership?.();
  }
  return snapshot;
}
