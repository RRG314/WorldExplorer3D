import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "../world/shortbread-source.js?v=9";
import { resolveFarBuildingMassing } from './far-building-massing.js?v=1';

const FAR_FIELD_SOURCE_ZOOM_OFFSET = 3;
const FAR_FIELD_OUTER_DISTANCE_METERS = 22000;
const FAR_FIELD_GRID_INTERVAL_METERS = 320;
const FAR_FIELD_SEAM_BLEND_METERS = 550;
const FAR_CONTEXT_ZOOM = 13;
const FAR_CONTEXT_MAX_BUILDINGS = 10000;
const FAR_CONTEXT_TILE_CONCURRENCY = 8;

const FAR_LAND_COLORS = Object.freeze({
  forest: [0.16, 0.25, 0.14],
  grass: [0.32, 0.42, 0.22],
  farmland: [0.43, 0.40, 0.27],
  developed: [0.39, 0.41, 0.40],
  industrial: [0.34, 0.35, 0.34],
  sand: [0.66, 0.58, 0.41]
});

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

function farLandClass(kind = '') {
  const value = String(kind || '').toLowerCase();
  if (/forest|wood|nature_reserve/.test(value)) return 'forest';
  if (/park|garden|grass|meadow|recreation|cemetery|village_green|golf|scrub|heath/.test(value)) return 'grass';
  if (/farm|orchard|vineyard|allotment|nursery/.test(value)) return 'farmland';
  if (/industrial|railway|quarry|landfill|construction|brownfield/.test(value)) return 'industrial';
  if (/residential|commercial|retail|school|university|hospital|parking/.test(value)) return 'developed';
  if (/sand|beach|dune|bare_rock|scree|shingle/.test(value)) return 'sand';
  return null;
}

function polygonRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates || []).map((polygon) => polygon?.[0]).filter(Array.isArray);
  }
  return [];
}

function ringBounds(ring) {
  const bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const coordinate of ring || []) {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
  }
  return bounds;
}

function pointInLonLatRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersects = ((yi > lat) !== (yj > lat)) &&
      lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function contextTileCoordinates(bounds) {
  const range = vectorTileRangeForBounds(
    bounds.latS,
    bounds.lonW,
    bounds.latN,
    bounds.lonE,
    FAR_CONTEXT_ZOOM
  );
  const coordinates = [];
  for (let x = range.xMin; x <= range.xMax; x += 1) {
    for (let y = range.yMin; y <= range.yMax; y += 1) coordinates.push({ x, y });
  }
  return coordinates;
}

async function fetchWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index]);
      } catch {
        results[index] = null;
      }
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

async function loadFarMappedContext(bounds) {
  const coordinates = contextTileCoordinates(bounds);
  const tiles = await fetchWithConcurrency(
    coordinates,
    FAR_CONTEXT_TILE_CONCURRENCY,
    ({ x, y }) => fetchShortbreadTile(FAR_CONTEXT_ZOOM, x, y)
  );
  const landByTile = new Map();
  const buildings = [];

  for (const tileRecord of tiles) {
    const tileKey = `${tileRecord.x}/${tileRecord.y}`;
    const landPolygons = [];
    for (const layerName of ['land', 'sites']) {
      const layer = tileRecord.tile.layers[layerName];
      if (!layer) continue;
      for (let index = 0; index < layer.length; index += 1) {
        const feature = layer.feature(index);
        const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
        const landClass = farLandClass(geojson?.properties?.kind);
        if (!landClass) continue;
        for (const ring of polygonRings(geojson.geometry)) {
          if (ring.length < 4) continue;
          landPolygons.push({ landClass, ring, bounds: ringBounds(ring) });
        }
      }
    }
    landByTile.set(tileKey, landPolygons);

    const buildingLayer = tileRecord.tile.layers.buildings;
    if (!buildingLayer) continue;
    const tileBuildings = [];
    for (let index = 0; index < buildingLayer.length; index += 1) {
      const feature = buildingLayer.feature(index);
      const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
      for (const ring of polygonRings(geojson?.geometry)) {
        if (ring.length < 4) continue;
        const bounds = ringBounds(ring);
        const span = Math.max(bounds.maxLat - bounds.minLat, bounds.maxLon - bounds.minLon);
        tileBuildings.push({
          ring,
          properties: geojson.properties || {},
          priority: span,
          identity: `${tileRecord.x}/${tileRecord.y}/${feature.id ?? index}`
        });
      }
    }
    tileBuildings.sort((a, b) => b.priority - a.priority);
    buildings.push(...tileBuildings.slice(0, 180));
  }

  return {
    buildings: buildings.slice(0, FAR_CONTEXT_MAX_BUILDINGS),
    landByTile,
    loadedTiles: tiles.length,
    requestedTiles: coordinates.length
  };
}

function mappedSurfaceColor(latitude, longitude, mappedContext) {
  if (!mappedContext) return null;
  const n = 2 ** FAR_CONTEXT_ZOOM;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const x = Math.floor((longitude + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(
    Math.tan(safeLat * Math.PI / 180) + 1 / Math.cos(safeLat * Math.PI / 180)
  ) / Math.PI) / 2 * n);
  const candidates = mappedContext.landByTile.get(`${x}/${y}`) || [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (latitude < candidate.bounds.minLat || latitude > candidate.bounds.maxLat ||
        longitude < candidate.bounds.minLon || longitude > candidate.bounds.maxLon) continue;
    if (pointInLonLatRing(longitude, latitude, candidate.ring)) {
      return FAR_LAND_COLORS[candidate.landClass] || null;
    }
  }
  return null;
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
    terrainTileDeps,
    tileXYToLatLonBounds,
    waitForTerrainTileReadyAtZoom,
    worldToLatLon
  } = deps;

  let generation = 0;
  let activeKey = '';
  let farFieldMesh = null;
  let farContextMesh = null;

  function setState(next) {
    appCtx.farTerrainClipmapState = Object.freeze({ generation, key: activeKey, ...(next || {}) });
  }

  function removeCurrentMesh() {
    if (farFieldMesh) {
      farFieldMesh.parent?.remove?.(farFieldMesh);
      disposeFarFieldMesh(farFieldMesh);
      farFieldMesh = null;
    }
    if (farContextMesh) {
      farContextMesh.parent?.remove?.(farContextMesh);
      disposeFarFieldMesh(farContextMesh);
      farContextMesh = null;
    }
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

  function buildGeometry(spec, loadedTiles, offsetMeters, mappedContext = null) {
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
        const mappedColor = !isWater ? mappedSurfaceColor(lat, lon, mappedContext) : null;
        colors.push(...(mappedColor || farFieldSurfaceColor(meters, lat, lon, isWater)));
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

  function buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext) {
    const positions = [];
    const colors = [];
    const indices = [];
    const unitsPerMeter = Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const yExaggeration = Number(appCtx.TERRAIN_Y_EXAGGERATION || 1);
    let published = 0;

    for (const building of mappedContext?.buildings || []) {
      const rawRing = building.ring || [];
      const withoutClosure = rawRing.length > 1 &&
        rawRing[0]?.[0] === rawRing.at(-1)?.[0] && rawRing[0]?.[1] === rawRing.at(-1)?.[1]
        ? rawRing.slice(0, -1)
        : rawRing.slice();
      if (withoutClosure.length < 3) continue;
      const stride = Math.max(1, Math.ceil(withoutClosure.length / 18));
      const sampled = withoutClosure.filter((_, index) => index % stride === 0);
      if (sampled.length < 3) continue;
      const footprint = sampled.map((coordinate) => {
        const lon = Number(coordinate?.[0]);
        const lat = Number(coordinate?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const world = appCtx.geoToWorld(lat, lon);
        return { x: world.x, z: world.z, lat, lon };
      }).filter(Boolean);
      if (footprint.length < 3) continue;

      const center = footprint.reduce((result, point) => ({
        x: result.x + point.x / footprint.length,
        z: result.z + point.z / footprint.length,
        lat: result.lat + point.lat / footprint.length,
        lon: result.lon + point.lon / footprint.length
      }), { x: 0, z: 0, lat: 0, lon: 0 });
      if (cellInsideHole(center.x, center.z, spec.inner)) continue;
      if (center.x < spec.outer.minX || center.x > spec.outer.maxX ||
          center.z < spec.outer.minZ || center.z > spec.outer.maxZ) continue;

      let signedArea = 0;
      for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
        signedArea += footprint[j].x * footprint[i].z - footprint[i].x * footprint[j].z;
      }
      const area = Math.abs(signedArea) * 0.5;
      if (area < 14 || area > 350000) continue;

      const sourceMeters = sampleSourceMeters(center.lat, center.lon, spec.sourceZoom, loadedTiles);
      if (!Number.isFinite(sourceMeters)) continue;
      const baseY = (sourceMeters + offsetMeters) * unitsPerMeter * yExaggeration + 0.25;
      const massing = resolveFarBuildingMassing(building, footprint, area, unitsPerMeter);
      if (!massing) continue;
      const { heightMeters, color } = massing;
      const topY = baseY + heightMeters * unitsPerMeter;
      const baseIndex = positions.length / 3;

      for (const point of footprint) {
        positions.push(point.x, baseY, point.z, point.x, topY, point.z);
        colors.push(...color, ...color);
      }
      for (let i = 0; i < footprint.length; i += 1) {
        const next = (i + 1) % footprint.length;
        const bottomA = baseIndex + i * 2;
        const topA = bottomA + 1;
        const bottomB = baseIndex + next * 2;
        const topB = bottomB + 1;
        indices.push(bottomA, bottomB, topA, topA, bottomB, topB);
      }
      const topTriangles = THREE.ShapeUtils.triangulateShape(
        footprint.map((point) => new THREE.Vector2(point.x, point.z)),
        []
      );
      for (const triangle of topTriangles) {
        indices.push(
          baseIndex + triangle[0] * 2 + 1,
          baseIndex + triangle[1] * 2 + 1,
          baseIndex + triangle[2] * 2 + 1
        );
      }
      published += 1;
      if (published >= FAR_CONTEXT_MAX_BUILDINGS) break;
    }

    if (published === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, buildings: published };
  }

  async function buildAndPublish(spec, requestGeneration) {
    const sourceTiles = sourceTileRange(spec.geographic, spec.sourceZoom);
    setState({ status: 'loading-elevation', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length });
    const mappedContextPromise = loadFarMappedContext(spec.geographic);
    const ready = await Promise.all(
      sourceTiles.map((tile) => waitForTerrainTileReadyAtZoom(tile.z, tile.tx, tile.ty, 10000, deps))
    );
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
    const built = buildGeometry(spec, loadedTiles, offsetMeters, null);
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
      sources: ['mapzen-terrarium', 'openstreetmap-shortbread'],
      fallback: offsetMeters === 0 &&
        typeof terrainTileDeps?.usesAcceptedGround === 'function' &&
        !terrainTileDeps.usesAcceptedGround()
    };

    removeCurrentMesh();
    farFieldMesh = mesh;
    appCtx.terrainGroup.add(mesh);
    setState({
      status: 'terrain-ready-context-loading',
      sourceZoom: spec.sourceZoom,
      sourceTiles: sourceTiles.length,
      offsetMeters,
      columns: built.columns,
      rows: built.rows,
      vertices: built.geometry.attributes.position.count,
      triangles: built.geometry.index.count / 3,
      minElevationMeters: built.minElevationMeters,
      maxElevationMeters: built.maxElevationMeters,
      surfaceColor: 'elevation-fallback-pending-mapped-context',
      farBuildings: 0,
      outerDistanceMeters: FAR_FIELD_OUTER_DISTANCE_METERS
    });

    const mappedContext = await mappedContextPromise;
    if (requestGeneration !== generation || farFieldMesh !== mesh) return;
    const contextualTerrain = buildGeometry(spec, loadedTiles, offsetMeters, mappedContext);
    const builtBuildings = buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext);
    if (requestGeneration !== generation || farFieldMesh !== mesh) {
      contextualTerrain?.geometry?.dispose?.();
      builtBuildings?.geometry?.dispose?.();
      return;
    }
    if (contextualTerrain) {
      const previousGeometry = mesh.geometry;
      mesh.geometry = contextualTerrain.geometry;
      previousGeometry?.dispose?.();
    }
    if (builtBuildings) {
      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
        fog: true
      });
      farContextMesh = new THREE.Mesh(builtBuildings.geometry, buildingMaterial);
      farContextMesh.name = 'FarMappedBuildingContext';
      farContextMesh.renderOrder = 1;
      farContextMesh.castShadow = false;
      farContextMesh.receiveShadow = false;
      farContextMesh.userData.isFarMappedContext = true;
      farContextMesh.userData.renderProvenance = {
        version: 1,
        profile: 'far-mapped-building-massing',
        provider: 'openstreetmap',
        dataset: 'Shortbread vector buildings',
        layer: 'buildings',
        role: 'far-context-lod',
        sources: ['openstreetmap-shortbread'],
        fallback: false
      };
      appCtx.terrainGroup.add(farContextMesh);
    }
    const finalTerrain = contextualTerrain || built;
    setState({
      status: 'ready',
      sourceZoom: spec.sourceZoom,
      sourceTiles: sourceTiles.length,
      offsetMeters,
      columns: finalTerrain.columns,
      rows: finalTerrain.rows,
      vertices: finalTerrain.geometry.attributes.position.count,
      triangles: finalTerrain.geometry.index.count / 3,
      minElevationMeters: finalTerrain.minElevationMeters,
      maxElevationMeters: finalTerrain.maxElevationMeters,
      surfaceColor: 'mapped-landuse-with-elevation-fallback',
      contextSource: 'openstreetmap-shortbread',
      contextTilesLoaded: mappedContext.loadedTiles,
      contextTilesRequested: mappedContext.requestedTiles,
      farBuildings: builtBuildings?.buildings || 0,
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
    // A square terrain patch must extend beyond the circular camera far plane
    // even along its diagonal. Otherwise aircraft expose its hard outer edge.
    const outerHalfExtent = Math.max(
      FAR_FIELD_OUTER_DISTANCE_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1),
      Number(appCtx.camera?.far || 0) * 1.6
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
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_FIELD_GRID_INTERVAL_METERS,
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_FIELD_SEAM_BLEND_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  buildClipmapAxis,
  cellInsideHole,
  createFarFieldTerrainApi
};
