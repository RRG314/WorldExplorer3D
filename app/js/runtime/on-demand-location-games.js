import { ctx as appCtx } from '../shared-context.js?v=55';

let deFlockModule = null;
let deFlockModulePromise = null;
let deFlockGeneration = 0;
let liveGpsModule = null;
let liveGpsModulePromise = null;
let liveGpsGeneration = 0;

function ensureDeFlockModule() {
  if (deFlockModule) return Promise.resolve(deFlockModule);
  if (!deFlockModulePromise) {
    deFlockModulePromise = import('../deflock/runtime.js?v=6').then((module) => {
      deFlockModule = module;
      return module;
    }).catch((error) => {
      deFlockModulePromise = null;
      throw error;
    });
  }
  return deFlockModulePromise;
}

function ensureLiveGpsModule() {
  if (liveGpsModule) return Promise.resolve(liveGpsModule);
  if (!liveGpsModulePromise) {
    liveGpsModulePromise = import('../live-gps/runtime.js?v=3').then((module) => {
      liveGpsModule = module;
      return module;
    }).catch((error) => {
      liveGpsModulePromise = null;
      throw error;
    });
  }
  return liveGpsModulePromise;
}

function startDeFlockMode() {
  const generation = ++deFlockGeneration;
  const state = { loading: true, module: null, session: null };
  void ensureDeFlockModule().then((module) => {
    if (generation !== deFlockGeneration || appCtx.gameMode !== 'deflock') return;
    state.module = module;
    state.session = module.startDeFlockMode();
    state.loading = false;
  }).catch((error) => {
    state.loading = false;
    console.error('[gameplay] DeFlock Hunt could not start.', error);
  });
  return state;
}

function updateDeFlockMode(dt, _context, state) {
  state?.module?.updateDeFlockMode?.(dt);
}

function stopDeFlockMode(context = {}, state = null, reason = '') {
  deFlockGeneration += 1;
  if (state?.module || deFlockModule) {
    return (state?.module || deFlockModule).stopDeFlockMode(context, state?.session, reason);
  }
  return false;
}

function getDeFlockSnapshot() {
  return deFlockModule?.getDeFlockSnapshot?.() || { active: false };
}

function startLiveGpsMode() {
  const generation = ++liveGpsGeneration;
  const state = { loading: true, module: null, session: null };
  void ensureLiveGpsModule().then((module) => {
    if (generation !== liveGpsGeneration || appCtx.gameMode !== 'livegps') return;
    state.module = module;
    state.session = module.startLiveGpsMode();
    state.loading = false;
  }).catch((error) => {
    state.loading = false;
    console.error('[gameplay] Live GPS Explore could not start.', error);
  });
  return state;
}

function updateLiveGpsMode(dt, _context, state) {
  state?.module?.updateLiveGpsMode?.(dt);
}

function stopLiveGpsMode(context = {}, state = null, reason = '') {
  liveGpsGeneration += 1;
  if (state?.module || liveGpsModule) {
    return (state?.module || liveGpsModule).stopLiveGpsMode(context, state?.session, reason);
  }
  return false;
}

function getLiveGpsSnapshot() {
  return liveGpsModule?.getLiveGpsSnapshot?.() || { active: false };
}

async function prepareLiveGpsStart(options = {}) {
  const module = await ensureLiveGpsModule();
  return module.prepareLiveGpsStart(options);
}

async function startLiveGpsFromWorld() {
  const module = await ensureLiveGpsModule();
  return module.startLiveGpsFromWorld();
}

Object.assign(appCtx, {
  getDeFlockSnapshot,
  getLiveGpsSnapshot,
  prepareLiveGpsStart,
  startLiveGpsFromWorld
});

export {
  getDeFlockSnapshot,
  getLiveGpsSnapshot,
  prepareLiveGpsStart,
  startDeFlockMode,
  startLiveGpsFromWorld,
  startLiveGpsMode,
  stopDeFlockMode,
  stopLiveGpsMode,
  updateDeFlockMode,
  updateLiveGpsMode
};
