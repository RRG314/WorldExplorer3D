import { ctx as appCtx } from '../shared-context.js?v=55';
import { createTutorialUi } from './ui.js?v=4';
import { createCurrentJourneyUi } from './current-journey.js?v=1';

const STORAGE_KEY = 'worldExplorer3D.tutorialState.v4';
const PREVIOUS_STORAGE_KEY = 'worldExplorer3D.tutorialState.v3';
const LEGACY_STORAGE_KEY = 'worldExplorer3D.tutorialState.v2';
const TUTORIAL_VERSION = 4;
const CORE_JOURNEY_ID = 'first-journey';
const MOVE_TARGET_METERS = 8;

const STAGES = Object.freeze({
  MOVE: 'move',
  PACK: 'pack',
  EXPLORER: 'explorer',
  ACTIVITY: 'activity',
  RECORD: 'record',
  REVIEW: 'review',
  COMPLETE: 'complete'
});
const STAGE_ORDER = [STAGES.MOVE, STAGES.PACK, STAGES.EXPLORER, STAGES.ACTIVITY, STAGES.RECORD, STAGES.REVIEW, STAGES.COMPLETE];
const STAGE_NUMBER = Object.freeze({ move: 1, pack: 2, explorer: 3, activity: 4, record: 5, review: 6, complete: 6 });
const CORE_STAGE_COUNT = 6;

function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch { return undefined; }
}

function tutorialTelemetry(name, params = {}) {
  const detail = {
    name,
    params: { journey_id: CORE_JOURNEY_ID, tutorial_version: TUTORIAL_VERSION, ...params }
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
  explorerSectionListener: null,
  currentJourneyUi: null,
  card: null,
  eyebrowEl: null,
  titleEl: null,
  bodyEl: null,
  progressEl: null,
  actionBtn: null,
  laterBtn: null,
  skipBtn: null,
  closeBtn: null,
  detailsBtn: null,
  settingsMount: null,
  settingsStatus: null,
  settingsToggle: null,
  settingsRestartBtn: null,
  previous: {
    gameStarted: false,
    inSpace: false,
    inMoon: false,
    roomPanelOpen: false,
    buildModeOn: false,
    backpackOpen: false,
    explorerOpen: false
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
    const previous = JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY) || 'null');
    if (previous && typeof previous === 'object') {
      return normalizeState({
        ...previous,
        stage: previous.completed ? STAGES.COMPLETE : previous.stage === 'choose' ? STAGES.ACTIVITY : previous.stage,
        contextSeen: previous.contextSeen
      });
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    if (legacy && typeof legacy === 'object') return normalizeState({
      enabled: legacy.enabled !== false,
      completed: false,
      skipped: false,
      stage: STAGES.MOVE,
      contextSeen: legacy.contextSeen
    });
  } catch {
    // Storage failures must never block play.
  }
  return defaultState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime.state)); } catch { /* non-fatal */ }
}

const tutorialUi = createTutorialUi({
  runtime,
  safeCall,
  onLater: () => dismissCurrentPrompt('not_now'),
  onSkip: () => disableTutorial(),
  setTutorialEnabled: (enabled) => setTutorialEnabled(enabled),
  restartTutorial: () => restartTutorial()
});
const { createCardIfNeeded, ensureSettingsControls, hidePrompt, updateSettingsStatus, setExpanded } = tutorialUi;

function playerPosition() {
  const target = appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker
    ? appCtx.Walk.state.walker
    : appCtx.boatMode?.active
      ? appCtx.boat
      : appCtx.droneMode
        ? appCtx.drone
        : appCtx.planeMode?.active
          ? appCtx.planeMode
          : appCtx.car;
  const x = Number(target?.x);
  const z = Number(target?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function showPrompt(stage, config = {}) {
  if (!runtime.state.enabled || runtime.state.skipped || (runtime.state.completed && !config.contextual)) return false;
  if (!config.contextual && runtime.sessionPresented.has(stage)) return false;
  if (uiBlocksTutorial()) return false;
  createCardIfNeeded();
  if (!runtime.card) return false;
  runtime.sessionPresented.add(stage);
  runtime.currentStage = stage;
  runtime.currentButtonAction = typeof config.onAction === 'function' ? config.onAction : null;
  runtime.eyebrowEl.textContent = config.eyebrow || `First Journey · ${STAGE_NUMBER[stage] || 1} of ${CORE_STAGE_COUNT}`;
  runtime.titleEl.textContent = config.title || 'Try this next';
  runtime.bodyEl.textContent = config.body || '';
  runtime.progressEl.style.width = `${Math.max(8, Math.min(100, Number(config.progress) || (STAGE_NUMBER[stage] / CORE_STAGE_COUNT * 100)))}%`;
  runtime.actionBtn.hidden = !(config.actionLabel && runtime.currentButtonAction);
  runtime.actionBtn.textContent = config.actionLabel || '';
  runtime.skipBtn.hidden = config.contextual === true;
  runtime.card.hidden = false;
  setExpanded(config.expanded === true);
  tutorialTelemetry('we3d_tutorial_step', { action: 'presented', step_id: stage });

  if (runtime.dismissTimer) clearTimeout(runtime.dismissTimer);
  runtime.dismissTimer = 0;
  if (config.contextual) {
    runtime.dismissTimer = window.setTimeout(() => dismissCurrentPrompt('auto_hidden'), Math.max(6000, Number(config.autoHideMs) || 10000));
  }
  return true;
}

function dismissCurrentPrompt(action = 'not_now') {
  if (runtime.currentStage) tutorialTelemetry('we3d_tutorial_step', { action, step_id: runtime.currentStage });
  hidePrompt();
}

function openBackpack() {
  const menuItem = document.getElementById('fBackpack');
  if (menuItem instanceof HTMLElement) menuItem.click();
  else appCtx.toggleUrbanEquipment?.(true);
}

function openExplorer() {
  const menuItem = document.getElementById('fWorldDiscovery');
  if (menuItem instanceof HTMLElement) menuItem.click();
  else appCtx.toggleWorldDiscoveryJournal?.(true);
}

function openExplorerJournal() {
  if (appCtx.openWorldDiscoverySection?.('journal')) return;
  openExplorer();
  globalThis.requestAnimationFrame?.(() => document.querySelector('[data-discovery-tab="journal"]')?.click());
}

function presentCurrentStage() {
  if (!runtime.state.enabled || runtime.state.completed || runtime.state.skipped || !appCtx.gameStarted) {
    hidePrompt();
    return;
  }
  if (runtime.state.stage === STAGES.MOVE) {
    const touchControls = appCtx.getMobileTouchInputSnapshot?.().enabled === true;
    showPrompt(STAGES.MOVE, {
      title: 'Move and look around',
      body: touchControls
        ? 'Use the left control to move and the right control to look. Travel a short distance so the camera and movement feel familiar.'
        : 'Use the arrow keys to move and turn. WASD looks around, and Shift runs.',
      progress: 16,
      expanded: true
    });
  } else if (runtime.state.stage === STAGES.PACK) {
    showPrompt(STAGES.PACK, {
      title: 'Open your Backpack',
      body: 'Your tools, finds, gear, and six quick slots live in one place. Open it now; you do not need to equip anything yet.',
      actionLabel: 'Open Backpack',
      onAction: openBackpack,
      progress: 32,
      expanded: true
    });
  } else if (runtime.state.stage === STAGES.EXPLORER) {
    showPrompt(STAGES.EXPLORER, {
      title: 'Open My Explorer',
      body: 'This is the home for Field Today, activities, Journal records, the Field Guide, companions, and your Explorer progress.',
      actionLabel: 'Open My Explorer',
      onAction: openExplorer,
      progress: 48,
      expanded: true
    });
  } else if (runtime.state.stage === STAGES.ACTIVITY) {
    showPrompt(STAGES.ACTIVITY, {
      title: 'Choose your first activity',
      body: 'Pick one nearby activity in Today. Your field tool and the world cue will show where to go and what to do.',
      actionLabel: 'Open Today',
      onAction: openExplorer,
      progress: 64,
      expanded: true
    });
  } else if (runtime.state.stage === STAGES.RECORD) {
    showPrompt(STAGES.RECORD, {
      title: 'Complete one field record',
      body: 'Follow the bearing or signal in the world. Use the action when you reach the site, finish the visible steps, and save the result.',
      progress: 80,
      expanded: true
    });
  } else if (runtime.state.stage === STAGES.REVIEW) {
    showPrompt(STAGES.REVIEW, {
      title: 'See what changed',
      body: 'Your Journal now holds the story of what you did. The Guide remembers what you identified, and any collected item stays in your Backpack.',
      actionLabel: 'Open Journal',
      onAction: openExplorerJournal,
      progress: 96,
      expanded: true
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
  updateSettingsStatus(`First Journey: ${Math.min(CORE_STAGE_COUNT, STAGE_NUMBER[nextStage] || 1)} of ${CORE_STAGE_COUNT}.`);
  return true;
}

function completeTutorial(reason = 'path_chosen') {
  if (runtime.state.completed) return;
  const completedStep = runtime.state.stage;
  runtime.state.completed = true;
  runtime.state.skipped = false;
  runtime.state.stage = STAGES.COMPLETE;
  runtime.state.completedAtMs = Date.now();
  saveState();
  tutorialTelemetry('we3d_tutorial_step', { action: 'completed', step_id: completedStep, result: reason });
  tutorialTelemetry('tutorial_complete');
  updateSettingsStatus('First Journey complete. Optional tips appear once when you enter an unfamiliar system.');
  hidePrompt();
  runtime.sessionPresented.delete('core_complete');
  showPrompt('core_complete', {
    contextual: true,
    eyebrow: 'First Journey complete',
    title: 'Explore your way',
    body: 'My Explorer remembers what you learn. Your Backpack carries what you use. Travel modes change how you move through the same world.',
    progress: 100,
    expanded: true,
    autoHideMs: 12000
  });
}

function disableTutorial() {
  runtime.state.enabled = false;
  runtime.state.skipped = true;
  saveState();
  tutorialTelemetry('we3d_tutorial_step', { action: 'disabled', step_id: runtime.state.stage });
  updateSettingsStatus('Guidance is off. Your game progress is unchanged, and First Journey can be replayed here.');
  hidePrompt();
}

function showContextTip(id, config) {
  if (!runtime.state.completed || !runtime.state.enabled || runtime.state.contextSeen[id]) return;
  const presented = showPrompt(`context_${id}`, { ...config, contextual: true, progress: 100, autoHideMs: 9000 });
  if (presented) {
    runtime.state.contextSeen[id] = true;
    saveState();
  }
}

function tutorialOnEvent(eventName, payload = {}) {
  if (!runtime.initialized) return;
  const name = String(eventName || '');
  if (name === 'spawned_in_world') {
    runtime.movementOrigin = playerPosition();
    runtime.lastPosition = runtime.movementOrigin;
    presentCurrentStage();
  } else if (name === 'opened_backpack' && runtime.state.stage === STAGES.PACK) {
    setStage(STAGES.EXPLORER, 'backpack_opened');
  } else if (name === 'opened_explorer' && runtime.state.stage === STAGES.EXPLORER) {
    setStage(STAGES.ACTIVITY, 'explorer_opened');
  } else if (name === 'build_mode_entered') {
    showContextTip('building', {
      eyebrow: 'Building tip',
      title: 'Build in this world',
      body: 'Build with Blocks and the Editor share the same placed-work authority. Save locally as you work; publish only when you choose.'
    });
  } else if (name === 'opened_rooms_menu' || name === 'room_created_or_toggled') {
    showContextTip('rooms', {
      eyebrow: 'Room tip',
      title: 'Explore together',
      body: 'Create or join a room when you want company. Room roles decide who can edit or moderate shared work.'
    });
  } else if (name === 'entered_space') {
    showContextTip('space', {
      eyebrow: 'Spaceflight tip',
      title: 'Fly your own course',
      body: 'Use the Wayfinder for direction or fly manually. Arrow keys steer, Space adds thrust, and Shift slows the ship.'
    });
  }
  if (payload?.forceStage && STAGE_ORDER.includes(payload.forceStage)) setStage(payload.forceStage, 'forced');
}

function onDiscoveryTelemetry(event) {
  if (!runtime.initialized || !runtime.state.enabled || runtime.state.completed) return;
  const type = String(event?.detail?.type || '');
  if (type === 'activity_started') {
    if (runtime.state.stage === STAGES.EXPLORER || runtime.state.stage === STAGES.ACTIVITY) setStage(STAGES.RECORD, 'activity_selected');
    return;
  }
  if (type === 'discovery_recorded' && [STAGES.ACTIVITY, STAGES.RECORD].includes(runtime.state.stage)) {
    setStage(STAGES.REVIEW, 'field_record_saved');
  }
}

function onExplorerSectionOpened(event) {
  if (!runtime.initialized || !runtime.state.enabled || runtime.state.completed) return;
  if (runtime.state.stage === STAGES.REVIEW && event?.detail?.section === 'journal') completeTutorial('journal_reviewed');
}

function panelIsOpen(id) {
  const element = document.getElementById(id);
  return !!element && (element.classList.contains('show') || element.getAttribute('aria-hidden') === 'false');
}

function uiBlocksTutorial() {
  return panelIsOpen('discoveryPanel') || panelIsOpen('urbanEquipment') ||
    panelIsOpen('roomPanelModal') || !!document.querySelector('.floatMenu.open');
}

function detectContextTransitions() {
  const inSpace = !!(appCtx.spaceFlight?.active || (typeof appCtx.isEnv === 'function' && appCtx.isEnv(appCtx.ENV?.SPACE_FLIGHT)));
  const inMoon = !!appCtx.onMoon;
  const roomPanelOpen = panelIsOpen('roomPanelModal');
  const buildModeOn = !!document.getElementById('fBlockBuild')?.classList.contains('on');
  const backpackOpen = panelIsOpen('urbanEquipment');
  const explorerOpen = panelIsOpen('discoveryPanel');
  if (!runtime.previous.gameStarted && appCtx.gameStarted) tutorialOnEvent('spawned_in_world');
  if (!runtime.previous.inSpace && inSpace) tutorialOnEvent('entered_space');
  if (!runtime.previous.inMoon && inMoon) showContextTip('moon', {
    eyebrow: 'Moon tip',
    title: 'Explore the surface',
    body: 'Walking and driving keep their familiar controls here. Use Travel Modes whenever you want to change how you explore.'
  });
  if (!runtime.previous.roomPanelOpen && roomPanelOpen) tutorialOnEvent('opened_rooms_menu');
  if (!runtime.previous.buildModeOn && buildModeOn) tutorialOnEvent('build_mode_entered');
  if (!runtime.previous.backpackOpen && backpackOpen) tutorialOnEvent('opened_backpack', { source: 'panel_state' });
  if (!runtime.previous.explorerOpen && explorerOpen) tutorialOnEvent('opened_explorer', { source: 'panel_state' });
  runtime.previous = {
    gameStarted: !!appCtx.gameStarted,
    inSpace,
    inMoon,
    roomPanelOpen,
    buildModeOn,
    backpackOpen,
    explorerOpen
  };
}

function tutorialUpdate(dt = 0) {
  if (!runtime.initialized) return;
  detectContextTransitions();
  runtime.currentJourneyUi?.update?.(dt);
  const activePanel = uiBlocksTutorial();
  if (activePanel) {
    if (runtime.card && !runtime.card.hidden) hidePrompt();
    return;
  }
  if (!runtime.state.enabled || runtime.state.completed || runtime.state.skipped || !appCtx.gameStarted) return;
  if ((!runtime.card || runtime.card.hidden) && !runtime.sessionPresented.has(runtime.state.stage)) presentCurrentStage();
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
    setStage(STAGES.PACK, 'moved_8m');
  }
}

function setTutorialEnabled(enabled) {
  runtime.state.enabled = !!enabled;
  if (enabled) runtime.state.skipped = false;
  else if (!runtime.state.completed) runtime.state.skipped = true;
  saveState();
  updateSettingsStatus(enabled ? 'Guidance enabled.' : 'Guidance disabled. Your game progress is unchanged.');
  if (enabled) presentCurrentStage();
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
  updateSettingsStatus(`First Journey restarted: step 1 of ${CORE_STAGE_COUNT}.`);
  presentCurrentStage();
}

function getTutorialSnapshot() {
  return {
    version: TUTORIAL_VERSION,
    enabled: runtime.state.enabled,
    completed: runtime.state.completed,
    skipped: runtime.state.skipped,
    stage: runtime.state.stage,
    step: STAGE_NUMBER[runtime.state.stage] || CORE_STAGE_COUNT,
    steps: CORE_STAGE_COUNT,
    distanceMoved: Number(runtime.state.distanceMoved.toFixed(2)),
    promptVisible: !!runtime.card && !runtime.card.hidden && getComputedStyle(runtime.card).display !== 'none',
    promptExpanded: !!runtime.card && !runtime.card.classList.contains('compact'),
    title: runtime.titleEl?.textContent || ''
  };
}

function initTutorial(appContext = null) {
  if (runtime.initialized) return;
  if (appContext && typeof appContext === 'object') Object.assign(appCtx, appContext);
  runtime.state = loadState();
  createCardIfNeeded();
  ensureSettingsControls();
  runtime.previous = {
    gameStarted: !!appCtx.gameStarted,
    inSpace: !!appCtx.spaceFlight?.active,
    inMoon: !!appCtx.onMoon,
    roomPanelOpen: panelIsOpen('roomPanelModal'),
    buildModeOn: !!document.getElementById('fBlockBuild')?.classList.contains('on'),
    backpackOpen: panelIsOpen('urbanEquipment'),
    explorerOpen: panelIsOpen('discoveryPanel')
  };
  runtime.movementOrigin = playerPosition();
  runtime.lastPosition = runtime.movementOrigin;
  runtime.discoveryListener = onDiscoveryTelemetry;
  runtime.explorerSectionListener = onExplorerSectionOpened;
  globalThis.addEventListener?.('we3d:discovery-telemetry', runtime.discoveryListener);
  globalThis.addEventListener?.('we3d:explorer-section-opened', runtime.explorerSectionListener);
  runtime.initialized = true;
  runtime.currentJourneyUi = createCurrentJourneyUi(appCtx, { getTutorialSnapshot });

  if (runtime.state.enabled && !runtime.state.completed && !runtime.state.skipped && !runtime.state.analyticsBegan) {
    runtime.state.analyticsBegan = true;
    runtime.state.startedAtMs = Date.now();
    tutorialTelemetry('tutorial_begin');
  }
  saveState();
  updateSettingsStatus(runtime.state.completed
    ? 'First Journey complete. Replay it whenever you want.'
    : runtime.state.enabled && !runtime.state.skipped
      ? `First Journey: ${STAGE_NUMBER[runtime.state.stage] || 1} of ${CORE_STAGE_COUNT}.`
      : 'Guidance is off. Replay First Journey whenever you want.');
  presentCurrentStage();
}

Object.assign(appCtx, {
  getTutorialSnapshot,
  initTutorial,
  restartTutorial,
  setTutorialEnabled,
  tutorialOnEvent,
  tutorialUpdate
});

export { getTutorialSnapshot, initTutorial, restartTutorial, setTutorialEnabled, tutorialOnEvent, tutorialUpdate };
