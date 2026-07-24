import { ctx as appCtx } from './shared-context.js?v=55';
import { createCoreFrameSystems } from './runtime/core-frame-systems.js?v=4';
import { createDebugPresentationSystem } from './runtime/debug-presentation.js?v=1';
import { getFrameOwnershipSnapshot, registerFrameOwner } from './runtime/frame-ownership.js?v=1';
import { createRuntimeKernel } from './runtime/kernel.js?v=1';

let perfPanelTimer = 0;
let runtimeSystemsRegistered = false;
const OVERLAY_EDGE_MARGIN = 6;
const OVERLAY_ANCHOR_GAP = 10;
const DEFAULT_LOADING_BG = '../assets/landing/city.jpg';
const TRANSITION_LOADING = {
  earth: { background: DEFAULT_LOADING_BG, text: 'Restoring Earth...' },
  space: { background: '../assets/landing/space.jpg', text: 'Preparing Space Flight...' },
  moon: { background: '../assets/landing/moon.jpg', text: 'Approaching The Moon...' },
  mars: { background: '../assets/landing/space.jpg', text: 'Approaching Olympus Mons...' },
  ocean: { background: DEFAULT_LOADING_BG, text: 'Diving Into Ocean Mode...' }
};
const LOADING_BG_BY_MODE = {
  earth: DEFAULT_LOADING_BG,
  moon: '../assets/landing/moon.jpg',
  mars: '../assets/landing/space.jpg',
  space: '../assets/landing/space.jpg',
  ocean: DEFAULT_LOADING_BG
};

function isVisibleRect(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function isEditorWorkspaceOpen() {
  return !!document.body?.classList.contains('editor-workspace-open');
}

function isActivityCreatorOpen() {
  return !!document.body?.classList.contains('activity-creator-open');
}

function positionOverlayBetween(overlay, leftRect, rightRect) {
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
  overlay.style.left = `${Math.round(Math.max(minLeft, Math.min(maxLeft, desiredLeft)))}px`;
  overlay.style.right = 'auto';
}

function positionTopOverlays() {
  if (!appCtx.gameStarted || isEditorWorkspaceOpen() || isActivityCreatorOpen()) return;
  const hudRect = isVisibleRect(document.getElementById('hud'));
  const menuRect = isVisibleRect(document.getElementById('mainMenuBtn'));
  if (!hudRect || !menuRect) return;
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
    positionOverlayBetween(debugOverlay, hudRect, centerRect);
  }
  const perfPanel = document.getElementById('perfPanel');
  if (perfPanel && perfPanel.style.display !== 'none') {
    positionOverlayBetween(perfPanel, centerRect, menuRect);
  }
}

function shouldUseComposer() {
  if (!appCtx.composer) return false;
  const quality = String(appCtx.renderQualityLevel || '').toLowerCase();
  if (quality !== 'low') return true;
  return !!(appCtx.ssaoPass?.enabled || appCtx.bloomPass?.enabled || appCtx.smaaPass?.enabled);
}

function dedicatedRendererActive() {
  return !!(
    appCtx.isEnv?.(appCtx.ENV?.SPACE_FLIGHT) ||
    appCtx.spaceFlight?.active ||
    appCtx.oceanMode?.active
  );
}

const runtimeKernel = createRuntimeKernel({
  fixedDelta: 1 / 60,
  maxDelta: 0.1,
  maxFixedSteps: 5,
  getContext: () => ({
    appCtx,
    environment: appCtx.getEnv?.() || null,
    gameStarted: !!appCtx.gameStarted
  }),
  isSuspended: () => document.hidden || dedicatedRendererActive(),
  onSuspendedFrame: ({ timestamp }) => {
    appCtx.lastTime = timestamp;
  },
  onSystemError: ({ error, system }) => {
    console.error(`[runtime] System failed: ${system.id}`, error);
    globalThis.dispatchEvent?.(new CustomEvent('we3d:runtime-system-error', {
      detail: { system, message: error instanceof Error ? error.message : String(error) }
    }));
  }
});

registerFrameOwner({
  id: 'earth.runtime-kernel',
  label: 'Earth runtime kernel',
  kind: 'continuous-renderer',
  exclusiveGroup: 'environment-renderer',
  getState: () => {
    const running = runtimeKernel.snapshot().running;
    const suspended = document.hidden || dedicatedRendererActive();
    return {
      active: running && !suspended,
      scheduled: running,
      suspended: running && suspended
    };
  }
});

function registerRuntimeSystems() {
  if (runtimeSystemsRegistered) return;
  runtimeSystemsRegistered = true;
  const systems = createCoreFrameSystems(appCtx, {
    isActivityCreatorOpen,
    isEditorWorkspaceOpen,
    positionTopOverlays
  });
  systems.forEach((system) => runtimeKernel.registerSystem(system));
  runtimeKernel.registerSystem(createDebugPresentationSystem(appCtx));
  runtimeKernel.registerSystem({
    id: 'core.renderer',
    owner: 'renderer',
    phase: 'render',
    priority: 0,
    update() {
      if (shouldUseComposer()) appCtx.composer.render();
      else appCtx.renderer.render(appCtx.scene, appCtx.camera);
      appCtx.recordPerfRendererInfo?.(appCtx.renderer);
    }
  });
  runtimeKernel.registerSystem({
    id: 'core.performance-panel',
    owner: 'diagnostics',
    phase: 'render',
    priority: 100,
    critical: false,
    update(frame) {
      perfPanelTimer += frame.dt;
      if (perfPanelTimer <= 0.2) return;
      perfPanelTimer = 0;
      appCtx.updatePerfPanel?.(false);
      positionTopOverlays();
    }
  });
}

function renderLoop() {
  registerRuntimeSystems();
  return runtimeKernel.start();
}

function warmNearbyWorldRenderResources(radius = Number.POSITIVE_INFINITY) {
  if (!appCtx.renderer || !appCtx.scene || !appCtx.camera) return 0;
  const actor = appCtx.activeTransportActor?.()?.position || appCtx.car || { x: 0, z: 0 };
  const radiusSq = radius * radius;
  const restored = [];
  const candidates = [...new Set([
    ...(appCtx.buildingMeshes || []),
    ...(appCtx.aerialContextMeshes || []),
    ...(appCtx.landuseMeshes || []),
    ...(appCtx.roadMeshes || []),
    ...(appCtx.linearFeatureMeshes || []),
    ...(appCtx.poiMeshes || []),
    ...(appCtx.streetFurnitureMeshes || []),
    ...(appCtx.structureVisualMeshes || []),
    ...(appCtx.vegetationMeshes || []),
    ...(appCtx.waterWaveVisuals || [])
  ])];
  appCtx.earthSceneRoot?.traverse?.((object) => {
    if (object?.geometry) candidates.push(object);
  });
  // Persistent transport actors live outside the replaceable Earth root.
  // Exercise their material/program variants before the first mode switch.
  appCtx.carMesh?.traverse?.((object) => {
    if (object?.geometry) candidates.push(object);
  });
  const uniqueCandidates = [...new Set(candidates)];
  const startedAt = performance.now();
  for (let i = 0; i < uniqueCandidates.length; i += 1) {
    const mesh = uniqueCandidates[i];
    if (!mesh?.geometry) continue;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const center = mesh.userData?.lodCenter || mesh.geometry.boundingSphere?.center;
    const x = Number(center?.x || 0) + Number(mesh.position?.x || 0);
    const z = Number(center?.z || 0) + Number(mesh.position?.z || 0);
    if ((x - actor.x) ** 2 + (z - actor.z) ** 2 > radiusSq) continue;
    restored.push({ mesh, parent: mesh.parent, visible: mesh.visible, frustumCulled: mesh.frustumCulled });
    mesh.visible = true;
    mesh.frustumCulled = false;
    if (!mesh.parent) appCtx.scene.add(mesh);
  }
  try {
    appCtx.renderer.render(appCtx.scene, appCtx.camera);
  } finally {
    for (let i = 0; i < restored.length; i += 1) {
      const { mesh, parent, visible, frustumCulled } = restored[i];
      mesh.visible = visible;
      mesh.frustumCulled = frustumCulled;
      if (!parent && mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
    }
  }
  return performance.now() - startedAt;
}

async function waitForWorldRenderReadiness(options = {}) {
  if (!appCtx.renderer || !appCtx.scene || !appCtx.camera) {
    return { ready: false, reason: 'renderer_unavailable', durationMs: 0, frames: 0 };
  }
  const timeoutMs = Math.max(500, Math.min(12000, Number(options.timeoutMs) || 9000));
  const requiredStableFrames = Math.max(4, Math.min(16, Number(options.stableFrames) || 8));
  const minimumReadyMs = Math.max(250, Math.min(2500, Number(options.minimumReadyMs) || 650));
  const startedAt = performance.now();
  const warmupMs = await warmNearbyWorldRenderResources();
  let previousFrameAt = startedAt;
  let previousSignature = '';
  let stableFrames = 0;
  let frames = 0;

  while (
    performance.now() - startedAt < timeoutMs &&
    (stableFrames < requiredStableFrames || performance.now() - startedAt < minimumReadyMs)
  ) {
    const frameAt = await new Promise((resolve) => requestAnimationFrame(resolve));
    frames += 1;
    const frameMs = frameAt - previousFrameAt;
    previousFrameAt = frameAt;
    const info = appCtx.renderer.info;
    const signature = [
      Number(info?.memory?.geometries || 0),
      Number(info?.memory?.textures || 0),
      Number(info?.programs?.length || 0)
    ].join(':');
    stableFrames = signature === previousSignature && frameMs <= 50 ? stableFrames + 1 : 0;
    previousSignature = signature;
  }

  const result = {
    ready: stableFrames >= requiredStableFrames,
    reason: stableFrames >= requiredStableFrames ? 'stable' : 'timeout',
    durationMs: Math.round(performance.now() - startedAt),
    frames,
    stableFrames,
    minimumReadyMs,
    warmupMs: Math.round(warmupMs),
    geometries: Number(appCtx.renderer.info?.memory?.geometries || 0),
    textures: Number(appCtx.renderer.info?.memory?.textures || 0),
    programs: Number(appCtx.renderer.info?.programs?.length || 0)
  };
  appCtx._lastWorldRenderReadiness = result;
  return result;
}

function registerRuntimeSystem(definition) {
  registerRuntimeSystems();
  return runtimeKernel.registerSystem(definition);
}

function showLoad(text, options = {}) {
  const loading = document.getElementById('loading');
  const loadText = document.getElementById('loadText');
  if (!loading || !loadText) return;
  const spinner = loading.querySelector('.spinner');
  const selectedMode = options.mode || appCtx.loadingScreenMode || 'earth';
  const background = options.background || LOADING_BG_BY_MODE[selectedMode] || DEFAULT_LOADING_BG;
  const overlay = Number.isFinite(options.overlay) ? options.overlay : 0.32;
  loading.style.background = `linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})), url('${background}') center center / cover no-repeat`;
  loadText.textContent = text || 'Loading...';
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
  const config = TRANSITION_LOADING[mode];
  if (!config) return;
  showLoad(config.text, {
    background: config.background,
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

Object.assign(appCtx, {
  getFrameOwnershipSnapshot,
  getRuntimeKernelSnapshot: () => runtimeKernel.snapshot(),
  hideLoad,
  positionTopOverlays,
  registerRuntimeSystem,
  renderLoop,
  waitForWorldRenderReadiness,
  showLoad,
  showTransitionLoad,
  stopRuntimeKernel: (reason) => runtimeKernel.stop(reason),
  unregisterRuntimeOwner: (owner) => runtimeKernel.unregisterOwner(owner),
  unregisterRuntimeSystem: (id) => runtimeKernel.unregisterSystem(id)
});

export {
  hideLoad,
  positionTopOverlays,
  registerRuntimeSystem,
  renderLoop,
  waitForWorldRenderReadiness,
  showLoad,
  showTransitionLoad
};
