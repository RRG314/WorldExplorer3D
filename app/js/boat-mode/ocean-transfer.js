import {getMaritimeCatalogEntry} from '../transport/maritime-catalog.js?v=1';
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

let transferPending = false;

function suspendBoatModeForOceanTransfer() {
  appCtx.boatDeck?.release();
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
  if(appCtx.sharedMarine?.active)return false; // Shared deployment is server-owned.
  if (transferPending) return false;
  if (!appCtx.boatMode?.active) return false;
  if (!canDiveBoatMode({ showNotice: options.showNotice !== false })) return false;
  if (typeof appCtx.startOceanMode !== 'function') return false;

  const geo = earthLocalToGeographic(appCtx.LOC, appCtx.SCALE, appCtx.boat.x, appCtx.boat.z);
  if (!Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lon)) {
    showBoatPrompt('Could not resolve water location for underwater entry', 'notice', promptDurationMs);
    return false;
  }

  // Capture before suspension clears the water authority. Keep rollback data
  // local to this transaction; a late load may not revive an abandoned region.
  const water = appCtx.boatMode.currentWater;
  const waveOffset = water?.source?.waveOffset || {};
  const launchWaveOffset = {x:appCtx.boat.x+(waveOffset.x||0),z:appCtx.boat.z+(waveOffset.z||0)};
  const priorTransfer = appCtx.boatMode.oceanTransferVessel;
  const origin = {lat:appCtx.LOC?.lat,lon:appCtx.LOC?.lon};
  const pose = {x:appCtx.boat.x,z:appCtx.boat.z,yaw:appCtx.boat.angle};
  const moored = !!appCtx.boatMode.moored, onDeck = !!appCtx.boatDeck?.active;
  const sameOrigin = () => appCtx.LOC?.lat === origin.lat && appCtx.LOC?.lon === origin.lon;
  const canRestore = () => sameOrigin() && !appCtx.boatMode.active && !appCtx.oceanMode?.active && (!appCtx.getEnv || appCtx.getEnv() === (appCtx.ENV?.EARTH || 'EARTH'));
  const vessel = Object.freeze({
    transportEntityId: String(appCtx.boatMode.transportEntityId || ''),
    transportCatalogId: String(appCtx.boatMode.transportCatalogId || 'marina-runabout'),
    condition: Number(appCtx.boatMode.condition ?? 1)
  });
  const launchDistance=(getMaritimeCatalogEntry(vessel.transportCatalogId).length||80)/2+12;
  transferPending = true;
  let started = false;
  try {
    captureEarthWorldSession();
    appCtx.boatMode.oceanTransferVessel = vessel;
    setPromptSignature('boat_to_submarine_transfer');
    showBoatPrompt('Diving underwater…', 'supported', promptDurationMs);
    suspendBoatModeForOceanTransfer();
    if (typeof appCtx.showTransitionLoad === 'function') await appCtx.showTransitionLoad('ocean', 700);
    if (!canRestore()) return false;
    started = !!await appCtx.startOceanMode({
      waveOffset: launchWaveOffset,
      parentVessel: vessel,
      isTransferCurrent: canRestore,
      launchSite: {lat:geo.lat,lon:geo.lon,name:appCtx.customLoc?.name || 'Open Water',region:'Underwater'},
      entry: {lat:geo.lat,lon:geo.lon,source:'mapped-boat-water',kind:'mapped-water-area'},
      submarinePose: {x:-Math.sin(pose.yaw||0)*launchDistance,y:-8.5,z:-Math.cos(pose.yaw||0)*launchDistance,yaw:Number.isFinite(pose.yaw)?pose.yaw:0}
    });
    return started;
  } catch (error) {
    console.warn('[BoatMode] submarine launch failed', error);
    return false;
  } finally {
    try { if (!started) {
      if (canRestore()) {
        const restored = startBoatMode({candidate:water,spawnX:pose.x,spawnZ:pose.z,yaw:pose.yaw,
          allowSynthetic:!!water?.source?.synthetic,waterKind:water?.waterKind,...vessel});
        if (restored) {appCtx.boatMode.moored=moored;if(onDeck)appCtx.boatDeck?.enter();}
        showBoatPrompt(restored?'Dive could not start. Returned to your vessel.':'Dive could not start. Use Travel to recover your vessel.','notice',promptDurationMs);
      }
      if (appCtx.boatMode.oceanTransferVessel === vessel) appCtx.boatMode.oceanTransferVessel = priorTransfer;
    }
    } catch {showBoatPrompt('The dive could not start. Your saved voyage is retained.','notice',promptDurationMs);}
    finally {transferPending = false;appCtx.updateControlsModeUI?.();}
  }
}

async function transferSubmarineToBoat(options = {}) {
  if(appCtx.sharedMarine?.active && options.source!=='shared-marine-authority')return false;
  if (transferPending) return false;
  if (!appCtx.oceanMode?.active) return false;
  if(appCtx.oceanMode.diver?.active){showBoatPrompt('Board the submarine or use Recover before switching to the surface boat.','notice',promptDurationMs);return false;}
  const launchSite = appCtx.oceanMode?.launchSite || {};
  const sub = appCtx.oceanMode?.submarine || {};
  if (!Number.isFinite(sub?.position?.x) || !Number.isFinite(sub?.position?.z) || !Number.isFinite(launchSite.lat) || !Number.isFinite(launchSite.lon)) {
    showBoatPrompt('Could not resolve submarine position for boat transfer', 'notice', promptDurationMs);
    return false;
  }
  appCtx.oceanVoyage?.checkpoint();
  const voyage=appCtx.oceanVoyage?.current;
  const {lat,lon} = voyage?.ship?.anchor || earthLocalToGeographic(launchSite, appCtx.SCALE, sub.position.x, sub.position.z);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const customName = `${launchSite.name || 'Ocean Site'} Surface`;
  const surfaceWaveOffset = voyage?.waveOffset || {x:sub.position.x+(appCtx.oceanMode?.waveOffset?.x||0),z:sub.position.z+(appCtx.oceanMode?.waveOffset?.z||0)};
  const surfaceYaw = voyage?.ship?.yaw ?? (Number.isFinite(sub.yaw)?sub.yaw:0);
  const transferVessel = appCtx.boatMode?.oceanTransferVessel || null;
  const candidate = buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean',surfaceY:.08,waveOffset:surfaceWaveOffset});
  if(!candidate){showBoatPrompt('Surface vessel unavailable. Your submarine remains here.','notice',promptDurationMs);return false;}
  const priorOrigin={lat:appCtx.LOC?.lat,lon:appCtx.LOC?.lon};
  const priorPose={x:sub.position.x,y:sub.position.y,z:sub.position.z,yaw:sub.yaw};
  const priorWave={...appCtx.oceanMode.waveOffset};
  let surfaced=false,originCommitted=false;
  const stillHere=()=>!appCtx.boatMode.active&&!appCtx.oceanMode.active&&(!appCtx.getEnv||appCtx.getEnv()===(appCtx.ENV?.EARTH||'EARTH'))&&(originCommitted?appCtx.LOC?.lat===lat&&appCtx.LOC?.lon===lon:appCtx.LOC?.lat===priorOrigin.lat&&appCtx.LOC?.lon===priorOrigin.lon);
  const customLatInput = document.getElementById('customLat');
  const customLonInput = document.getElementById('customLon');
  if (customLatInput) customLatInput.value = lat.toFixed(6);
  if (customLonInput) customLonInput.value = lon.toFixed(6);

  appCtx.setCustomLocation?.({ lat, lon, name: customName });

  setPromptSignature('submarine_transfer');
  showBoatPrompt(voyage?'Recovering submarine to its parent vessel…':'Switching from submarine to surface boat…', 'supported', promptDurationMs);

  transferPending = true;
  try {
    appCtx.exitCurrentEnvironmentSync?.(appCtx.ENV?.EARTH, { source: 'submarine_transfer' });
    appCtx.commitEnvironment?.(appCtx.ENV?.EARTH, { source: 'submarine_transfer' });
    if (typeof appCtx.showTransitionLoad === 'function') {
      await appCtx.showTransitionLoad('earth', 700);
    }
    if(!stillHere())return false;
    // A submarine surfaces into the modeled open-ocean patch, not a terrestrial
    // OSM scene. Waiting for a complete road/building/vegetation reload here
    // both delays control and can place land cover over the boat. The explicit
    // synthetic-water handoff below is the authority for this transition.
    // The accepted ocean launch site is now the Earth-local origin. Search
    // selection alone does not update LOC; keeping the previous origin made
    // the map and the next dive jump to the last terrestrial city.
    commitEarthLocationOrigin(appCtx, {lat, lon, name:customName});
    originCommitted=true;
    void appCtx.refreshWaterEnvironmentEvidence?.();
    const resolved = typeof appCtx.setTravelMode === 'function' ?
      appCtx.setTravelMode('boat', {
        source: options.source || 'submarine_transfer',
        force: true,
        emitTutorial: options.emitTutorial !== false,
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: surfaceYaw,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk',
        transportEntityId: transferVessel?.transportEntityId,
        transportCatalogId: transferVessel?.transportCatalogId || 'ocean-research-vessel',
        condition: transferVessel?.condition
      }) :
      startBoatMode({
        source: options.source || 'submarine_transfer',
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: surfaceYaw,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk',
        transportEntityId: transferVessel?.transportEntityId,
        transportCatalogId: transferVessel?.transportCatalogId || 'ocean-research-vessel',
        condition: transferVessel?.condition
      });
    surfaced = resolved === 'boat' || resolved === true;
    if (surfaced) {
      appCtx.boatMode.oceanTransferVessel = null;
      appCtx.boatMode.moored = !!voyage;
      appCtx.oceanVoyage?.surfaced();
      appCtx.resetMinimapView?.();
      appCtx.drawMinimap?.();
    }
    return surfaced;
  } catch (error) {
    console.warn('[BoatMode] submarine transfer failed', error);
    setPromptSignature('submarine_transfer_error');
    showBoatPrompt('Could not switch from submarine to surface boat here', 'notice', promptDurationMs);
    return false;
  } finally {
    try{if(!surfaced&&stillHere()){
      const restored=await appCtx.startOceanMode?.({launchSite:{...launchSite},entry:{lat:launchSite.lat,lon:launchSite.lon,source:'mapped-boat-water',kind:'mapped-water-area'},waveOffset:priorWave,submarinePose:priorPose,voyageResume:voyage,isTransferCurrent:stillHere});
      showBoatPrompt(restored?'Surface transfer failed. Returned to your submarine.':'Recovery could not finish. Resume your saved voyage from the location menu.','notice',promptDurationMs);
    }}catch{showBoatPrompt('Recovery could not finish. Your saved voyage is retained.','notice',promptDurationMs);}finally{transferPending=false;}
  }
}


  return { suspendBoatModeForOceanTransfer, transferBoatToSubmarine, transferSubmarineToBoat };
}
