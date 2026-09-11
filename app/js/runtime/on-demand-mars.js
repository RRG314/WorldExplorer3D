let modulePromise = null;

function installOnDemandMars(appCtx) {
  const startSpaceFlightToMars = appCtx.startSpaceFlightToMars;

  async function ensureMarsRuntimeReady() {
    if (!modulePromise) {
      modulePromise = import('../planetary/mars-world.js?v=18').catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }

  Object.assign(appCtx, {
    ensureMarsRuntimeReady,
    arriveAtMars: async (...args) => {
      const mars = await ensureMarsRuntimeReady();
      return mars.arriveAtMars(...args);
    },
    cancelPendingMarsTransition: () => false,
    directTravelToMars: async (...args) => {
      const mars = await ensureMarsRuntimeReady();
      return mars.directTravelToMars(...args);
    },
    prepareEarthDepartureForMars: () => false,
    prepareMarsTitleExit: () => false,
    returnFromMars: async (...args) => {
      if (!modulePromise) return false;
      const mars = await modulePromise;
      return mars.returnFromMars(...args);
    },
    sampleMarsLocalHeight: () => 0,
    startSpaceFlightToMars: async (...args) => {
      await ensureMarsRuntimeReady();
      return startSpaceFlightToMars?.(...args) ?? false;
    }
  });

  return { ensureMarsRuntimeReady };
}

export { installOnDemandMars };
