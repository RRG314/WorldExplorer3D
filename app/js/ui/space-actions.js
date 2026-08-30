export function bindSpaceActions(appCtx, closeAllFloatMenus) {
  document.getElementById('fSpaceDirect')?.addEventListener('click', () => {
    if (appCtx.onMars) appCtx.startFastTravelJourney?.('earth', { sourceBodyId: 'mars' });
    else if (appCtx.onMoon) appCtx.startFastTravelJourney?.('earth', { sourceBodyId: 'moon' });
    else if (!appCtx.travelingToMoon) appCtx.startFastTravelJourney?.('moon', { sourceBodyId: 'earth' });
    closeAllFloatMenus();
  });

  document.getElementById('fSpaceRocket')?.addEventListener('click', () => {
    if (appCtx.onMars) {
      appCtx.returnFromMars?.();
    } else if (appCtx.onMoon) {
      appCtx.returnToEarth?.();
    } else if (!appCtx.travelingToMoon) {
      appCtx.travelToMoon?.();
    }
    closeAllFloatMenus();
  });

  document.getElementById('fSpaceMars')?.addEventListener('click', () => {
    if (appCtx.onMars) appCtx.returnFromMars?.();
    else if (!appCtx.travelingToMoon) appCtx.startSpaceFlightToMars?.();
    closeAllFloatMenus();
  });
}
