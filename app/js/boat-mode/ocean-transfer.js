export function createBoatOceanTransferApi(options = {}) {
  const {
    appCtx,
    buildSyntheticBoatCandidate,
    canDiveBoatMode,
    captureEarthWorldSession,
    findNearestBoatCandidate,
    hideBoatPrompt,
    maxCandidateDistance,
    promptDurationMs,
    resetBoatDynamics,
    resetBoatFoamFx,
    setPromptSignature,
    showBoatPrompt,
    startBoatMode,
    syncBoatTerrainSuppression,
    updateBoatMenuUi,
    updateWaterWaveVisuals
  } = options;

function suspendBoatModeForOceanTransfer() {
  appCtx.boatMode.active = false;
  appCtx.boatMode.available = false;
  appCtx.boatMode.candidate = null;
  appCtx.boatMode.currentWater = null;
  appCtx.boatMode.shorelineDistance = 0;
  appCtx.boatMode.offshoreDistance = 0;
  resetBoatDynamics();
  resetBoatFoamFx();
  if (appCtx.boatMode.mesh) appCtx.boatMode.mesh.visible = false;
  if (appCtx.boatMode.waterPatch) appCtx.boatMode.waterPatch.visible = false;
  if (appCtx.boatMode.oceanHorizonPatch) appCtx.boatMode.oceanHorizonPatch.visible = false;
  syncBoatTerrainSuppression();
  updateWaterWaveVisuals();
  updateBoatMenuUi();
  hideBoatPrompt();
}

async function transferBoatToSubmarine(options = {}) {
  if (!appCtx.boatMode?.active) return false;
  if (!canDiveBoatMode({ showNotice: options.showNotice !== false })) return false;
  if (typeof appCtx.worldToLatLon !== 'function' || typeof appCtx.startOceanMode !== 'function') return false;

  const geo = appCtx.worldToLatLon(appCtx.boat.x, appCtx.boat.z);
  if (!Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lon)) {
    showBoatPrompt('Could not resolve water location for underwater entry', 'notice', promptDurationMs);
    return false;
  }

  captureEarthWorldSession();
  setPromptSignature('boat_to_submarine_transfer');
  showBoatPrompt('Diving underwater…', 'supported', promptDurationMs);

  suspendBoatModeForOceanTransfer();
  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('ocean', 700);
  }

  const started = appCtx.startOceanMode({
    launchSite: {
      lat: geo.lat,
      lon: geo.lon,
      name: appCtx.customLoc?.name || 'Open Water',
      region: 'Underwater'
    },
    submarinePose: {
      x: 0,
      y: -8.5,
      z: 24,
      yaw: Number.isFinite(appCtx.boat?.angle) ? appCtx.boat.angle : 0
    }
  });
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  return !!started;
}

async function transferSubmarineToBoat(options = {}) {
  if (!appCtx.oceanMode?.active) return false;
  const launchSite = appCtx.oceanMode?.launchSite || {};
  const sub = appCtx.oceanMode?.submarine || {};
  if (!Number.isFinite(sub?.position?.x) || !Number.isFinite(sub?.position?.z) || !Number.isFinite(launchSite.lat) || !Number.isFinite(launchSite.lon)) {
    showBoatPrompt('Could not resolve submarine position for boat transfer', 'notice', promptDurationMs);
    return false;
  }
  const lonDenom = appCtx.SCALE * Math.cos(launchSite.lat * Math.PI / 180);
  const lat = launchSite.lat - sub.position.z / appCtx.SCALE;
  const lon = launchSite.lon + sub.position.x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE);
  const customName = `${launchSite.name || 'Ocean Site'} Surface`;
  const customLatInput = document.getElementById('customLat');
  const customLonInput = document.getElementById('customLon');
  if (customLatInput) customLatInput.value = lat.toFixed(6);
  if (customLonInput) customLonInput.value = lon.toFixed(6);

  appCtx.setCustomLocation?.({ lat, lon, name: customName });

  setPromptSignature('submarine_transfer');
  showBoatPrompt('Switching from submarine to surface boat…', 'supported', promptDurationMs);

  try {
    appCtx.exitCurrentEnvironmentSync?.(appCtx.ENV?.EARTH, { source: 'submarine_transfer' });
    appCtx.commitEnvironment?.(appCtx.ENV?.EARTH, { source: 'submarine_transfer' });
    if (typeof appCtx.showTransitionLoad === 'function') {
      await appCtx.showTransitionLoad('earth', 700);
    }
    if (typeof appCtx.loadRoads === 'function') {
      await appCtx.loadRoads();
    }
    if (typeof appCtx.applyCustomLocationSpawn === 'function') {
      appCtx.applyCustomLocationSpawn('walk', {
        source: 'submarine_transfer_spawn',
        preferBoatIfWater: true,
        allowSyntheticWater: true,
        waterKind: 'open_ocean'
      });
    }
    if (appCtx.boatMode?.active) {
      if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
      return true;
    }
    const candidate =
      findNearestBoatCandidate(0, 0, maxCandidateDistance * 2.2, {
        allowSynthetic: true,
        waterKind: 'open_ocean'
      }) ||
      buildSyntheticBoatCandidate(0, 0, { waterKind: 'open_ocean' });
    if (!candidate) {
      showBoatPrompt('No surface boat spawn was available here', 'notice', promptDurationMs);
      return false;
    }
    const resolved = typeof appCtx.setTravelMode === 'function' ?
      appCtx.setTravelMode('boat', {
        source: options.source || 'submarine_transfer',
        force: true,
        emitTutorial: options.emitTutorial !== false,
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: Number.isFinite(sub.yaw) ? sub.yaw : 0,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk'
      }) :
      startBoatMode({
        source: options.source || 'submarine_transfer',
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: Number.isFinite(sub.yaw) ? sub.yaw : 0,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk'
      });
    return resolved === 'boat' || resolved === true;
  } catch (error) {
    console.warn('[BoatMode] submarine transfer failed', error);
    setPromptSignature('submarine_transfer_error');
    showBoatPrompt('Could not switch from submarine to surface boat here', 'notice', promptDurationMs);
    return false;
  }
}


  return { suspendBoatModeForOceanTransfer, transferBoatToSubmarine, transferSubmarineToBoat };
}
