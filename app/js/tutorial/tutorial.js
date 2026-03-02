import { ctx as appCtx } from "../shared-context.js?v=55";

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
    inMoon: false
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
      inMoon: parsed.inMoon === true
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

function createCardIfNeeded() {
  if (runtime.card) return;
  const card = document.createElement('aside');
  card.id = 'tutorialHintCard';
  card.setAttribute('aria-live', 'polite');
  card.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'max-width:min(360px,calc(100vw - 30px))',
    'padding:12px 12px 10px',
    'background:rgba(255,255,255,0.97)',
    'border:2px solid rgba(102,126,234,0.35)',
    'border-radius:12px',
    'box-shadow:0 14px 36px rgba(2,6,23,0.32)',
    'z-index:250',
    'display:none',
    'backdrop-filter:blur(8px)',
    'font-family:Inter,sans-serif',
    'pointer-events:auto'
  ].join(';');

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px';

  const title = document.createElement('div');
  title.style.cssText = 'font-family:Poppins,sans-serif;font-size:13px;font-weight:700;color:#1e293b';

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss tutorial hint');
  close.textContent = '×';
  close.style.cssText = 'border:none;background:#e2e8f0;color:#334155;border-radius:999px;width:24px;height:24px;font-size:16px;line-height:24px;cursor:pointer;flex:0 0 auto';

  const body = document.createElement('div');
  body.style.cssText = 'font-size:12px;line-height:1.45;color:#475569;white-space:pre-line';

  const action = document.createElement('button');
  action.type = 'button';
  action.style.cssText = 'margin-top:9px;border:none;background:linear-gradient(135deg,#0f3460,#533483);color:#fff;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;display:none';

  head.appendChild(title);
  head.appendChild(close);
  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(action);
  document.body.appendChild(card);

  runtime.card = card;
  runtime.titleEl = title;
  runtime.bodyEl = body;
  runtime.actionBtn = action;
  runtime.closeBtn = close;

  close.addEventListener('click', () => hidePrompt());
  action.addEventListener('click', () => {
    const fn = runtime.currentButtonAction;
    hidePrompt();
    safeCall(fn);
  });
}

function ensureSettingsControls() {
  if (runtime.settingsMount) return;
  const tabSettings = document.getElementById('tab-settings');
  if (!tabSettings) return;

  const wrap = document.createElement('div');
  wrap.id = 'tutorialSettingsCard';
  wrap.style.cssText = 'margin-top:18px;background:#f8fafc;border:2px solid #dbe5f5;border-radius:12px;padding:14px';

  const heading = document.createElement('div');
  heading.textContent = '🎓 Guided Walkthrough';
  heading.style.cssText = 'font-family:Poppins,sans-serif;font-size:15px;font-weight:600;color:#667eea;margin-bottom:10px';

  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:12px;color:#334155;cursor:pointer;margin-bottom:10px';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.id = 'tutorialEnabledToggle';
  toggle.style.cssText = 'width:16px;height:16px;cursor:pointer';

  const text = document.createElement('span');
  text.textContent = 'Enable first-time guided walkthrough';

  label.appendChild(toggle);
  label.appendChild(text);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.id = 'tutorialRestartBtn';
  restartBtn.textContent = 'Restart Tutorial';
  restartBtn.style.cssText = 'background:#334155;border:none;border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;font-weight:600;cursor:pointer';

  const status = document.createElement('div');
  status.id = 'tutorialSettingsStatus';
  status.style.cssText = 'font-size:11px;color:#64748b;min-height:16px;margin-top:8px';

  row.appendChild(restartBtn);
  wrap.appendChild(heading);
  wrap.appendChild(label);
  wrap.appendChild(row);
  wrap.appendChild(status);
  tabSettings.appendChild(wrap);

  runtime.settingsMount = wrap;
  runtime.settingsStatus = status;
  runtime.settingsToggle = toggle;
  runtime.settingsRestartBtn = restartBtn;

  toggle.checked = runtime.state.enabled;
  status.textContent = runtime.state.completed ? 'Tutorial completed on this browser.' : 'Tutorial is ready.';

  toggle.addEventListener('change', () => {
    setTutorialEnabled(!!toggle.checked);
  });
  restartBtn.addEventListener('click', () => {
    restartTutorial();
  });
}

function updateSettingsStatus(text) {
  if (runtime.settingsStatus) runtime.settingsStatus.textContent = text || '';
  if (runtime.settingsToggle) runtime.settingsToggle.checked = runtime.state.enabled;
}

function hidePrompt() {
  if (runtime.dismissTimer) {
    clearTimeout(runtime.dismissTimer);
    runtime.dismissTimer = 0;
  }
  runtime.currentButtonAction = null;
  if (runtime.card) runtime.card.style.display = 'none';
}

function showPrompt(stage, config) {
  if (!runtime.state.enabled || runtime.state.completed) {
    hidePrompt();
    return;
  }
  if (!config || runtime.stageShown.has(stage)) return;
  createCardIfNeeded();
  if (!runtime.card || !runtime.titleEl || !runtime.bodyEl || !runtime.actionBtn) return;

  runtime.stageShown.add(stage);
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
      body: 'Walk controls:\nArrow keys move, A/D turn, W/S look, Space jump, Shift run.',
      autoHideMs: 9600
    });
    return;
  }

  if (stage === STAGES.MODE_HINT) {
    showPrompt(stage, {
      title: 'Switch Travel Modes',
      body: 'Use the right-side buttons to swap Walk / Driving / Drone.\nKeyboard: F toggles walk, 6 toggles drone.',
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
      body: 'Open Game Mode and enable Build Mode, or place an artifact in a room.',
      actionLabel: 'Enable Build Mode',
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
    inMoon: false
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
