import { ctx as appCtx } from './shared-context.js?v=55';
import { createCoreFrameSystems } from './runtime/core-frame-systems.js?v=1';
import { createDebugPresentationSystem } from './runtime/debug-presentation.js?v=1';
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
    appCtx.worldLoading ||
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
  isSuspended: dedicatedRendererActive,
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
  getRuntimeKernelSnapshot: () => runtimeKernel.snapshot(),
  hideLoad,
  positionTopOverlays,
  registerRuntimeSystem,
  renderLoop,
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
  showLoad,
  showTransitionLoad
};
