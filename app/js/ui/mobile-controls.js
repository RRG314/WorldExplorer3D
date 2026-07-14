import { ctx as appCtx } from "../shared-context.js?v=55";

const MOBILE_CONTROL_PROFILES = {
  driving: {
    moveLabel: 'Drive',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    look: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    actions: [{ label: 'Brake', binding: { channel: 'earth', key: 'Space' } }]
  },
  boat: {
    moveLabel: 'Throttle',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    look: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    actions: [{ label: 'Brake', binding: { channel: 'earth', key: 'Space' } }]
  },
  walking: {
    moveLabel: 'Move',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    look: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    actions: [
      { label: 'Jump', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Run', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  },
  drone: {
    moveLabel: 'Move',
    lookLabel: 'Look',
    move: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    look: {
      up: { channel: 'earth', key: 'ArrowUp' },
      down: { channel: 'earth', key: 'ArrowDown' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    actions: [
      { label: 'Ascend', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Descend', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  },
  rocket: {
    moveLabel: 'Move',
    lookLabel: 'Steer',
    move: null,
    look: {
      up: { channel: 'space', key: 'arrowup' },
      down: { channel: 'space', key: 'arrowdown' },
      left: { channel: 'space', key: 'arrowleft' },
      right: { channel: 'space', key: 'arrowright' }
    },
    actions: [
      { label: 'Accelerate', binding: { channel: 'space', key: ' ' } },
      { label: 'Decelerate', binding: { channel: 'space', key: 'shift' } }
    ]
  },
  ocean: {
    moveLabel: 'Sub Move',
    lookLabel: 'Depth',
    move: {
      up: { channel: 'earth', key: 'KeyW' },
      down: { channel: 'earth', key: 'KeyS' },
      left: { channel: 'earth', key: 'KeyA' },
      right: { channel: 'earth', key: 'KeyD' }
    },
    look: {
      up: { channel: 'earth', key: 'Space' },
      down: { channel: 'earth', key: 'ShiftLeft' },
      left: { channel: 'earth', key: 'ArrowLeft' },
      right: { channel: 'earth', key: 'ArrowRight' }
    },
    actions: [
      { label: 'Ascend', binding: { channel: 'earth', key: 'Space' } },
      { label: 'Descend', binding: { channel: 'earth', key: 'ShiftLeft' } }
    ]
  }
};

function initMobileControls() {
  const controlsTab = document.getElementById('controlsTab');
  const ctrlHeader = document.getElementById('ctrlHeader');
  const ctrlContent = document.getElementById('ctrlContent');
  const drivingControls = document.getElementById('drivingControls');
  const boatControls = document.getElementById('boatControls');
  const walkingControls = document.getElementById('walkingControls');
  const droneControls = document.getElementById('droneControls');
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
  const mobileHeldCounts = new Map();
  const mobileActivePointers = new Map();

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
    mobileHoldButtons.forEach((btn) => {
      btn.classList.remove('active');
      delete btn.dataset.activeCount;
    });
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
      btn.addEventListener('pointerdown', onPointerPress);
      btn.addEventListener('pointerup', onPointerRelease);
      btn.addEventListener('pointercancel', onPointerRelease);
      btn.addEventListener('lostpointercapture', onPointerRelease);
    } else {
      btn.addEventListener('touchstart', onTouchPress, { passive: false });
      btn.addEventListener('touchend', onTouchRelease, { passive: false });
      btn.addEventListener('touchcancel', onTouchRelease, { passive: false });
    }
    btn.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  function detectControlsMode() {
    if ((typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.OCEAN)) || appCtx.oceanMode?.active) {
      return 'ocean';
    }
    if ((typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) || appCtx.spaceFlight?.active) {
      return 'rocket';
    }
    if (appCtx.boatMode?.active) return 'boat';
    if (appCtx.droneMode) return 'drone';
    if (appCtx.Walk?.state?.mode === 'walk') return 'walking';
    return 'driving';
  }

  function updateMobileTouchControls(mode = detectControlsMode()) {
    if (!mobileTouchControls || !isTouchPreferredClient) return;
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

    mobileTouchControls.classList.remove('mode-driving', 'mode-boat', 'mode-walking', 'mode-drone', 'mode-rocket', 'mode-ocean');
    mobileTouchControls.classList.add(`mode-${mode}`);
    mobileTouchControls.style.zIndex = inSpaceFlight ? '10002' : '106';

    const profile = MOBILE_CONTROL_PROFILES[mode] || MOBILE_CONTROL_PROFILES.driving;
    applyPadProfile('mobileMove', mobileMovePad, profile.move, mobileMoveLabel, profile.moveLabel || 'Move');
    applyPadProfile('mobileLook', mobileLookPad, profile.look, mobileLookLabel, profile.lookLabel || 'Look');
    applyActionProfile(profile.actions);
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
      events.forEach((eventName) => el.addEventListener(eventName, stop, eventName.startsWith('touch') ? { passive: true } : undefined));
    });
  }

  function updateControlsModeUI() {
    const mode = detectControlsMode();
    if (typeof appCtx.syncTravelModeButtons === 'function') appCtx.syncTravelModeButtons();
    if (drivingControls) drivingControls.style.display = mode === 'driving' ? 'block' : 'none';
    if (boatControls) boatControls.style.display = mode === 'boat' ? 'block' : 'none';
    if (walkingControls) walkingControls.style.display = mode === 'walking' ? 'block' : 'none';
    if (droneControls) droneControls.style.display = mode === 'drone' ? 'block' : 'none';
    if (rocketControls) rocketControls.style.display = mode === 'rocket' ? 'block' : 'none';
    if (oceanControls) oceanControls.style.display = mode === 'ocean' ? 'block' : 'none';
    oceanModeMenuItem?.classList.toggle('on', mode === 'ocean');
    earthModeMenuItem?.classList.toggle('on', mode !== 'ocean');
    if (oceanModeMenuItem) {
      oceanModeMenuItem.textContent =
        mode === 'boat' ? '🌊 Dive Underwater' :
        mode === 'ocean' ? '🌊 Submarine Mode' :
        '🌊 Ocean Mode';
    }
    if (earthModeMenuItem) {
      earthModeMenuItem.textContent = mode === 'ocean' ? '🌍 Return to Earth' : '🌍 Earth Mode';
    }
    if (controlsTab && ctrlContent) {
      controlsTab.classList.toggle('compact', isTouchPreferredClient && ctrlContent.classList.contains('hidden'));
    }
    if (ctrlHeader) {
      const modeLabel =
        mode === 'boat' ? 'Boat Mode' :
        mode === 'walking' ? 'Walking Mode' :
        mode === 'drone' ? 'Drone Mode' :
        mode === 'rocket' ? 'Rocket Mode' :
        mode === 'ocean' ? 'Submarine Mode' :
        'Driving Mode';
      const arrow = ctrlContent?.classList.contains('hidden') ? '▼' : '▲';
      ctrlHeader.textContent = `⚙️ ${modeLabel} ${arrow}`;
    }
    updateMobileTouchControls(mode);
  }

  if (mobileTouchControls && isTouchPreferredClient) {
    mobileHoldButtons.forEach((btn) => bindMobileHoldButton(btn));
    window.addEventListener('blur', clearVirtualHeldInputs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearVirtualHeldInputs();
    });
    setInterval(() => updateMobileTouchControls(), 220);
  } else {
    mobileTouchControls?.classList.remove('show');
  }

  installMobileUiPointerShield();
  appCtx.updateControlsModeUI = updateControlsModeUI;
  appCtx.updateMobileTouchControls = updateMobileTouchControls;

  return {
    controlsTab,
    ctrlHeader,
    ctrlContent,
    isTouchPreferredClient,
    clearVirtualHeldInputs,
    updateControlsModeUI
  };
}

export { initMobileControls };
