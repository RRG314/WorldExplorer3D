import { ctx as appCtx } from '../shared-context.js?v=55';

const modeLoads = {
  ocean: null,
  space: null
};

appCtx.spaceFlight ||= {
  active: false,
  scene: null,
  camera: null,
  renderer: null,
  rocket: null,
  earth: null,
  moon: null,
  animationId: null,
  destination: 'moon',
  mode: 'idle',
  keys: {}
};
appCtx.oceanMode ||= {
  active: false,
  scene: null,
  camera: null,
  renderer: null,
  animationId: null
};

export function ensureSpaceRuntime() {
  if (!modeLoads.space) {
    modeLoads.space = (async () => {
      // Solar-system and universe code is intentionally outside the Earth
      // startup graph. It is evaluated only after a space action.
      await import('../solar-system.js?v=86');
      return import('../space.js?v=154');
    })().catch((error) => {
      modeLoads.space = null;
      throw error;
    });
  }
  return modeLoads.space;
}

export function ensureOceanRuntime() {
  if (!modeLoads.ocean) {
    modeLoads.ocean = import('../ocean.js?v=10').catch((error) => {
      modeLoads.ocean = null;
      throw error;
    });
  }
  return modeLoads.ocean;
}

async function invokeSpace(method, args) {
  const runtime = await ensureSpaceRuntime();
  if (typeof runtime?.[method] !== 'function') {
    throw new Error(`Space runtime action ${method} is unavailable.`);
  }
  return runtime[method](...args);
}

async function invokeOcean(method, args) {
  const runtime = await ensureOceanRuntime();
  if (typeof runtime?.[method] !== 'function') {
    throw new Error(`Ocean runtime action ${method} is unavailable.`);
  }
  return runtime[method](...args);
}

Object.assign(appCtx, {
  ensureOceanRuntime,
  ensureSpaceRuntime,
  startOceanMode: (...args) => invokeOcean('startOceanMode', args),
  stopOceanMode: (...args) => modeLoads.ocean
    ? invokeOcean('stopOceanMode', args)
    : false,
  startSpaceFlightToEarth: (...args) => invokeSpace('startSpaceFlightToEarth', args),
  startSpaceFlightToMars: (...args) => invokeSpace('startSpaceFlightToMars', args),
  startSpaceFlightToSolisReach: (...args) => invokeSpace('startSpaceFlightToSolisReach', args),
  startFreeSpaceFlight: (...args) => invokeSpace('startFreeSpaceFlight', args),
  startSpaceFlightToMoon: (...args) => invokeSpace('startSpaceFlightToMoon', args),
  getOnDemandModeSnapshot: () => ({
    ocean: {
      requested: modeLoads.ocean !== null,
      active: appCtx.oceanMode?.active === true,
      rendererReady: !!appCtx.oceanMode?.renderer
    },
    space: {
      requested: modeLoads.space !== null,
      active: appCtx.spaceFlight?.active === true,
      rendererReady: !!appCtx.spaceFlight?.renderer
    }
  })
});
