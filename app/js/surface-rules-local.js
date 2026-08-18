export function denseSettlementOwnsUrbanSurface({
  buildings = 0,
  roads = 0,
  greenLanduses = 0,
  urbanRatio = 0,
  grassRatio = 0,
  waterRatio = 0
} = {}) {
  const mappedBuildings = Number(buildings);
  const mappedRoads = Number(roads);
  const sampledUrbanRatio = Number(urbanRatio);
  const sampledGrassRatio = Number(grassRatio);
  const locallyUrban =
    mappedBuildings >= 20 &&
    mappedRoads >= 8 &&
    sampledUrbanRatio >= 0.28;
  // The 5x5 surface sampler can miss narrow footprints. Strong mapped density
  // still needs sampled hardscape, while exact green and water retain vetoes.
  const regionallyDense =
    mappedBuildings >= 100 &&
    mappedRoads >= 20 &&
    sampledUrbanRatio >= 0.05;
  const mappedGreenDominates =
    Number(greenLanduses) > 0 &&
    sampledGrassRatio > sampledUrbanRatio * 1.25;
  return !mappedGreenDominates &&
    (locallyUrban || regionallyDense) &&
    Number(waterRatio) < 0.45;
}

export function regionalBuildingTileOwnsUrbanSurface(buildingCount = 0) {
  // A z14 context tile is only a few hundred metres across. Eighteen mapped
  // footprints are sufficient settlement evidence for the otherwise
  // unclassified ground between them, while exact mapped green areas still
  // override this fallback in the far-field publisher.
  return Number(buildingCount) >= 18;
}

export function createLocalSurfaceAnalysisApi({ appCtx, constants }) {
  const {
    COASTAL_SAMPLE_PADDING_WORLD,
    EXPLICIT_SAND_SURFACE_TYPES,
    ROAD_SAMPLE_PADDING_WORLD,
    ROCKY_SURFACE_TYPES,
    SOIL_SURFACE_TYPES,
    TILE_SAMPLE_GRID,
    URBAN_SURFACE_TYPES,
    VEGETATED_SURFACE_TYPES
  } = constants;

  function pointInPolygonXZ(x, z, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const zi = polygon[i].z;
      const xj = polygon[j].x;
      const zj = polygon[j].z;
      const intersects = (zi > z) !== (zj > z) &&
        x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointToSegmentDistanceXZ(x, z, p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 1e-9) return Math.hypot(x - p1.x, z - p1.z);
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p1.x + dx * t;
    const pz = p1.z + dz * t;
    return Math.hypot(x - px, z - pz);
  }

  function boundsFromPoints(points = []) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      return null;
    }
    return { minX, maxX, minZ, maxZ };
  }

  function ensureRecordBounds(record) {
    if (!record || typeof record !== 'object') return null;
    if (
      Number.isFinite(record.minX) &&
      Number.isFinite(record.maxX) &&
      Number.isFinite(record.minZ) &&
      Number.isFinite(record.maxZ)
    ) {
      return { minX: record.minX, maxX: record.maxX, minZ: record.minZ, maxZ: record.maxZ };
    }
    if (record.bounds && Number.isFinite(record.bounds.minX)) return record.bounds;
    const points = Array.isArray(record.pts) ? record.pts : null;
    const bounds = boundsFromPoints(points || []);
    if (bounds) record.bounds = bounds;
    return bounds;
  }

  function boundsIntersect(a, b, padding = 0) {
    if (!a || !b) return false;
    return !(
      a.maxX < b.minX - padding ||
      a.minX > b.maxX + padding ||
      a.maxZ < b.minZ - padding ||
      a.minZ > b.maxZ + padding
    );
  }

  function pointNearRoadCorridor(x, z, roadCandidates = []) {
    const probeBounds = { minX: x, maxX: x, minZ: z, maxZ: z };
    for (let i = 0; i < roadCandidates.length; i++) {
      const road = roadCandidates[i];
      const roadBounds = ensureRecordBounds(road);
      const roadWidth = Number.isFinite(road?.width) ? road.width : 8;
      const extraSidewalkRoom =
        String(road?.type || '').includes('motorway') || String(road?.type || '').includes('trunk') ? 1.2 :
        3.6;
      const corridorRadius = roadWidth * 0.5 + extraSidewalkRoom;
      if (!boundsIntersect(roadBounds, probeBounds, corridorRadius)) continue;
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      for (let p = 0; p < pts.length - 1; p++) {
        if (pointToSegmentDistanceXZ(x, z, pts[p], pts[p + 1]) <= corridorRadius) {
          return true;
        }
      }
    }
    return false;
  }

  function geoBoundsToWorldBounds(bounds, padding = 0) {
    if (!bounds || typeof appCtx.geoToWorld !== 'function') return null;
    const points = [
      appCtx.geoToWorld(bounds.latN, bounds.lonW),
      appCtx.geoToWorld(bounds.latN, bounds.lonE),
      appCtx.geoToWorld(bounds.latS, bounds.lonW),
      appCtx.geoToWorld(bounds.latS, bounds.lonE)
    ];
    const worldBounds = boundsFromPoints(points);
    if (!worldBounds) return null;
    if (!padding) return worldBounds;
    return {
      minX: worldBounds.minX - padding,
      maxX: worldBounds.maxX + padding,
      minZ: worldBounds.minZ - padding,
      maxZ: worldBounds.maxZ + padding
    };
  }

  function classifyLocalSurfaceBucket(type) {
    if (!type) return null;
    if (type === 'water') return 'water';
    if (EXPLICIT_SAND_SURFACE_TYPES.has(type)) return 'sand';
    if (ROCKY_SURFACE_TYPES.has(type)) return 'rock';
    if (SOIL_SURFACE_TYPES.has(type)) return 'soil';
    if (URBAN_SURFACE_TYPES.has(type)) return 'urban';
    if (VEGETATED_SURFACE_TYPES.has(type) || type === 'grass' || type === 'meadow' || type === 'scrub') return 'grass';
    return null;
  }

  function surfacePriority(type) {
    if (EXPLICIT_SAND_SURFACE_TYPES.has(type)) return 6;
    if (ROCKY_SURFACE_TYPES.has(type)) return 5;
    if (URBAN_SURFACE_TYPES.has(type)) return 4;
    if (SOIL_SURFACE_TYPES.has(type)) return 3;
    if (VEGETATED_SURFACE_TYPES.has(type) || type === 'grass' || type === 'meadow' || type === 'scrub') return 2;
    return 1;
  }

  function normalizedLocalSignals(samples) {
    const total = Math.max(1, Number(samples.total) || 0);
    return {
      sand: (samples.sand || 0) / total,
      grass: (samples.grass || 0) / total,
      urban: (samples.urban || 0) / total,
      soil: (samples.soil || 0) / total,
      rock: (samples.rock || 0) / total,
      water: (samples.water || 0) / total,
      uncovered: (samples.uncovered || 0) / total
    };
  }

  function summarizeLocalGroundSignals(bounds) {
    const worldProfile = appCtx.worldSurfaceProfile || null;
    const aridWorld =
      worldProfile?.terrainModeHint === 'sand' ||
      worldProfile?.reason === 'arid_surface';
    const tileBounds = geoBoundsToWorldBounds(bounds);
    const coastalBounds = geoBoundsToWorldBounds(bounds, COASTAL_SAMPLE_PADDING_WORLD);
    const roadBounds = geoBoundsToWorldBounds(bounds, ROAD_SAMPLE_PADDING_WORLD);
    const samples = { total: 0, sand: 0, grass: 0, urban: 0, soil: 0, rock: 0, water: 0, uncovered: 0 };

    if (!tileBounds) {
      return {
        raw: samples,
        normalized: normalizedLocalSignals(samples),
        waterAdjacent: false,
        candidates: { landuses: 0, water: 0, buildings: 0 }
      };
    }

    const preciseLanduseCandidates = (Array.isArray(appCtx.landuses) ? appCtx.landuses : []).filter((entry) => {
      const entryBounds = ensureRecordBounds(entry);
      return boundsIntersect(entryBounds, tileBounds);
    });
    const fallbackLanduseCandidates = preciseLanduseCandidates.length === 0 ?
      (Array.isArray(appCtx.surfaceFeatureHints) ? appCtx.surfaceFeatureHints : []).filter((entry) => {
        const entryBounds = ensureRecordBounds(entry);
        return boundsIntersect(entryBounds, tileBounds);
      }) :
      [];
    const landuseCandidates = preciseLanduseCandidates.length > 0 ? preciseLanduseCandidates : fallbackLanduseCandidates;
    const waterCandidates = (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : []).filter((entry) => {
      const entryBounds = ensureRecordBounds(entry);
      return boundsIntersect(entryBounds, coastalBounds);
    });
    const roadCandidates = (Array.isArray(appCtx.roads) ? appCtx.roads : []).filter((entry) => {
      const entryBounds = ensureRecordBounds(entry);
      return boundsIntersect(entryBounds, roadBounds || tileBounds);
    });
    const buildingCandidates = (Array.isArray(appCtx.buildings) ? appCtx.buildings : []).filter((entry) => {
      const entryBounds = ensureRecordBounds(entry);
      return boundsIntersect(entryBounds, tileBounds);
    });
    const hasExplicitUrbanLanduse = landuseCandidates.some((entry) => URBAN_SURFACE_TYPES.has(entry?.type));
    const hasExplicitGreenLanduse = landuseCandidates.some((entry) =>
      VEGETATED_SURFACE_TYPES.has(entry?.type) || entry?.type === 'grass' || entry?.type === 'meadow' || entry?.type === 'scrub'
    );
    const denseBuiltWithoutGreen = !hasExplicitGreenLanduse &&
      ((buildingCandidates.length >= 10 && roadCandidates.length >= 7) || (buildingCandidates.length >= 8 && roadCandidates.length >= 10));
    const inferredUrbanCorridor =
      denseBuiltWithoutGreen &&
      ((buildingCandidates.length >= 8 && roadCandidates.length >= 6) || (buildingCandidates.length >= 12 && roadCandidates.length >= 5));

    const tileWidth = Math.max(1, tileBounds.maxX - tileBounds.minX);
    const tileDepth = Math.max(1, tileBounds.maxZ - tileBounds.minZ);
    for (let row = 0; row < TILE_SAMPLE_GRID; row++) {
      for (let col = 0; col < TILE_SAMPLE_GRID; col++) {
        const x = tileBounds.minX + ((col + 0.5) / TILE_SAMPLE_GRID) * tileWidth;
        const z = tileBounds.minZ + ((row + 0.5) / TILE_SAMPLE_GRID) * tileDepth;
        samples.total += 1;

        let insideBuilding = false;
        for (let i = 0; i < buildingCandidates.length; i++) {
          const building = buildingCandidates[i];
          const buildingBounds = ensureRecordBounds(building);
          if (!boundsIntersect(buildingBounds, { minX: x, maxX: x, minZ: z, maxZ: z })) continue;
          if (Array.isArray(building.pts) && building.pts.length >= 3 && !pointInPolygonXZ(x, z, building.pts)) continue;
          insideBuilding = true;
          break;
        }
        if (insideBuilding) {
          samples.urban += 1.25;
          continue;
        }

        let matchedType = null;
        let matchedPriority = -1;
        for (let i = 0; i < landuseCandidates.length; i++) {
          const landuse = landuseCandidates[i];
          const luBounds = ensureRecordBounds(landuse);
          if (!boundsIntersect(luBounds, { minX: x, maxX: x, minZ: z, maxZ: z })) continue;
          if (!pointInPolygonXZ(x, z, landuse.pts)) continue;
          const type = landuse.type || null;
          const priority = surfacePriority(type);
          if (priority >= matchedPriority) {
            matchedPriority = priority;
            matchedType = type;
          }
        }

        if (!matchedType) {
          let waterHit = false;
          for (let i = 0; i < waterCandidates.length; i++) {
            const area = waterCandidates[i];
            const waterBounds = ensureRecordBounds(area);
            if (!boundsIntersect(waterBounds, { minX: x, maxX: x, minZ: z, maxZ: z })) continue;
            if (pointInPolygonXZ(x, z, area.pts)) {
              waterHit = true;
              break;
            }
          }
          if (waterHit) {
            samples.water += 1;
            continue;
          }
          const nearRoadCorridor = roadCandidates.length > 0 && pointNearRoadCorridor(x, z, roadCandidates);
          const corridorUrbanEligible = hasExplicitUrbanLanduse || inferredUrbanCorridor;
          if (nearRoadCorridor && corridorUrbanEligible) {
            const inferredUrbanWeight =
              buildingCandidates.length >= 14 || roadCandidates.length >= 10 ? 0.68 :
              buildingCandidates.length >= 10 ? 0.58 :
              0.52;
            const urbanWeight = hasExplicitUrbanLanduse ? 0.82 : inferredUrbanWeight;
            samples.urban += urbanWeight;
            samples.uncovered += 1 - urbanWeight;
          } else if (nearRoadCorridor) {
            if (aridWorld && !hasExplicitGreenLanduse) {
              const corridorSandWeight = buildingCandidates.length <= 8 ? 0.58 : 0.42;
              samples.sand += corridorSandWeight;
              samples.uncovered += 1 - corridorSandWeight;
            } else if (!hasExplicitGreenLanduse && buildingCandidates.length >= 7 && roadCandidates.length >= 4) {
              samples.soil += 0.44;
              samples.uncovered += 0.34;
              samples.grass += 0.22;
            } else {
              const corridorGrassWeight = hasExplicitGreenLanduse ? 0.82 : buildingCandidates.length <= 8 ? 0.72 : 0.62;
              samples.grass += corridorGrassWeight;
              samples.uncovered += 1 - corridorGrassWeight;
            }
          } else if (hasExplicitUrbanLanduse && buildingCandidates.length >= 6 && roadCandidates.length >= 4) {
            samples.urban += 0.3;
            samples.uncovered += 0.7;
          } else {
            if (aridWorld && !hasExplicitGreenLanduse && waterCandidates.length === 0) {
              samples.sand += 0.35;
              samples.uncovered += 0.65;
            } else {
              samples.uncovered += 1;
            }
          }
          continue;
        }

        const bucket = classifyLocalSurfaceBucket(matchedType);
        if (bucket === 'water') samples.water += 1;
        else if (bucket === 'sand') samples.sand += 1;
        else if (bucket === 'urban') samples.urban += 1;
        else if (bucket === 'soil') samples.soil += 1;
        else if (bucket === 'rock') samples.rock += 1;
        else if (bucket === 'grass') samples.grass += 1;
        else samples.uncovered += 1;
      }
    }

    return {
      raw: samples,
      normalized: normalizedLocalSignals(samples),
      waterAdjacent: waterCandidates.length > 0,
      candidates: {
        landuses: landuseCandidates.length,
        water: waterCandidates.length,
        buildings: buildingCandidates.length,
        roads: roadCandidates.length,
        urbanLanduses: hasExplicitUrbanLanduse ? 1 : 0,
        greenLanduses: hasExplicitGreenLanduse ? 1 : 0
      }
    };
  }

  return { summarizeLocalGroundSignals };
}
