import { ctx as appCtx } from '../shared-context.js?v=55';

export function hidePlanetaryReturnControls() {
  appCtx.hideReturnToEarthButton?.();
  const marsReturn = document.getElementById('marsReturnEarthBtn');
  if (marsReturn) marsReturn.style.display = 'none';
}

export function suspendEarthModesForPlanetaryEntry() {
  appCtx.cancelPendingEarthArrival?.();
  hidePlanetaryReturnControls();
  if (appCtx.oceanMode?.active && typeof appCtx.stopOceanMode === 'function') {
    appCtx.stopOceanMode();
  }
  if (appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    appCtx.stopBoatMode({ targetMode: 'drive' });
  }

  ['boatPrompt', 'boatWaveDock', 'interiorPrompt'].forEach((id) => {
    document.getElementById(id)?.classList.remove('show');
  });
}
