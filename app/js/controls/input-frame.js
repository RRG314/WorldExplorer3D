// Each active frame owner calls the same input boundary. Fresh Ocean/Space
// launches do not require starting an Earth renderer or a second input loop.
export function updateControlInputFrame(appCtx, frame) {
  if (!appCtx.gameStarted || appCtx.worldLoading || appCtx.titleLaunchPending || appCtx.arSessionActive || globalThis.document?.hidden) return false;
  appCtx.vrPresentation?.beforeInput?.(frame);
  appCtx.updateControlInput?.();
  return true;
}
