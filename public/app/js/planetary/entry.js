import { ctx as appCtx } from '../shared-context.js?v=55';
import { ENV, getEnv, switchEnv } from '../env.js?v=57';

export function hidePlanetaryReturnControls() {
  appCtx.hideReturnToEarthButton?.();
  const marsReturn = document.getElementById('marsReturnEarthBtn');
  if (marsReturn) marsReturn.style.display = 'none';
}

export function suspendEarthModesForPlanetaryEntry() {
  appCtx.cancelPendingEarthArrival?.();
  appCtx.pauseEarthStreaming?.('planetary_entry');
  hidePlanetaryReturnControls();
  if (appCtx.oceanMode?.active && typeof appCtx.stopOceanMode === 'function') {
    appCtx.stopOceanMode();
  }
  if (appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    appCtx.stopBoatMode({ targetMode: 'walk' });
  }
  if (appCtx.planeMode?.active) appCtx.stopPlaneMode?.();
  appCtx.pendingAutoBoatEntry = null;

  ['boatPrompt', 'boatWaveDock', 'interiorPrompt'].forEach((id) => {
    document.getElementById(id)?.classList.remove('show');
  });
}

function hideSurface(object) {
  if (!object) return;
  object.visible = false;
  if (object.parent === appCtx.scene) appCtx.scene.remove(object);
}

export function prepareTitleEnvironment() {
  const previousEnv = appCtx.getEnv?.() || null;
  appCtx.cancelPendingEarthArrival?.();
  appCtx.cancelPendingMarsTransition?.();
  hidePlanetaryReturnControls();

  if (appCtx.spaceFlight?.active) appCtx.exitSpaceFlight?.();
  if (appCtx.oceanMode?.active) appCtx.stopOceanMode?.();
  if (appCtx.boatMode?.active) appCtx.stopBoatMode?.({ targetMode: 'walk' });
  if (appCtx.planeMode?.active) appCtx.stopPlaneMode?.();
  appCtx.pendingAutoBoatEntry = null;

  hideSurface(appCtx.moonSurface);
  (window._moonObjects || []).forEach(hideSurface);
  hideSurface(appCtx.marsSurface);
  (appCtx.marsObjects || []).forEach(hideSurface);
  appCtx.prepareMarsTitleExit?.();
  appCtx.setLunarEarthVisible?.(false);
  appCtx.setEarthSceneVisible?.(true);

  if (getEnv() !== ENV.EARTH) {
    switchEnv(ENV.EARTH);
  }
  void appCtx.setPlanetaryVehicle?.('earth');
  appCtx.setPlanetaryCharacter?.('earth');
  appCtx.paused = false;

  return {
    previousEnv,
    env: getEnv(),
    spaceFlightActive: !!appCtx.spaceFlight?.active
  };
}

Object.assign(appCtx, { prepareTitleEnvironment });
