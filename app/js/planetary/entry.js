import { ctx as appCtx } from '../shared-context.js?v=55';
import { ENV, getEnv } from '../env.js?v=58';
import { commitEnvironment, exitCurrentEnvironmentSync } from '../session-coordinator.js?v=2';

export function hidePlanetaryReturnControls() {
  appCtx.hideReturnToEarthButton?.();
  const marsReturn = document.getElementById('marsReturnEarthBtn');
  if (marsReturn) marsReturn.style.display = 'none';
}

export function suspendEarthModesForPlanetaryEntry(targetEnvironment = ENV.EARTH) {
  appCtx.cancelPendingEarthArrival?.();
  exitCurrentEnvironmentSync(targetEnvironment, { source: 'planetary_entry' });
  if (targetEnvironment !== ENV.EARTH) appCtx.setEarthSceneVisible?.(false);
  hidePlanetaryReturnControls();
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

  exitCurrentEnvironmentSync(ENV.EARTH, { source: 'title_environment' });
  if (appCtx.boatMode?.active) appCtx.stopBoatMode?.({ targetMode: 'walk' });
  if (appCtx.planeMode?.active) appCtx.stopPlaneMode?.();
  appCtx.pendingAutoBoatEntry = null;

  hideSurface(appCtx.moonSurface);
  (window._moonObjects || []).forEach(hideSurface);
  hideSurface(appCtx.marsSurface);
  (appCtx.marsObjects || []).forEach(hideSurface);
  appCtx.setLunarEarthVisible?.(false);
  appCtx.setEarthSceneVisible?.(true);

  if (getEnv() !== ENV.EARTH) {
    commitEnvironment(ENV.EARTH, { source: 'title_environment' });
  }
  void appCtx.setPlanetaryVehicle?.('earth');
  appCtx.setPlanetaryCharacter?.('earth');
  appCtx.clearPauseReasons?.();

  return {
    previousEnv,
    env: getEnv(),
    spaceFlightActive: !!appCtx.spaceFlight?.active
  };
}

Object.assign(appCtx, { prepareTitleEnvironment });
