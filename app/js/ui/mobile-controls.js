import { ctx as appCtx } from "../shared-context.js?v=55";
import { createLifecycleScope } from "../runtime/lifecycle-scope.js?v=2";
import { canUseEquippedItemOnMobile } from './equipment-action-policy.js?v=1';

const MOBILE_CONTROL_PROFILES = {
  driving: {
    moveLabel: 'Drive',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    actions: [{ label: 'Brake', binding: { channel: 'earth', key: 'Space' } }]
  },
  boat: {
    moveLabel: 'Throttle',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    actions: [{ label: 'Brake', binding: { channel: 'earth', key: 'Space' } }]
  },
  walking: {
    moveLabel: 'Move',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    actions: [
      { label: 'Jump', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Run', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  },
  skydiving: {
    moveLabel: 'Canopy',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    actions: [{ label: 'Deploy', binding: { channel: 'earth', key: 'Space' } }]
  },
  drone: {
    moveLabel: 'Move',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: null,
      right: null
    },
    actions: [
      { label: 'Ascend', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Descend', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  },
  plane: {
    moveLabel: 'Flight',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    actions: [
      { label: 'Throttle +', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Throttle -', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  },
  rocket: {
    moveLabel: 'Flight',
    lookLabel: 'Look',
    move: {
      up: { channel: 'space', key: 'arrowup' },
      down: { channel: 'space', key: 'arrowdown' },
      left: { channel: 'space', key: 'arrowleft' },
      right: { channel: 'space', key: 'arrowright' }
    },
    look: null,
    actions: [
      { label: 'Accelerate', binding: { channel: 'space', key: ' ' } },
      { label: 'Decelerate', binding: { channel: 'space', key: 'shift' } }
    ]
  },
  ocean: {
    moveLabel: 'Sub Move',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    look: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    actions: [
      { label: 'Ascend', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Descend', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  }
};

const MOBILE_CONTROL_GUIDANCE = {
  driving: ['Driving', 'Throttle · steer', 'Look', 'Brake'],
  boat: ['Boat', 'Throttle · steer', 'Look', 'Brake'],
  walking: ['Walking', 'Move', 'Look', 'Jump · Run'],
  skydiving: ['Skydiving', 'Steer · flare', 'Look', 'Deploy parachute'],
  drone: ['Drone', 'Fly · turn', 'Look', 'Ascend · descend'],
  plane: ['Plane', 'Pitch · roll', 'Look', 'Throttle + · −'],
  rocket: ['Space Flight', 'Pitch · turn', 'Camera follows', 'Accelerate · brake'],
  ocean: ['Submersible', 'Thrust · turn', 'Look', 'Ascend · descend']
};

function initMobileControls() {
  const mobileControlScope = createLifecycleScope('mobile-controls');
  const controlsTab = document.getElementById('controlsTab');
  const ctrlHeader = document.getElementById('ctrlHeader');
  const ctrlContent = document.getElementById('ctrlContent');
  const drivingControls = document.getElementById('drivingControls');
  const boatControls = document.getElementById('boatControls');
  const walkingControls = document.getElementById('walkingControls');
  const droneControls = document.getElementById('droneControls');
  const planeControls = document.getElementById('planeControls');
  const rocketControls = document.getElementById('rocketControls');
  const oceanControls = document.getElementById('oceanControls');
  const oceanModeMenuItem = document.getElementById('fOceanMode');
  const earthModeMenuItem = document.getElementById('fEarthMode');
  const mobileTouchControls = document.getElementById('mobileTouchControls');
  const mobileMovePad = document.getElementById('mobileMovePad');
  const mobileLookPad = document.getElementById('mobileLookPad');
  const mobileMoveLabel = document.getElementById('mobileMoveLabel');
  const mobileLookLabel = document.getElementById('mobileLookLabel');
  const mobileActionPrimary = document.getElementById('mobileActionPrimary');
  const mobileActionSecondary = document.getElementById('mobileActionSecondary');
  const mobileEquipmentUse = document.getElementById('mobileEquipmentUse');
  const mobileActionStack = document.getElementById('mobileActionStack');
  const urbanEquipmentToggle = document.getElementById('urbanEquipmentToggle');
  const mobileControlsHandedness = document.getElementById('mobileControlsHandedness');
  const mobileMoveSensitivity = document.getElementById('mobileMoveSensitivity');
  const mobileMoveSensitivityValue = document.getElementById('mobileMoveSensitivityValue');
  const mobileLookSensitivity = document.getElementById('mobileLookSensitivity');
  const mobileLookSensitivityValue = document.getElementById('mobileLookSensitivityValue');
  const mobileCameraRecenter = document.getElementById('mobileCameraRecenter');
  const mobileControlsReset = document.getElementById('mobileControlsReset');
  const mobileControlModeName = document.getElementById('mobileControlModeName');
  const mobileControlLeftSummary = document.getElementById('mobileControlLeftSummary');
  const mobileControlRightSummary = document.getElementById('mobileControlRightSummary');
  const mobileControlActionSummary = document.getElementById('mobileControlActionSummary');
  const mobileHoldButtons = [
    'mobileMoveUp',
    'mobileMoveLeft',
    'mobileMoveRight',
    'mobileMoveDown',
    'mobileLookUp',
    'mobileLookLeft',
    'mobileLookRight',
    'mobileLookDown',
    'mobileActionPrimary',
    'mobileActionSecondary'
  ].map((id) => document.getElementById(id)).filter(Boolean);

  const isTouchPreferredClient = (() => {
    try {
      return (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    } catch (_) {
      return (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    }
  })();

  if (isTouchPreferredClient && mobileActionStack && urbanEquipmentToggle) {
    urbanEquipmentToggle.classList.add('mobilePackAction');
    mobileActionStack.append(urbanEquipmentToggle);
  }
  const mobileHeldCounts = new Map();
  const mobileActivePointers = new Map();
  const analogPadPointers = new Map();

  function setVirtualInputPressed(channel, key, pressed) {
    if (!key) return;
    if (channel === 'space') {
      if (!appCtx.spaceFlight?.keys) return;
      appCtx.spaceFlight.keys[key] = pressed;
      return;
    }
    if (appCtx.keys) appCtx.keys[key] = pressed;
  }

  function holdVirtualKey(channel, key) {
    const id = `${channel}:${key}`;
    const nextCount = (mobileHeldCounts.get(id) || 0) + 1;
    mobileHeldCounts.set(id, nextCount);
    if (nextCount === 1) setVirtualInputPressed(channel, key, true);
  }

  function releaseVirtualKey(channel, key) {
    const id = `${channel}:${key}`;
    const current = mobileHeldCounts.get(id) || 0;
    if (current <= 1) {
      mobileHeldCounts.delete(id);
      setVirtualInputPressed(channel, key, false);
      return;
    }
    mobileHeldCounts.set(id, current - 1);
  }

  function clearVirtualHeldInputs() {
    for (const id of mobileHeldCounts.keys()) {
      const sep = id.indexOf(':');
      const channel = sep >= 0 ? id.slice(0, sep) : 'earth';
      const key = sep >= 0 ? id.slice(sep + 1) : id;
      setVirtualInputPressed(channel, key, false);
    }
    mobileHeldCounts.clear();
    mobileActivePointers.clear();
    analogPadPointers.clear();
    appCtx.clearMobileTouchInput?.('mobile-controls-cleared');
    [mobileMovePad, mobileLookPad].forEach((pad) => {
      pad?.classList.remove('active');
      const knob = pad?.querySelector('.mobilePadLabel');
      if (knob) knob.style.transform = '';
    });
    mobileHoldButtons.forEach((btn) => {
      btn.classList.remove('active');
      delete btn.dataset.activeCount;
    });
  }

  function bindAnalogPad(pad, kind) {
    if (!pad || typeof PointerEvent === 'undefined') return;
    const update = (event) => {
      const activePointer = analogPadPointers.get(kind);
      if (activePointer?.pointerId !== event.pointerId) return;
      const bounds = pad.getBoundingClientRect();
      const radius = Math.max(32, Math.min(bounds.width, bounds.height) * 0.48);
      const rawX = (event.clientX - activePointer.originX) / radius;
      const rawY = (event.clientY - activePointer.originY) / radius;
      const length = Math.hypot(rawX, rawY) || 1;
      const scale = length > 1 ? 1 / length : 1;
      const x = rawX * scale;
      const y = rawY * scale;
      appCtx.setMobileTouchPad?.(kind, x, y, true, performance.now());
      const knob = pad.querySelector('.mobilePadLabel');
      if (knob) knob.style.transform = `translate(${(x * radius * 0.52).toFixed(1)}px, ${(y * radius * 0.52).toFixed(1)}px)`;
    };
    const start = (event) => {
      if (analogPadPointers.has(kind)) return;
      event.preventDefault();
      event.stopPropagation();
      // Thumb-down is neutral. Landing off-center must not immediately command
      // a turn or sprint before the player deliberately drags.
      analogPadPointers.set(kind, {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY
      });
      try { pad.setPointerCapture?.(event.pointerId); } catch (_) {}
      pad.classList.add('active');
      update(event);
    };
    const move = (event) => {
      if (analogPadPointers.get(kind)?.pointerId !== event.pointerId) return;
      event.preventDefault();
      update(event);
    };
    const end = (event) => {
      if (analogPadPointers.get(kind)?.pointerId !== event.pointerId) return;
      event.preventDefault();
      analogPadPointers.delete(kind);
      appCtx.setMobileTouchPad?.(kind, 0, 0, false, performance.now());
      pad.classList.remove('active');
      const knob = pad.querySelector('.mobilePadLabel');
      if (knob) knob.style.transform = '';
    };
    mobileControlScope.listen(pad, 'pointerdown', start);
    mobileControlScope.listen(pad, 'pointermove', move);
    mobileControlScope.listen(pad, 'pointerup', end);
    mobileControlScope.listen(pad, 'pointercancel', end);
    mobileControlScope.listen(pad, 'lostpointercapture', end);
  }

  function bindPadButton(prefix, direction, binding) {
    const btn = document.getElementById(`${prefix}${direction}`);
    if (!btn) return;
    if (!binding?.key) {
      btn.dataset.key = '';
      btn.dataset.channel = '';
      btn.disabled = true;
      btn.classList.add('hidden');
      return;
    }
    btn.dataset.key = binding.key;
    btn.dataset.channel = binding.channel || 'earth';
    btn.disabled = false;
    btn.classList.remove('hidden');
  }

  function applyPadProfile(prefix, padEl, bindings, labelEl, labelText) {
    if (padEl) padEl.classList.toggle('hidden', !bindings);
    if (labelEl) labelEl.textContent = labelText || '';
    bindPadButton(prefix, 'Up', bindings?.up || null);
    bindPadButton(prefix, 'Down', bindings?.down || null);
    bindPadButton(prefix, 'Left', bindings?.left || null);
    bindPadButton(prefix, 'Right', bindings?.right || null);
  }

  function applyActionProfile(actions) {
    [mobileActionPrimary, mobileActionSecondary].forEach((btn, index) => {
      if (!btn) return;
      const action = Array.isArray(actions) ? actions[index] : null;
      if (!action?.binding?.key) {
        btn.dataset.key = '';
        btn.dataset.channel = '';
        btn.disabled = true;
        btn.classList.add('hidden');
        return;
      }
      btn.textContent = action.label || `Action ${index + 1}`;
      btn.dataset.key = action.binding.key;
      btn.dataset.channel = action.binding.channel || 'earth';
      btn.disabled = false;
      btn.classList.remove('hidden');
    });
  }

  function syncMobileControlSettingsUi() {
    const settings = appCtx.getMobileTouchInputSnapshot?.().settings;
    if (!settings) return;
    if (mobileControlsHandedness) mobileControlsHandedness.value = settings.handedness;
    if (mobileMoveSensitivity) mobileMoveSensitivity.value = String(Math.round(settings.moveSensitivity * 100));
    if (mobileMoveSensitivityValue) mobileMoveSensitivityValue.value = `${Math.round(settings.moveSensitivity * 100)}%`;
    if (mobileLookSensitivity) mobileLookSensitivity.value = String(Math.round(settings.lookSensitivity * 100));
    if (mobileLookSensitivityValue) mobileLookSensitivityValue.value = `${Math.round(settings.lookSensitivity * 100)}%`;
    if (mobileCameraRecenter) mobileCameraRecenter.checked = settings.cameraRecenter !== false;
    if (mobileTouchControls) mobileTouchControls.dataset.handedness = settings.handedness;
  }

  function updateMobileControlGuidance(mode) {
    const guidance = MOBILE_CONTROL_GUIDANCE[mode] || MOBILE_CONTROL_GUIDANCE.driving;
    if (mobileControlModeName) mobileControlModeName.textContent = guidance[0];
    if (mobileControlLeftSummary) mobileControlLeftSummary.textContent = guidance[1];
    if (mobileControlRightSummary) mobileControlRightSummary.textContent = guidance[2];
    if (mobileControlActionSummary) mobileControlActionSummary.textContent = guidance[3];
  }

  function updateMobileSettings(patch) {
    appCtx.updateMobileTouchSettings?.(patch);
    syncMobileControlSettingsUi();
  }

  function bindMobileHoldButton(btn) {
    const beginHold = (token, channel, key) => {
      if (!token || !key || mobileActivePointers.has(token)) return;
      mobileActivePointers.set(token, { channel, key, buttonId: btn.id });
      holdVirtualKey(channel, key);
      const activeCount = (Number(btn.dataset.activeCount) || 0) + 1;
      btn.dataset.activeCount = String(activeCount);
      btn.classList.add('active');
    };

    const endHold = (token) => {
      const held = mobileActivePointers.get(token);
      if (!held) return;
      mobileActivePointers.delete(token);
      releaseVirtualKey(held.channel, held.key);
      const activeCount = Math.max(0, (Number(btn.dataset.activeCount) || 0) - 1);
      if (activeCount > 0) {
        btn.dataset.activeCount = String(activeCount);
      } else {
        delete btn.dataset.activeCount;
        btn.classList.remove('active');
      }
    };

    const onPointerPress = (event) => {
      if (btn.disabled || !btn.dataset.key) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof btn.setPointerCapture === 'function' && Number.isFinite(event.pointerId)) {
        try { btn.setPointerCapture(event.pointerId); } catch (_) {}
      }
      const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 0;
      beginHold(`${btn.id}:p:${pointerId}`, btn.dataset.channel || 'earth', btn.dataset.key);
      if (
        btn === mobileActionPrimary &&
        btn.dataset.key === 'Space' &&
        detectControlsMode() === 'skydiving'
      ) {
        appCtx.handleUrbanEquipmentUse?.();
      }
    };

    const onPointerRelease = (event) => {
      const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 0;
      endHold(`${btn.id}:p:${pointerId}`);
    };

    const onTouchPress = (event) => {
      if (btn.disabled || !btn.dataset.key || !event.changedTouches?.length) return;
      event.preventDefault();
      event.stopPropagation();
      for (let index = 0; index < event.changedTouches.length; index++) {
        const id = event.changedTouches[index]?.identifier;
        if (Number.isFinite(id)) beginHold(`${btn.id}:t:${id}`, btn.dataset.channel || 'earth', btn.dataset.key);
      }
      if (
        btn === mobileActionPrimary &&
        btn.dataset.key === 'Space' &&
        detectControlsMode() === 'skydiving'
      ) {
        appCtx.handleUrbanEquipmentUse?.();
      }
    };

    const onTouchRelease = (event) => {
      if (!event.changedTouches?.length) return;
      event.preventDefault();
      for (let index = 0; index < event.changedTouches.length; index++) {
        const id = event.changedTouches[index]?.identifier;
        if (Number.isFinite(id)) endHold(`${btn.id}:t:${id}`);
      }
    };

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      mobileControlScope.listen(btn, 'pointerdown', onPointerPress);
      mobileControlScope.listen(btn, 'pointerup', onPointerRelease);
      mobileControlScope.listen(btn, 'pointercancel', onPointerRelease);
      mobileControlScope.listen(btn, 'lostpointercapture', onPointerRelease);
    } else {
      mobileControlScope.listen(btn, 'touchstart', onTouchPress, { passive: false });
      mobileControlScope.listen(btn, 'touchend', onTouchRelease, { passive: false });
      mobileControlScope.listen(btn, 'touchcancel', onTouchRelease, { passive: false });
    }
    mobileControlScope.listen(btn, 'contextmenu', (event) => event.preventDefault());
  }

  function detectControlsMode() {
    if (appCtx.activeShipInterior === true && appCtx.Walk?.state?.mode === 'walk') return 'walking';
    if ((typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.OCEAN)) || appCtx.oceanMode?.active) {
      return 'ocean';
    }
    if ((typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) || appCtx.spaceFlight?.active) {
      return 'rocket';
    }
    if (appCtx.boatMode?.active) return 'boat';
    if (appCtx.planeMode?.active) return 'plane';
    if (appCtx.droneMode) return 'drone';
    if (appCtx.Walk?.state?.mode === 'walk') {
      return appCtx.urbanSandboxRuntime?.parachute?.skydiving === true ? 'skydiving' : 'walking';
    }
    return 'driving';
  }

  function updateMobileTouchControls(mode = detectControlsMode()) {
    if (!mobileTouchControls || !isTouchPreferredClient) return;
    updateMobileControlGuidance(mode);
    const titleVisible = !document.getElementById('titleScreen')?.classList.contains('hidden');
    const inSpaceFlight = mode === 'rocket';
    const controlsExpanded = !!(ctrlContent && !ctrlContent.classList.contains('hidden'));
    const blocked = titleVisible || !appCtx.gameStarted || (appCtx.paused && !inSpaceFlight) || (!inSpaceFlight && appCtx.showLargeMap) || (!inSpaceFlight && controlsExpanded);

    if (blocked) {
      mobileTouchControls.classList.remove('show');
      clearVirtualHeldInputs();
      return;
    }

    if (mobileTouchControls.dataset.mode !== mode) {
      clearVirtualHeldInputs();
      mobileTouchControls.dataset.mode = mode;
    }

    mobileTouchControls.classList.remove('mode-driving', 'mode-boat', 'mode-walking', 'mode-skydiving', 'mode-drone', 'mode-plane', 'mode-rocket', 'mode-ocean');
    mobileTouchControls.classList.add(`mode-${mode}`);
    mobileTouchControls.dataset.handedness = appCtx.getMobileTouchInputSnapshot?.().settings?.handedness || 'standard';
    mobileTouchControls.style.zIndex = inSpaceFlight ? '10002' : '106';

    const profile = MOBILE_CONTROL_PROFILES[mode] || MOBILE_CONTROL_PROFILES.driving;
    let actions = profile.actions;
    if (mode === 'skydiving' && appCtx.isUrbanParachuteDeployed?.() === true) {
      actions = [{ label: 'Flare', binding: { channel: 'earth', key: 'Space' } }];
    }
    if (mode === 'driving' && appCtx.car?.vehicleServiceType === 'responder') {
      actions = [
        ...(Array.isArray(profile.actions) ? profile.actions.slice(0, 1) : []),
        { label: appCtx.car?.vehicleServiceLightsActive ? 'Siren off' : 'Siren', binding: { channel: 'earth', key: 'KeyH' } }
      ];
    }
    if (appCtx.activePlanetaryBodyId && (mode === 'walking' || mode === 'driving')) {
      actions = [
        ...(Array.isArray(profile.actions) ? profile.actions.slice(0, 1) : []),
        { label: 'Explore', binding: { channel: 'earth', key: 'KeyE' } }
      ];
    }
    if (appCtx.activeShipInterior === true && mode === 'walking') {
      actions = [
        { label: 'Jump', binding: { channel: 'earth', key: 'Space' } },
        { label: 'Interact', binding: { channel: 'earth', key: 'KeyE' } }
      ];
    }
    if (appCtx.gameMode === 'deflock' && ['driving', 'walking', 'drone', 'boat'].includes(mode)) {
      actions = Array.isArray(profile.actions) ? profile.actions.slice(0, 1) : [];
      actions.push({ label: 'DeFlock', binding: { channel: 'earth', key: 'KeyE' } });
    }
    applyPadProfile('mobileMove', mobileMovePad, profile.move, mobileMoveLabel, profile.moveLabel || 'Move');
    applyPadProfile('mobileLook', mobileLookPad, profile.look, mobileLookLabel, profile.lookLabel || 'Look');
    applyActionProfile(actions);
    const showPackAction = mode === 'walking' && urbanEquipmentToggle && !urbanEquipmentToggle.hidden;
    const equipped = appCtx.playerBackpackInventory?.equipped?.() || null;
    const showEquipmentUse = mode === 'walking' &&
      canUseEquippedItemOnMobile(equipped) &&
      typeof appCtx.handleUrbanEquipmentUse === 'function';
    if (mobileEquipmentUse) {
      mobileEquipmentUse.textContent = equipped?.actionLabel || 'Use';
      mobileEquipmentUse.setAttribute('aria-label', `${equipped?.actionLabel || 'Use'} ${equipped?.label || 'equipped item'}`);
      mobileEquipmentUse.classList.toggle('hidden', !showEquipmentUse);
      mobileEquipmentUse.disabled = !showEquipmentUse;
    }
    urbanEquipmentToggle?.classList.toggle('mobile-mode-hidden', !showPackAction);
    mobileActionStack?.classList.toggle('has-pack-action', !!showPackAction);
    mobileTouchControls.classList.add('show');
  }

  function installMobileUiPointerShield() {
    if (!isTouchPreferredClient) return;
    const shieldTargets = document.querySelectorAll([
      '#floatMenuContainer',
      '#controlsTab',
      '#mainMenuBtn',
      '#memoryFlowerFloatBtn',
      '#flowerActionMenu',
      '#deFlockHud',
      '#deFlockPrompt',
      '#deFlockHelp',
      '#gameShareFloatBtn',
      '#gameShareMenu',
      '#mobileTouchControls',
      '#largeMap',
      '#propertyPanel',
      '#historicPanel',
      '#memoryComposer',
      '#memoryInfoPanel'
    ].join(','));
    const stop = (event) => {
      if (appCtx.gameStarted) event.stopPropagation();
    };
    const events = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend'];
    shieldTargets.forEach((el) => {
      events.forEach((eventName) => mobileControlScope.listen(
        el,
        eventName,
        stop,
        eventName.startsWith('touch') ? { passive: true } : undefined
      ));
    });
  }

  function updateControlsModeUI() {
    const mode = detectControlsMode();
    if (typeof appCtx.syncTravelModeButtons === 'function') appCtx.syncTravelModeButtons();
    if (drivingControls) drivingControls.style.display = mode === 'driving' ? 'block' : 'none';
    if (boatControls) boatControls.style.display = mode === 'boat' ? 'block' : 'none';
    if (walkingControls) walkingControls.style.display = mode === 'walking' || mode === 'skydiving' ? 'block' : 'none';
    if (droneControls) droneControls.style.display = mode === 'drone' ? 'block' : 'none';
    if (planeControls) planeControls.style.display = mode === 'plane' ? 'block' : 'none';
    if (rocketControls) rocketControls.style.display = mode === 'rocket' ? 'block' : 'none';
    if (oceanControls) oceanControls.style.display = mode === 'ocean' ? 'block' : 'none';
    if (controlsTab && ctrlContent) {
      controlsTab.classList.toggle('compact', isTouchPreferredClient && ctrlContent.classList.contains('hidden'));
    }
    if (ctrlHeader) {
      const modeLabel =
        mode === 'boat' ? 'Boat Mode' :
        mode === 'walking' ? 'Walking Mode' :
        mode === 'skydiving' ? 'Skydiving' :
        mode === 'drone' ? 'Drone Mode' :
        mode === 'plane' ? 'Personal Plane' :
        mode === 'rocket' ? 'Rocket Mode' :
        mode === 'ocean' ? 'Submarine Mode' :
        'Driving Mode';
      const arrow = ctrlContent?.classList.contains('hidden') ? '▼' : '▲';
      const controlsOpen = !ctrlContent?.classList.contains('hidden');
      ctrlHeader.textContent = isTouchPreferredClient && controlsOpen
        ? 'Close controls ×'
        : `⚙️ ${modeLabel} ${arrow}`;
      ctrlHeader.setAttribute('aria-expanded', String(controlsOpen));
      const controlsBarBtn = document.getElementById('controlsBarBtn');
      const controlsBarLabel = controlsBarBtn?.querySelector('.btnText');
      if (controlsBarLabel) controlsBarLabel.textContent = `⚙️ ${modeLabel} Controls`;
      controlsBarBtn?.setAttribute('aria-expanded', String(controlsOpen));
      controlsTab?.classList.toggle('bar-open', controlsOpen);
    }
    updateMobileTouchControls(mode);
  }

  if (mobileTouchControls && isTouchPreferredClient) {
    appCtx.setMobileTouchEnabled?.(true);
    bindAnalogPad(mobileMovePad, 'move');
    bindAnalogPad(mobileLookPad, 'look');
    mobileHoldButtons.forEach((btn) => bindMobileHoldButton(btn));
    mobileControlScope.listen(mobileEquipmentUse, 'click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      appCtx.handleUrbanEquipmentUse?.();
    });
    syncMobileControlSettingsUi();
    mobileControlScope.listen(mobileControlsHandedness, 'change', () => updateMobileSettings({ handedness: mobileControlsHandedness.value }));
    mobileControlScope.listen(mobileMoveSensitivity, 'input', () => updateMobileSettings({ moveSensitivity: Number(mobileMoveSensitivity.value) / 100 }));
    mobileControlScope.listen(mobileLookSensitivity, 'input', () => updateMobileSettings({ lookSensitivity: Number(mobileLookSensitivity.value) / 100 }));
    mobileControlScope.listen(mobileCameraRecenter, 'change', () => updateMobileSettings({ cameraRecenter: mobileCameraRecenter.checked }));
    mobileControlScope.listen(mobileControlsReset, 'click', () => updateMobileSettings({ handedness: 'standard', moveSensitivity: 1, lookSensitivity: 0.82, cameraRecenter: true, cameraRecenterDelayMs: 650 }));
    mobileControlScope.listen(window, 'blur', clearVirtualHeldInputs);
    mobileControlScope.listen(document, 'visibilitychange', () => {
      if (document.hidden) clearVirtualHeldInputs();
    });
  } else {
    appCtx.setMobileTouchEnabled?.(false);
    mobileTouchControls?.classList.remove('show');
  }

  installMobileUiPointerShield();
  appCtx.updateControlsModeUI = updateControlsModeUI;
  appCtx.updateMobileTouchControls = updateMobileTouchControls;
  appCtx.isTouchPreferredClient = isTouchPreferredClient;

  const dispose = (reason = 'mobile-controls-disposed') => {
    clearVirtualHeldInputs();
    appCtx.setMobileTouchEnabled?.(false);
    mobileTouchControls?.classList.remove('show');
    return mobileControlScope.dispose(reason);
  };
  appCtx.disposeMobileControls = dispose;

  return {
    controlsTab,
    ctrlHeader,
    ctrlContent,
    isTouchPreferredClient,
    clearVirtualHeldInputs,
    dispose,
    lifecycleSnapshot: () => mobileControlScope.snapshot(),
    updateControlsModeUI
  };
}

export { initMobileControls };
