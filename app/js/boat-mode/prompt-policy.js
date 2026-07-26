export function boatPromptBlockedBySubgradeTravel(appCtx) {
  if (!appCtx || appCtx.boatMode?.active || appCtx.oceanMode?.active || appCtx.droneMode) return false;
  if (appCtx.tunnelWaterOcclusionActive === true) return true;
  const drivingSubgrade = appCtx.car?.road?.structureSemantics?.terrainMode === 'subgrade';
  const walkingRoad = appCtx.Walk?.state?.walker?.road;
  const walkingSubgrade =
    appCtx.Walk?.state?.mode === 'walk' &&
    walkingRoad?.structureSemantics?.terrainMode === 'subgrade';
  return drivingSubgrade || walkingSubgrade;
}
