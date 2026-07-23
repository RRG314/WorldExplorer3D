function restoreWorldRuntimeAfterRollback(appCtx, options = {}) {
  if (!appCtx || options.reason === 'superseded') return false;
  const clearBuildingSpatialIndex = typeof options.clearBuildingSpatialIndex === 'function'
    ? options.clearBuildingSpatialIndex
    : () => {};
  const addBuildingToSpatialIndex = typeof options.addBuildingToSpatialIndex === 'function'
    ? options.addBuildingToSpatialIndex
    : null;
  const invalidateTraversalNetworks = typeof options.invalidateTraversalNetworks === 'function'
    ? options.invalidateTraversalNetworks
    : () => {};

  clearBuildingSpatialIndex();
  if (addBuildingToSpatialIndex) appCtx.buildings?.forEach?.(addBuildingToSpatialIndex);
  invalidateTraversalNetworks('world_load_rollback');
  appCtx.invalidateRoadCache?.();
  appCtx.refreshMemoryMarkersForCurrentLocation?.();
  appCtx.refreshBlockBuilderForCurrentLocation?.();
  appCtx.refreshAstronomicalSky?.(true);
  appCtx.refreshLiveWeather?.(true);
  return true;
}

export { restoreWorldRuntimeAfterRollback };
