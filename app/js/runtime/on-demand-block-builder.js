function emptySnapshot() {
  return {
    enabled: false,
    tool: 'place',
    materialIndex: 0,
    shape: 'cube',
    rotation: 0,
    canUndo: false,
    count: 0,
    maxCount: 200,
    shared: false
  };
}

function emptyPersistenceStatus(connected = true) {
  return {
    ready: false,
    totalCount: 0,
    currentLocationCount: 0,
    shared: { enabled: false, totalCount: 0, connected, pendingCount: 0 }
  };
}

function installOnDemandBlockBuilder(appCtx, options = {}) {
  let modulePromise = null, loadedModules = null;
  let pendingSharedConfig = null, pendingSharedEntries = null;
  let pendingSharedConnected = true, pendingScope = '';
  const loadBlocks = options.loadBlocks || (() => import('../blocks.js?v=70'));
  const loadUi = options.loadUi || (() => import('../block-builder/ui.js?v=9'));

  function applyPendingSharedState() {
    if (!loadedModules) return;
    const { blocks } = loadedModules;
    if (pendingSharedConfig) {
      const config = pendingSharedConfig; pendingSharedConfig = null;
      blocks.configureSharedBuildSync?.(config);
    }
    blocks.setSharedBuildConnectionState?.(pendingSharedConnected);
    if (pendingSharedEntries) {
      const entries = pendingSharedEntries; pendingSharedEntries = null;
      blocks.setSharedBuildEntries?.(entries);
    }
  }

  async function ensureBlockBuilderReady() {
    if (!modulePromise) {
      // Load UI before the runtime publishes its direct context methods, then
      // drain the latest room exactly once. Replaying one callback per queued
      // join used to attach old rows to a newer room during this lazy load.
      modulePromise = Promise.resolve().then(loadUi).then(async ui => {
        const blocks = await loadBlocks();
        loadedModules = { blocks, ui };
        applyPendingSharedState();
        if (appCtx.gameStarted) blocks.refreshBlockBuilderForCurrentLocation?.();
        return loadedModules;
      }).catch((error) => {
        modulePromise = null;
        loadedModules = null;
        throw error;
      });
    }
    return modulePromise;
  }

  function loadQueuedSharedState() {
    if (loadedModules) applyPendingSharedState();
    else void ensureBlockBuilderReady().catch(error => console.warn('[blocks] Builder could not load; room state retained for retry.', error));
  }

  const enableBuilder = async (forceState) => {
    if (forceState === false && !modulePromise) return false;
    const { blocks } = await ensureBlockBuilderReady();
    return blocks.toggleBlockBuildMode?.(forceState) ?? false;
  };

  Object.assign(appCtx, {
    ensureBlockBuilderReady,
    openBlockBuilder: async (...args) => {
      const { ui } = await ensureBlockBuilderReady();
      return ui.openBlockBuilder?.(...args) ?? false;
    },
    closeBlockBuilder: () => false,
    toggleBlockBuildMode: enableBuilder,
    setBuildModeEnabled: (enabled) => {
      if (enabled !== true && !modulePromise) return false;
      void ensureBlockBuilderReady().then(({ blocks }) => blocks.setBuildModeEnabled?.(enabled));
      return !!enabled;
    },
    configureSharedBuildSync: (config = {}) => {
      const scope = config.enabled === true ? JSON.stringify([config.roomId, config.world || null]) : '';
      if (scope !== pendingScope) pendingSharedEntries = null;
      pendingScope = scope;
      pendingSharedConfig = { ...config, ...(config.world ? { world: { ...config.world } } : {}) };
      if (config.enabled === true || modulePromise) {
        loadQueuedSharedState();
      }
      return false;
    },
    setSharedBuildEntries: (entries = []) => {
      pendingSharedEntries = Array.isArray(entries) ? entries.slice() : [];
      if (pendingScope || modulePromise || loadedModules) loadQueuedSharedState();
      return false;
    },
    setSharedBuildConnectionState: (connected) => {
      pendingSharedConnected = connected !== false;
      if (loadedModules) loadedModules.blocks.setSharedBuildConnectionState?.(pendingSharedConnected);
      return pendingSharedConnected;
    },
    getBlockBuilderSnapshot: emptySnapshot,
    getBuildPersistenceStatus: () => emptyPersistenceStatus(pendingSharedConnected),
    getBuildLimits: () => ({ maxPerLocation: 200, maxTotal: 5000, currentLocationCount: 0, totalCount: 0 }),
    getSharedBuildSyncStatus: () => ({ enabled: false, totalCount: 0, connected: pendingSharedConnected, pendingCount: 0 }),
    getBuildCollisionAtWorldXZ: () => null,
    getBuildTopSurfaceAtWorldXZ: () => null,
    getBuildVehicleContact: () => null,
    getBuildVehicleSurfaceAtWorldXZ: () => null,
    handleBlockBuilderClick: () => false,
    clearBlockBuilderForWorldReload: () => false,
    refreshBlockBuilderForCurrentLocation: () => false,
    clearAllBuildBlocks: () => false
  });

  return { ensureBlockBuilderReady };
}

export { installOnDemandBlockBuilder };
