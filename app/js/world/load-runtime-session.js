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
    resetWorldForReload,
    resetWorldFurnitureCaches,
    retryPass = 0,
    sameLocation
  } = options;

  const locName = appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
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
    phases: {}
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
  const startLoadPhase = (name) => {
    if (!name) return;
    phaseStartedAt[name] = performance.now();
  };
  const endLoadPhase = (name) => {
    if (!name) return;
    const startedAt = phaseStartedAt[name];
    if (!Number.isFinite(startedAt)) return;
    const dt = performance.now() - startedAt;
    phaseTotals[name] = (phaseTotals[name] || 0) + dt;
    delete phaseStartedAt[name];
  };

  resetWorldForReload({
    clearBuildingSpatialIndex,
    invalidateTraversalNetworks,
    locName,
    resetWorldFurnitureCaches
  });
  appCtx.initialEarthWorldReady = false;
  appCtx.worldDetailState = {};

  if (appCtx.selLoc === 'custom') {
    const lat = parseFloat(document.getElementById('customLat').value);
    const lon = parseFloat(document.getElementById('customLon').value);
    if (isNaN(lat) || isNaN(lon)) {
      appCtx.showLoad('Enter valid coordinates');
      appCtx.worldLoading = false;
      finalizePerfLoad(false, { reason: 'invalid_coordinates' });
      return { aborted: true };
    }
    appCtx.LOC = { lat, lon };
    appCtx.setCustomLocation?.({ lat, lon, name: appCtx.customLoc?.name || 'Custom' }, { syncInputs: false });
  } else {
    appCtx.LOC = { lat: appCtx.LOCS[appCtx.selLoc].lat, lon: appCtx.LOCS[appCtx.selLoc].lon };
  }

  const loadLocation = { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon };
  const loadSequence = appCtx._worldLoadSequence = (appCtx._worldLoadSequence || 0) + 1;
  const isActiveLoadContext = () =>
    appCtx._worldLoadSequence === loadSequence &&
    sameLocation(appCtx.LOC, loadLocation) &&
    !earthSceneSuppressed();

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

  if (appCtx.terrainEnabled && !appCtx.onMoon) {
    if (typeof appCtx.resetTerrainStreamingState === 'function') appCtx.resetTerrainStreamingState();
    if (typeof appCtx.clearTerrainMeshes === 'function') appCtx.clearTerrainMeshes();
    if (typeof appCtx.updateTerrainAround === 'function') appCtx.updateTerrainAround(0, 0);
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
  const loadProfile = getAdaptiveLoadProfile(rdtLoadComplexity, perfModeNow, dynamicBudgetState.budgetScale);
  const lodThresholds = getWorldLodThresholds(rdtLoadComplexity, perfModeNow, dynamicBudgetState.lodScale);
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
    maxTotalLoadMs: loadProfile.maxTotalLoadMs
  };
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
    startLoadPhase,
    useRdtBudgeting,
    useSyntheticFallbackRoads:
      appCtx.gameMode === 'trial' ||
      appCtx.gameMode === 'checkpoint' ||
      appCtx.gameMode === 'painttown'
  };
}

export function finishWorldLoadRuntimeSession(session = {}) {
  const { appCtx, finalizePerfLoad, loadMetrics, phaseTotals, loaded = false } = session;
  if (!appCtx) return;

  const loadedRadiusDeg = Number(loadMetrics?.activeRadiusDeg);
  appCtx.initialEarthDetailRadius = Number.isFinite(loadedRadiusDeg)
    ? Math.max(800, Math.round(loadedRadiusDeg * (appCtx.SCALE || 100000) * 0.92))
    : 1050;

  appCtx.worldLoading = false;
  appCtx.initialEarthWorldReady = !!loaded;
  if (typeof appCtx.enforceEnvironmentSceneOwnership === 'function') {
    appCtx.enforceEnvironmentSceneOwnership();
  }
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
  }
  loadMetrics.initialEarthDetailRadius = appCtx.initialEarthDetailRadius;
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
}
