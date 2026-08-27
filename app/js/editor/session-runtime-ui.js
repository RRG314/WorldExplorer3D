import { DEFAULT_EDITOR_HELP_TOPIC } from './help.js?v=1';

export function openHelpDrawer(ctx, topicId = DEFAULT_EDITOR_HELP_TOPIC, context = null) {
  ctx.state.helpOpen = true;
  ctx.state.helpTopic = ctx.sanitizeText(topicId || DEFAULT_EDITOR_HELP_TOPIC, 80).toLowerCase() || DEFAULT_EDITOR_HELP_TOPIC;
  ctx.state.helpContext = context ? ctx.cloneJson(context) : null;
  ctx.renderUi();
}

export function closeHelpDrawer(ctx) {
  ctx.state.helpOpen = false;
  ctx.state.helpTopic = DEFAULT_EDITOR_HELP_TOPIC;
  ctx.state.helpContext = null;
  ctx.renderUi();
}

export function collapseRuntimeUiForEditor(ctx) {
  // World-selection cards sit above normal gameplay UI and can intercept the
  // editor before a tool-specific entry point gets a chance to clear them.
  // Editor entry owns this boundary, so clear the selection up front.
  ctx.appCtx.clearStarSelection?.();
  document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
  ctx.appCtx.showLargeMap = false;
  document.getElementById('largeMap')?.classList.remove('show');
  document.getElementById('legendPanel')?.style?.setProperty('display', 'none');
  document.getElementById('mapInfoPanel')?.style?.setProperty('display', 'none');
  document.getElementById('navigationHud')?.style?.setProperty('display', 'none');
  document.getElementById('flowerActionMenu')?.classList.remove('open');
  document.getElementById('gameShareMenu')?.classList.remove('show');
  document.getElementById('roomPanelModal')?.classList.remove('show');
  document.getElementById('memoryInfoPanel')?.classList.remove('show');
  document.getElementById('boatPrompt')?.classList.remove('show');
  document.getElementById('liveEarthLocalPanel')?.classList.remove('show');
  document.getElementById('flowerChallengeHud')?.classList.remove('show');
  document.getElementById('paintTownHud')?.classList.remove('show');
  if (typeof ctx.appCtx.closePropertyPanel === 'function') ctx.appCtx.closePropertyPanel();
  if (typeof ctx.appCtx.closeHistoricPanel === 'function') ctx.appCtx.closeHistoricPanel();
  if (typeof ctx.appCtx.closeMemoryComposer === 'function') ctx.appCtx.closeMemoryComposer();
}

export function restoreRuntimeUiAfterEditor(ctx) {
  if (!ctx.appCtx.gameStarted) return;
  if (typeof ctx.appCtx.updateHUD === 'function') ctx.appCtx.updateHUD();
  if (typeof ctx.appCtx.drawMinimap === 'function') ctx.appCtx.drawMinimap();
  if (ctx.appCtx.showLargeMap && typeof ctx.appCtx.drawLargeMap === 'function') ctx.appCtx.drawLargeMap();
}

function captureEditorViewRestoreState(ctx) {
  if (ctx.state.editorViewRestore) return ctx.state.editorViewRestore;
  ctx.state.editorViewRestore = {
    walkView: ctx.sanitizeText(ctx.appCtx.Walk?.state?.view || '', 24).toLowerCase(),
    camMode: Number.isFinite(ctx.appCtx.camMode) ? ctx.appCtx.camMode : null
  };
  return ctx.state.editorViewRestore;
}

export function applyEditorViewMode(ctx, mode = '3d') {
  const nextMode = ctx.sanitizeText(mode || '3d', 8).toLowerCase() === '2d' ? '2d' : '3d';
  ctx.state.viewMode = nextMode;
  if (nextMode === '2d') {
    captureEditorViewRestoreState(ctx);
    if (ctx.appCtx.walkMode && ctx.appCtx.Walk?.state) {
      ctx.appCtx.Walk.state.view = 'overhead';
      if (ctx.appCtx.Walk.state.characterMesh) ctx.appCtx.Walk.state.characterMesh.visible = true;
    } else if (Number.isFinite(ctx.appCtx.camMode)) {
      ctx.appCtx.setCameraMode(2);
    }
    ctx.setStatus('2D plan view enabled. Drag paths and box out footprints from above.', 'ok');
  } else if (ctx.state.editorViewRestore) {
    if (ctx.appCtx.walkMode && ctx.appCtx.Walk?.state && ctx.state.editorViewRestore.walkView) {
      ctx.appCtx.Walk.state.view = ctx.state.editorViewRestore.walkView;
      if (ctx.appCtx.Walk.state.characterMesh) ctx.appCtx.Walk.state.characterMesh.visible = ctx.appCtx.Walk.state.view !== 'first';
    } else if (Number.isFinite(ctx.state.editorViewRestore.camMode)) {
      ctx.appCtx.setCameraMode(ctx.state.editorViewRestore.camMode);
    }
    ctx.state.editorViewRestore = null;
    ctx.setStatus('3D edit view restored.', 'ok');
  }
  ctx.renderUi();
}

export function restoreEditorViewMode(ctx) {
  if (!ctx.state.editorViewRestore) {
    ctx.state.viewMode = '3d';
    return;
  }
  if (ctx.appCtx.walkMode && ctx.appCtx.Walk?.state && ctx.state.editorViewRestore.walkView) {
    ctx.appCtx.Walk.state.view = ctx.state.editorViewRestore.walkView;
    if (ctx.appCtx.Walk.state.characterMesh) ctx.appCtx.Walk.state.characterMesh.visible = ctx.appCtx.Walk.state.view !== 'first';
  } else if (Number.isFinite(ctx.state.editorViewRestore.camMode)) {
    ctx.appCtx.setCameraMode(ctx.state.editorViewRestore.camMode);
  }
  ctx.state.editorViewRestore = null;
  ctx.state.viewMode = '3d';
}

export function enterEditorPerformanceMode(ctx) {
  const currentTier = typeof ctx.appCtx.getPerfAutoQualityTier === 'function' ? ctx.appCtx.getPerfAutoQualityTier() : '';
  const autoEnabled = typeof ctx.appCtx.getPerfAutoQualityEnabled === 'function' ? ctx.appCtx.getPerfAutoQualityEnabled() : false;
  ctx.state.editorPerfRestore = {
    autoEnabled,
    tier: ctx.sanitizeText(currentTier || '', 24).toLowerCase()
  };
  const performanceTier = ctx.sanitizeText(ctx.appCtx.PERF_QUALITY_TIER_PERFORMANCE || 'performance', 24).toLowerCase();
  if (autoEnabled === true && performanceTier && currentTier !== performanceTier && typeof ctx.appCtx.setPerfAutoQualityTier === 'function') {
    ctx.appCtx.setPerfAutoQualityTier(performanceTier, { reason: 'editor_mode' });
  }
  const renderQuality = typeof ctx.appCtx.getRenderQualityLevel === 'function'
    ? ctx.appCtx.getRenderQualityLevel()
    : ctx.appCtx.renderQualityLevel;
  ctx.state.editorRenderQualityRestore = ctx.sanitizeText(renderQuality || '', 24).toLowerCase();
  if (ctx.state.editorRenderQualityRestore && ctx.state.editorRenderQualityRestore !== 'low' && typeof ctx.appCtx.setRenderQualityLevel === 'function') {
    ctx.appCtx.setRenderQualityLevel('low', { persist: false });
  }
}

export function restoreEditorPerformanceMode(ctx) {
  const restore = ctx.state.editorPerfRestore;
  const renderRestore = ctx.sanitizeText(ctx.state.editorRenderQualityRestore || '', 24).toLowerCase();
  ctx.state.editorPerfRestore = null;
  ctx.state.editorRenderQualityRestore = '';
  if (restore && restore.autoEnabled === true && restore.tier && typeof ctx.appCtx.getPerfAutoQualityTier === 'function' && typeof ctx.appCtx.setPerfAutoQualityTier === 'function') {
    if (ctx.appCtx.getPerfAutoQualityTier() !== restore.tier) {
      ctx.appCtx.setPerfAutoQualityTier(restore.tier, { reason: 'editor_restore' });
    }
  }
  if (renderRestore && typeof ctx.appCtx.getRenderQualityLevel === 'function' && typeof ctx.appCtx.setRenderQualityLevel === 'function') {
    if (ctx.appCtx.getRenderQualityLevel() !== renderRestore) {
      ctx.appCtx.setRenderQualityLevel(renderRestore, { persist: false });
    }
  }
}
