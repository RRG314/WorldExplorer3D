import {getMaritimeCatalogEntry} from '../transport/maritime-catalog.js?v=1';
import {submarineDeploymentAdmission} from '../transport/maritime-admission.js';
export function createBoatModePolicy(options = {}) {
  const { appCtx, exitMaxShorelineDrive, exitMaxShorelineWalk, minimumBoatShorelineDistance, promptDurationMs, setPromptSignature, showBoatPrompt, updateBoatMenuUi } = options;

function canExitBoatMode(targetMode = 'walk', options = {}) {
  if (!appCtx.boatMode?.active) return true;
  if (options.source !== 'boat_prompt_exit') {
    if (options.showNotice !== false) {
      setPromptSignature(`blocked_mode_switch:${targetMode}`);
      showBoatPrompt('Stay with the vessel on open water • Use Exit Vessel near shore', 'notice', promptDurationMs);
    }
    updateBoatMenuUi();
    return false;
  }
  const maxShoreline = targetMode === 'drive' ? exitMaxShorelineDrive : exitMaxShorelineWalk;
  const shoreline = Number(appCtx.boatMode?.shorelineDistance || 0);
  if (Number.isFinite(shoreline) && shoreline <= maxShoreline) return true;
  if (options.showNotice !== false) {
    setPromptSignature(`blocked_exit:${targetMode}`);
    showBoatPrompt('Move closer to shore before leaving the vessel', 'notice', promptDurationMs);
  }
  updateBoatMenuUi();
  return false;
}

function canDiveBoatMode(options = {}) {
  if (!appCtx.boatMode?.active) return false;
  const currentWater = appCtx.boatMode.currentWater || appCtx.boatMode.candidate || null;
  const waterKind = String(currentWater?.waterKind || '').toLowerCase();
  const shoreline = Number(appCtx.boatMode?.shorelineDistance || currentWater?.shorelineDistance || 0);
  const minimumDiveDistance = minimumBoatShorelineDistance(waterKind) + (
    waterKind === 'open_ocean' ? 14 :
    waterKind === 'coastal' ? 10 :
    waterKind === 'lake' ? 8 :
    6
  );
  const decision = submarineDeploymentAdmission({
    catalog:getMaritimeCatalogEntry(appCtx.boatMode.transportCatalogId),
    speedMetersPerSecond:Math.hypot(appCtx.boat?.vx||0,appCtx.boat?.vz||0,appCtx.boat?.speed||0)*(appCtx.METERS_PER_WORLD_UNIT||1),
    waterKind,waterType:currentWater?.type,shorelineDistance:shoreline,requiredShorelineDistance:minimumDiveDistance
  });
  const diveEligible = decision.allowed;

  if (!diveEligible && options.showNotice !== false) {
    setPromptSignature('blocked_dive');
    showBoatPrompt(decision.reason, 'notice', promptDurationMs);
  }
  return diveEligible;
}


  return { canDiveBoatMode, canExitBoatMode };
}
