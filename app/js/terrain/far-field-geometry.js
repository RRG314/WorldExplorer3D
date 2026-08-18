import {
  addCoverageEdges,
  cellFullyInsideDetailedCoverage,
  cellInsideDetailedCoverage,
  publishedDetailedTerrainTileKeys
} from './far-field-coverage.js?v=2';
import { yieldToMainThread } from '../world/cooperative-scheduling.js?v=1';
import { createNormalizedTerrainAttribute } from './surface-material-blend.js?v=2';

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
}

function resolveFarFieldFallbackDatum(acceptedGroundSample) {
  const acceptedMeters = Number(acceptedGroundSample?.groundElevationMeters);
  return acceptedGroundSample?.status === 'available' && Number.isFinite(acceptedMeters)
    ? acceptedMeters
    : 0;
}

function appendInterval(values, start, end, interval, includeStart = true) {
  const distance = Math.max(0, end - start);
  const segments = Math.max(1, Math.ceil(distance / Math.max(1, interval)));
  for (let index = includeStart ? 0 : 1; index <= segments; index += 1) {
    values.push(start + (end - start) * (index / segments));
  }
}

function buildClipmapAxis(outerMin, innerMin, innerMax, outerMax, interval, innerInterval = interval) {
  const values = [];
  appendInterval(values, outerMin, innerMin, interval, true);
  appendInterval(values, innerMin, innerMax, innerInterval, false);
  appendInterval(values, innerMax, outerMax, interval, false);
  return values;
}

function distanceOutsideInnerBounds(x, z, innerBounds) {
  const dx = x < innerBounds.minX ? innerBounds.minX - x : x > innerBounds.maxX ? x - innerBounds.maxX : 0;
  const dz = z < innerBounds.minZ ? innerBounds.minZ - z : z > innerBounds.maxZ ? z - innerBounds.maxZ : 0;
  return Math.hypot(dx, dz);
}

function insetFarFieldSamplePoint(x, z, outer, insetWorld = 0.01) {
  const inset = Math.max(1e-6, Number(insetWorld) || 0.01);
  return {
    x: Math.max(outer.minX + inset, Math.min(outer.maxX - inset, x)),
    z: Math.max(outer.minZ + inset, Math.min(outer.maxZ - inset, z))
  };
}

function farFieldPointWithinOuterBounds(x, z, outer, toleranceWorld = 0.05) {
  const tolerance = Math.max(1e-6, Number(toleranceWorld) || 0.05);
  return !!outer &&
    x >= outer.minX - tolerance && x <= outer.maxX + tolerance &&
    z >= outer.minZ - tolerance && z <= outer.maxZ + tolerance;
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function mappedWaterBedMetersAt(
  longitude,
  latitude,
  terrainMeters,
  waterAreas = [],
  pointInMappedWaterArea = null,
  bedDepthMeters = 12
) {
  if (!Number.isFinite(terrainMeters) || typeof pointInMappedWaterArea !== 'function') {
    return terrainMeters;
  }
  let resolvedMeters = terrainMeters;
  // The fixed location LOD uses a 320 m grid. A shallow sub-meter cut can
  // still let one coarse terrain triangle cross the water plane between its
  // vertices, especially with a 12 km camera depth range. Keep the regional
  // bed safely below the mapped surface; the detailed terrain pipeline owns
  // the fine shoreline feather close to the selected city.
  for (const area of waterAreas || []) {
    const surfaceMeters = Number(area?.surfaceMeters);
    if (!Number.isFinite(surfaceMeters)) continue;
    if (!pointInMappedWaterArea(longitude, latitude, area)) continue;
    const coastalOwner = area?.kind === 'ocean' || area?._surfaceOwnerKind === 'ocean';
    const depth = coastalOwner
      ? Math.max(30, Number(bedDepthMeters) || 12)
      : Math.max(2, Number(bedDepthMeters) || 12);
    resolvedMeters = Math.min(resolvedMeters, surfaceMeters - depth);
  }
  return resolvedMeters;
}

function normalizeMappedWaterSurfaceOwnership(
  waterAreas = [],
  pointInMappedWaterArea = null
) {
  if (typeof pointInMappedWaterArea !== 'function') return waterAreas;
  const ordered = [...waterAreas].sort((left, right) => {
    const oceanPriority = Number(right?.kind === 'ocean') - Number(left?.kind === 'ocean');
    return oceanPriority || Number(right?.spanMeters || 0) - Number(left?.spanMeters || 0);
  });
  const owners = [];
  for (const area of ordered) {
    const bounds = area?.bounds;
    const longitude = bounds ? (Number(bounds.minLon) + Number(bounds.maxLon)) * 0.5 : NaN;
    const latitude = bounds ? (Number(bounds.minLat) + Number(bounds.maxLat)) * 0.5 : NaN;
    const owner = Number.isFinite(longitude) && Number.isFinite(latitude)
      ? owners.find((candidate) => pointInMappedWaterArea(longitude, latitude, candidate))
      : null;
    if (owner && Number.isFinite(Number(owner.surfaceMeters))) {
      // Shortbread can describe one estuary in both `ocean` and
      // `water_polygons`. Sharing the established owner's physical height is
      // safe; deleting only the overlapping triangles is not, because those
      // triangles often cross a shoreline or tile boundary.
      area.surfaceMeters = Number(owner.surfaceMeters);
      area._surfaceOwnerKind = owner._surfaceOwnerKind || owner.kind || null;
    } else {
      area._surfaceOwnerKind = area.kind || null;
    }
    owners.push(area);
  }
  return waterAreas;
}

function intervalIndex(values, value) {
  if (!Array.isArray(values) || values.length < 2 || !Number.isFinite(value)) return -1;
  if (value < values[0] || value > values[values.length - 1]) return -1;
  if (value === values[values.length - 1]) return values.length - 2;
  let low = 0;
  let high = values.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) * 0.5);
    if (values[middle] <= value) low = middle;
    else high = middle;
  }
  return low;
}

function sampleFarFieldGridWorldY(x, z, surfaceGrid) {
  const xValues = surfaceGrid?.xValues;
  const zValues = surfaceGrid?.zValues;
  const worldYs = surfaceGrid?.worldYs;
  const column = intervalIndex(xValues, Number(x));
  const row = intervalIndex(zValues, Number(z));
  if (column < 0 || row < 0 || !worldYs) return null;

  if (cellFullyInsideDetailedCoverage(
    xValues[column],
    xValues[column + 1],
    zValues[row],
    zValues[row + 1],
    surfaceGrid.detailedCoverage
  )) return null;

  const columns = xValues.length;
  const a = row * columns + column;
  const b = a + 1;
  const c = a + columns;
  const d = c + 1;
  const ax = xValues[column];
  const az = zValues[row];
  const u = (Number(x) - ax) / Math.max(1e-9, xValues[column + 1] - ax);
  const v = (Number(z) - az) / Math.max(1e-9, zValues[row + 1] - az);
  const ya = Number(worldYs[a]);
  const yb = Number(worldYs[b]);
  const yc = Number(worldYs[c]);
  const yd = Number(worldYs[d]);
  if (![ya, yb, yc, yd].every(Number.isFinite)) return null;

  // Match the exact a-c-b / b-c-d triangle split published to WebGL.
  return u + v <= 1
    ? ya + u * (yb - ya) + v * (yc - ya)
    : yd + (1 - u) * (yc - yd) + (1 - v) * (yb - yd);
}

function parentTerrainTile(tile, levels = 1) {
  const safeLevels = Math.max(1, Math.floor(Number(levels) || 1));
  const divisor = 2 ** safeLevels;
  return {
    z: Math.max(0, Number(tile?.z || 0) - safeLevels),
    tx: Math.floor(Number(tile?.tx || 0) / divisor),
    ty: Math.floor(Number(tile?.ty || 0) / divisor)
  };
}

function disposeFarFieldMesh(mesh) {
  if (!mesh) return;
  mesh.userData.farFieldDisposed = true;
  mesh.userData?.mappedWaterOwnershipMask?.dispose?.();
  for (const textures of Object.values(mesh.userData?.terrainTextureSetsByMode || {})) {
    textures?.map?.dispose?.();
    textures?.normalMap?.dispose?.();
    textures?.roughnessMap?.dispose?.();
  }
  const geometries = new Set();
  const materials = new Set();
  const collect = (node) => {
    if (node?.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node?.material) ? node.material : [node?.material];
    nodeMaterials.filter(Boolean).forEach((material) => materials.add(material));
  };
  if (typeof mesh.traverse === 'function') mesh.traverse(collect);
  else collect(mesh);
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) {
    material.dispose?.();
  }
}

function createFarFieldGeometryPlanner(deps = {}) {
  const {
    appCtx,
    clampElevationMeters,
    farFieldGridIntervalMeters,
    farFieldGapFillIntervalMeters,
    farFieldSeamBlendMeters,
    latLonToTileXY,
    sampleAcceptedGroundAtLatLon,
    sampleTileElevationMeters,
    pointInMappedWaterArea,
    pointInMappedLandArea,
    terrainTileDeps,
    tileXYToLatLonBounds,
    worldToLatLon
  } = deps;

  function innerWorldBounds(z, centerX, centerY, ring) {
    const northWest = tileXYToLatLonBounds(centerX - ring, centerY - ring, z);
    const southEast = tileXYToLatLonBounds(centerX + ring, centerY + ring, z);
    const worldNorthWest = appCtx.geoToWorld(northWest.latN, northWest.lonW);
    const worldSouthEast = appCtx.geoToWorld(southEast.latS, southEast.lonE);
    return {
      minX: Math.min(worldNorthWest.x, worldSouthEast.x),
      maxX: Math.max(worldNorthWest.x, worldSouthEast.x),
      minZ: Math.min(worldNorthWest.z, worldSouthEast.z),
      maxZ: Math.max(worldNorthWest.z, worldSouthEast.z)
    };
  }

  function detailedTileWorldBounds(z, tx, ty) {
    const bounds = tileXYToLatLonBounds(tx, ty, z);
    const northWest = appCtx.geoToWorld(bounds.latN, bounds.lonW);
    const northEast = appCtx.geoToWorld(bounds.latN, bounds.lonE);
    const southWest = appCtx.geoToWorld(bounds.latS, bounds.lonW);
    const center = appCtx.geoToWorld(
      (bounds.latN + bounds.latS) * 0.5,
      (bounds.lonW + bounds.lonE) * 0.5
    );
    const width = Math.hypot(northEast.x - northWest.x, northEast.z - northWest.z);
    const depth = Math.hypot(southWest.x - northWest.x, southWest.z - northWest.z);
    return {
      minX: center.x - width * 0.5,
      maxX: center.x + width * 0.5,
      minZ: center.z - depth * 0.5,
      maxZ: center.z + depth * 0.5
    };
  }

  function completeDetailedTileCoverage(z, centerX, centerY, ring) {
    const coverage = [];
    const publishedTiles = publishedDetailedTerrainTileKeys(appCtx.terrainGroup?.children || []);
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        const tx = centerX + dx;
        const ty = centerY + dy;
        if (!publishedTiles.has(`${z}/${tx}/${ty}`)) continue;
        coverage.push(detailedTileWorldBounds(z, tx, ty));
      }
    }
    return coverage;
  }

  function geographicBounds(worldBounds) {
    const a = worldToLatLon(worldBounds.minX, worldBounds.minZ);
    const b = worldToLatLon(worldBounds.maxX, worldBounds.maxZ);
    return {
      latN: Math.max(a.lat, b.lat),
      latS: Math.min(a.lat, b.lat),
      lonW: Math.min(a.lon, b.lon),
      lonE: Math.max(a.lon, b.lon)
    };
  }

  function sourceTileRange(bounds, zoom) {
    const epsilon = 1e-8;
    const northWest = latLonToTileXY(bounds.latN - epsilon, bounds.lonW + epsilon, zoom);
    const southEast = latLonToTileXY(bounds.latS + epsilon, bounds.lonE - epsilon, zoom);
    const tiles = [];
    for (let tx = Math.min(northWest.x, southEast.x); tx <= Math.max(northWest.x, southEast.x); tx += 1) {
      for (let ty = Math.min(northWest.y, southEast.y); ty <= Math.max(northWest.y, southEast.y); ty += 1) {
        tiles.push({ z: zoom, tx, ty, key: `${zoom}/${tx}/${ty}` });
      }
    }
    return tiles;
  }

  function sourceZoomForTileBudget(bounds, preferredZoom, maxTiles = 81, minimumZoom = 8) {
    let zoom = Math.max(minimumZoom, Math.floor(Number(preferredZoom) || minimumZoom));
    while (zoom > minimumZoom && sourceTileRange(bounds, zoom).length > maxTiles) zoom -= 1;
    return zoom;
  }

  function sampleSourceMeters(latitude, longitude, zoom, loadedTiles) {
    for (let sampleZoom = zoom; sampleZoom >= Math.max(0, zoom - 1); sampleZoom -= 1) {
      const point = latLonToTileXY(latitude, longitude, sampleZoom);
      const tile = loadedTiles.get(`${sampleZoom}/${point.x}/${point.y}`);
      const meters = sampleTileElevationMeters(tile, point.xf - point.x, point.yf - point.y, clampElevationMeters);
      if (Number.isFinite(meters)) return meters;
    }
    return null;
  }

  function normalizationOffset(innerBounds, zoom, loadedTiles) {
    if (typeof terrainTileDeps?.usesAcceptedGround === 'function' &&
        !terrainTileDeps.usesAcceptedGround()) return 0;
    const offsets = [];
    for (const fx of [0.15, 0.5, 0.85]) {
      for (const fz of [0.15, 0.5, 0.85]) {
        const x = innerBounds.minX + (innerBounds.maxX - innerBounds.minX) * fx;
        const z = innerBounds.minZ + (innerBounds.maxZ - innerBounds.minZ) * fz;
        const { lat, lon } = worldToLatLon(x, z);
        const accepted = sampleAcceptedGroundAtLatLon(lat, lon);
        const source = sampleSourceMeters(lat, lon, zoom, loadedTiles);
        const acceptedMeters = Number(accepted?.groundElevationMeters);
        if (accepted?.status === 'available' && Number.isFinite(acceptedMeters) && Number.isFinite(source)) {
          offsets.push(acceptedMeters - source);
        }
      }
    }
    return median(offsets);
  }

  function representativeWaterSurfaceMeters(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const nonNegative = sorted.filter((value) => value >= -2);
    const candidates = nonNegative.length >= Math.ceil(sorted.length * 0.5) ? nonNegative : sorted;
    return candidates[Math.min(candidates.length - 1, Math.floor(candidates.length * 0.2))];
  }

  function prepareMappedWaterSurfaces(mappedContext, sourceZoom, loadedTiles, offsetMeters, fallbackElevationMeters = null) {
    for (const area of mappedContext?.waterAreas || []) {
      if (area.kind === 'ocean') {
        area.surfaceMeters = 0;
        continue;
      }
      const ring = area.outer || [];
      const stride = Math.max(1, Math.ceil(ring.length / 8));
      const samples = [];
      for (let index = 0; index < ring.length; index += stride) {
        const lon = Number(ring[index]?.[0]);
        const lat = Number(ring[index]?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const sampledSourceMeters = sampleSourceMeters(lat, lon, sourceZoom, loadedTiles);
        const sourceMeters = Number.isFinite(sampledSourceMeters)
          ? sampledSourceMeters
          : Number(fallbackElevationMeters);
        if (Number.isFinite(sourceMeters)) samples.push(sourceMeters + offsetMeters);
      }
      area.surfaceMeters = representativeWaterSurfaceMeters(samples);
    }
    normalizeMappedWaterSurfaceOwnership(
      mappedContext?.waterAreas,
      pointInMappedWaterArea
    );
  }

  function sampleFarFieldSurfaceMeters(
    x,
    z,
    spec,
    loadedTiles,
    offsetMeters,
    mappedContext = null,
    maskStats = null
  ) {
    if (!farFieldPointWithinOuterBounds(x, z, spec?.outer)) return null;
    // Match the inward epsilon used to choose the bounded source-tile range.
    // At an exact Web Mercator boundary, sampling the exterior side would ask
    // for a deliberately unloaded neighbor and reject the entire fixed mesh.
    const samplePoint = insetFarFieldSamplePoint(x, z, spec.outer);
    const { lat, lon } = worldToLatLon(samplePoint.x, samplePoint.z);
    const sampledSourceMeters = sampleSourceMeters(lat, lon, spec.sourceZoom, loadedTiles);
    const sourceMeters = Number.isFinite(sampledSourceMeters)
      ? sampledSourceMeters
      : Number(spec.fallbackElevationMeters);
    if (!Number.isFinite(sourceMeters)) return null;

    let meters = sourceMeters + offsetMeters;
    const seamBlendWorld = farFieldSeamBlendMeters * Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const distanceFromSeam = distanceOutsideInnerBounds(x, z, spec.inner);
    if (distanceFromSeam <= seamBlendWorld) {
      const accepted = sampleAcceptedGroundAtLatLon(lat, lon);
      const acceptedMeters = Number(accepted?.groundElevationMeters);
      if (accepted?.status === 'available' && Number.isFinite(acceptedMeters)) {
        const blend = smoothstep01(distanceFromSeam / Math.max(1, seamBlendWorld));
        meters = acceptedMeters + (meters - acceptedMeters) * blend;
      }
    }
    const resolvedMeters = mappedWaterBedMetersAt(
      lon,
      lat,
      meters,
      mappedContext?.waterAreas,
      pointInMappedWaterArea
    );
    if (maskStats && resolvedMeters < meters - 1e-6) maskStats.waterMaskedVertices += 1;
    return resolvedMeters;
  }

  async function buildFarFieldGeometry(spec, loadedTiles, offsetMeters, mappedContext = null) {
    const interval = farFieldGridIntervalMeters * Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const gapFillInterval = Math.min(
      interval,
      Math.max(20, Number(farFieldGapFillIntervalMeters) || farFieldGridIntervalMeters) *
        Number(appCtx.WORLD_UNITS_PER_METER || 1)
    );
    const xValues = addCoverageEdges(
      buildClipmapAxis(
        spec.outer.minX,
        spec.inner.minX,
        spec.inner.maxX,
        spec.outer.maxX,
        interval,
        gapFillInterval
      ),
      spec.detailedCoverage,
      'minX',
      'maxX'
    );
    const zValues = addCoverageEdges(
      buildClipmapAxis(
        spec.outer.minZ,
        spec.inner.minZ,
        spec.inner.maxZ,
        spec.outer.maxZ,
        interval,
        gapFillInterval
      ),
      spec.detailedCoverage,
      'minZ',
      'maxZ'
    );
    const positions = [];
    const surfaceWorldYs = [];
    const colors = [];
    const mappedSurfaceTints = [];
    const mappedSurfaceModes = [];
    const uvs = [];
    const indices = [];
    const xRange = spec.outer.maxX - spec.outer.minX || 1;
    const zRange = spec.outer.maxZ - spec.outer.minZ || 1;
    let farOwnedCells = 0;
    let detailedOwnedCells = 0;
    let minElevationMeters = Infinity;
    let maxElevationMeters = -Infinity;
    const maskStats = { waterMaskedVertices: 0 };

    for (let row = 0; row < zValues.length; row += 1) {
      const z = zValues[row];
      if (row > 0 && row % 12 === 0) await yieldToMainThread();
      for (const x of xValues) {
        // This square clipmap owns terrain continuity only. Water is published
        // exclusively by the mapped polygon/ribbon pipeline, so the clipmap
        // can never turn its rectangular bounds into a blue city moat.
        const meters = sampleFarFieldSurfaceMeters(
          x,
          z,
          spec,
          loadedTiles,
          offsetMeters,
          mappedContext,
          maskStats
        );
        if (!Number.isFinite(meters)) return null;
        minElevationMeters = Math.min(minElevationMeters, meters);
        maxElevationMeters = Math.max(maxElevationMeters, meters);
        const worldY = Math.fround(
          meters * Number(appCtx.WORLD_UNITS_PER_METER || 1) * Number(appCtx.TERRAIN_Y_EXAGGERATION || 1)
        );
        positions.push(x, worldY, z);
        surfaceWorldYs.push(worldY);
        // The fixed-location LOD uses the same PBR base, WorldCover tint, and
        // built-surface shader as detailed terrain. White is the neutral vertex
        // multiplier until that shared presentation is applied to the mesh.
        const samplePoint = insetFarFieldSamplePoint(x, z, spec.outer);
        const geographicPoint = worldToLatLon(samplePoint.x, samplePoint.z);
        const contextTile = latLonToTileXY(
          geographicPoint.lat,
          geographicPoint.lon,
          Number(mappedContext?.contextZoom || 0)
        );
        const contextTileKey = `${mappedContext.contextZoom}/${contextTile.x}/${contextTile.y}`;
        const landBucket = mappedContext?.landAreasByTile?.get?.(contextTileKey) || [];
        const mappedSurface = landBucket.find((area) => (
          typeof pointInMappedLandArea === 'function' &&
          pointInMappedLandArea(geographicPoint.lon, geographicPoint.lat, area)
        ));
        const resolvedSurface = mappedSurface || mappedContext?.surfaceFallbackByTile?.get?.(contextTileKey) || null;
        const mappedTint = resolvedSurface?.tint;
        if (Array.isArray(mappedTint) && mappedTint.length >= 3) {
          colors.push(mappedTint[0], mappedTint[1], mappedTint[2]);
          mappedSurfaceTints.push(mappedTint[0], mappedTint[1], mappedTint[2]);
          mappedSurfaceModes.push(String(resolvedSurface.mode || resolvedSurface.kind || ''));
        } else {
          colors.push(1, 1, 1);
          mappedSurfaceTints.push(NaN, NaN, NaN);
          mappedSurfaceModes.push('');
        }
        uvs.push((x - spec.outer.minX) / xRange, 1 - (z - spec.outer.minZ) / zRange);
      }
    }

    const width = xValues.length;
    for (let row = 0; row < zValues.length - 1; row += 1) {
      for (let column = 0; column < xValues.length - 1; column += 1) {
        if (cellFullyInsideDetailedCoverage(
          xValues[column],
          xValues[column + 1],
          zValues[row],
          zValues[row + 1],
          spec.detailedCoverage
        )) {
          detailedOwnedCells += 1;
          continue;
        }
        farOwnedCells += 1;
        const a = row * width + column;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', createNormalizedTerrainAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return {
      geometry,
      columns: xValues.length,
      rows: zValues.length,
      minElevationMeters,
      maxElevationMeters,
      waterMaskedVertices: maskStats.waterMaskedVertices,
      mappedSurfaceTints: new Float32Array(mappedSurfaceTints),
      mappedSurfaceModes,
      coverage: {
        totalCells: (xValues.length - 1) * (zValues.length - 1),
        farOwnedCells,
        detailedOwnedCells,
        unownedCells: (xValues.length - 1) * (zValues.length - 1) -
          farOwnedCells - detailedOwnedCells
      },
      surfaceGrid: {
        xValues,
        zValues,
        worldYs: new Float32Array(surfaceWorldYs),
        detailedCoverage: spec.detailedCoverage
      }
    };
  }

  return {
    buildFarFieldGeometry,
    completeDetailedTileCoverage,
    geographicBounds,
    innerWorldBounds,
    normalizationOffset,
    prepareMappedWaterSurfaces,
    sampleFarFieldSurfaceMeters,
    sampleSourceMeters,
    sourceTileRange,
    sourceZoomForTileBudget
  };
}

export {
  buildClipmapAxis,
  createFarFieldGeometryPlanner,
  disposeFarFieldMesh,
  farFieldPointWithinOuterBounds,
  insetFarFieldSamplePoint,
  mappedWaterBedMetersAt,
  normalizeMappedWaterSurfaceOwnership,
  parentTerrainTile,
  resolveFarFieldFallbackDatum,
  sampleFarFieldGridWorldY
};
