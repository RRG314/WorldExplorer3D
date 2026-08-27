let modulePromise = null;
let pendingSharedConfig = null;
let pendingSharedEntries = null;
let pendingSharedConnected = true;

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

function emptyPersistenceStatus() {
  return {
    ready: false,
    totalCount: 0,
    currentLocationCount: 0,
    shared: { enabled: false, totalCount: 0, connected: pendingSharedConnected, pendingCount: 0 }
  };
}

function installOnDemandBlockBuilder(appCtx) {
  async function ensureBlockBuilderReady() {
    if (!modulePromise) {
      modulePromise = import('../blocks.js?v=67').then(async (blocks) => {
        const ui = await import('../block-builder/ui.js?v=6');
        if (pendingSharedConfig) blocks.configureSharedBuildSync?.(pendingSharedConfig);
        blocks.setSharedBuildConnectionState?.(pendingSharedConnected);
        if (pendingSharedEntries) blocks.setSharedBuildEntries?.(pendingSharedEntries);
        pendingSharedConfig = null;
        pendingSharedEntries = null;
        if (appCtx.gameStarted) blocks.refreshBlockBuilderForCurrentLocation?.();
        return { blocks, ui };
      }).catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
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
      pendingSharedConfig = { ...config };
      if (config.enabled === true || modulePromise) {
        void ensureBlockBuilderReady().then(({ blocks }) => blocks.configureSharedBuildSync?.(pendingSharedConfig || config));
      }
      return false;
    },
    setSharedBuildEntries: (entries = []) => {
      pendingSharedEntries = Array.isArray(entries) ? entries.slice() : [];
      void ensureBlockBuilderReady().then(({ blocks }) => blocks.setSharedBuildEntries?.(pendingSharedEntries || entries));
      return false;
    },
    setSharedBuildConnectionState: (connected) => {
      pendingSharedConnected = connected !== false;
      if (modulePromise) void modulePromise.then(({ blocks }) => blocks.setSharedBuildConnectionState?.(pendingSharedConnected));
      return pendingSharedConnected;
    },
    getBlockBuilderSnapshot: emptySnapshot,
    getBuildPersistenceStatus: emptyPersistenceStatus,
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
