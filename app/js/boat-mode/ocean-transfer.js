import { commitEarthLocationOrigin, earthLocalToGeographic } from '../earth-core/location-origin.js?v=1';
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
    updateBoatMenuUi,
    updateWaterWaveVisuals,
    restoreEarthSurfaceLayers
  } = options;

function suspendBoatModeForOceanTransfer() {
  appCtx.boatMode.active = false;
  restoreEarthSurfaceLayers?.();
  appCtx.boatMode.available = false;
  appCtx.boatMode.candidate = null;
  appCtx.boatMode.currentWater = null;
  appCtx.boatMode.shorelineDistance = 0;
  appCtx.boatMode.offshoreDistance = 0;
  resetBoatDynamics();
  resetBoatFoamFx();
  if (appCtx.boatMode.mesh) appCtx.boatMode.mesh.visible = false;
  if (appCtx.boatMode.waterPatch) appCtx.boatMode.waterPatch.visible = false;
  updateWaterWaveVisuals();
  updateBoatMenuUi();
  hideBoatPrompt();
}

async function transferBoatToSubmarine(options = {}) {
  if (!appCtx.boatMode?.active) return false;
  if (!canDiveBoatMode({ showNotice: options.showNotice !== false })) return false;
  if (typeof appCtx.startOceanMode !== 'function') return false;

  const geo = earthLocalToGeographic(appCtx.LOC, appCtx.SCALE, appCtx.boat.x, appCtx.boat.z);
  if (!Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lon)) {
    showBoatPrompt('Could not resolve water location for underwater entry', 'notice', promptDurationMs);
    return false;
  }

  captureEarthWorldSession();
  appCtx.boatMode.oceanTransferVessel = Object.freeze({
    transportEntityId: String(appCtx.boatMode.transportEntityId || ''),
    transportCatalogId: String(appCtx.boatMode.transportCatalogId || 'marina-runabout'),
    condition: Number(appCtx.boatMode.condition ?? 1)
  });
  setPromptSignature('boat_to_submarine_transfer');
  showBoatPrompt('Diving underwater…', 'supported', promptDurationMs);

  suspendBoatModeForOceanTransfer();
  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('ocean', 700);
  }

  const waveOffset=appCtx.boatMode.currentWater?.source?.waveOffset || {};
  const started = await appCtx.startOceanMode({
    waveOffset:{x:appCtx.boat.x+(waveOffset.x||0),z:appCtx.boat.z+(waveOffset.z||0)},
    launchSite: {
      lat: geo.lat,
      lon: geo.lon,
      name: appCtx.customLoc?.name || 'Open Water',
      region: 'Underwater'
    },
    // canDiveBoatMode already checked the mapped area and offshore clearance.
    entry: { lat: geo.lat, lon: geo.lon, source: 'mapped-boat-water', kind: 'mapped-water-area' },
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
  if(appCtx.oceanMode.diver?.active){showBoatPrompt('Board the submarine or use Recover before switching to the surface boat.','notice',promptDurationMs);return false;}
  const launchSite = appCtx.oceanMode?.launchSite || {};
  const sub = appCtx.oceanMode?.submarine || {};
  if (!Number.isFinite(sub?.position?.x) || !Number.isFinite(sub?.position?.z) || !Number.isFinite(launchSite.lat) || !Number.isFinite(launchSite.lon)) {
    showBoatPrompt('Could not resolve submarine position for boat transfer', 'notice', promptDurationMs);
    return false;
  }
  const {lat,lon} = earthLocalToGeographic(launchSite, appCtx.SCALE, sub.position.x, sub.position.z);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const customName = `${launchSite.name || 'Ocean Site'} Surface`;
  const transferVessel = appCtx.boatMode?.oceanTransferVessel || null;
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
    // A submarine surfaces into the modeled open-ocean patch, not a terrestrial
    // OSM scene. Waiting for a complete road/building/vegetation reload here
    // both delays control and can place land cover over the boat. The explicit
    // synthetic-water handoff below is the authority for this transition.
    // The accepted ocean launch site is now the Earth-local origin. Search
    // selection alone does not update LOC; keeping the previous origin made
    // the map and the next dive jump to the last terrestrial city.
    commitEarthLocationOrigin(appCtx, {lat, lon, name:customName});
    void appCtx.refreshWaterEnvironmentEvidence?.();
    const candidate = buildSyntheticBoatCandidate(0, 0, {waterKind:'open_ocean', surfaceY:0.08, waveOffset:{x:sub.position.x+(appCtx.oceanMode?.waveOffset?.x||0),z:sub.position.z+(appCtx.oceanMode?.waveOffset?.z||0)}});
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
        entryMode: 'walk',
        transportEntityId: transferVessel?.transportEntityId,
        transportCatalogId: transferVessel?.transportCatalogId,
        condition: transferVessel?.condition
      }) :
      startBoatMode({
        source: options.source || 'submarine_transfer',
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: Number.isFinite(sub.yaw) ? sub.yaw : 0,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk',
        transportEntityId: transferVessel?.transportEntityId,
        transportCatalogId: transferVessel?.transportCatalogId,
        condition: transferVessel?.condition
      });
    const surfaced = resolved === 'boat' || resolved === true;
    if (surfaced) {
      appCtx.boatMode.oceanTransferVessel = null;
      appCtx.resetMinimapView?.();
      appCtx.drawMinimap?.();
    }
    return surfaced;
  } catch (error) {
    console.warn('[BoatMode] submarine transfer failed', error);
    setPromptSignature('submarine_transfer_error');
    showBoatPrompt('Could not switch from submarine to surface boat here', 'notice', promptDurationMs);
    return false;
  }
}


  return { suspendBoatModeForOceanTransfer, transferBoatToSubmarine, transferSubmarineToBoat };
}
