// Missing physical surfaces cannot be recovered as a playable partial world.
// Provider failures may use recorded data; a compiler failure must stay visible.
export class SurfacePublicationError extends Error {
  constructor(stage,cause) {
    super(`Street surfaces could not be published (${stage}): ${cause?.message || cause}`,{cause});
    this.name='SurfacePublicationError';
    this.code='STREET_SURFACE_PUBLICATION_FAILED';
    this.stage=stage;
  }
}
export const isSurfacePublicationError = error => error?.code==='STREET_SURFACE_PUBLICATION_FAILED';

export function finishFailedSurfaceLoad(session = {},error) {
  const {appCtx,runtimeState,worldSession,loadMetrics}=session;
  const reason='street-surface-publication-failed';
  session.abortProviderWork?.(reason);
  appCtx._cancelStreetPavementBuild?.();
  appCtx.streetOverview?.dispose?.();
  worldSession?.fail?.(reason);
  if(runtimeState) {
    runtimeState.status='failed';
    runtimeState.geometryReady=false;
    runtimeState.activePhases=[];
    runtimeState.error=String(error?.message || error);
    runtimeState.finishedAt=runtimeState.updatedAt=performance.now();
  }
  if(loadMetrics)loadMetrics.error=String(error?.message || error);
  appCtx.worldLoading=false;
  appCtx.gameStarted=false;
  appCtx.initialEarthWorldReady=false;
  appCtx.discardEarthWorldSceneLoad?.(runtimeState?.sequence);
  // Discarding a scene stage only changes its status. Release through the
  // normal world owner as well, so failed loads cannot retain terrain, meshes,
  // contact indexes and provider snapshots behind the location menu.
  try { appCtx.releaseEarthWorldForTitle?.(); }
  catch (cleanupError) {
    if(runtimeState)runtimeState.cleanupError=String(cleanupError?.message || cleanupError);
    console.error('[World] Failed to release rejected street publication',cleanupError);
  }
  appCtx.enforceEnvironmentSceneOwnership?.();
  appCtx.hideLoad?.();
  appCtx.showToast?.('Street surfaces could not finish loading. This location has not been published. Return to the menu to try again.');
  session.syncWorldSessionState?.();
  session.finalizePerfLoad?.(false,{reason});
  session.releaseWorldLoadCancellation?.();
  return worldSession?.snapshot?.() || {status:'failed',reason};
}
