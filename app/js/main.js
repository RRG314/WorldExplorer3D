import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// main.js - Main game loop, render loop, loading helpers
// ============================================================================

let _hudTimer = 0;
let _mapTimer = 0;
let _largeMapTimer = 0;
let _lodTimer = 0;
let _perfPanelTimer = 0;
let _weatherTimer = 0;
let _boatTimer = 0;
let _liveEarthTimer = 0;
let _liveEarthFrameTimer = 0;
let _interactiveStreamingKickTimer = 0;
let _skyRefreshTimer = 0;
let _activityCreatorTimer = 0;
let _activityDiscoveryTimer = 0;
let _firstControllableMilestoneRecorded = false;
let _simulationAccumulator = 0;
let _simulationInterpolationAlpha = 0;
let _lastMinimapDrawState = null;
let _lastLargeMapDrawState = null;
const OVERLAY_EDGE_MARGIN = 6;
const OVERLAY_ANCHOR_GAP = 10;
const FIXED_SIMULATION_STEP = 1 / 60;
const MAX_SIMULATION_SUBSTEPS = 8;
const DEFAULT_LOADING_BG = 'loading-bg.jpg';
const TRANSITION_LOADING = {
  space: { background: 'space-transition.png', text: 'Preparing Space Flight...' },
  moon: { background: 'moon-transition.png', text: 'Approaching The Moon...' },
  ocean: { background: 'loading-bg.jpg', text: 'Diving Into Ocean Mode...' }
};
const LOADING_BG_BY_MODE = {
  earth: DEFAULT_LOADING_BG,
  moon: 'moon-transition.png',
  space: 'space-transition.png',
  ocean: DEFAULT_LOADING_BG
};

function _isVisibleRect(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return null;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  return rect;
}

function _isEditorWorkspaceOpen() {
  return !!document.body?.classList.contains('editor-workspace-open');
}

function _isActivityCreatorOpen() {
  return !!document.body?.classList.contains('activity-creator-open');
}

function _positionOverlayBetween(overlay, leftRect, rightRect) {
  if (!overlay || !leftRect || !rightRect) return;
  const overlayRect = overlay.getBoundingClientRect();
  if (!(overlayRect.width > 0)) return;

  const minLeft = Math.max(OVERLAY_EDGE_MARGIN, leftRect.right + OVERLAY_ANCHOR_GAP);
  const maxLeft = Math.min(
    window.innerWidth - OVERLAY_EDGE_MARGIN - overlayRect.width,
    rightRect.left - OVERLAY_ANCHOR_GAP - overlayRect.width
  );
  if (maxLeft < minLeft) return;

  const desiredLeft = (leftRect.right + rightRect.left) * 0.5 - overlayRect.width * 0.5;
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
  overlay.style.left = `${Math.round(clampedLeft)}px`;
  overlay.style.right = 'auto';
}

function positionTopOverlays() {
  if (!appCtx.gameStarted || _isEditorWorkspaceOpen() || _isActivityCreatorOpen()) return;
  const hudRect = _isVisibleRect(document.getElementById('hud'));
  const menuRect = _isVisibleRect(document.getElementById('mainMenuBtn'));
  if (!hudRect || !menuRect) return;

  // Mode HUD was removed; use a virtual center anchor between HUD and menu.
  const centerX = Math.round((hudRect.right + menuRect.left) * 0.5);
  const centerRect = {
    left: centerX,
    right: centerX,
    top: Math.max(hudRect.top, OVERLAY_EDGE_MARGIN),
    bottom: Math.max(hudRect.top, OVERLAY_EDGE_MARGIN) + 1,
    width: 1,
    height: 1
  };

  const debugOverlay = document.getElementById('debugOverlay');
  if (debugOverlay && debugOverlay.style.display !== 'none') {
    _positionOverlayBetween(debugOverlay, hudRect, centerRect);
  }

  const perfPanel = document.getElementById('perfPanel');
  if (perfPanel && perfPanel.style.display !== 'none') {
    _positionOverlayBetween(perfPanel, centerRect, menuRect);
  }
}

function shouldUseComposer() {
  if (!appCtx.composer) return false;
  const quality = String(appCtx.renderQualityLevel || '').toLowerCase();
  if (quality !== 'low') return true;
  return !!(appCtx.ssaoPass?.enabled || appCtx.bloomPass?.enabled || appCtx.smaaPass?.enabled);
}

function getActiveMovementState() {
  if (appCtx.oceanMode?.active) {
    return { mode: 'ocean', speed: Math.abs(Number(appCtx.getOceanModeDebugState?.()?.speed || 0)) };
  }
  if (appCtx.boatMode?.active) {
    return { mode: 'boat', speed: Math.abs(Number(appCtx.boat?.speed || 0)) };
  }
  if (appCtx.droneMode) {
    return { mode: 'drone', speed: Math.abs(Number(appCtx.drone?.speed || 0)) };
  }
  if (appCtx.Walk?.state?.mode === 'walk') {
    return { mode: 'walk', speed: Math.abs(Number(appCtx.Walk.state.walker?.speedMph || 0)) };
  }
  return { mode: 'drive', speed: Math.abs(Number(appCtx.car?.speed || 0)) };
}

function movementCountsAsIdle(movementState = null) {
  const state = movementState || getActiveMovementState();
  const mode = String(state?.mode || 'drive');
  const speed = Math.abs(Number(state?.speed || 0));
  if (mode === 'walk') return speed < 0.35;
  if (mode === 'drone') return speed < 1.5;
  if (mode === 'boat' || mode === 'ocean') return speed < 1.5;
  return speed < 1.2;
}

function getSimulationStepBudget() {
  const liveFrameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
  const activeMovement = getActiveMovementState();
  const mode = String(activeMovement?.mode || 'drive');
  const speed = Math.abs(Number(activeMovement?.speed || 0));
  const motionCritical = mode === 'drive' || mode === 'drone' || mode === 'boat' || mode === 'ocean';
  const moving = !movementCountsAsIdle(activeMovement);
  const fastMoving =
    mode === 'walk' ? speed >= 3 :
    mode === 'drone' ? speed >= 10 :
    mode === 'boat' || mode === 'ocean' ? speed >= 8 :
    speed >= 10;
  if (!moving) {
    if (liveFrameMs >= 55) {
      return {
        maxSubsteps: 3,
        maxAccumulator: FIXED_SIMULATION_STEP * 3,
        preserveAccumulatorSteps: 1,
        mode: 'fixed_step_idle_recovery'
      };
    }
    return {
      maxSubsteps: 2,
      maxAccumulator: FIXED_SIMULATION_STEP * 2,
      preserveAccumulatorSteps: 0.75,
      mode: 'fixed_step_idle'
    };
  }

  if (liveFrameMs >= 55) {
    return {
      maxSubsteps: MAX_SIMULATION_SUBSTEPS,
      maxAccumulator: FIXED_SIMULATION_STEP * MAX_SIMULATION_SUBSTEPS,
      preserveAccumulatorSteps:
        fastMoving ?
          motionCritical ? 6 : 4 :
        motionCritical ?
          4 :
          3,
      mode: fastMoving ? 'fixed_step_motion_fast_recovery' : 'fixed_step_motion_recovery'
    };
  }

  return {
    maxSubsteps: MAX_SIMULATION_SUBSTEPS,
    maxAccumulator: FIXED_SIMULATION_STEP * MAX_SIMULATION_SUBSTEPS,
    preserveAccumulatorSteps:
      fastMoving ?
        motionCritical ? 4 : 3 :
      motionCritical ?
        3 :
        2,
    mode: fastMoving ? 'fixed_step_motion_fast' : 'fixed_step_motion'
  };
}

function stepGameplaySimulation(frameDt) {
  const safeDt = Math.max(0, Number(frameDt) || 0);
  if (appCtx.worldLoading) {
    const startedAt = performance.now();
    appCtx.update(Math.min(safeDt, 1 / 30));
    _simulationAccumulator = 0;
    _simulationInterpolationAlpha = 0;
    if (typeof appCtx.recordPerfRuntimeSection === 'function') {
      appCtx.recordPerfRuntimeSection('update', performance.now() - startedAt);
    }
    if (typeof appCtx.setPerfLiveStat === 'function') {
      appCtx.setPerfLiveStat('simulation', {
        fixedStepHz: Math.round(1 / FIXED_SIMULATION_STEP),
        steps: 1,
        alpha: 0,
        accumulatorMs: 0,
        mode: 'loading_passthrough'
      });
    }
    return;
  }

  const simulationBudget = getSimulationStepBudget();
  _simulationAccumulator = Math.min(
    simulationBudget.maxAccumulator,
    Math.max(0, _simulationAccumulator + safeDt)
  );

  let steps = 0;
  const startedAt = performance.now();
  while (_simulationAccumulator >= FIXED_SIMULATION_STEP && steps < simulationBudget.maxSubsteps) {
    appCtx.update(FIXED_SIMULATION_STEP);
    _simulationAccumulator -= FIXED_SIMULATION_STEP;
    steps += 1;
  }

  let droppedAccumulatorMs = 0;
  if (_simulationAccumulator >= FIXED_SIMULATION_STEP) {
    const preserveAccumulatorMs = FIXED_SIMULATION_STEP * Math.max(0.5, Number(simulationBudget.preserveAccumulatorSteps || 0.5));
    if (_simulationAccumulator > preserveAccumulatorMs) {
      droppedAccumulatorMs = Math.round((_simulationAccumulator - preserveAccumulatorMs) * 1000);
    }
    _simulationAccumulator = Math.min(_simulationAccumulator, preserveAccumulatorMs);
  }

  _simulationInterpolationAlpha =
    FIXED_SIMULATION_STEP > 0 ?
      Math.max(0, Math.min(1, _simulationAccumulator / FIXED_SIMULATION_STEP)) :
      0;

  if (typeof appCtx.recordPerfRuntimeSection === 'function') {
    appCtx.recordPerfRuntimeSection('update', performance.now() - startedAt);
  }
  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('simulation', {
      fixedStepHz: Math.round(1 / FIXED_SIMULATION_STEP),
      steps,
      alpha: Number(_simulationInterpolationAlpha.toFixed(3)),
      accumulatorMs: Math.round(_simulationAccumulator * 1000),
      droppedAccumulatorMs,
      mode: simulationBudget.mode
    });
  }
}

function normalizeAngleDelta(a, b) {
  const delta = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(delta);
}

function getMapRenderReferenceState() {
  if (appCtx.boatMode?.active && appCtx.boat) {
    return {
      x: Number(appCtx.boat.x || 0),
      z: Number(appCtx.boat.z || 0),
      yaw: Number(appCtx.boat.angle || 0)
    };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) {
    return {
      x: Number(appCtx.Walk.state.walker.x || 0),
      z: Number(appCtx.Walk.state.walker.z || 0),
      yaw: Number(appCtx.Walk.state.walker.angle || appCtx.Walk.state.walker.yaw || 0)
    };
  }
  if (appCtx.droneMode && appCtx.drone) {
    return {
      x: Number(appCtx.drone.x || 0),
      z: Number(appCtx.drone.z || 0),
      yaw: Number(appCtx.drone.yaw || 0)
    };
  }
  return {
    x: Number(appCtx.car?.x || 0),
    z: Number(appCtx.car?.z || 0),
    yaw: Number(appCtx.car?.angle || 0)
  };
}

function shouldRedrawMap(lastState, nextState, options = {}) {
  if (!nextState) return true;
  if (!lastState) return true;
  const now = Number(options.now || performance.now());
  const forceMs = Math.max(0, Number(options.forceMs || 0));
  if (forceMs > 0 && (now - Number(lastState.at || 0)) >= forceMs) return true;
  if (options.force === true) return true;
  const moveThreshold = Math.max(0, Number(options.moveThreshold || 0));
  const yawThreshold = Math.max(0, Number(options.yawThreshold || 0));
  const moved = Math.hypot(
    Number(nextState.x || 0) - Number(lastState.x || 0),
    Number(nextState.z || 0) - Number(lastState.z || 0)
  );
  if (moved >= moveThreshold) return true;
  return normalizeAngleDelta(Number(nextState.yaw || 0), Number(lastState.yaw || 0)) >= yawThreshold;
}

function renderLoop(t = 0) {
  requestAnimationFrame(renderLoop);

  // Skip main rendering entirely during destination modes with dedicated renderers.
  if (
    appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT) ||
    appCtx.spaceFlight && appCtx.spaceFlight.active ||
    appCtx.oceanMode && appCtx.oceanMode.active
  ) {
    appCtx.lastTime = t;
    return;
  }

  const dt = Math.min((t - appCtx.lastTime) / 1000, 0.1);
  appCtx.lastTime = t;
  if (typeof appCtx.recordPerfFrame === 'function') appCtx.recordPerfFrame(dt);
  if (typeof appCtx.tutorialUpdate === 'function') appCtx.tutorialUpdate(dt);
  if (appCtx.renderer?.info?.autoReset === false && typeof appCtx.renderer.info.reset === 'function') {
    appCtx.renderer.info.reset();
  }

  if (appCtx.gameStarted) {
    if (!_firstControllableMilestoneRecorded && !appCtx.worldLoading) {
      _firstControllableMilestoneRecorded = true;
      if (typeof appCtx.markPerfMilestone === 'function') {
        appCtx.markPerfMilestone('runtime:first_controllable_world', {
          env: typeof appCtx.getEnv === 'function' ? appCtx.getEnv() : null
        });
      }
    }
    if (typeof appCtx.kickOptionalRuntimeBoot === 'function') {
      appCtx.kickOptionalRuntimeBoot('main_loop');
    }
    if (typeof appCtx.kickDeferredFeatureBoot === 'function') {
      appCtx.kickDeferredFeatureBoot('main_loop');
    }
    stepGameplaySimulation(dt);
    if (typeof appCtx.applyInterpolatedVehicleRenderState === 'function') {
      const startedAt = performance.now();
      appCtx.applyInterpolatedVehicleRenderState(_simulationInterpolationAlpha);
      if (typeof appCtx.recordPerfRuntimeSection === 'function') {
        appCtx.recordPerfRuntimeSection('vehicleInterpolation', performance.now() - startedAt);
      }
    }
    const movementState = getActiveMovementState();
    const interactiveStreamState =
      typeof appCtx.getContinuousWorldInteractiveStreamSnapshot === 'function' ?
        appCtx.getContinuousWorldInteractiveStreamSnapshot() :
        null;
    const activeStreaming =
      !!interactiveStreamState?.pending ||
      ((Date.now() - Number(interactiveStreamState?.lastLoadAt || 0)) < 1600);
    const moving =
      movementState.mode === 'walk' ?
        movementState.speed >= 0.5 :
        movementState.speed >= 0.2;
    const perfTier = String(appCtx.getPerfAutoQualityTier?.() || appCtx.perfAutoQualityTier || 'balanced');
    const performanceTier = perfTier === 'performance';
    if (typeof appCtx.updateContinuousWorldRuntime === 'function') {
      const startedAt = performance.now();
      appCtx.updateContinuousWorldRuntime(dt);
      if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('continuousWorldRuntime', performance.now() - startedAt);
    }
    if (typeof appCtx.kickContinuousWorldInteractiveStreaming === 'function') {
      _interactiveStreamingKickTimer += dt;
      const settledIdleStreaming =
        !activeStreaming &&
        movementCountsAsIdle(movementState) &&
        Number(interactiveStreamState?.totalLoads || 0) > 0;
      const streamKickInterval =
        appCtx.worldLoading ? 0.05 :
        activeStreaming ? (performanceTier ? 0.09 : 0.07) :
        settledIdleStreaming ? (performanceTier ? 0.42 : 0.28) :
        moving ? (performanceTier ? 0.12 : 0.09) :
        0.14;
      if (_interactiveStreamingKickTimer >= streamKickInterval) {
        _interactiveStreamingKickTimer = 0;
        const startedAt = performance.now();
        appCtx.kickContinuousWorldInteractiveStreaming('main_loop');
        if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('interactiveStreamingKick', performance.now() - startedAt);
      }
    }
    _skyRefreshTimer += dt;
    const skyRefreshInterval =
      moving ? (performanceTier ? 0.5 : 0.35) :
      performanceTier ? 0.9 :
      0.6;
    if (_skyRefreshTimer >= skyRefreshInterval) {
      _skyRefreshTimer = 0;
      if (typeof appCtx.refreshAstronomicalSky === 'function') {
        appCtx.refreshAstronomicalSky(false);
      }
    }
    _weatherTimer += dt;
    if (_weatherTimer > 5) {
      _weatherTimer = 0;
      if (typeof appCtx.refreshLiveWeather === 'function') {
        void appCtx.refreshLiveWeather(false);
      }
    }
    _boatTimer += dt;
    const boatRefreshEligible =
      !appCtx.boatMode?.active &&
      !appCtx.droneMode &&
      !appCtx.activeInterior &&
      !appCtx.onMoon &&
      !appCtx.travelingToMoon &&
      !appCtx.spaceFlight?.active &&
      typeof appCtx.isEnv === 'function' &&
      appCtx.isEnv(appCtx.ENV.EARTH);
    const boatRefreshInterval = boatRefreshEligible ? 0.45 : Number.POSITIVE_INFINITY;
    if (Number.isFinite(boatRefreshInterval) && _boatTimer > boatRefreshInterval) {
      _boatTimer = 0;
      if (typeof appCtx.refreshBoatAvailability === 'function') {
        appCtx.refreshBoatAvailability(false);
      }
    }
    {
      const startedAt = performance.now();
      appCtx.updateCamera();
      if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('camera', performance.now() - startedAt);
    }
    _activityCreatorTimer += dt;
    const creatorOpen = !!document.body?.classList.contains('activity-creator-open');
    const creatorInterval = creatorOpen ? 0.08 : 0.3;
    if (_activityCreatorTimer >= creatorInterval && typeof appCtx.updateActivityCreator === 'function') {
      _activityCreatorTimer = 0;
      const startedAt = performance.now();
      appCtx.updateActivityCreator(dt, t);
      if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('activityCreator', performance.now() - startedAt);
    }
    _activityDiscoveryTimer += dt;
    const discoverySnapshot =
      typeof appCtx.getActivityDiscoverySnapshot === 'function' ?
        appCtx.getActivityDiscoverySnapshot() :
        null;
    const discoveryActive = !!(discoverySnapshot?.active);
    const discoveryInterval =
      discoveryActive ? 0.1 :
      moving ? 0.28 :
      0.45;
    if (_activityDiscoveryTimer >= discoveryInterval && typeof appCtx.updateActivityDiscovery === 'function') {
      _activityDiscoveryTimer = 0;
      const startedAt = performance.now();
      appCtx.updateActivityDiscovery(dt, t);
      if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('activityDiscovery', performance.now() - startedAt);
    }
    _liveEarthFrameTimer += dt;
    const liveEarthFrameInterval =
      appCtx.liveEarth?.getPanelMode?.() === 'live-earth' ? 0 : 0.2;
    if (_liveEarthFrameTimer > liveEarthFrameInterval) {
      _liveEarthFrameTimer = 0;
      if (appCtx.liveEarth && typeof appCtx.liveEarth.updateFrame === 'function') {
        const startedAt = performance.now();
        appCtx.liveEarth.updateFrame(dt);
        if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('liveEarthFrame', performance.now() - startedAt);
      }
    }

    _liveEarthTimer += dt;
    if (_liveEarthTimer > 4) {
      _liveEarthTimer = 0;
      if (appCtx.liveEarth && typeof appCtx.liveEarth.updateSelectorFrame === 'function') {
        appCtx.liveEarth.updateSelectorFrame();
      }
    }

    const frameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
    const mapRuntimeAvgMs = Number(appCtx.perfStats?.live?.runtimeSections?.map?.avgMs) || 0;
    const heavyMapPressure =
      frameMs > (performanceTier ? 34 : 42) ||
      mapRuntimeAvgMs > (performanceTier ? 8 : 12);
    const moderateMapPressure =
      frameMs > (performanceTier ? 22 : 28) ||
      mapRuntimeAvgMs > (performanceTier ? 5 : 7);

    // Throttle HUD DOM writes more aggressively under performance pressure.
    const hudInterval =
      heavyMapPressure ? 0.1 :
      performanceTier && moving ? 0.085 :
      0.066;
    _hudTimer += dt;
    if (_hudTimer > hudInterval) {
      _hudTimer = 0;
      if (!_isEditorWorkspaceOpen() && !_isActivityCreatorOpen()) {
        const startedAt = performance.now();
        appCtx.updateHUD();
        positionTopOverlays();
        if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('hud', performance.now() - startedAt);
      }
    }

    const minimapPerfMode =
      !appCtx.showLargeMap && (activeStreaming || moving || moderateMapPressure || performanceTier) ?
        'reduced' :
        'full';
    appCtx.minimapPerfMode = minimapPerfMode;
    const idleMapState = movementCountsAsIdle(movementState) && !activeStreaming;
    const minimapInterval =
      heavyMapPressure ? 0.7 :
      idleMapState ? (performanceTier ? 0.95 : 0.55) :
      performanceTier && (activeStreaming || moving) ? 0.55 :
      moderateMapPressure ? 0.38 :
      activeStreaming ? 0.34 :
      moving ? 0.3 :
      0.1;
    const largeMapInterval =
      heavyMapPressure ? 0.95 :
      idleMapState ? (performanceTier ? 0.9 : 0.55) :
      performanceTier ? 0.6 :
      moderateMapPressure ? 0.35 :
      0.18;
    const mapState = getMapRenderReferenceState();
    const mapNow = performance.now();
    const canRedrawMaps = _firstControllableMilestoneRecorded && !appCtx.worldLoading;

    // Throttle minimap/large-map more aggressively while moving or under frame pressure.
    _mapTimer += dt;
    _largeMapTimer += dt;
    if (canRedrawMaps && _mapTimer > minimapInterval) {
      _mapTimer = 0;
      if (!_isEditorWorkspaceOpen() && !_isActivityCreatorOpen()) {
        const shouldDrawMinimap = shouldRedrawMap(_lastMinimapDrawState, mapState, {
          now: mapNow,
          force: false,
          forceMs:
            heavyMapPressure ? 1800 :
            idleMapState ? (performanceTier ? 3200 : 1800) :
            performanceTier ? 1400 :
            1200,
          moveThreshold:
            idleMapState ? (performanceTier ? 12 : 8.5) :
            performanceTier ? (moving ? 4.5 : 8.5) :
            (moving ? 4.5 : 5.5),
          yawThreshold:
            idleMapState ? (performanceTier ? 0.24 : 0.18) :
            performanceTier ? 0.14 :
            0.1
        });
        if (shouldDrawMinimap) {
          const startedAt = performance.now();
          appCtx.drawMinimap();
          _lastMinimapDrawState = { ...mapState, at: mapNow };
          if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('map', performance.now() - startedAt);
        }
      }
    }
    if (canRedrawMaps && _largeMapTimer > largeMapInterval) {
      _largeMapTimer = 0;
      if (appCtx.showLargeMap && !_isEditorWorkspaceOpen() && !_isActivityCreatorOpen()) {
        const shouldDrawLargeMap = shouldRedrawMap(_lastLargeMapDrawState, mapState, {
          now: mapNow,
          force: false,
          forceMs:
            heavyMapPressure ? 1100 :
            idleMapState ? (performanceTier ? 1800 : 1200) :
            performanceTier ? 900 :
            450,
          moveThreshold:
            idleMapState ? (performanceTier ? 6 : 3.25) :
            performanceTier ? 3.5 :
            1.75,
          yawThreshold:
            idleMapState ? (performanceTier ? 0.12 : 0.08) :
            performanceTier ? 0.08 :
            0.05
        });
        if (shouldDrawLargeMap) {
          const startedAt = performance.now();
          appCtx.drawLargeMap();
          _lastLargeMapDrawState = { ...mapState, at: mapNow };
          if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('mapLarge', performance.now() - startedAt);
        }
      }
    }

    // LOD visibility updates run at low frequency to avoid per-frame overhead.
    const lodInterval =
      appCtx.worldLoading ? 0.06 :
      activeStreaming ? 0.08 :
      moving ? 0.1 :
      0.2;
    _lodTimer += dt;
    if (_lodTimer > lodInterval) {
      _lodTimer = 0;
      if (typeof appCtx.updateWorldLod === 'function') {
        const startedAt = performance.now();
        appCtx.updateWorldLod(false);
        if (typeof appCtx.recordPerfRuntimeSection === 'function') appCtx.recordPerfRuntimeSection('worldLod', performance.now() - startedAt);
      }
    }
  }

  // Animate Apollo 11 beacon pulse (only on moon, throttled)
  if (window.apollo11Beacon && appCtx.isEnv(appCtx.ENV.MOON) && _hudTimer === 0) {
    const pulseTime = t / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 2);

    const beam = window.apollo11Beacon.children[0];
    const glow = window.apollo11Beacon.children[1];

    if (beam && beam.material) {
      beam.material.opacity = 0.3 + pulse * 0.2;
    }
    if (glow && glow.material) {
      glow.material.opacity = 0.6 + pulse * 0.3;
    }
  }

  // Debug overlay update (throttled to HUD rate)
  if (window._debugMode && appCtx.gameStarted && _hudTimer === 0) {
    const overlay = document.getElementById('debugOverlay');
    if (overlay) {
      let modeLabel = 'drive';
      let refX = Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0;
      let refZ = Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0;
      let refY = Number.isFinite(appCtx.car?.y) ? appCtx.car.y : null;
      let onRoadValue = !!appCtx.car?.onRoad;
      let roadName = appCtx.car?.road?.name || '-';

      if (appCtx.droneMode) {
        modeLabel = 'drone';
        refX = Number.isFinite(appCtx.drone?.x) ? appCtx.drone.x : refX;
        refZ = Number.isFinite(appCtx.drone?.z) ? appCtx.drone.z : refZ;
        refY = Number.isFinite(appCtx.drone?.y) ? appCtx.drone.y : refY;
      } else if (appCtx.boatMode?.active) {
        modeLabel = 'boat';
        refX = Number.isFinite(appCtx.boat?.x) ? appCtx.boat.x : refX;
        refZ = Number.isFinite(appCtx.boat?.z) ? appCtx.boat.z : refZ;
        refY = Number.isFinite(appCtx.boat?.y) ? appCtx.boat.y : refY;
      } else if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker) {
        modeLabel = 'walk';
        refX = Number.isFinite(appCtx.Walk.state.walker.x) ? appCtx.Walk.state.walker.x : refX;
        refZ = Number.isFinite(appCtx.Walk.state.walker.z) ? appCtx.Walk.state.walker.z : refZ;
        refY = Number.isFinite(appCtx.Walk.state.walker.y) ? appCtx.Walk.state.walker.y : refY;
      }

      const nearestSurface = modeLabel === 'drive' || modeLabel === 'boat' ?
        appCtx.findNearestRoad(refX, refZ) :
        typeof appCtx.findNearestTraversalFeature === 'function' ?
          appCtx.findNearestTraversalFeature(refX, refZ, { mode: 'walk', maxDistance: 24 }) :
          appCtx.findNearestRoad(refX, refZ);
      const roadDist = Number.isFinite(nearestSurface?.dist) ? nearestSurface.dist : null;
      if (modeLabel !== 'drive' && modeLabel !== 'boat') {
        const feature = nearestSurface?.feature || nearestSurface?.road || null;
        roadName = typeof appCtx.surfaceDisplayName === 'function' ? appCtx.surfaceDisplayName(feature) : feature?.name || roadName;
        const halfWidth = feature?.width ? feature.width * 0.5 : 5;
        onRoadValue = Number.isFinite(roadDist) ? roadDist <= halfWidth + 3 : false;
      }

      const onRd = onRoadValue ? 'YES' : 'no';
      const tY = appCtx.elevationWorldYAtWorldXZ(refX, refZ).toFixed(2);
      const refYVal = Number.isFinite(refY) ? refY.toFixed(2) : '?';
      const rdist = Number.isFinite(roadDist) ? roadDist.toFixed(1) : '?';
      const speed = modeLabel === 'drone' ?
      Math.round(Math.abs((appCtx.drone?.speed || 0) * 1.8)) :
      modeLabel === 'boat' ?
      Math.round(Math.abs((appCtx.boat?.speed || 0) * 0.43)) :
      modeLabel === 'walk' ?
      Math.round(Math.abs(appCtx.Walk?.state?.walker?.speedMph || 0)) :
      Math.round(Math.abs((appCtx.car?.speed || 0) * 0.5));
      overlay.textContent =
      `Mode: ${modeLabel.toUpperCase()}  Speed: ${speed} mph\n` +
      `Ref Y: ${refYVal}  Terrain Y: ${tY}\n` +
      `On surface: ${onRd}  dist: ${rdist}\n` +
      `Surface: ${roadName}`;
    }
    // Update debug marker position
    if (window._debugMarker) {
      let markerX = Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0;
      let markerZ = Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0;
      let markerOnRoad = !!appCtx.car?.onRoad;

      if (appCtx.droneMode) {
        markerX = Number.isFinite(appCtx.drone?.x) ? appCtx.drone.x : markerX;
        markerZ = Number.isFinite(appCtx.drone?.z) ? appCtx.drone.z : markerZ;
        const nearest = typeof appCtx.findNearestTraversalFeature === 'function' ?
          appCtx.findNearestTraversalFeature(markerX, markerZ, { mode: 'walk', maxDistance: 24 }) :
          appCtx.findNearestRoad(markerX, markerZ);
        const feature = nearest?.feature || nearest?.road || null;
        const halfWidth = feature?.width ? feature.width * 0.5 : 5;
        markerOnRoad = Number.isFinite(nearest?.dist) ? nearest.dist <= halfWidth + 3 : false;
      } else if (appCtx.boatMode?.active) {
        markerX = Number.isFinite(appCtx.boat?.x) ? appCtx.boat.x : markerX;
        markerZ = Number.isFinite(appCtx.boat?.z) ? appCtx.boat.z : markerZ;
        markerOnRoad = false;
      } else if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker) {
        markerX = Number.isFinite(appCtx.Walk.state.walker.x) ? appCtx.Walk.state.walker.x : markerX;
        markerZ = Number.isFinite(appCtx.Walk.state.walker.z) ? appCtx.Walk.state.walker.z : markerZ;
        const nearest = typeof appCtx.findNearestTraversalFeature === 'function' ?
          appCtx.findNearestTraversalFeature(markerX, markerZ, { mode: 'walk', maxDistance: 24 }) :
          appCtx.findNearestRoad(markerX, markerZ);
        const feature = nearest?.feature || nearest?.road || null;
        const halfWidth = feature?.width ? feature.width * 0.5 : 5;
        markerOnRoad = Number.isFinite(nearest?.dist) ? nearest.dist <= halfWidth + 3 : false;
      }

      const debugY = appCtx.elevationWorldYAtWorldXZ(markerX, markerZ);
      window._debugMarker.position.set(markerX, debugY, markerZ);
      window._debugMarker.material.color.setHex(markerOnRoad ? 0x00ff00 : 0xffff00);
    }
  }

  if (shouldUseComposer()) {
    appCtx.composer.render();
  } else {
    appCtx.renderer.render(appCtx.scene, appCtx.camera);
  }

  if (typeof appCtx.recordPerfRendererInfo === 'function') {
    appCtx.recordPerfRendererInfo(appCtx.renderer);
  }

  if (typeof appCtx.flushPendingTerrainAround === 'function') {
    const startedAt = performance.now();
    const flushed = appCtx.flushPendingTerrainAround();
    if (flushed && typeof appCtx.recordPerfRuntimeSection === 'function') {
      appCtx.recordPerfRuntimeSection('terrainQueue', performance.now() - startedAt);
    }
  }

  _perfPanelTimer += dt;
  if (_perfPanelTimer > 0.2) {
    _perfPanelTimer = 0;
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(false);
    positionTopOverlays();
  }
}

function showLoad(txt, options = {}) {
  const loading = document.getElementById('loading');
  const loadText = document.getElementById('loadText');
  if (!loading || !loadText) return;

  const spinner = loading.querySelector('.spinner');
  const selectedMode = options.mode || appCtx.loadingScreenMode || 'earth';
  const themedBg = LOADING_BG_BY_MODE[selectedMode] || DEFAULT_LOADING_BG;
  const background = options.background || themedBg;
  const overlay = Number.isFinite(options.overlay) ? options.overlay : 0.32;

  loading.style.background = `linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})), url('${background}') center center / cover no-repeat`;
  loadText.textContent = txt || 'Loading...';
  loadText.style.fontWeight = options.bold ? '700' : '500';
  loadText.style.letterSpacing = options.letterSpacing || '';
  loadText.style.textShadow = options.transition ? '0 4px 18px rgba(0,0,0,0.9)' : '';
  if (spinner) spinner.style.display = options.hideSpinner ? 'none' : '';

  loading.classList.add('show');
}

function hideLoad() {
  const loading = document.getElementById('loading');
  const loadText = document.getElementById('loadText');
  if (!loading || !loadText) return;

  const spinner = loading.querySelector('.spinner');
  if (spinner) spinner.style.display = '';
  loadText.style.fontWeight = '';
  loadText.style.letterSpacing = '';
  loadText.style.textShadow = '';
  loading.style.background = '';
  loading.classList.remove('show');
}

async function showTransitionLoad(mode, durationMs = 1400) {
  const cfg = TRANSITION_LOADING[mode];
  if (!cfg) return;

  showLoad(cfg.text, {
    background: cfg.background,
    hideSpinner: true,
    transition: true,
    bold: true,
    letterSpacing: '1px',
    overlay: 0.22
  });

  await new Promise((resolve) => setTimeout(resolve, durationMs));
  hideLoad();
}

window.addEventListener('resize', () => {
  requestAnimationFrame(() => positionTopOverlays());
}, { passive: true });

Object.assign(appCtx, { hideLoad, positionTopOverlays, renderLoop, showLoad, showTransitionLoad });

export { hideLoad, positionTopOverlays, renderLoop, showLoad, showTransitionLoad };
