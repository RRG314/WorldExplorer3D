export function bindSpaceActions(appCtx, closeAllFloatMenus) {
  document.getElementById('fDeployPathfinder')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    const { stageEarthPathfinder } = await import('../expedition/runtime.js?v=45');
    stageEarthPathfinder(appCtx);
  });
  document.getElementById('fBoardSolisReach')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    const { boardSolisReachDirect } = await import('../expedition/runtime.js?v=45');
    if (!await boardSolisReachDirect(appCtx)) appCtx.showToast?.('Direct Solis Reach boarding is unavailable from here.');
  });
  document.getElementById('fSpaceDirect')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    try {
      // Fast-travel authority is installed with the on-demand space runtime.
      // A fresh Earth session must load that authority before dispatching the
      // trip, otherwise the first press only changes the placeholder target.
      await appCtx.ensureSpaceRuntime?.();
      if (appCtx.onMars) await appCtx.startFastTravelJourney?.('earth', { sourceBodyId: 'mars' });
      else if (appCtx.onMoon) await appCtx.startFastTravelJourney?.('earth', { sourceBodyId: 'moon' });
      else if (!appCtx.travelingToMoon) await appCtx.startFastTravelJourney?.('moon', { sourceBodyId: 'earth' });
    } catch (error) {
      console.error('[space-travel] Direct trip could not start.', error);
      appCtx.showToast?.('The direct space trip is unavailable right now.');
    }
  });

  document.getElementById('fSpaceRocket')?.addEventListener('click', () => {
    if (appCtx.onMoon || appCtx.onMars) appCtx.returnToEarth?.();
    else if (!appCtx.travelingToMoon) appCtx.startFreeSpaceFlight?.();
    closeAllFloatMenus();
  });
}
