// One terminal failure path for a rejected Earth publication. Persistent
// records are owned elsewhere; release only this request's resident world.
export function finishFailedWorldLoad(session = {}, error, options = {}) {
  const {appCtx, runtimeState, worldSession, loadMetrics} = session;
  const reason = options.reason || 'world-load-failed';
  session.abortProviderWork?.(reason);
  worldSession?.fail?.(reason);
  if (runtimeState) {
    Object.assign(runtimeState, {status: 'failed', geometryReady: false,
      gameplayRuntimesReady: false, activePhases: [], error: String(error?.message || error),
      updatedAt: performance.now()});
    runtimeState.finishedAt = runtimeState.updatedAt;
  }
  if (loadMetrics) loadMetrics.error = String(error?.message || error);
  // An old rejection must never stop or dispose a newer publication.
  if (appCtx && runtimeState && appCtx.worldLoadRuntimeState === runtimeState) {
    appCtx.worldLoading = false;
    appCtx.gameStarted = false;
    appCtx.initialEarthWorldReady = false;
    const cleanupErrors = [];
    for (const cleanup of [
      () => appCtx._cancelStreetPavementBuild?.(),
      () => appCtx.streetOverview?.dispose?.(),
      () => appCtx.discardEarthWorldSceneLoad?.(runtimeState.sequence),
      () => appCtx.releaseEarthWorldForTitle?.(),
      () => appCtx.enforceEnvironmentSceneOwnership?.(),
      () => appCtx.hideLoad?.(),
      () => appCtx.globeSelector?.open?.(),
      () => appCtx.globeSelector?.setSearchStatus?.(
        options.message || 'This location could not finish loading. Select Explore to retry, or choose another location.', '#fca5a5')
    ]) {
      try { cleanup(); }
      catch (failure) { cleanupErrors.push(String(failure?.message || failure)); }
    }
    if (cleanupErrors.length) {
      runtimeState.cleanupError = cleanupErrors.join('; ');
      console.error('[World] Rejected-world cleanup failed', runtimeState.cleanupError);
    }
    appCtx.showToast?.(options.message || 'This location could not finish loading. Return to the location menu and try again.');
  }
  session.syncWorldSessionState?.();
  session.finalizePerfLoad?.(false, {reason});
  session.releaseWorldLoadCancellation?.();
  return worldSession?.snapshot?.() || {status: 'failed', reason};
}
