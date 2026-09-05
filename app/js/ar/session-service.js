import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';
import { describeArCapability, detectArCapabilities } from './capabilities.js?v=1';
import { evaluateArEligibility, getArEligibilityRegistrySnapshot } from './eligibility.js?v=2';
import { compileWaterfowlChallenge, createWaterfowlChallengeSession } from './field-challenge.js?v=2';
import { createArPresentation } from './presentation.js?v=6';

let activePlatform = null;

function currentPlayerPosition(appCtx) {
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker) return appCtx.Walk.state.walker;
  if (appCtx.boatMode?.active) return appCtx.boat;
  if (appCtx.droneMode) return appCtx.drone;
  return appCtx.car || { x: 0, y: 0, z: 0 };
}

function currentTravelMode(appCtx) {
  return appCtx.Walk?.state?.mode === 'walk' ? 'walk' : appCtx.boatMode?.active ? 'boat' : appCtx.droneMode ? 'drone' : appCtx.planeMode?.active ? 'plane' : 'car';
}

function requestTitle(request = {}) {
  request ||= {};
  if (request.type === 'companion') return request.companion?.name || 'Companion';
  if (request.type === 'specimen') return request.record?.name || request.record?.catalogId || 'Field specimen';
  if (request.type === 'field-challenge') return 'Waterfowl Photo Survey';
  return 'AR Experience';
}

function createArPlatform(appCtx, options = {}) {
  const scope = createLifecycleScope('ar-platform');
  const byId = (id) => document.getElementById(id);
  const ui = {
    shell: byId('arExperience'), video: byId('arCameraFeed'), canvas: byId('arCanvas'), close: byId('arCloseBtn'),
    title: byId('arTitle'), mode: byId('arModeBadge'), status: byId('arStatus'), intro: byId('arIntro'),
    introTitle: byId('arIntroTitle'), introCopy: byId('arIntroCopy'), continueButton: byId('arContinueBtn'), cancelButton: byId('arCancelBtn'),
    controls: byId('arControls'), place: byId('arPlaceBtn'), smaller: byId('arSmallerBtn'), larger: byId('arLargerBtn'),
    instruction: byId('arInstruction'), metric: byId('arMetric'), privacy: byId('arPrivacyBadge')
  };
  const state = {
    phase: 'idle', request: null, capability: null, eligibility: null, stream: null, xrSession: null,
    presentation: null, raf: null, challengePlan: null, challengeSession: null, hitTestAvailable: false, error: '', lastReason: '', openedAt: 0,
    input: { pointerId: null, x: 0, y: 0, moved: false }
  };

  function contextForRequest() {
    const runtime = appCtx.worldDiscoveryRuntime;
    return {
      environmentName: appCtx.getEnv?.() || 'EARTH',
      environment: runtime?.publication?.environment,
      position: currentPlayerPosition(appCtx),
      travelMode: currentTravelMode(appCtx),
      liveGpsSnapshot: appCtx.getLiveGpsSnapshot?.() || { active: false },
      companions: runtime?.companionRuntime?.snapshot?.().companions || []
    };
  }

  function renderUi() {
    const preview = state.phase === 'preview' || state.phase === 'starting' || state.phase === 'error';
    const active = state.phase === 'active';
    ui.shell?.classList.toggle('show', state.phase !== 'idle');
    ui.shell?.classList.toggle('is-active', active);
    ui.shell?.classList.toggle('is-camera', active && !!state.stream);
    ui.shell?.setAttribute('aria-hidden', state.phase === 'idle' ? 'true' : 'false');
    if (ui.intro) ui.intro.hidden = !preview;
    if (ui.controls) ui.controls.hidden = !active;
    if (ui.title) ui.title.textContent = requestTitle(state.request);
    if (ui.mode) ui.mode.textContent = state.capability ? describeArCapability(state.capability) : 'Checking device';
    if (ui.introTitle) ui.introTitle.textContent = state.error ? 'Could not start camera view' : `Open ${requestTitle(state.request)}?`;
    if (ui.introCopy) {
      ui.introCopy.textContent = state.error || (state.capability?.level === 'spatial-ar'
        ? 'Move slowly and point the camera toward a clear surface. World Explorer will ask for camera and motion access after you continue.'
        : state.capability?.level === 'camera-overlay'
          ? 'This device will use a camera overlay. Placement is screen-relative and is not a scanned or persistent physical anchor.'
          : 'Camera AR is unavailable here, so World Explorer will open the same content in an interactive 3D viewer.');
    }
    if (ui.continueButton) {
      ui.continueButton.disabled = state.phase === 'starting';
      ui.continueButton.textContent = state.phase === 'starting' ? 'Starting…' : state.error ? 'Open 3D Instead' : state.capability?.level === 'interactive-3d' ? 'Open 3D' : 'Continue';
    }
    if (ui.status) ui.status.textContent = state.phase === 'active' ? state.lastReason : state.error || '';
    if (ui.privacy) ui.privacy.textContent = state.stream ? 'Camera stays on this device' : 'No camera recording';
    if (ui.place) ui.place.hidden = !(active && state.capability?.level === 'spatial-ar' && state.hitTestAvailable);
    if (ui.smaller) ui.smaller.hidden = state.request?.type === 'field-challenge';
    if (ui.larger) ui.larger.hidden = state.request?.type === 'field-challenge';
    document.body?.classList.toggle('ar-experience-open', state.phase !== 'idle');
    appCtx.arSessionActive = ['starting', 'active', 'ending'].includes(state.phase);
  }

  function stopStream() {
    const stream = state.stream;
    state.stream = null;
    if (ui.video) {
      ui.video.pause?.();
      ui.video.srcObject = null;
    }
    stream?.getTracks?.().forEach((track) => track.stop());
  }

  function cancelAnimation() {
    if (state.raf !== null) globalThis.cancelAnimationFrame?.(state.raf);
    state.raf = null;
  }

  async function end(reason = 'user-exit') {
    if (state.phase === 'idle' || state.phase === 'ending') return false;
    state.phase = 'ending';
    renderUi();
    cancelAnimation();
    const session = state.xrSession;
    state.xrSession = null;
    try { if (session?.visibilityState !== 'ended') await session?.end?.(); } catch (_) {}
    stopStream();
    state.presentation?.dispose?.();
    state.presentation = null;
    state.challengeSession = null;
    state.challengePlan = null;
    state.hitTestAvailable = false;
    state.request = null;
    state.capability = null;
    state.eligibility = null;
    state.error = '';
    state.lastReason = String(reason);
    state.phase = 'idle';
    renderUi();
    globalThis.dispatchEvent?.(new CustomEvent('we3d:ar-session-ended', { detail: { reason } }));
    return true;
  }

  function updateChallengeUi() {
    const snapshot = state.challengeSession?.snapshot?.();
    if (!snapshot) return;
    if (ui.metric) ui.metric.textContent = `${snapshot.photographed} / ${snapshot.total} photographed`;
    if (ui.instruction) ui.instruction.textContent = snapshot.completed
      ? 'Survey complete. Every target was virtual and no real wildlife was affected.'
      : 'Tap a virtual mallard to photograph it. Stay aware of your surroundings.';
    if (snapshot.completed) state.lastReason = 'Waterfowl photo survey complete.';
    state.presentation?.setChallengeComplete?.(snapshot.completed);
  }

  function runViewerLoop() {
    cancelAnimation();
    const frame = (timestamp) => {
      if (state.phase !== 'active' || state.xrSession) return;
      state.presentation?.update?.(timestamp);
      state.raf = globalThis.requestAnimationFrame(frame);
    };
    state.raf = globalThis.requestAnimationFrame(frame);
  }

  async function startCamera() {
    const mediaDevices = (options.navigatorObject || navigator).mediaDevices;
    const request = Promise.resolve().then(() => mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }));
    let timeoutId = null;
    let timedOut = false;
    const timeout = new Promise((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        const error = new Error('Camera permission did not finish. Continue in interactive 3D instead.');
        error.name = 'CameraStartTimeoutError';
        reject(error);
      }, 8_000);
    });
    try {
      state.stream = await Promise.race([request, timeout]);
    } catch (error) {
      if (timedOut) {
        void request.then((lateStream) => lateStream?.getTracks?.().forEach((track) => track.stop())).catch(() => {});
      }
      throw error;
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    }
    if (ui.video) {
      ui.video.srcObject = state.stream;
      await ui.video.play();
    }
  }

  async function startSpatial() {
    const xr = (options.navigatorObject || navigator).xr;
    const sessionInit = { requiredFeatures: ['local-floor'], optionalFeatures: ['hit-test', 'anchors', 'dom-overlay'] };
    if (ui.shell) sessionInit.domOverlay = { root: ui.shell };
    const session = await xr.requestSession('immersive-ar', sessionInit);
    state.xrSession = session;
    state.presentation.setSpatialMode?.(true);
    state.presentation.renderer.xr.enabled = true;
    await state.presentation.renderer.xr.setSession(session);
    const referenceSpace = await session.requestReferenceSpace('local-floor');
    let hitTestSource = null;
    if (session.enabledFeatures?.has?.('hit-test') || typeof session.requestHitTestSource === 'function') {
      try {
        const viewerSpace = await session.requestReferenceSpace('viewer');
        hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      } catch (_) {}
    }
    session.addEventListener('end', () => { if (state.phase !== 'idle' && state.phase !== 'ending') void end('xr-session-ended'); }, { once: true });
    session.addEventListener('select', () => {
      if (!state.hitTestAvailable) return;
      if (state.presentation?.placeAtReticle?.()) {
        state.lastReason = 'Placed. Move around slowly and keep the area clear.';
        renderUi();
      }
    });
    state.hitTestAvailable = !!hitTestSource;
    state.presentation.renderer.setAnimationLoop((_timestamp, frame) => state.presentation?.updateXr?.(frame, hitTestSource, referenceSpace));
    state.lastReason = hitTestSource ? 'Move the reticle onto a clear surface, then place.' : 'Spatial session active. Surface placement is unavailable on this device.';
  }

  async function begin() {
    if (state.phase !== 'preview' && state.phase !== 'error') return false;
    if (state.error && state.capability) state.capability = { ...state.capability, level: 'interactive-3d' };
    state.phase = 'starting';
    state.error = '';
    renderUi();
    try {
      state.challengePlan = state.request.type === 'field-challenge' ? compileWaterfowlChallenge({
        environment: contextForRequest().environment,
        position: contextForRequest().position,
        environmentName: contextForRequest().environmentName,
        liveGpsSnapshot: contextForRequest().liveGpsSnapshot,
        travelMode: contextForRequest().travelMode
      }) : null;
      if (state.challengePlan && !state.challengePlan.eligible) throw new Error('This habitat is no longer eligible for the waterfowl survey.');
      state.challengeSession = state.challengePlan ? createWaterfowlChallengeSession(state.challengePlan) : null;
      state.presentation = createArPresentation({ canvas: ui.canvas, request: state.request, challengePlan: state.challengePlan });
      if (state.capability.level === 'spatial-ar') await startSpatial();
      else {
        if (state.capability.level === 'camera-overlay') await startCamera();
        state.lastReason = state.request.type === 'field-challenge'
          ? 'Virtual waterfowl survey active. Tap only the rendered targets.'
          : state.capability.level === 'camera-overlay'
            ? 'Camera view active. Drag to rotate; placement is screen-relative.'
            : 'Interactive 3D viewer active. Drag to rotate and use the size controls.';
        runViewerLoop();
      }
      state.phase = 'active';
      renderUi();
      updateChallengeUi();
      globalThis.dispatchEvent?.(new CustomEvent('we3d:ar-session-started', { detail: { type: state.request.type, level: state.capability.level } }));
      return true;
    } catch (error) {
      cancelAnimation();
      stopStream();
      try { await state.xrSession?.end?.(); } catch (_) {}
      state.xrSession = null;
      state.presentation?.dispose?.();
      state.presentation = null;
      state.challengeSession = null;
      state.hitTestAvailable = false;
      state.error = error?.name === 'NotAllowedError'
        ? 'Camera access was not allowed. You can continue in interactive 3D without a camera.'
        : error?.name === 'CameraStartTimeoutError'
          ? 'Camera permission did not finish. You can continue in interactive 3D without a camera.'
          : String(error?.message || error || 'AR could not start.');
      state.capability = { ...(state.capability || {}), level: 'interactive-3d', camera: false, immersiveAr: false };
      state.phase = 'error';
      renderUi();
      return false;
    }
  }

  async function open(request = {}) {
    await end('replaced');
    const context = contextForRequest();
    const eligibility = evaluateArEligibility(request, context);
    if (!eligibility.allowed) {
      const message = eligibility.reason === 'stop-vehicle-first' || eligibility.reason === 'moving-too-fast'
        ? 'Stop moving and leave vehicle controls before opening AR.'
        : eligibility.reason === 'earth-only' ? 'AR field experiences are available on Earth.' : 'This AR experience is not available here.';
      appCtx.showToast?.(message);
      return Object.freeze({ opened: false, eligibility });
    }
    state.phase = 'preview';
    state.request = request;
    state.eligibility = eligibility;
    state.capability = await detectArCapabilities({ navigatorObject: options.navigatorObject });
    if (request.type === 'field-challenge' && state.capability.level === 'spatial-ar') {
      state.capability = Object.freeze({
        ...state.capability,
        level: state.capability.camera ? 'camera-overlay' : 'interactive-3d',
        reason: 'touch-photo-overlay'
      });
    }
    state.openedAt = Date.now();
    state.lastReason = '';
    state.error = '';
    renderUi();
    return Object.freeze({ opened: true, eligibility, capability: state.capability });
  }

  function handlePointerDown(event) {
    if (state.phase !== 'active') return;
    state.input = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    ui.canvas?.setPointerCapture?.(event.pointerId);
  }
  function handlePointerMove(event) {
    if (state.phase !== 'active' || state.input.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.input.x;
    const dy = event.clientY - state.input.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.input.moved = true;
    state.presentation?.rotate?.(dx, dy);
    state.input.x = event.clientX;
    state.input.y = event.clientY;
  }
  function handlePointerUp(event) {
    if (state.phase !== 'active' || state.input.pointerId !== event.pointerId) return;
    if (!state.input.moved && state.challengeSession) {
      const actorId = state.presentation?.hitChallenge?.(event.clientX, event.clientY);
      if (actorId && state.challengeSession.photograph(actorId)) {
        state.lastReason = 'Virtual mallard photographed.';
        updateChallengeUi();
        renderUi();
      }
    }
    state.input.pointerId = null;
  }

  scope.listen(ui.close, 'click', () => void end('user-exit'));
  scope.listen(ui.cancelButton, 'click', () => void end('cancelled'));
  scope.listen(ui.continueButton, 'click', () => void begin());
  scope.listen(ui.place, 'click', () => {
    const placed = state.presentation?.placeAtReticle?.();
    state.lastReason = placed ? 'Placed. Move around slowly and keep the area clear.' : 'Move slowly until the surface reticle appears.';
    renderUi();
  });
  scope.listen(ui.smaller, 'click', () => state.presentation?.scaleBy?.(.85));
  scope.listen(ui.larger, 'click', () => state.presentation?.scaleBy?.(1.18));
  scope.listen(ui.canvas, 'pointerdown', handlePointerDown);
  scope.listen(ui.canvas, 'pointermove', handlePointerMove);
  scope.listen(ui.canvas, 'pointerup', handlePointerUp);
  scope.listen(globalThis, 'resize', () => state.presentation?.resize?.(), { passive: true });
  scope.listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.phase === 'active') void end('page-hidden');
  });

  function snapshot() {
    return Object.freeze({
      type: 'ArPlatformSnapshot', phase: state.phase, active: state.phase === 'active',
      experienceType: state.request?.type || null, contentId: state.request?.companion?.instanceId || state.request?.record?.instanceId || state.request?.record?.catalogId || null,
      capability: state.capability, eligibility: state.eligibility, cameraActive: !!state.stream,
      xrSessionActive: !!state.xrSession, challenge: state.challengeSession?.snapshot?.() || null,
      presentation: state.presentation?.snapshot?.() || null, error: state.error,
      registry: getArEligibilityRegistrySnapshot(), cameraFramesStored: false, cameraFramesUploaded: false
    });
  }

  renderUi();
  return Object.freeze({
    begin, end, open, snapshot,
    dispose() { void end('platform-disposed'); scope.dispose('platform-disposed'); }
  });
}

function initArPlatform(appCtx, options = {}) {
  if (activePlatform) return activePlatform;
  activePlatform = createArPlatform(appCtx, options);
  appCtx.openArExperience = activePlatform.open;
  appCtx.closeArExperience = activePlatform.end;
  appCtx.getArPlatformSnapshot = activePlatform.snapshot;
  return activePlatform;
}

function getArPlatformSnapshot() {
  return activePlatform?.snapshot?.() || Object.freeze({ type: 'ArPlatformSnapshot', phase: 'idle', active: false });
}

export { createArPlatform, getArPlatformSnapshot, initArPlatform };
