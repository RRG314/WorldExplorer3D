function resolveCustomLocationArrival(deps, mode = 'walk', options = {}) {
  const {
    appCtx,
    applyResolvedWorldSpawn,
    applySpawnTarget,
    featuredArrivalNear,
    findGradeSeparatedRoadAt,
    isSubgradeArrival,
    resolveSafeWorldSpawn,
    searchNearestSafeRoadSpawn,
    tryAutoEnterBoatAt
  } = deps;
  const arrival = featuredArrivalNear(appCtx.LOC);
  if (arrival) {
    const viewpoint = appCtx.geoToWorld(arrival.viewpoint.lat, arrival.viewpoint.lon);
    const lookAt = appCtx.geoToWorld(arrival.lookAt.lat, arrival.lookAt.lon);
    const angle = Math.atan2(lookAt.x - viewpoint.x, lookAt.z - viewpoint.z);
    const resolved = resolveSafeWorldSpawn(viewpoint.x, viewpoint.z, {
      ...options,
      angle,
      mode,
      preferRoad: false,
      maxGroundRadius: 96,
      maxRoadDistance: 160,
      source: 'featured_landmark_arrival'
    });
    if (resolved) resolved.angle = Math.atan2(lookAt.x - resolved.x, lookAt.z - resolved.z);
    return applyResolvedWorldSpawn(resolved, options);
  }

  const exactRoad = findGradeSeparatedRoadAt(0, 0);
  const structureMode = exactRoad?.road?.structureSemantics?.terrainMode || 'at_grade';
  const roadHalfWidth = Math.max(2, Number(exactRoad?.road?.width || 0) * 0.5 + 1);
  // Preserve a bridge deck at the selected coordinates. A tunnel arrival is
  // redirected to a safe surface so entry happens through a mapped portal.
  const structureFeetY =
    structureMode === 'elevated' &&
    exactRoad?.dist <= roadHalfWidth &&
    Number.isFinite(exactRoad?.y)
      ? exactRoad.y
      : null;
  if (Number.isFinite(structureFeetY)) {
    return applySpawnTarget(exactRoad.x, exactRoad.z, {
      ...options,
      mode,
      feetY: structureFeetY,
      preferRoad: true,
      preserveElevatedSurface: true,
      source: options.source || 'custom_structure'
    });
  }

  const verifiedOcean = appCtx.worldLoadRuntimeState?.surfaceDomain?.kind === 'ocean';
  if (!verifiedOcean && Array.isArray(appCtx.roads) && appCtx.roads.length > 0) {
    const mappedWalkApproach = mode === 'walk'
      ? searchNearestSafeRoadSpawn(0, 0, {
          mode: 'walk',
          angle: appCtx.Walk?.state?.walker?.angle,
          maxDistance: 160
        })
      : null;
    if (
      mappedWalkApproach?.valid &&
      Math.hypot(mappedWalkApproach.x, mappedWalkApproach.z) <= 160 &&
      !isSubgradeArrival(mappedWalkApproach)
    ) {
      mappedWalkApproach.source = options.source || 'custom_mapped_walk_approach';
      return applyResolvedWorldSpawn(mappedWalkApproach, options);
    }
    const landApproach = resolveSafeWorldSpawn(exactRoad?.x || 0, exactRoad?.z || 0, {
      ...options,
      mode,
      preferRoad: mode === 'drive',
      source: options.source || 'custom_land_approach'
    });
    if (landApproach?.valid && !isSubgradeArrival(landApproach)) {
      return applyResolvedWorldSpawn(landApproach, options);
    }
  }

  const boatSpawn = tryAutoEnterBoatAt(0, 0, {
    ...options,
    mode,
    source: options.source || 'custom_location'
  });
  if (boatSpawn) return boatSpawn;
  return applySpawnTarget(exactRoad?.x || 0, exactRoad?.z || 0, {
    ...options,
    mode,
    feetY: Number.isFinite(structureFeetY) ? structureFeetY : options.feetY,
    preferRoad: mode === 'drive' || Number.isFinite(structureFeetY)
  });
}

export { resolveCustomLocationArrival };
