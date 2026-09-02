export function bindSpaceActions(appCtx, closeAllFloatMenus) {
  document.getElementById('fSpaceSurveyor')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    const { stageEarthPodToSurveyor } = await import('../expedition/runtime.js?v=40');
    stageEarthPodToSurveyor(appCtx);
  });
  document.getElementById('fSpaceBoardSurveyor')?.addEventListener('click', async () => {
    closeAllFloatMenus();
    const { boardSurveyorDirect } = await import('../expedition/runtime.js?v=40');
    if (!await boardSurveyorDirect(appCtx)) appCtx.showToast?.('Direct Solis Reach boarding is unavailable from here.');
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
