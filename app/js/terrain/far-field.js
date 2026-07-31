const FAR_FIELD_SOURCE_ZOOM_OFFSET = 3;
const FAR_FIELD_OUTER_DISTANCE_METERS = 15000;
const FAR_FIELD_GRID_INTERVAL_METERS = 320;
const FAR_FIELD_SEAM_BLEND_METERS = 550;

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

function cellInsideHole(centerX, centerZ, innerBounds) {
  return centerX > innerBounds.minX && centerX < innerBounds.maxX &&
    centerZ > innerBounds.minZ && centerZ < innerBounds.maxZ;
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

function farFieldSurfaceColor(meters, latitude, longitude, isWater = false) {
  if (isWater) return [0.23, 0.44, 0.61];
  const broadVariation = Math.sin(latitude * 41.7 + longitude * 27.3) * 0.5 + 0.5;
  if (meters >= 2200) return [0.82, 0.85, 0.87];
  if (meters >= 900) return [0.43, 0.45, 0.43];
  if (meters >= 240) {
    return [0.27 + broadVariation * 0.05, 0.36 + broadVariation * 0.08, 0.24 + broadVariation * 0.04];
  }
  return [0.43 + broadVariation * 0.08, 0.47 + broadVariation * 0.07, 0.42 + broadVariation * 0.05];
}

function disposeFarFieldMesh(mesh) {
  if (!mesh) return;
  mesh.userData.farFieldDisposed = true;
  mesh.geometry?.dispose?.();
  if (mesh.material && !Array.isArray(mesh.material)) {
    mesh.material.dispose?.();
  }
}

function createFarFieldTerrainApi(deps = {}) {
  const {
    appCtx,
    clampElevationMeters,
    getOrLoadTerrainTile,
    latLonToTileXY,
    sampleAcceptedGroundAtLatLon,
    sampleTileElevationMeters,
    tileXYToLatLonBounds,
    waitForTerrainTileReadyAtZoom,
    worldToLatLon
  } = deps;

  let generation = 0;
  let activeKey = '';
  let farFieldMesh = null;

  function setState(next) {
    appCtx.farTerrainClipmapState = Object.freeze({ generation, key: activeKey, ...(next || {}) });
  }

  function removeCurrentMesh() {
    if (!farFieldMesh) return;
    farFieldMesh.parent?.remove?.(farFieldMesh);
    disposeFarFieldMesh(farFieldMesh);
    farFieldMesh = null;
  }

  function resetFarTerrainClipmap() {
    generation += 1;
    activeKey = '';
    removeCurrentMesh();
    appCtx.farTerrainClipmapState = null;
  }

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

  function sampleSourceMeters(latitude, longitude, zoom, loadedTiles) {
    const point = latLonToTileXY(latitude, longitude, zoom);
    const tile = loadedTiles.get(`${zoom}/${point.x}/${point.y}`) || getOrLoadTerrainTile(zoom, point.x, point.y, deps);
    return sampleTileElevationMeters(tile, point.xf - point.x, point.yf - point.y, clampElevationMeters);
  }

  function normalizationOffset(innerBounds, zoom, loadedTiles) {
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

  function buildGeometry(spec, loadedTiles, offsetMeters) {
    const interval = FAR_FIELD_GRID_INTERVAL_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const xValues = buildClipmapAxis(spec.outer.minX, spec.inner.minX, spec.inner.maxX, spec.outer.maxX, interval);
    const zValues = buildClipmapAxis(spec.outer.minZ, spec.inner.minZ, spec.inner.maxZ, spec.outer.maxZ, interval);
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const xRange = spec.outer.maxX - spec.outer.minX || 1;
    const zRange = spec.outer.maxZ - spec.outer.minZ || 1;
    const seamBlendWorld = FAR_FIELD_SEAM_BLEND_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1);
    let minElevationMeters = Infinity;
    let maxElevationMeters = -Infinity;

    for (const z of zValues) {
      for (const x of xValues) {
        const { lat, lon } = worldToLatLon(x, z);
        const sourceMeters = sampleSourceMeters(lat, lon, spec.sourceZoom, loadedTiles);
        if (!Number.isFinite(sourceMeters)) return null;
        const isWater = sourceMeters <= 0.75;
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
        if (isWater) meters = 0;
        minElevationMeters = Math.min(minElevationMeters, meters);
        maxElevationMeters = Math.max(maxElevationMeters, meters);
        positions.push(x, meters * Number(appCtx.WORLD_UNITS_PER_METER || 1) * Number(appCtx.TERRAIN_Y_EXAGGERATION || 1), z);
        colors.push(...farFieldSurfaceColor(meters, lat, lon, isWater));
        uvs.push((x - spec.outer.minX) / xRange, 1 - (z - spec.outer.minZ) / zRange);
      }
    }

    const width = xValues.length;
    for (let row = 0; row < zValues.length - 1; row += 1) {
      for (let column = 0; column < xValues.length - 1; column += 1) {
        const centerX = (xValues[column] + xValues[column + 1]) * 0.5;
        const centerZ = (zValues[row] + zValues[row + 1]) * 0.5;
        if (cellInsideHole(centerX, centerZ, spec.inner)) continue;
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

  async function buildAndPublish(spec, requestGeneration) {
    const sourceTiles = sourceTileRange(spec.geographic, spec.sourceZoom);
    setState({ status: 'loading-elevation', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length });
    const ready = await Promise.all(sourceTiles.map((tile) => waitForTerrainTileReadyAtZoom(tile.z, tile.tx, tile.ty, 10000, deps)));
    if (requestGeneration !== generation) return;
    if (!ready.every(Boolean)) {
      setState({ status: 'unavailable', reason: 'far-field-elevation-unavailable' });
      return;
    }
    const loadedTiles = new Map(sourceTiles.map((tile) => [tile.key, getOrLoadTerrainTile(tile.z, tile.tx, tile.ty, deps)]));
    const offsetMeters = normalizationOffset(spec.inner, spec.sourceZoom, loadedTiles);
    if (!Number.isFinite(offsetMeters)) {
      setState({ status: 'unavailable', reason: 'far-field-datum-normalization-unavailable' });
      return;
    }

    setState({ status: 'building-geometry', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length, offsetMeters });
    const built = buildGeometry(spec, loadedTiles, offsetMeters);
    if (requestGeneration !== generation) {
      built?.geometry?.dispose?.();
      return;
    }
    if (!built) {
      setState({ status: 'unavailable', reason: 'far-field-elevation-sampling-failed' });
      return;
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.FrontSide,
      // Fog participation is allowed, but scene fog density is owned entirely
      // by the weather system and is zero outside an actual fog condition.
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    });
    const mesh = new THREE.Mesh(built.geometry, material);
    mesh.name = 'FarTerrainClipmap';
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.userData.isFarTerrainClipmap = true;
    mesh.userData.renderProvenance = {
      version: 1,
      profile: 'far-field-terrain-clipmap',
      provider: 'mapzen-terrarium',
      dataset: 'Mapzen Terrarium elevation-derived landscape',
      verticalDatum: sampleAcceptedGroundAtLatLon(appCtx.LOC.lat, appCtx.LOC.lon)?.verticalDatum || null,
      normalizationOffsetMeters: offsetMeters,
      layer: 'terrain',
      role: 'far-field-terrain',
      sources: ['mapzen-terrarium'],
      fallback: false
    };

    removeCurrentMesh();
    farFieldMesh = mesh;
    appCtx.terrainGroup.add(mesh);
    setState({
      status: 'ready',
      sourceZoom: spec.sourceZoom,
      sourceTiles: sourceTiles.length,
      offsetMeters,
      columns: built.columns,
      rows: built.rows,
      vertices: built.geometry.attributes.position.count,
      triangles: built.geometry.index.count / 3,
      minElevationMeters: built.minElevationMeters,
      maxElevationMeters: built.maxElevationMeters,
      surfaceColor: 'deterministic-elevation-derived',
      outerDistanceMeters: FAR_FIELD_OUTER_DISTANCE_METERS
    });
  }

  function updateFarTerrainClipmap(options = {}) {
    const z = Number(options.z);
    const centerX = Number(options.centerX);
    const centerY = Number(options.centerY);
    const ring = Math.max(1, Number(options.ring) || 1);
    const key = `${z}/${centerX}/${centerY}/r${ring}`;
    if (key === activeKey) return;
    activeKey = key;
    generation += 1;
    const requestGeneration = generation;
    const inner = innerWorldBounds(z, centerX, centerY, ring);
    const outerHalfExtent = Math.max(
      FAR_FIELD_OUTER_DISTANCE_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1),
      Number(appCtx.camera?.far || 0) * 1.2
    );
    const actorX = Number(options.actorX) || 0;
    const actorZ = Number(options.actorZ) || 0;
    const outer = {
      minX: actorX - outerHalfExtent,
      maxX: actorX + outerHalfExtent,
      minZ: actorZ - outerHalfExtent,
      maxZ: actorZ + outerHalfExtent
    };
    const sourceZoom = Math.max(0, z - FAR_FIELD_SOURCE_ZOOM_OFFSET);
    setState({ status: 'queued', sourceZoom });
    void buildAndPublish({ inner, outer, geographic: geographicBounds(outer), sourceZoom }, requestGeneration);
  }

  return { resetFarTerrainClipmap, updateFarTerrainClipmap };
}

export {
  FAR_FIELD_GRID_INTERVAL_METERS,
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_FIELD_SEAM_BLEND_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  buildClipmapAxis,
  cellInsideHole,
  createFarFieldTerrainApi
};
