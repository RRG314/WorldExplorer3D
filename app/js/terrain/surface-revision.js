// A pavement build yields between cells. Reject it if the physical ground or
// road contact changes while it is sampling; never publish mixed revisions.
export function markGroundSurfaceChanged(appCtx) {
  appCtx._groundSurfaceRevision = (appCtx._groundSurfaceRevision || 0) + 1;
  if (appCtx.streetPavement || appCtx._cancelStreetPavementBuild)
    appCtx._streetPavementDirty = true;
}
