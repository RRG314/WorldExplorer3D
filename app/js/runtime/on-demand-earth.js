let modulePromise = null;

function installOnDemandEarth(appCtx) {
  if (appCtx.ensureEarthRuntimeReady?.isEarthRuntimeLoader === true) {
    return { ensureEarthRuntimeReady: appCtx.ensureEarthRuntimeReady };
  }

  async function ensureEarthRuntimeReady() {
    if (!modulePromise) {
      modulePromise = import('./earth-runtime.js?v=3').catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }
  ensureEarthRuntimeReady.isEarthRuntimeLoader = true;

  async function loadEarthRoads(...args) {
    const facade = appCtx.loadRoads;
    await ensureEarthRuntimeReady();
    if (typeof appCtx.loadRoads !== 'function' || appCtx.loadRoads === facade) {
      throw new Error('Earth runtime loaded without installing its world loader.');
    }
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

export { installOnDemandEarth };
