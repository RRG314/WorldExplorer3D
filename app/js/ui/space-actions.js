export function bindSpaceActions(appCtx, closeAllFloatMenus) {
  document.getElementById('fDeployPathfinder')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    const { stageEarthPathfinder } = await import('../expedition/runtime.js?v=42');
    stageEarthPathfinder(appCtx);
  });
  document.getElementById('fBoardSolisReach')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    const { boardSolisReachDirect } = await import('../expedition/runtime.js?v=42');
    if (!await boardSolisReachDirect(appCtx)) appCtx.showToast?.('Direct Solis Reach boarding is unavailable from here.');
  });
  document.getElementById('fSpaceDirect')?.addEventListener('click', () => {
    if (appCtx.onMars) appCtx.startFastTravelJourney?.('earth', { sourceBodyId: 'mars' });
    else if (appCtx.onMoon) appCtx.startFastTravelJourney?.('earth', { sourceBodyId: 'moon' });
    else if (!appCtx.travelingToMoon) appCtx.startFastTravelJourney?.('moon', { sourceBodyId: 'earth' });
    closeAllFloatMenus();
  });

  document.getElementById('fSpaceRocket')?.addEventListener('click', () => {
    if (appCtx.onMoon || appCtx.onMars) appCtx.returnToEarth?.();
    else if (!appCtx.travelingToMoon) appCtx.startFreeSpaceFlight?.();
    closeAllFloatMenus();
  });
}
