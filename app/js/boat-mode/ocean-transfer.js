import {parentVesselSubmarinePose} from '../ocean/parent-vessel.js';
import {DEFAULT_OCEAN_SITE} from '../ocean/launch-site.js';
import {hasOceanEntry} from '../ocean/entry-policy.js?v=1';
import {ensureOceanVoyage,prepareSurfaceVoyage} from '../ocean/voyage.js';
import { commitEarthLocationOrigin, earthLocalToGeographic } from '../earth-core/location-origin.js?v=1';
export function createBoatOceanTransferApi(options = {}) {
  const {
    appCtx,
    buildSyntheticBoatCandidate,
    canDiveBoatMode,
    captureEarthWorldSession,
    captureEnvironmentSession,
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

function startSurfaceResearchVoyage(options={}) {
  if(transferPending||appCtx.sharedMarine?.active||options.isTransferCurrent?.()===false)return Promise.resolve(false);
  const site=options.launchSite||DEFAULT_OCEAN_SITE;
  if(options.launchSite&&!hasOceanEntry(site,options.entry))return Promise.resolve(false);
  const voyage=prepareSurfaceVoyage(site,options.waveOffset);
  if(!voyage)return Promise.resolve(false);
  // Admission and record preparation precede any environment or save mutation.
  return transferSubmarineToBoat({...options,source:'ocean-exploration-start',enterDeck:true},voyage);
}

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
  if (options.asDiver && (!appCtx.boatDeck?.atDivePlatform() || Math.hypot(appCtx.boat.vx||0,appCtx.boat.vz||0,appCtx.boat.speed||0)*(appCtx.METERS_PER_WORLD_UNIT||1)>.5)) return false;
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
    condition: Number(appCtx.boatMode.condition ?? 1),
    yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0
  });
  transferPending = true;
  let started = false;
  try {
    captureEarthWorldSession();
    appCtx.boatMode.oceanTransferVessel = vessel;
    setPromptSignature('boat_to_submarine_transfer');
    showBoatPrompt('Diving underwater…', 'supported', promptDurationMs);
    suspendBoatModeForOceanTransfer();
    if (!options.asDiver && typeof appCtx.showTransitionLoad === 'function') await appCtx.showTransitionLoad('ocean', 700);
    if (!canRestore()) return false;
    started = !!await appCtx.startOceanMode({
      waveOffset: launchWaveOffset,
      parentVessel: vessel,
      diverEntry: options.asDiver ? {from:'parent-vessel',jump:options.jump===true} : null,
      isTransferCurrent: canRestore,
      launchSite: {lat:geo.lat,lon:geo.lon,name:appCtx.customLoc?.name || 'Open Water',region:'Underwater'},
      entry: {lat:geo.lat,lon:geo.lon,source:'mapped-boat-water',kind:'mapped-water-area'},
      submarinePose: parentVesselSubmarinePose(vessel)
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

async function transferSubmarineToBoat(options = {},surfaceVoyage=null) {
  if(options.isTransferCurrent?.()===false)return false;
  if(appCtx.sharedMarine?.active && options.source!=='shared-marine-authority')return false;
  if (transferPending) return false;
  const wasUnderwater=!!appCtx.oceanMode?.active;
  if (!wasUnderwater&&!surfaceVoyage) return false;
  if(appCtx.oceanMode.diver?.active){showBoatPrompt('Board the submarine or use Recover before switching to the surface boat.','notice',promptDurationMs);return false;}
  const launchSite = surfaceVoyage?.site || appCtx.oceanMode?.launchSite || {};
  const sub = appCtx.oceanMode?.submarine || {};
  if ((!surfaceVoyage&&(!Number.isFinite(sub?.position?.x)||!Number.isFinite(sub?.position?.z))) || !Number.isFinite(launchSite.lat) || !Number.isFinite(launchSite.lon)) {
    showBoatPrompt('Could not resolve submarine position for boat transfer', 'notice', promptDurationMs);
    return false;
  }
  if(wasUnderwater)appCtx.oceanVoyage?.checkpoint();
  const voyage=surfaceVoyage||appCtx.oceanVoyage?.current;
  const {lat,lon} = voyage?.ship?.anchor || earthLocalToGeographic(launchSite, appCtx.SCALE, sub.position.x, sub.position.z);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const customName = String(launchSite.name || 'Ocean Site').replace(/(?: Surface)+$/, '');
  const surfaceWaveOffset = voyage?.waveOffset || {x:sub.position.x+(appCtx.oceanMode?.waveOffset?.x||0),z:sub.position.z+(appCtx.oceanMode?.waveOffset?.z||0)};
  const surfaceYaw = voyage?.ship?.yaw ?? (Number.isFinite(sub.yaw)?sub.yaw:0);
  const transferVessel = surfaceVoyage?.ship || appCtx.boatMode?.oceanTransferVessel || null;
  const candidate = buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean',surfaceY:.08,waveOffset:surfaceWaveOffset});
  if(!candidate){showBoatPrompt('Surface vessel unavailable. Your submarine remains here.','notice',promptDurationMs);return false;}
  const priorOrigin={...appCtx.LOC},priorSelection=appCtx.customLoc?{...appCtx.customLoc}:null;
  const priorOceanSite={...appCtx.oceanMode?.launchSite},priorVoyage=appCtx.oceanVoyage?.current;
  const priorPose=wasUnderwater?{x:sub.position.x,y:sub.position.y,z:sub.position.z,yaw:sub.yaw}:null;
  const priorWave={...appCtx.oceanMode?.waveOffset};
  const priorBoat=appCtx.boatMode.active?{candidate:appCtx.boatMode.currentWater,spawnX:appCtx.boat.x,spawnZ:appCtx.boat.z,yaw:appCtx.boat.angle,transportEntityId:appCtx.boatMode.transportEntityId,transportCatalogId:appCtx.boatMode.transportCatalogId,condition:appCtx.boatMode.condition,moored:appCtx.boatMode.moored,onDeck:!!appCtx.boatDeck?.active}:null;
  let surfaced=false,originCommitted=false,session=null;
  const current=()=>options.isTransferCurrent?.()!==false&&(!session||session.isCurrent());
  const stillHere=()=>current()&&!appCtx.boatMode.active&&!appCtx.oceanMode?.active&&(!appCtx.getEnv||appCtx.getEnv()===(appCtx.ENV?.EARTH||'EARTH'))&&(originCommitted?appCtx.LOC?.lat===lat&&appCtx.LOC?.lon===lon:appCtx.LOC?.lat===priorOrigin.lat&&appCtx.LOC?.lon===priorOrigin.lon);
  const customLatInput = document.getElementById('customLat');
  const customLonInput = document.getElementById('customLon');
  if (customLatInput) customLatInput.value = lat.toFixed(6);
  if (customLonInput) customLonInput.value = lon.toFixed(6);

  setPromptSignature('submarine_transfer');
  showBoatPrompt(surfaceVoyage?'Preparing your research vessel…':voyage?'Recovering submarine to its parent vessel…':'Switching from submarine to surface boat…', 'supported', promptDurationMs);

  transferPending = true;
  try {
    if(surfaceVoyage){
      // Capture before rebasing the surface frame; this preserves the previous
      // location-based Earth visit for the existing return authority.
      captureEarthWorldSession();
      if(priorBoat)suspendBoatModeForOceanTransfer();
    }
    appCtx.exitCurrentEnvironmentSync?.(appCtx.ENV?.EARTH, { source: 'submarine_transfer' });
    appCtx.commitEnvironment?.(appCtx.ENV?.EARTH, { source: 'submarine_transfer' });
    session=captureEnvironmentSession?.();
    if (typeof appCtx.showTransitionLoad === 'function') {
      await appCtx.showTransitionLoad('earth', 700);
    }
    if(!stillHere())return false;
    appCtx.setCustomLocation?.({ lat, lon, name: customName });
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
        surfaceArrival: {lat,lon},
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
        surfaceArrival: {lat,lon},
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
      if(surfaceVoyage)ensureOceanVoyage(appCtx).beginAboard(surfaceVoyage);
      else appCtx.oceanVoyage?.surfaced();
      appCtx.resetMinimapView?.();
      appCtx.drawMinimap?.();
      if(options.enterDeck!==false && appCtx.boatMode.transportCatalogId==='ocean-research-vessel') {
        await appCtx.setPlanetaryCharacter?.('earth');
        if(current() && appCtx.boatMode.active && appCtx.boatMode.transportEntityId===(transferVessel?.transportEntityId||appCtx.boatMode.transportEntityId) && appCtx.LOC?.lat===lat && appCtx.LOC?.lon===lon) {
          if(!appCtx.boatDeck?.enter(true)) showBoatPrompt('Your vessel is ready. Choose Walk research deck when the explorer finishes loading.','notice',promptDurationMs);
        }
      }
    }
    return surfaced&&current();
  } catch (error) {
    console.warn('[BoatMode] submarine transfer failed', error);
    setPromptSignature('submarine_transfer_error');
    showBoatPrompt('Could not switch from submarine to surface boat here', 'notice', promptDurationMs);
    return false;
  } finally {
    try{if(!surfaced&&stillHere()){
      if(wasUnderwater){
        const restored=await appCtx.startOceanMode?.({launchSite:priorOceanSite,entry:{lat:priorOceanSite.lat,lon:priorOceanSite.lon,source:'mapped-boat-water',kind:'mapped-water-area'},waveOffset:priorWave,submarinePose:priorPose,voyageResume:priorVoyage,isTransferCurrent:stillHere});
        showBoatPrompt(restored?'Surface transfer failed. Returned to your submarine.':'Recovery could not finish. Resume your saved voyage from the location menu.','notice',promptDurationMs);
      }else{
        if(Number.isFinite(priorOrigin.lat)&&Number.isFinite(priorOrigin.lon))commitEarthLocationOrigin(appCtx,priorOrigin);
        if(priorSelection)appCtx.setCustomLocation?.(priorSelection);
        if(priorBoat&&startBoatMode({...priorBoat,allowSynthetic:!!priorBoat.candidate?.source?.synthetic})){appCtx.boatMode.moored=priorBoat.moored;if(priorBoat.onDeck)appCtx.boatDeck?.enter();}
        showBoatPrompt('The research vessel could not start. Your saved voyage is retained.','notice',promptDurationMs);
      }
    }}catch{showBoatPrompt('Recovery could not finish. Your saved voyage is retained.','notice',promptDurationMs);}finally{transferPending=false;}
  }
}


  return { suspendBoatModeForOceanTransfer, transferBoatToSubmarine, transferSubmarineToBoat, startSurfaceResearchVoyage };
}
