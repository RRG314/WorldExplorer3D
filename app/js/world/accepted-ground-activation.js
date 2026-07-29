export async function activateAcceptedGroundForWorldLoad(options = {}) {
  const {
    appCtx,
    endLoadPhase = () => {},
    finalizePerfLoad = () => {},
    loadMetrics = {},
    runtimeState = {},
    startLoadPhase = () => {}
  } = options;
  if (!appCtx?.terrainEnabled || appCtx.onMoon) return true;

  startLoadPhase('prepareAcceptedGround');
  appCtx.showLoad('Verifying accepted ground data...');
  let state;
  try {
    state = typeof appCtx.prepareAcceptedGroundFromCatalog === 'function'
      ? await appCtx.prepareAcceptedGroundFromCatalog({
          latitude: appCtx.LOC.lat,
          longitude: appCtx.LOC.lon,
          coverageProbes: [{
            latitude: appCtx.LOC.lat,
            longitude: appCtx.LOC.lon
          }]
        })
      : {
          status: 'blocked',
          reason: 'accepted-ground-catalog-runtime-missing'
        };
  } finally {
    endLoadPhase('prepareAcceptedGround');
  }

  loadMetrics.acceptedGround = state;
  if (state?.status === 'accepted') {
    runtimeState.acceptedGround = state;
    appCtx.updateTerrainAround?.(0, 0);
    return true;
  }

  const reason = String(state?.reason || 'accepted-ground-unavailable');
  Object.assign(runtimeState, {
    status: 'blocked',
    reason,
    acceptedGround: state || null,
    updatedAt: performance.now(),
    finishedAt: performance.now(),
    activePhases: []
  });
  appCtx.worldLoading = false;
  appCtx.initialEarthWorldReady = false;
  finalizePerfLoad(false, { reason, acceptedGround: state || null });
  appCtx.showLoad(
    `This location cannot open safely: accepted ground data is unavailable (${reason}).`,
    { hideSpinner: true, bold: true }
  );
  return false;
}
