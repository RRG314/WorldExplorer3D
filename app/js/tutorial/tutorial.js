import { ctx as appCtx } from '../shared-context.js?v=55';
import { createTutorialUi } from './ui.js?v=2';

const STORAGE_KEY = 'worldExplorer3D.tutorialState.v2';
const LEGACY_STORAGE_KEY = 'worldExplorer3D.tutorialState.v1';
const TUTORIAL_VERSION = 2;
const CORE_JOURNEY_ID = 'first-earth-discovery';
const MOVE_TARGET_METERS = 12;

const STAGES = Object.freeze({
  MOVE: 'move',
  EXPLORE: 'explore',
  DISCOVER: 'discover',
  COMPLETE: 'complete'
});
const STAGE_ORDER = [STAGES.MOVE, STAGES.EXPLORE, STAGES.DISCOVER, STAGES.COMPLETE];
const STAGE_NUMBER = Object.freeze({ move: 1, explore: 2, discover: 3, complete: 3 });

function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (_) { return undefined; }
}

function tutorialTelemetry(name, params = {}) {
  const detail = {
    name,
    params: {
      journey_id: CORE_JOURNEY_ID,
      tutorial_version: TUTORIAL_VERSION,
      ...params
    }
  };
  if (globalThis.__WE3D_ANALYTICS_PRODUCT_EVENTS_BOUND__ === true) {
    globalThis.dispatchEvent?.(new CustomEvent('we3d:tutorial-telemetry', { detail }));
    return;
  }
  const queue = globalThis.__WE3D_TUTORIAL_ANALYTICS_QUEUE__ ||= [];
  queue.push(detail);
  if (queue.length > 24) queue.splice(0, queue.length - 24);
}

function defaultState() {
  return {
    version: TUTORIAL_VERSION,
    enabled: true,
    completed: false,
    skipped: false,
    stage: STAGES.MOVE,
    distanceMoved: 0,
    startedAtMs: 0,
    completedAtMs: 0,
    analyticsBegan: false,
    contextSeen: {}
  };
}

const runtime = {
  initialized: false,
  state: defaultState(),
  sessionPresented: new Set(),
  dismissTimer: 0,
  currentButtonAction: null,
  currentStage: '',
  movementOrigin: null,
  lastPosition: null,
  discoveryListener: null,
  card: null,
  eyebrowEl: null,
  titleEl: null,
  bodyEl: null,
  progressEl: null,
  actionBtn: null,
  laterBtn: null,
  skipBtn: null,
  closeBtn: null,
  settingsMount: null,
  settingsStatus: null,
  settingsToggle: null,
  settingsRestartBtn: null,
  previous: {
    gameStarted: false,
    inSpace: false,
    inMoon: false,
    roomPanelOpen: false,
    buildModeOn: false
  }
};

function normalizeState(input) {
  const base = defaultState();
  const stage = STAGE_ORDER.includes(input?.stage) ? input.stage : STAGES.MOVE;
  return {
    ...base,
    enabled: input?.enabled !== false,
    completed: input?.completed === true,
    skipped: input?.skipped === true,
    stage: input?.completed === true ? STAGES.COMPLETE : stage,
    distanceMoved: Math.max(0, Number(input?.distanceMoved) || 0),
    startedAtMs: Math.max(0, Number(input?.startedAtMs) || 0),
    completedAtMs: Math.max(0, Number(input?.completedAtMs) || 0),
    analyticsBegan: input?.analyticsBegan === true,
    contextSeen: input?.contextSeen && typeof input.contextSeen === 'object' ? { ...input.contextSeen } : {}
  };
}

function loadState() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (current && typeof current === 'object') return normalizeState(current);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    if (legacy && typeof legacy === 'object') {
      return normalizeState({
        enabled: legacy.enabled !== false,
        completed: legacy.completed === true,
        stage: legacy.completed === true ? STAGES.COMPLETE : STAGES.MOVE
      });
    }
  } catch (_) {
    // Private browsing and malformed historical state must never block play.
  }
  return defaultState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime.state)); } catch (_) { /* non-fatal */ }
}

const tutorialUi = createTutorialUi({
  runtime,
  safeCall,
  onLater: () => dismissCurrentPrompt('later'),
  onSkip: () => skipTutorial(),
  setTutorialEnabled: (enabled) => setTutorialEnabled(enabled),
  restartTutorial: () => restartTutorial()
});
const { createCardIfNeeded, ensureSettingsControls, hidePrompt, updateSettingsStatus } = tutorialUi;

function playerPosition() {
  const target = appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker
    ? appCtx.Walk.state.walker
    : appCtx.boatMode?.active
      ? appCtx.boat
      : appCtx.droneMode
        ? appCtx.drone
        : appCtx.car;
  const x = Number(target?.x);
  const z = Number(target?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function showPrompt(stage, config = {}) {
  if (!runtime.state.enabled || runtime.state.skipped || (runtime.state.completed && !config.contextual)) return;
  if (!config.contextual && runtime.sessionPresented.has(stage)) return;
  createCardIfNeeded();
  if (!runtime.card) return;
  runtime.sessionPresented.add(stage);
  runtime.currentStage = stage;
  runtime.currentButtonAction = typeof config.onAction === 'function' ? config.onAction : null;
  runtime.eyebrowEl.textContent = config.eyebrow || `First expedition · ${STAGE_NUMBER[stage] || 1} of 3`;
  runtime.titleEl.textContent = config.title || 'Next step';
  runtime.bodyEl.textContent = config.body || '';
  runtime.progressEl.style.width = `${Math.max(8, Math.min(100, Number(config.progress) || (STAGE_NUMBER[stage] / 3 * 100)))}%`;
  runtime.actionBtn.hidden = !(config.actionLabel && runtime.currentButtonAction);
  runtime.actionBtn.textContent = config.actionLabel || '';
  runtime.skipBtn.hidden = config.contextual === true;
  runtime.card.hidden = false;
  tutorialTelemetry('we3d_tutorial_step', { action: 'presented', step_id: stage });

  if (runtime.dismissTimer) clearTimeout(runtime.dismissTimer);
  const autoHideMs = Math.max(5000, Number(config.autoHideMs) || 11000);
  runtime.dismissTimer = window.setTimeout(() => dismissCurrentPrompt('auto_hidden'), autoHideMs);
}

function dismissCurrentPrompt(action = 'later') {
  if (runtime.currentStage) tutorialTelemetry('we3d_tutorial_step', { action, step_id: runtime.currentStage });
  hidePrompt();
}

function openExploration() {
  const direct = document.getElementById('fWorldDiscovery');
  const quick = document.getElementById('discoveryQuickToolBtn');
  if (direct instanceof HTMLElement) direct.click();
  else if (quick instanceof HTMLElement) quick.click();
}

function presentCurrentStage() {
  if (!runtime.state.enabled || runtime.state.completed || runtime.state.skipped || !appCtx.gameStarted) {
    hidePrompt();
    return;
  }
  if (runtime.state.stage === STAGES.MOVE) {
    showPrompt(STAGES.MOVE, {
      title: 'Take your first steps',
      body: 'Move about 12 metres and look around. Use W/S to move, A/D to turn, and Shift to run.',
      progress: 33
    });
  } else if (runtime.state.stage === STAGES.EXPLORE) {
    showPrompt(STAGES.EXPLORE, {
      title: 'Choose one field activity',
      body: 'Open Exploration, then choose an activity that fits this place. You only need to learn one right now.',
      actionLabel: 'Open Exploration',
      onAction: openExploration,
      progress: 66,
      autoHideMs: 14000
    });
  } else if (runtime.state.stage === STAGES.DISCOVER) {
    showPrompt(STAGES.DISCOVER, {
      title: 'Record one discovery',
      body: 'Follow the bearing or signal, approach the target, and document it. Your first record starts the Field Journal.',
      progress: 92,
      autoHideMs: 15000
    });
  }
}

function setStage(nextStage, reason = 'progress') {
  if (!STAGE_ORDER.includes(nextStage) || runtime.state.stage === nextStage) return false;
  const previous = runtime.state.stage;
  runtime.state.stage = nextStage;
  runtime.sessionPresented.delete(nextStage);
  saveState();
  tutorialTelemetry('we3d_tutorial_step', { action: 'completed', step_id: previous, result: reason });
  presentCurrentStage();
  updateSettingsStatus(`First expedition: ${Math.min(3, STAGE_NUMBER[nextStage] || 1)} of 3.`);
  return true;
}

function completeTutorial(reason = 'discovery_recorded') {
  if (runtime.state.completed) return;
  const completedStep = runtime.state.stage;
  runtime.state.completed = true;
  runtime.state.skipped = false;
  runtime.state.stage = STAGES.COMPLETE;
  runtime.state.completedAtMs = Date.now();
  saveState();
  tutorialTelemetry('we3d_tutorial_step', { action: 'completed', step_id: completedStep, result: reason });
  tutorialTelemetry('tutorial_complete');
  updateSettingsStatus('First expedition complete. Contextual tips remain available when you open advanced systems.');
  hidePrompt();
  runtime.sessionPresented.delete('core_complete');
  showPrompt('core_complete', {
    contextual: true,
    eyebrow: 'First expedition complete',
    title: 'Your Explorer story has started',
    body: 'The action is saved chronologically in Journal and identified in Field Guide. Only acquired objects enter Collection. Follow Current Goal here, or choose a new destination for regional credit.',
    progress: 100,
    autoHideMs: 12000
  });
}

function skipTutorial() {
  if (runtime.state.completed || runtime.state.skipped) return;
  runtime.state.enabled = false;
  runtime.state.skipped = true;
  saveState();
  tutorialTelemetry('we3d_tutorial_step', { action: 'skipped', step_id: runtime.state.stage });
  updateSettingsStatus('First expedition skipped. You can restart it here at any time.');
  hidePrompt();
}

function showContextTip(id, config) {
  if (!runtime.state.completed || runtime.state.contextSeen[id]) return;
  runtime.state.contextSeen[id] = true;
  saveState();
  showPrompt(`context_${id}`, { ...config, contextual: true, progress: 100, autoHideMs: 9000 });
}

function tutorialOnEvent(eventName, payload = {}) {
  if (!runtime.initialized) return;
  const name = String(eventName || '');
  if (name === 'spawned_in_world') {
    runtime.movementOrigin = playerPosition();
    runtime.lastPosition = runtime.movementOrigin;
    presentCurrentStage();
  } else if (name === 'build_mode_entered') {
    showContextTip('building', {
      eyebrow: 'Contextual guide', title: 'Build locally first',
      body: 'Place and adjust a few pieces locally. Publish or share only after the result is ready.'
    });
  } else if (name === 'opened_rooms_menu' || name === 'room_created_or_toggled') {
    showContextTip('rooms', {
      eyebrow: 'Contextual guide', title: 'Rooms share this world',
      body: 'Create or join a room when you want company. Room roles control who can edit or moderate shared content.'
    });
  } else if (name === 'entered_space') {
    showContextTip('space', {
      eyebrow: 'Contextual guide', title: 'Space flight controls',
      body: 'Arrow keys steer, Space adds thrust, and Shift brakes. Return to Earth whenever you are ready.'
    });
  }
  if (payload?.forceStage && STAGE_ORDER.includes(payload.forceStage)) setStage(payload.forceStage, 'forced');
}

function onDiscoveryTelemetry(event) {
  if (!runtime.initialized || !runtime.state.enabled || runtime.state.completed) return;
  const type = String(event?.detail?.type || '');
  if (type === 'activity_started' && runtime.state.stage === STAGES.EXPLORE) {
    setStage(STAGES.DISCOVER, 'activity_started');
  } else if (type === 'discovery_recorded') {
    completeTutorial('discovery_recorded');
  }
}

function detectContextTransitions() {
  const inSpace = !!(appCtx.spaceFlight?.active || (typeof appCtx.isEnv === 'function' && appCtx.isEnv(appCtx.ENV?.SPACE_FLIGHT)));
  const inMoon = !!appCtx.onMoon;
  const roomPanelOpen = !!document.getElementById('roomPanelModal')?.classList.contains('show');
  const buildModeOn = !!document.getElementById('fBlockBuild')?.classList.contains('on');
  if (!runtime.previous.gameStarted && appCtx.gameStarted) tutorialOnEvent('spawned_in_world');
  if (!runtime.previous.inSpace && inSpace) tutorialOnEvent('entered_space');
  if (!runtime.previous.inMoon && inMoon) showContextTip('moon', {
    eyebrow: 'Contextual guide', title: 'Explore the Moon',
    body: 'Walking and driving use the same basic controls. Try one mode, then explore freely.'
  });
  if (!runtime.previous.roomPanelOpen && roomPanelOpen) tutorialOnEvent('opened_rooms_menu');
  if (!runtime.previous.buildModeOn && buildModeOn) tutorialOnEvent('build_mode_entered');
  runtime.previous.gameStarted = !!appCtx.gameStarted;
  runtime.previous.inSpace = inSpace;
  runtime.previous.inMoon = inMoon;
  runtime.previous.roomPanelOpen = roomPanelOpen;
  runtime.previous.buildModeOn = buildModeOn;
}

function tutorialUpdate() {
  if (!runtime.initialized) return;
  detectContextTransitions();
  // The field workspace already contains the instructions needed for the
  // current activity. Yield the compact guide while that workspace is open so
  // onboarding never stacks a second panel over active play UI.
  if (document.getElementById('discoveryPanel')?.classList.contains('show')) {
    if (runtime.card && !runtime.card.hidden) hidePrompt();
    return;
  }
  if (!runtime.state.enabled || runtime.state.completed || runtime.state.skipped || !appCtx.gameStarted) return;
  if (runtime.state.stage !== STAGES.MOVE) return;
  const current = playerPosition();
  if (!current) return;
  if (!runtime.movementOrigin) runtime.movementOrigin = current;
  if (runtime.lastPosition) {
    const step = Math.hypot(current.x - runtime.lastPosition.x, current.z - runtime.lastPosition.z);
    if (step > 0 && step < 25) runtime.state.distanceMoved = Math.min(MOVE_TARGET_METERS * 2, runtime.state.distanceMoved + step);
  }
  runtime.lastPosition = current;
  if (runtime.state.distanceMoved >= MOVE_TARGET_METERS) {
    saveState();
    setStage(STAGES.EXPLORE, 'moved_12m');
  }
}

function setTutorialEnabled(enabled) {
  const next = !!enabled;
  runtime.state.enabled = next;
  if (next) runtime.state.skipped = false;
  else if (!runtime.state.completed) runtime.state.skipped = true;
  saveState();
  updateSettingsStatus(next ? 'First expedition guidance enabled.' : 'Guidance disabled. Your game progress is unchanged.');
  if (next) presentCurrentStage();
  else hidePrompt();
}

function restartTutorial() {
  runtime.state = defaultState();
  runtime.state.startedAtMs = Date.now();
  runtime.state.analyticsBegan = true;
  runtime.sessionPresented.clear();
  runtime.movementOrigin = playerPosition();
  runtime.lastPosition = runtime.movementOrigin;
  saveState();
  tutorialTelemetry('tutorial_begin');
  updateSettingsStatus('First expedition restarted: step 1 of 3.');
  presentCurrentStage();
}

function initTutorial(appContext = null) {
  if (runtime.initialized) return;
  if (appContext && typeof appContext === 'object') Object.assign(appCtx, appContext);
  runtime.state = loadState();
  createCardIfNeeded();
  ensureSettingsControls();
  runtime.previous.gameStarted = !!appCtx.gameStarted;
  runtime.previous.inSpace = !!appCtx.spaceFlight?.active;
  runtime.previous.inMoon = !!appCtx.onMoon;
  runtime.previous.roomPanelOpen = !!document.getElementById('roomPanelModal')?.classList.contains('show');
  runtime.previous.buildModeOn = !!document.getElementById('fBlockBuild')?.classList.contains('on');
  runtime.movementOrigin = playerPosition();
  runtime.lastPosition = runtime.movementOrigin;
  runtime.discoveryListener = onDiscoveryTelemetry;
  globalThis.addEventListener?.('we3d:discovery-telemetry', runtime.discoveryListener);
  runtime.initialized = true;

  if (runtime.state.enabled && !runtime.state.completed && !runtime.state.skipped && !runtime.state.analyticsBegan) {
    runtime.state.analyticsBegan = true;
    runtime.state.startedAtMs = Date.now();
    tutorialTelemetry('tutorial_begin');
  }
  saveState();
  updateSettingsStatus(runtime.state.completed
    ? 'First expedition complete. Replay it whenever you want.'
    : runtime.state.enabled && !runtime.state.skipped
      ? `First expedition: ${STAGE_NUMBER[runtime.state.stage] || 1} of 3.`
      : 'First expedition skipped. Restart it whenever you want.');
  presentCurrentStage();
}

Object.assign(appCtx, { initTutorial, tutorialOnEvent, tutorialUpdate, setTutorialEnabled, restartTutorial });

export { initTutorial, restartTutorial, setTutorialEnabled, tutorialOnEvent, tutorialUpdate };
