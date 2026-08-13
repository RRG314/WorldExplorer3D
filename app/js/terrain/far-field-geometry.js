import {
  addCoverageEdges,
  cellInsideDetailedCoverage
} from './far-field-coverage.js?v=1';

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
}

function appendInterval(values, start, end, interval, includeStart = true) {
  const distance = Math.max(0, end - start);
  const segments = Math.max(1, Math.ceil(distance / Math.max(1, interval)));
  for (let index = includeStart ? 0 : 1; index <= segments; index += 1) {
    values.push(start + (end - start) * (index / segments));
  }
}

function buildClipmapAxis(outerMin, innerMin, innerMax, outerMax, interval) {
  const values = [];
  appendInterval(values, outerMin, innerMin, interval, true);
  appendInterval(values, innerMin, innerMax, interval, false);
  appendInterval(values, innerMax, outerMax, interval, false);
  return values;
}

function distanceOutsideInnerBounds(x, z, innerBounds) {
  const dx = x < innerBounds.minX ? innerBounds.minX - x : x > innerBounds.maxX ? x - innerBounds.maxX : 0;
  const dz = z < innerBounds.minZ ? innerBounds.minZ - z : z > innerBounds.maxZ ? z - innerBounds.maxZ : 0;
  return Math.hypot(dx, dz);
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
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
  for (const textures of Object.values(mesh.userData?.terrainTextureSetsByMode || {})) {
    textures?.map?.dispose?.();
    textures?.normalMap?.dispose?.();
    textures?.roughnessMap?.dispose?.();
  }
  mesh.geometry?.dispose?.();
  if (mesh.material && !Array.isArray(mesh.material)) {
    mesh.material.dispose?.();
  }
}

function createFarFieldGeometryPlanner(deps = {}) {
  const {
    appCtx,
    clampElevationMeters,
    farFieldGridIntervalMeters,
    farFieldSeamBlendMeters,
    latLonToTileXY,
    sampleAcceptedGroundAtLatLon,
    sampleTileElevationMeters,
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
    if (typeof terrainTileDeps?.usesAcceptedGround === 'function' &&
        !terrainTileDeps.usesAcceptedGround()) return [];
    const coverage = [];
    const checkpoints = [0, 0.5, 1];
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        const rect = detailedTileWorldBounds(z, centerX + dx, centerY + dy);
        let complete = true;
        for (const fx of checkpoints) {
          for (const fz of checkpoints) {
            const x = rect.minX + (rect.maxX - rect.minX) * fx;
            const zWorld = rect.minZ + (rect.maxZ - rect.minZ) * fz;
            const { lat, lon } = worldToLatLon(x, zWorld);
            const sample = sampleAcceptedGroundAtLatLon(lat, lon);
            if (sample?.status !== 'available' || !Number.isFinite(Number(sample.groundElevationMeters))) {
              complete = false;
              break;
            }
          }
          if (!complete) break;
        }
        if (complete) coverage.push(rect);
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

  function prepareMappedWaterSurfaces(mappedContext, sourceZoom, loadedTiles, offsetMeters) {
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
        const sourceMeters = sampleSourceMeters(lat, lon, sourceZoom, loadedTiles);
        if (Number.isFinite(sourceMeters)) samples.push(sourceMeters + offsetMeters);
      }
      area.surfaceMeters = representativeWaterSurfaceMeters(samples);
    }
  }

  function buildFarFieldGeometry(spec, loadedTiles, offsetMeters) {
    const interval = farFieldGridIntervalMeters * Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const xValues = addCoverageEdges(
      buildClipmapAxis(spec.outer.minX, spec.inner.minX, spec.inner.maxX, spec.outer.maxX, interval),
      spec.detailedCoverage,
      'minX',
      'maxX'
    );
    const zValues = addCoverageEdges(
      buildClipmapAxis(spec.outer.minZ, spec.inner.minZ, spec.inner.maxZ, spec.outer.maxZ, interval),
      spec.detailedCoverage,
      'minZ',
      'maxZ'
    );
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const xRange = spec.outer.maxX - spec.outer.minX || 1;
    const zRange = spec.outer.maxZ - spec.outer.minZ || 1;
    const seamBlendWorld = farFieldSeamBlendMeters * Number(appCtx.WORLD_UNITS_PER_METER || 1);
    let minElevationMeters = Infinity;
    let maxElevationMeters = -Infinity;

    for (const z of zValues) {
      for (const x of xValues) {
        const { lat, lon } = worldToLatLon(x, z);
        const sourceMeters = sampleSourceMeters(lat, lon, spec.sourceZoom, loadedTiles);
        if (!Number.isFinite(sourceMeters)) return null;
        // This square clipmap owns terrain continuity only. Water is published
        // exclusively by the mapped polygon/ribbon pipeline, so the clipmap
        // can never turn its rectangular bounds into a blue city moat.
        let meters = sourceMeters + offsetMeters;
        const distanceFromSeam = distanceOutsideInnerBounds(x, z, spec.inner);
        if (distanceFromSeam <= seamBlendWorld) {
          const accepted = sampleAcceptedGroundAtLatLon(lat, lon);
          const acceptedMeters = Number(accepted?.groundElevationMeters);
          if (accepted?.status === 'available' && Number.isFinite(acceptedMeters)) {
            const blend = smoothstep01(distanceFromSeam / Math.max(1, seamBlendWorld));
            meters = acceptedMeters + (meters - acceptedMeters) * blend;
          }
        }
        minElevationMeters = Math.min(minElevationMeters, meters);
        maxElevationMeters = Math.max(maxElevationMeters, meters);
        positions.push(x, meters * Number(appCtx.WORLD_UNITS_PER_METER || 1) * Number(appCtx.TERRAIN_Y_EXAGGERATION || 1), z);
        // The fixed-location LOD uses the same PBR base, WorldCover tint, and
        // built-surface shader as detailed terrain. White is the neutral vertex
        // multiplier until that shared presentation is applied to the mesh.
        colors.push(1, 1, 1);
        uvs.push((x - spec.outer.minX) / xRange, 1 - (z - spec.outer.minZ) / zRange);
      }
    }

    const width = xValues.length;
    for (let row = 0; row < zValues.length - 1; row += 1) {
      for (let column = 0; column < xValues.length - 1; column += 1) {
        const centerX = (xValues[column] + xValues[column + 1]) * 0.5;
        const centerZ = (zValues[row] + zValues[row + 1]) * 0.5;
        if (cellInsideDetailedCoverage(centerX, centerZ, spec.detailedCoverage)) continue;
        const a = row * width + column;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, columns: xValues.length, rows: zValues.length, minElevationMeters, maxElevationMeters };
  }

  return {
    buildFarFieldGeometry,
    completeDetailedTileCoverage,
    geographicBounds,
    innerWorldBounds,
    normalizationOffset,
    prepareMappedWaterSurfaces,
    sampleSourceMeters,
    sourceTileRange,
    sourceZoomForTileBudget
  };
}

export {
  buildClipmapAxis,
  createFarFieldGeometryPlanner,
  disposeFarFieldMesh,
  parentTerrainTile
};
