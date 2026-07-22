import { ctx as appCtx } from "../shared-context.js?v=55";
import { createTutorialUi } from "./ui.js?v=1";

const STORAGE_KEY = 'worldExplorer3D.tutorialState.v1';

const STAGES = {
  AWAIT_GLOBE: 'await_globe',
  MOVE_HINT: 'move_hint',
  MODE_HINT: 'mode_hint',
  SPACE_HINT: 'space_hint',
  SPACE_FLY: 'space_fly',
  MOON_HINT: 'moon_hint',
  MOON_MOVE: 'moon_move',
  RETURN_HINT: 'return_hint',
  BUILD_HINT: 'build_hint',
  ROOM_HINT: 'room_hint',
  INVITE_HINT: 'invite_hint',
  COMPLETE: 'complete'
};

const STAGE_ORDER = [
  STAGES.AWAIT_GLOBE,
  STAGES.MOVE_HINT,
  STAGES.MODE_HINT,
  STAGES.SPACE_HINT,
  STAGES.SPACE_FLY,
  STAGES.MOON_HINT,
  STAGES.MOON_MOVE,
  STAGES.RETURN_HINT,
  STAGES.BUILD_HINT,
  STAGES.ROOM_HINT,
  STAGES.INVITE_HINT,
  STAGES.COMPLETE
];

function clampStage(stage) {
  return STAGE_ORDER.includes(stage) ? stage : STAGES.AWAIT_GLOBE;
}

function normalizeShownStages(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach((entry) => {
    const stage = String(entry || '');
    if (!STAGE_ORDER.includes(stage) || seen.has(stage)) return;
    seen.add(stage);
    out.push(stage);
  });
  return out;
}

function safeCall(fn, ...args) {
  if (typeof fn === 'function') {
    try {
      fn(...args);
    } catch (_) {
      // Keep tutorial non-fatal.
    }
  }
}

const runtime = {
  initialized: false,
  state: {
    enabled: true,
    completed: false,
    stage: STAGES.AWAIT_GLOBE,
    worldSeconds: 0,
    moonSeconds: 0,
    modeSwitchCount: 0,
    moonModeSwitchCount: 0,
    buildInteracted: false,
    roomInteracted: false,
    openedMainMenu: false,
    openedRoomsMenu: false,
    selectedLocation: false,
    spawned: false,
    inSpace: false,
    inMoon: false,
    shownStages: []
  },
  stageShown: new Set(),
  dismissTimer: 0,
  currentButtonAction: null,
  card: null,
  titleEl: null,
  bodyEl: null,
  actionBtn: null,
  closeBtn: null,
  settingsMount: null,
  settingsStatus: null,
  settingsToggle: null,
  settingsRestartBtn: null,
  previous: {
    gameStarted: false,
    mode: '',
    inSpace: false,
    inMoon: false,
    roomCode: '',
    roomPanelOpen: false,
    buildModeOn: false,
    titleVisible: true
  }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const stage = clampStage(String(parsed.stage || STAGES.AWAIT_GLOBE));
    return {
      enabled: parsed.enabled !== false,
      completed: parsed.completed === true,
      stage,
      worldSeconds: Number.isFinite(Number(parsed.worldSeconds)) ? Math.max(0, Number(parsed.worldSeconds)) : 0,
      moonSeconds: Number.isFinite(Number(parsed.moonSeconds)) ? Math.max(0, Number(parsed.moonSeconds)) : 0,
      modeSwitchCount: Number.isFinite(Number(parsed.modeSwitchCount)) ? Math.max(0, Number(parsed.modeSwitchCount)) : 0,
      moonModeSwitchCount: Number.isFinite(Number(parsed.moonModeSwitchCount)) ? Math.max(0, Number(parsed.moonModeSwitchCount)) : 0,
      buildInteracted: parsed.buildInteracted === true,
      roomInteracted: parsed.roomInteracted === true,
      openedMainMenu: parsed.openedMainMenu === true,
      openedRoomsMenu: parsed.openedRoomsMenu === true,
      selectedLocation: parsed.selectedLocation === true,
      spawned: parsed.spawned === true,
      inSpace: parsed.inSpace === true,
      inMoon: parsed.inMoon === true,
      shownStages: normalizeShownStages(parsed.shownStages)
    };
  } catch {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime.state));
  } catch {
    // Ignore quota/private mode failures.
  }
}

const tutorialUi = createTutorialUi({
  runtime,
  safeCall,
  setTutorialEnabled: (enabled) => setTutorialEnabled(enabled),
  restartTutorial: () => restartTutorial()
});
const { createCardIfNeeded, ensureSettingsControls, hidePrompt, updateSettingsStatus } = tutorialUi;

function showPrompt(stage, config) {
  if (!runtime.state.enabled || runtime.state.completed) {
    hidePrompt();
    return;
  }
  if (!config || runtime.stageShown.has(stage)) return;
  const shownStages = Array.isArray(runtime.state.shownStages) ? runtime.state.shownStages : [];
  if (shownStages.includes(stage)) return;
  createCardIfNeeded();
  if (!runtime.card || !runtime.titleEl || !runtime.bodyEl || !runtime.actionBtn) return;

  runtime.stageShown.add(stage);
  shownStages.push(stage);
  runtime.state.shownStages = shownStages;
  saveState();
  runtime.titleEl.textContent = String(config.title || 'Next Tip');
  runtime.bodyEl.textContent = String(config.body || '');

  const hasAction = typeof config.onAction === 'function' && config.actionLabel;
  runtime.actionBtn.style.display = hasAction ? 'inline-flex' : 'none';
  runtime.actionBtn.textContent = hasAction ? String(config.actionLabel) : '';
  runtime.currentButtonAction = hasAction ? config.onAction : null;
  runtime.card.style.display = 'block';

  if (runtime.dismissTimer) clearTimeout(runtime.dismissTimer);
  const autoHideMs = Number.isFinite(Number(config.autoHideMs)) ? Math.max(2400, Number(config.autoHideMs)) : 7600;
  runtime.dismissTimer = setTimeout(() => {
    runtime.dismissTimer = 0;
    hidePrompt();
  }, autoHideMs);
}

function markCompleted() {
  runtime.state.completed = true;
  runtime.state.stage = STAGES.COMPLETE;
  saveState();
  updateSettingsStatus('Tutorial complete. Use Restart Tutorial to run it again.');
  showPrompt(STAGES.COMPLETE, {
    title: 'Tutorial Complete',
    body: 'You can keep exploring or try another location from the main menu.',
    autoHideMs: 9500
  });
}

function setStage(nextStage) {
  const clamped = clampStage(nextStage);
  if (runtime.state.stage === clamped) return;
  runtime.state.stage = clamped;
  saveState();
  presentCurrentStage();
}

function getCurrentTravelMode() {
  if (appCtx.spaceFlight?.active || (typeof appCtx.isEnv === 'function' && appCtx.isEnv(appCtx.ENV?.SPACE_FLIGHT))) return 'space';
  if (appCtx.onMoon) return 'moon';
  if (appCtx.planeMode?.active) return 'plane';
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walk';
  return 'drive';
}

function requestSpaceTransition() {
  if (typeof appCtx.travelToMoon === 'function' && !appCtx.onMoon && !appCtx.travelingToMoon) {
    appCtx.travelToMoon();
  }
}

function requestMoonTransition() {
  if (appCtx.spaceFlight?.active && typeof appCtx.forceSpaceFlightLanding === 'function') {
    if (typeof appCtx.setSpaceFlightLandingTarget === 'function') {
      appCtx.setSpaceFlightLandingTarget('moon');
    }
    appCtx.forceSpaceFlightLanding();
    return;
  }
  if (typeof appCtx.directTravelToMoon === 'function' && !appCtx.onMoon && !appCtx.travelingToMoon) {
    appCtx.directTravelToMoon();
  }
}

function requestEarthReturn() {
  if (typeof appCtx.returnToEarth === 'function' && appCtx.onMoon && !appCtx.travelingToMoon) {
    appCtx.returnToEarth();
    return;
  }
  if (appCtx.spaceFlight?.active && typeof appCtx.startSpaceFlightToEarth === 'function') {
    appCtx.startSpaceFlightToEarth();
  }
}

function requestBuildMode() {
  if (typeof appCtx.toggleBlockBuildMode === 'function') {
    appCtx.toggleBlockBuildMode(true);
  }
}

function requestRoomPanel() {
  const panelBtn = document.getElementById('mpTitlePanelBtn');
  const joinBtn = document.getElementById('fMpJoin');
  if (panelBtn instanceof HTMLElement) {
    panelBtn.click();
    return;
  }
  if (joinBtn instanceof HTMLElement) {
    joinBtn.click();
  }
}

function requestGlobeOpen() {
  safeCall(appCtx.openGlobeSelector);
}

function getMovementHint() {
  if (appCtx.oceanMode?.active) {
    return 'Submarine controls:\nArrow keys steer and change speed, Control dives, Shift rises.';
  }
  if (appCtx.boatMode?.active) {
    return 'Boat controls:\nArrow keys steer and change speed, Space brakes, F changes travel mode.';
  }
  if (appCtx.planeMode?.active) {
    return 'Plane controls:\nArrow keys steer, Space adds throttle, Shift reduces throttle, V changes camera.';
  }
  if (appCtx.droneMode) {
    return 'Drone controls:\nArrow keys move, Space climbs, Control descends, WASD looks around.';
  }
  if (appCtx.Walk?.state?.mode !== 'walk') {
    return 'Driving controls:\nArrow keys steer and change speed, Space brakes, WASD looks around.';
  }
  return 'Walk controls:\nArrow keys move and turn, WASD looks around, Space jumps, Shift runs.';
}

function presentCurrentStage() {
  if (!runtime.state.enabled || runtime.state.completed) {
    hidePrompt();
    return;
  }

  const stage = runtime.state.stage;
  if (stage === STAGES.AWAIT_GLOBE) {
    showPrompt(stage, {
      title: 'Pick a Place on Earth',
      body: 'Play starts from the globe selector.\nTip: search still works for city names or exact coordinates.',
      actionLabel: 'Open Globe',
      onAction: requestGlobeOpen,
      autoHideMs: 9000
    });
    return;
  }

  if (stage === STAGES.MOVE_HINT) {
    showPrompt(stage, {
      title: 'Try Moving Around',
      body: getMovementHint(),
      autoHideMs: 9600
    });
    return;
  }

  if (stage === STAGES.MODE_HINT) {
    showPrompt(stage, {
      title: 'Switch Travel Modes',
      body: 'Use the right-side buttons to choose Walk, Driving, or Drone.\nKeyboard: F cycles through all three travel modes.',
      autoHideMs: 9800
    });
    return;
  }

  if (stage === STAGES.SPACE_HINT) {
    showPrompt(stage, {
      title: 'Try Going to Space',
      body: 'Use the travel menu to launch a space flight, then explore around Earth.',
      actionLabel: 'Go To Space',
      onAction: requestSpaceTransition,
      autoHideMs: 9800
    });
    return;
  }

  if (stage === STAGES.SPACE_FLY) {
    showPrompt(stage, {
      title: 'Fly Around Earth',
      body: 'In space flight: Arrow keys steer, Space thrust, Shift brake.',
      autoHideMs: 9000
    });
    return;
  }

  if (stage === STAGES.MOON_HINT) {
    showPrompt(stage, {
      title: 'Try the Moon',
      body: 'Land on the Moon next to continue the walkthrough.',
      actionLabel: 'Go To Moon',
      onAction: requestMoonTransition,
      autoHideMs: 9800
    });
    return;
  }

  if (stage === STAGES.MOON_MOVE) {
    showPrompt(stage, {
      title: 'Explore the Moon',
      body: 'Try walking or driving on the Moon surface, then switch modes once.',
      autoHideMs: 9200
    });
    return;
  }

  if (stage === STAGES.RETURN_HINT) {
    showPrompt(stage, {
      title: 'Return to Earth',
      body: 'Head back to Earth and try building something at your location.',
      actionLabel: 'Return To Earth',
      onAction: requestEarthReturn,
      autoHideMs: 9800
    });
    return;
  }

  if (stage === STAGES.BUILD_HINT) {
    showPrompt(stage, {
      title: 'Build Something',
      body: 'Open Land & Property and choose Build with Blocks, or place an artifact in a room.',
      actionLabel: 'Open Build with Blocks',
      onAction: requestBuildMode,
      autoHideMs: 9800
    });
    return;
  }

  if (stage === STAGES.ROOM_HINT) {
    showPrompt(stage, {
      title: 'Share It With a Room',
      body: 'Create or join a room to share this place in multiplayer.',
      actionLabel: 'Open Room Panel',
      onAction: requestRoomPanel,
      autoHideMs: 9800
    });
    return;
  }

  if (stage === STAGES.INVITE_HINT) {
    showPrompt(stage, {
      title: 'Invite Friends',
      body: 'Open Main Menu -> Rooms -> Invite Link to share your room code.',
      autoHideMs: 10200
    });
  }
}

function tutorialOnEvent(eventName, payload = {}) {
  if (!runtime.initialized) return;
  if (!runtime.state.enabled || runtime.state.completed) return;

  const name = String(eventName || '');
  if (!name) return;

  if (name === 'location_selected') {
    runtime.state.selectedLocation = true;
    saveState();
  }

  if (name === 'spawned_in_world') {
    runtime.state.spawned = true;
    runtime.state.worldSeconds = 0;
    saveState();
    setStage(STAGES.MOVE_HINT);
    return;
  }

  if (name === 'mode_switched') {
    runtime.state.modeSwitchCount += 1;
    if (runtime.state.inMoon) runtime.state.moonModeSwitchCount += 1;
    saveState();
    if (runtime.state.stage === STAGES.MOVE_HINT) presentCurrentStage();
    if (runtime.state.stage === STAGES.MODE_HINT && runtime.state.modeSwitchCount >= 1) {
      setStage(STAGES.SPACE_HINT);
      return;
    }
    if (runtime.state.stage === STAGES.MOON_MOVE && runtime.state.moonModeSwitchCount >= 1) {
      setStage(STAGES.RETURN_HINT);
      return;
    }
  }

  if (name === 'entered_space') {
    runtime.state.inSpace = true;
    runtime.state.inMoon = false;
    saveState();
    setStage(STAGES.SPACE_FLY);
    return;
  }

  if (name === 'entered_moon') {
    runtime.state.inMoon = true;
    runtime.state.inSpace = false;
    runtime.state.moonSeconds = 0;
    saveState();
    setStage(STAGES.MOON_MOVE);
    return;
  }

  if (name === 'returned_to_earth') {
    runtime.state.inMoon = false;
    runtime.state.inSpace = false;
    saveState();
    if (runtime.state.stage === STAGES.RETURN_HINT || runtime.state.stage === STAGES.MOON_MOVE) {
      setStage(STAGES.BUILD_HINT);
      return;
    }
  }

  if (name === 'build_mode_entered' || name === 'artifact_placed') {
    runtime.state.buildInteracted = true;
    saveState();
    if (runtime.state.stage === STAGES.BUILD_HINT) {
      setStage(STAGES.ROOM_HINT);
      return;
    }
  }

  if (name === 'room_created_or_toggled') {
    runtime.state.roomInteracted = true;
    saveState();
    if (runtime.state.stage === STAGES.ROOM_HINT || runtime.state.stage === STAGES.BUILD_HINT) {
      setStage(STAGES.INVITE_HINT);
      return;
    }
  }

  if (name === 'opened_main_menu') {
    runtime.state.openedMainMenu = true;
    saveState();
  }

  if (name === 'opened_rooms_menu') {
    runtime.state.openedRoomsMenu = true;
    saveState();
  }

  if (runtime.state.stage === STAGES.SPACE_FLY && runtime.state.inSpace) {
    setStage(STAGES.MOON_HINT);
    return;
  }

  if (runtime.state.stage === STAGES.INVITE_HINT && runtime.state.openedMainMenu && runtime.state.openedRoomsMenu) {
    markCompleted();
  }

  if (payload && typeof payload === 'object' && payload.forceStage) {
    setStage(clampStage(String(payload.forceStage)));
  }
}

function detectEventTransitions() {
  const currentMode = getCurrentTravelMode();
  if (runtime.previous.mode && runtime.previous.mode !== currentMode) {
    tutorialOnEvent('mode_switched', { mode: currentMode });
  }
  runtime.previous.mode = currentMode;

  const inSpaceNow = !!(appCtx.spaceFlight?.active || (typeof appCtx.isEnv === 'function' && appCtx.isEnv(appCtx.ENV?.SPACE_FLIGHT)));
  const inMoonNow = !!appCtx.onMoon;
  const titleVisible = !!(document.getElementById('titleScreen') && !document.getElementById('titleScreen').classList.contains('hidden'));
  const roomCodeNow = String(appCtx.multiplayerMapRooms?.currentRoomCode || '');
  const roomPanelOpen = !!document.getElementById('roomPanelModal')?.classList.contains('show');
  const buildModeOn = !!document.getElementById('fBlockBuild')?.classList.contains('on');

  if (!runtime.previous.gameStarted && appCtx.gameStarted) {
    tutorialOnEvent('spawned_in_world');
  }
  if (!runtime.previous.inSpace && inSpaceNow) {
    tutorialOnEvent('entered_space');
  }
  if (!runtime.previous.inMoon && inMoonNow) {
    tutorialOnEvent('entered_moon');
  }
  if (runtime.previous.inMoon && !inMoonNow) {
    tutorialOnEvent('returned_to_earth');
  }
  if (!runtime.previous.roomCode && roomCodeNow) {
    tutorialOnEvent('room_created_or_toggled', { roomCode: roomCodeNow });
  }
  if (!runtime.previous.roomPanelOpen && roomPanelOpen) {
    tutorialOnEvent('opened_rooms_menu');
  }
  if (!runtime.previous.buildModeOn && buildModeOn) {
    tutorialOnEvent('build_mode_entered');
  }
  if (!runtime.previous.titleVisible && titleVisible && appCtx.gameStarted === false) {
    tutorialOnEvent('opened_main_menu');
  }

  runtime.previous.gameStarted = !!appCtx.gameStarted;
  runtime.previous.inSpace = inSpaceNow;
  runtime.previous.inMoon = inMoonNow;
  runtime.previous.roomCode = roomCodeNow;
  runtime.previous.roomPanelOpen = roomPanelOpen;
  runtime.previous.buildModeOn = buildModeOn;
  runtime.previous.titleVisible = titleVisible;
}

function tutorialUpdate(dt) {
  if (!runtime.initialized) return;
  const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;

  detectEventTransitions();

  if (!runtime.state.enabled || runtime.state.completed) return;

  if (appCtx.gameStarted && !runtime.state.inMoon && !runtime.state.inSpace) {
    runtime.state.worldSeconds += delta;
  }
  if (runtime.state.stage === STAGES.MOVE_HINT && runtime.bodyEl) {
    const movementHint = getMovementHint();
    if (runtime.bodyEl.textContent !== movementHint) runtime.bodyEl.textContent = movementHint;
  }
  if (runtime.state.inMoon) {
    runtime.state.moonSeconds += delta;
  }

  if (runtime.state.stage === STAGES.MOVE_HINT && runtime.state.worldSeconds >= 8) {
    setStage(STAGES.MODE_HINT);
    return;
  }

  if (runtime.state.stage === STAGES.MODE_HINT && (runtime.state.worldSeconds >= 60 || runtime.state.modeSwitchCount >= 1)) {
    setStage(STAGES.SPACE_HINT);
    return;
  }

  if (runtime.state.stage === STAGES.MOON_MOVE && (runtime.state.moonSeconds >= 60 || runtime.state.moonModeSwitchCount >= 1)) {
    setStage(STAGES.RETURN_HINT);
    return;
  }

  if (runtime.state.stage === STAGES.INVITE_HINT && runtime.state.openedMainMenu && runtime.state.openedRoomsMenu) {
    markCompleted();
    return;
  }

  saveState();
}

function setTutorialEnabled(enabled) {
  runtime.state.enabled = !!enabled;
  if (!runtime.state.enabled) {
    hidePrompt();
    updateSettingsStatus('Tutorial disabled. You can re-enable it anytime.');
  } else {
    updateSettingsStatus(runtime.state.completed ? 'Tutorial completed on this browser.' : 'Tutorial enabled.');
    presentCurrentStage();
  }
  saveState();
}

function restartTutorial() {
  runtime.state = {
    enabled: true,
    completed: false,
    stage: STAGES.AWAIT_GLOBE,
    worldSeconds: 0,
    moonSeconds: 0,
    modeSwitchCount: 0,
    moonModeSwitchCount: 0,
    buildInteracted: false,
    roomInteracted: false,
    openedMainMenu: false,
    openedRoomsMenu: false,
    selectedLocation: false,
    spawned: false,
    inSpace: false,
    inMoon: false,
    shownStages: []
  };
  runtime.stageShown.clear();
  hidePrompt();
  updateSettingsStatus('Tutorial restarted.');
  saveState();
  presentCurrentStage();
}

function initTutorial(appContext = null) {
  if (runtime.initialized) return;
  if (appContext && typeof appContext === 'object') {
    Object.assign(appCtx, appContext);
  }

  const persisted = loadState();
  if (persisted) {
    runtime.state = { ...runtime.state, ...persisted, stage: clampStage(persisted.stage) };
  }

  createCardIfNeeded();
  ensureSettingsControls();
  updateSettingsStatus(runtime.state.completed ? 'Tutorial completed on this browser.' : 'Tutorial is ready.');

  runtime.previous.gameStarted = !!appCtx.gameStarted;
  runtime.previous.mode = getCurrentTravelMode();
  runtime.previous.inSpace = !!(appCtx.spaceFlight?.active);
  runtime.previous.inMoon = !!appCtx.onMoon;
  runtime.previous.roomCode = String(appCtx.multiplayerMapRooms?.currentRoomCode || '');
  runtime.previous.roomPanelOpen = !!document.getElementById('roomPanelModal')?.classList.contains('show');
  runtime.previous.buildModeOn = !!document.getElementById('fBlockBuild')?.classList.contains('on');
  runtime.previous.titleVisible = !!(document.getElementById('titleScreen') && !document.getElementById('titleScreen').classList.contains('hidden'));

  runtime.initialized = true;

  if (!runtime.state.enabled) {
    hidePrompt();
    saveState();
    return;
  }

  if (runtime.state.completed) {
    hidePrompt();
    saveState();
    return;
  }

  // If the user already started a world before tutorial initialization,
  // continue from movement hints instead of forcing title flow.
  if (appCtx.gameStarted && STAGE_ORDER.indexOf(runtime.state.stage) < STAGE_ORDER.indexOf(STAGES.MOVE_HINT)) {
    runtime.state.stage = STAGES.MOVE_HINT;
  }

  saveState();
  presentCurrentStage();
}

Object.assign(appCtx, {
  initTutorial,
  tutorialOnEvent,
  tutorialUpdate,
  setTutorialEnabled,
  restartTutorial
});

export {
  initTutorial,
  restartTutorial,
  setTutorialEnabled,
  tutorialOnEvent,
  tutorialUpdate
};
