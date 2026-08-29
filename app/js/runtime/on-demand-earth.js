let modulePromise = null;

function captureEarthLoadIntent(appCtx) {
  const selection = appCtx.resolveLocationSelection?.();
  if (!selection || typeof selection !== 'object') return null;
  const lat = Number(selection.lat);
  const lon = Number(selection.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return Object.freeze({
    ...selection,
    key: String(selection.key || ''),
    name: String(selection.name || 'Unknown location'),
    lat,
    lon
  });
}

function restoreEarthLoadIntent(appCtx, selection) {
  if (!selection) return false;
  if (selection.key === 'custom') {
    return appCtx.setCustomLocation?.(selection, {
      transient: false,
      syncInputs: false
    }) !== false;
  }
  return appCtx.selectPresetLocation?.(selection.key) !== false;
}

function installOnDemandEarth(appCtx) {
  if (appCtx.ensureEarthRuntimeReady?.isEarthRuntimeLoader === true) {
    return { ensureEarthRuntimeReady: appCtx.ensureEarthRuntimeReady };
  }

  async function ensureEarthRuntimeReady() {
    if (!modulePromise) {
      modulePromise = import('./earth-runtime.js?v=153').catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }
  ensureEarthRuntimeReady.isEarthRuntimeLoader = true;

  async function loadEarthRoads(...args) {
    // Lazy runtime installation must not move the request boundary. Capture
    // location intent before awaiting the module so a later selection cannot
    // rewrite this call into a different city.
    const requestedSelection = captureEarthLoadIntent(appCtx);
    const facade = appCtx.loadRoads;
    await ensureEarthRuntimeReady();
    if (typeof appCtx.loadRoads !== 'function' || appCtx.loadRoads === facade) {
      throw new Error('Earth runtime loaded without installing its world loader.');
    }
    restoreEarthLoadIntent(appCtx, requestedSelection);
    return appCtx.loadRoads(...args);
  }

  Object.assign(appCtx, {
    ensureEarthRuntimeReady,
    getEarthRuntimeSnapshot: () => ({
      requested: modulePromise !== null,
      ready: modulePromise !== null && appCtx.loadRoads !== loadEarthRoads
    }),
    loadRoads: loadEarthRoads
  });

  return { ensureEarthRuntimeReady };
}

export {
  captureEarthLoadIntent,
  installOnDemandEarth,
  restoreEarthLoadIntent
};
