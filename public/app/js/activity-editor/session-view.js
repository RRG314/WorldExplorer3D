export function createActivityCreatorViewApi(options = {}) {
  const { appCtx, state, sanitizeText, setStatus, renderUi } = options;

function collapseRuntimeUiForCreator() {
  document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
  appCtx.showLargeMap = false;
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
  if (typeof appCtx.closePropertyPanel === 'function') appCtx.closePropertyPanel();
  if (typeof appCtx.closeHistoricPanel === 'function') appCtx.closeHistoricPanel();
  if (typeof appCtx.closeMemoryComposer === 'function') appCtx.closeMemoryComposer();
}

function restoreRuntimeUiAfterCreator() {
  if (!appCtx.gameStarted) return;
  if (typeof appCtx.updateHUD === 'function') appCtx.updateHUD();
  if (typeof appCtx.drawMinimap === 'function') appCtx.drawMinimap();
  if (appCtx.showLargeMap && typeof appCtx.drawLargeMap === 'function') appCtx.drawLargeMap();
}

function captureCreatorViewRestoreState() {
  if (state.creatorViewRestore) return state.creatorViewRestore;
  state.creatorViewRestore = {
    walkView: sanitizeText(appCtx.Walk?.state?.view || '', 24).toLowerCase(),
    camMode: Number.isFinite(appCtx.camMode) ? appCtx.camMode : null
  };
  return state.creatorViewRestore;
}

function applyCreatorViewMode(mode = '3d') {
  const nextMode = sanitizeText(mode || '3d', 8).toLowerCase() === '2d' ? '2d' : '3d';
  state.viewMode = nextMode;
  if (nextMode === '2d') {
    captureCreatorViewRestoreState();
    if (appCtx.Walk?.state) {
      appCtx.Walk.state.view = 'overhead';
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
    } else if (Number.isFinite(appCtx.camMode)) {
      appCtx.setCameraMode(2);
    }
    setStatus('2D plan view enabled for anchor layout and route ordering.', 'ok');
  } else if (state.creatorViewRestore) {
    if (appCtx.Walk?.state && state.creatorViewRestore.walkView) {
      appCtx.Walk.state.view = state.creatorViewRestore.walkView;
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
    } else if (Number.isFinite(state.creatorViewRestore.camMode)) {
      appCtx.setCameraMode(state.creatorViewRestore.camMode);
    }
    state.creatorViewRestore = null;
    setStatus('3D creator view restored.', 'ok');
  }
  renderUi();
}

function restoreCreatorViewMode() {
  if (!state.creatorViewRestore) {
    state.viewMode = '3d';
    return;
  }
  if (appCtx.Walk?.state && state.creatorViewRestore.walkView) {
    appCtx.Walk.state.view = state.creatorViewRestore.walkView;
    if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
  } else if (Number.isFinite(state.creatorViewRestore.camMode)) {
    appCtx.setCameraMode(state.creatorViewRestore.camMode);
  }
  state.creatorViewRestore = null;
  state.viewMode = '3d';
}

function enterCreatorPerformanceMode() {
  const currentTier = typeof appCtx.getPerfAutoQualityTier === 'function' ? appCtx.getPerfAutoQualityTier() : '';
  const autoEnabled = typeof appCtx.getPerfAutoQualityEnabled === 'function' ? appCtx.getPerfAutoQualityEnabled() : false;
  state.creatorPerfRestore = {
    autoEnabled,
    tier: sanitizeText(currentTier || '', 24).toLowerCase()
  };
  const performanceTier = sanitizeText(appCtx.PERF_QUALITY_TIER_PERFORMANCE || 'performance', 24).toLowerCase();
  if (autoEnabled && performanceTier && currentTier !== performanceTier && typeof appCtx.setPerfAutoQualityTier === 'function') {
    appCtx.setPerfAutoQualityTier(performanceTier, { reason: 'activity_creator' });
  }
  const renderQuality = typeof appCtx.getRenderQualityLevel === 'function' ? appCtx.getRenderQualityLevel() : appCtx.renderQualityLevel;
  state.creatorRenderQualityRestore = sanitizeText(renderQuality || '', 24).toLowerCase();
  if (state.creatorRenderQualityRestore && state.creatorRenderQualityRestore !== 'low' && typeof appCtx.setRenderQualityLevel === 'function') {
    appCtx.setRenderQualityLevel('low', { persist: false });
  }
}

function restoreCreatorPerformanceMode() {
  const restore = state.creatorPerfRestore;
  const renderRestore = sanitizeText(state.creatorRenderQualityRestore || '', 24).toLowerCase();
  state.creatorPerfRestore = null;
  state.creatorRenderQualityRestore = '';
  if (restore?.autoEnabled === true && restore.tier && typeof appCtx.getPerfAutoQualityTier === 'function' && typeof appCtx.setPerfAutoQualityTier === 'function') {
    if (appCtx.getPerfAutoQualityTier() !== restore.tier) appCtx.setPerfAutoQualityTier(restore.tier, { reason: 'activity_creator_restore' });
  }
  if (renderRestore && typeof appCtx.getRenderQualityLevel === 'function' && typeof appCtx.setRenderQualityLevel === 'function') {
    if (appCtx.getRenderQualityLevel() !== renderRestore) appCtx.setRenderQualityLevel(renderRestore, { persist: false });
  }
}


  return { collapseRuntimeUiForCreator, restoreRuntimeUiAfterCreator, captureCreatorViewRestoreState, applyCreatorViewMode, restoreCreatorViewMode, enterCreatorPerformanceMode, restoreCreatorPerformanceMode };
}
