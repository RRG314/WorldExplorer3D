export function updateAlternateTravelMode(appCtx, dt, options = {}) {
  const { isPlanetarySurface, updateDrone, updatePlane } = options;

  if (appCtx.boatMode?.active) {
    appCtx.updateBoatMode?.(dt);
    appCtx.updateFishingGame?.(dt);
    appCtx.updateMode?.(dt);
    return true;
  }

  if (appCtx.fishingGame?.open || appCtx.fishingGame?.active) {
    appCtx.updateFishingGame?.(dt);
  }

  if (appCtx.planeMode?.active) {
    updatePlane(dt);
    appCtx.updateMode?.(dt);
    appCtx.updateInteriorInteraction?.();
    return true;
  }

  if (appCtx.droneMode) {
    updateDrone(dt);
    appCtx.updateMode?.(dt);
    appCtx.updateInteriorInteraction?.();
    if (!isPlanetarySurface() && !appCtx.worldLoading) {
      appCtx.updateTerrainAround(appCtx.drone.x, appCtx.drone.z);
    }
    return true;
  }

  if (!appCtx.Walk) return false;
  appCtx.Walk.update(dt);
  if (appCtx.Walk.state.mode !== 'walk') return false;

  if (appCtx.isRecording && appCtx.customTrack.length > 0) {
    const lastPoint = appCtx.customTrack[appCtx.customTrack.length - 1];
    const distance = Math.hypot(
      appCtx.Walk.state.walker.x - lastPoint.x,
      appCtx.Walk.state.walker.z - lastPoint.z
    );
    if (distance > 5) appCtx.customTrack.push({ x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z });
  } else if (appCtx.isRecording) {
    appCtx.customTrack.push({ x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z });
  }

  appCtx.police.forEach((officer) => {
    const distance = Math.hypot(
      appCtx.Walk.state.walker.x - officer.x,
      appCtx.Walk.state.walker.z - officer.z
    );
    if (distance >= 15 || officer.caught) return;
    officer.caught = true;
    appCtx.policeHits++;
    const policeHud = document.getElementById('police');
    if (policeHud) {
      policeHud.textContent = `💔 ${appCtx.policeHits}/3`;
      policeHud.classList.add('warn');
    }
    if (appCtx.policeHits >= 3) {
      appCtx.setPauseReason?.('caught', true);
      document.getElementById('caughtScreen')?.classList.add('show');
    }
  });

  appCtx.updateMode?.(dt);
  appCtx.updateInteriorInteraction?.();
  return true;
}
