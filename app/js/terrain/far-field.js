import {
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  loadFarMappedContext
} from './far-field-mapped-context.js?v=4';
import { resolveFarBuildingMassing } from './far-building-massing.js?v=1';
import { loadFarTerrainElevationWithParentFallback } from './far-field-elevation-loader.js?v=2';
import {
  addCoverageEdges,
  cellInsideDetailedCoverage,
  cellInsideHole
} from './far-field-coverage.js?v=1';
import {
  classifyWorldCoverSurface,
  loadWorldCoverBaseline
} from './worldcover-baseline.js?v=15';
import {
  applyWorldCoverVertexTints,
  ensureTerrainTextureSet
} from './surface-profiles.js?v=44';
import { resolveWorldCoverDetailMode } from './worldcover-detail-mode.js?v=1';

const FAR_FIELD_SOURCE_ZOOM_OFFSET = 3;
const FAR_FIELD_OUTER_DISTANCE_METERS = 22000;
const FAR_FIELD_GRID_INTERVAL_METERS = 320;
const FAR_FIELD_SEAM_BLEND_METERS = 550;
const FAR_CONTEXT_HALF_EXTENT_METERS = 6500;

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
  let farWaterMesh = null;
  let pendingBuildPromise = null;
  let elevationAbortController = null;
  let farFieldSurfaceState = null;
  let surfaceRefreshTimer = null;
  let lastAppliedDetailMode = '';

  function waitForGenerationDrain(buildPromise) {
    if (!buildPromise) return Promise.resolve();
    return Promise.resolve(buildPromise).catch(() => undefined);
  }

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
    if (farWaterMesh) {
      farWaterMesh.parent?.remove?.(farWaterMesh);
      disposeFarFieldMesh(farWaterMesh);
      farWaterMesh = null;
    }
    farFieldSurfaceState = null;
    lastAppliedDetailMode = '';
  }

  function resetFarTerrainClipmap() {
    const retiringBuildPromise = pendingBuildPromise;
    generation += 1;
    elevationAbortController?.abort?.('far-terrain-generation-reset');
    elevationAbortController = null;
    if (surfaceRefreshTimer !== null) clearTimeout(surfaceRefreshTimer);
    surfaceRefreshTimer = null;
    activeKey = '';
    removeCurrentMesh();
    pendingBuildPromise = null;
    appCtx.farTerrainClipmapState = null;
    return waitForGenerationDrain(retiringBuildPromise);
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

  function buildGeometry(spec, loadedTiles, offsetMeters) {
    const interval = FAR_FIELD_GRID_INTERVAL_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1);
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
    const seamBlendWorld = FAR_FIELD_SEAM_BLEND_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1);
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

  function fixedLocationDetailMode(worldCoverResult = null) {
    const publishedMode = String(appCtx.worldCoverBaseDetailMode || '');
    if (publishedMode) return publishedMode;
    const nearestDetailedTerrain = (appCtx.terrainGroup?.children || [])
      .filter((mesh) => mesh?.userData?.isTerrainMesh && !mesh.userData?.isFixedLocationTerrainLod)
      .sort((left, right) =>
        Math.hypot(Number(left.position?.x || 0), Number(left.position?.z || 0)) -
        Math.hypot(Number(right.position?.x || 0), Number(right.position?.z || 0))
      )[0];
    const detailedMode = String(
      nearestDetailedTerrain?.userData?.terrainVisualProfile?.visualMode ||
      nearestDetailedTerrain?.userData?.terrainVisualProfile?.mode ||
      ''
    );
    if (['snow', 'snowRock', 'sand', 'soil', 'rock', 'forest', 'grass'].includes(detailedMode)) {
      return detailedMode;
    }
    const worldHint = String(appCtx.worldSurfaceProfile?.terrainModeHint || '');
    if (worldHint === 'snow' || worldHint === 'sand') return worldHint;
    const semantic = classifyWorldCoverSurface(worldCoverResult, Number(appCtx.LOC?.lat || 0));
    return resolveWorldCoverDetailMode(semantic, worldCoverResult);
  }

  function applyFixedLocationSurfaceMaterial(mesh, worldCoverResult, spec) {
    const material = mesh?.material;
    if (!mesh || !material || Array.isArray(material)) return false;
    const detailMode = fixedLocationDetailMode(worldCoverResult);
    const unitsPerMeter = Math.max(1e-6, Number(appCtx.WORLD_UNITS_PER_METER || 1));
    const spanMeters = Math.max(
      Number(spec?.outer?.maxX || 0) - Number(spec?.outer?.minX || 0),
      Number(spec?.outer?.maxZ || 0) - Number(spec?.outer?.minZ || 0)
    ) / unitsPerMeter;
    // Detailed z15 tiles use roughly one repeat per 80 m. The location LOD
    // keeps that physical scale instead of stretching one texture across the
    // entire 44 km background square.
    const repeats = Math.max(12, spanMeters / 80);
    const detailTextures = ensureTerrainTextureSet(mesh, repeats, detailMode);
    material.map = detailTextures?.map || null;
    material.normalMap = detailTextures?.normalMap || null;
    material.roughnessMap = detailTextures?.roughnessMap || null;
    if (material.normalMap) {
      const normalStrength =
        detailMode === 'sand' ? [0.78, 0.42] :
        detailMode === 'rock' ? [0.56, 0.56] :
        detailMode === 'soil' ? [0.48, 0.48] :
        detailMode === 'forest' ? [0.48, 0.48] :
        [0.6, 0.6];
      material.normalScale = new THREE.Vector2(normalStrength[0], normalStrength[1]);
    }
    const tinted = worldCoverResult
      ? applyWorldCoverVertexTints(mesh, worldCoverResult)
      : false;
    material.color.setHex(0xffffff);
    material.roughness = 0.96;
    material.metalness = 0;
    material.needsUpdate = true;
    mesh.userData.terrainTextureRepeats = repeats;
    mesh.userData.terrainDetailProvenance = {
      kind: tinted
        ? 'fixed-location-smoothed-worldcover-natural-terrain-pbr'
        : 'fixed-location-semantic-pbr',
      source: worldCoverResult?.source || 'fixed-location-profile',
      mode: detailMode,
      hardscapeOwner: 'exact-mapped-surface-geometry'
    };
    lastAppliedDetailMode = detailMode;
    return true;
  }

  function buildFarWaterGeometry(mappedContext) {
    const positions = [];
    const indices = [];
    const unitsPerMeter = Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const yExaggeration = Number(appCtx.TERRAIN_Y_EXAGGERATION || 1);
    let polygons = 0;

    const worldRing = (ring) => {
      const withoutClosure = ring?.length > 1 &&
        ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
        ? ring.slice(0, -1)
        : (ring || []).slice();
      return withoutClosure.map((coordinate) => {
        const lon = Number(coordinate?.[0]);
        const lat = Number(coordinate?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const world = appCtx.geoToWorld(lat, lon);
        return new THREE.Vector2(world.x, world.z);
      }).filter(Boolean);
    };

    for (const area of mappedContext?.waterAreas || []) {
      if (!Number.isFinite(area.surfaceMeters)) continue;
      const contour = worldRing(area.outer);
      const holes = (area.holes || []).map(worldRing).filter((ring) => ring.length >= 3);
      if (contour.length < 3) continue;
      const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
      if (!triangles.length) continue;
      const points = [contour, ...holes].flat();
      const baseIndex = positions.length / 3;
      const y = area.surfaceMeters * unitsPerMeter * yExaggeration + 0.04;
      for (const point of points) positions.push(point.x, y, point.y);
      for (const triangle of triangles) {
        indices.push(baseIndex + triangle[0], baseIndex + triangle[1], baseIndex + triangle[2]);
      }
      polygons += 1;
    }

    if (!polygons) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, polygons, triangles: indices.length / 3 };
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

  async function buildAndPublish(spec, requestGeneration, signal) {
    const sourceTiles = sourceTileRange(spec.geographic, spec.sourceZoom);
    setState({ status: 'loading-elevation-and-context', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length });
    const [elevation, mappedContext, worldCoverContext] = await Promise.all([
      loadFarTerrainElevationWithParentFallback({
        tiles: sourceTiles,
        isActive: () => requestGeneration === generation,
        parentTile: parentTerrainTile,
        loadTile: (tile) => waitForTerrainTileReadyAtZoom(
          tile.z, tile.tx, tile.ty, 10000, deps, { signal }
        )
      }),
      loadFarMappedContext(
        spec.contextGeographic,
        spec.innerGeographic,
        spec.geographic,
        { signal }
      ),
      loadWorldCoverBaseline(spec.geographic, {
        size: 128,
        key: `far-field:${activeKey}`,
        signal,
        priority: -10
      }).catch(() => null)
    ]);
    if (requestGeneration !== generation) return;
    const missingSourceTiles = elevation.missingSourceTiles;
    const fallbackTiles = elevation.fallbackTiles;
    const fallbackElevation = elevation.fallback;
    if (!elevation.ready) {
      setState({
        status: 'unavailable',
        reason: 'far-field-elevation-and-parent-fallback-unavailable',
        missingSourceTiles: missingSourceTiles.length,
        fallbackSourceTiles: fallbackTiles.length
      });
      return;
    }
    const loadedTiles = new Map([
      ...sourceTiles.map((tile) => [tile.key, getOrLoadTerrainTile(tile.z, tile.tx, tile.ty, deps)]),
      ...fallbackTiles.map((tile) => [tile.key, getOrLoadTerrainTile(tile.z, tile.tx, tile.ty, deps)])
    ]);
    const offsetMeters = normalizationOffset(spec.inner, spec.sourceZoom, loadedTiles);
    if (!Number.isFinite(offsetMeters)) {
      setState({ status: 'unavailable', reason: 'far-field-datum-normalization-unavailable' });
      return;
    }
    prepareMappedWaterSurfaces(mappedContext, spec.sourceZoom, loadedTiles, offsetMeters);

    setState({ status: 'building-geometry', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length, offsetMeters });
    const built = buildGeometry(spec, loadedTiles, offsetMeters);
    const builtBuildings = buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext);
    const builtWater = buildFarWaterGeometry(mappedContext);
    if (requestGeneration !== generation) {
      built?.geometry?.dispose?.();
      builtBuildings?.geometry?.dispose?.();
      builtWater?.geometry?.dispose?.();
      return;
    }
    if (!built) {
      builtBuildings?.geometry?.dispose?.();
      builtWater?.geometry?.dispose?.();
      setState({ status: 'unavailable', reason: 'far-field-elevation-sampling-failed' });
      return;
    }

    // Retire the prior location LOD before publishing state for its replacement.
    // Clearing after material setup erased the new surface authority and left the
    // outer terrain frozen on its initial coarse fallback.
    removeCurrentMesh();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.FrontSide,
      // Fog participation is allowed, but scene fog density is owned entirely
      // by the weather system and is zero outside an actual fog condition.
      fog: true
    });
    const mesh = new THREE.Mesh(built.geometry, material);
    mesh.name = 'FixedLocationTerrainLod';
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.isFarTerrainClipmap = true;
    mesh.userData.isFixedLocationTerrainLod = true;
    farFieldSurfaceState = { spec, worldCoverResult: worldCoverContext };
    applyFixedLocationSurfaceMaterial(mesh, worldCoverContext, spec);
    mesh.userData.renderProvenance = {
      version: 1,
      profile: 'fixed-location-terrain-lod',
      provider: 'mapzen-terrarium',
      dataset: 'Mapzen Terrarium elevation-derived landscape',
      verticalDatum: sampleAcceptedGroundAtLatLon(appCtx.LOC.lat, appCtx.LOC.lon)?.verticalDatum || null,
      normalizationOffsetMeters: offsetMeters,
      layer: 'terrain',
      role: 'fixed-location-terrain-lod',
      sources: ['mapzen-terrarium', 'openstreetmap-shortbread', ...(worldCoverContext ? ['esa-worldcover-2021'] : [])],
      fallback: offsetMeters === 0 &&
        typeof terrainTileDeps?.usesAcceptedGround === 'function' &&
        !terrainTileDeps.usesAcceptedGround()
    };

    farFieldMesh = mesh;
    appCtx.terrainGroup.add(mesh);
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
    if (builtWater) {
      const waterStyle = appCtx.LANDUSE_STYLES?.water || {};
      const waterMaterial = new THREE.MeshStandardMaterial({
        color: waterStyle.color || 0x2b6f9f,
        emissive: 0x0f355a,
        emissiveIntensity: 0.16,
        roughness: 0.34,
        metalness: 0.02,
        side: THREE.DoubleSide,
        fog: true,
        transparent: false,
        depthWrite: true
      });
      farWaterMesh = new THREE.Mesh(builtWater.geometry, waterMaterial);
      farWaterMesh.name = 'FarMappedWaterContext';
      farWaterMesh.renderOrder = 0;
      farWaterMesh.castShadow = false;
      farWaterMesh.receiveShadow = true;
      farWaterMesh.userData.isFarMappedWaterContext = true;
      farWaterMesh.userData.renderProvenance = {
        version: 1,
        profile: 'far-mapped-water-polygon-lod',
        provider: 'openstreetmap',
        dataset: 'Shortbread mapped ocean and water polygons',
        layer: 'water',
        role: 'far-context-water-lod',
        sources: ['openstreetmap-shortbread'],
        fallback: false
      };
      appCtx.terrainGroup.add(farWaterMesh);
    }
    setState({
      status: 'ready',
      sourceZoom: spec.sourceZoom,
      preferredSourceZoom: spec.preferredSourceZoom,
      sourceTiles: sourceTiles.length,
      elevationRequestsStarted: elevation.primary.started,
      elevationMaxInFlight: elevation.primary.maxInFlight,
      missingSourceTiles: missingSourceTiles.length,
      fallbackSourceTiles: fallbackTiles.length,
      fallbackElevationRequestsStarted: Number(fallbackElevation?.started || 0),
      fallbackElevationMaxInFlight: Number(fallbackElevation?.maxInFlight || 0),
      offsetMeters,
      columns: built.columns,
      rows: built.rows,
      vertices: built.geometry.attributes.position.count,
      triangles: built.geometry.index.count / 3,
      minElevationMeters: built.minElevationMeters,
      maxElevationMeters: built.maxElevationMeters,
      surfaceColor: worldCoverContext ? 'shared-worldcover-pbr' : 'shared-semantic-pbr',
      surfaceMaterialOwner: 'fixed-location-shared-pbr',
      surfaceDetailMode: lastAppliedDetailMode,
      worldCoverSurfaceStatus: worldCoverContext ? 'ready' : 'unavailable',
      detailedWorldCoverSurfacesReused: 0,
      contextSource: 'openstreetmap-shortbread',
      contextZoom: mappedContext.contextZoom,
      contextTilesLoaded: mappedContext.loadedTiles,
      contextTilesRequested: mappedContext.requestedTiles,
      waterOwner: 'exact-mapped-polygon-pipelines',
      waterContextZoom: mappedContext.waterZoom,
      waterContextTilesLoaded: mappedContext.waterTilesLoaded,
      waterContextTilesRequested: mappedContext.waterTilesRequested,
      farWaterPolygons: builtWater?.polygons || 0,
      farWaterTriangles: builtWater?.triangles || 0,
      skippedDuplicateNearBuildings: mappedContext.skippedNearBuildings,
      geometryBuildPasses: 1,
      farBuildings: builtBuildings?.buildings || 0,
      detailedTerrainTilesExcluded: spec.detailedCoverage?.length || 0,
      outerDistanceMeters: FAR_FIELD_OUTER_DISTANCE_METERS
    });
  }

  function refreshFarTerrainSurfaceColors() {
    if (!farFieldMesh || !farFieldSurfaceState || farFieldMesh.userData?.farFieldDisposed) return false;
    const nextMode = fixedLocationDetailMode(farFieldSurfaceState.worldCoverResult);
    if (nextMode === lastAppliedDetailMode) return false;
    if (!applyFixedLocationSurfaceMaterial(
      farFieldMesh,
      farFieldSurfaceState.worldCoverResult,
      farFieldSurfaceState.spec
    )) return false;
    setState({
      ...appCtx.farTerrainClipmapState,
      surfaceDetailMode: nextMode,
      surfaceRefreshes: Number(appCtx.farTerrainClipmapState?.surfaceRefreshes || 0) + 1
    });
    return true;
  }

  function scheduleFarTerrainSurfaceRefresh() {
    if (!farFieldMesh || !farFieldSurfaceState) return;
    if (surfaceRefreshTimer !== null) clearTimeout(surfaceRefreshTimer);
    surfaceRefreshTimer = setTimeout(() => {
      surfaceRefreshTimer = null;
      refreshFarTerrainSurfaceColors();
    }, 180);
  }

  function updateFarTerrainClipmap(options = {}) {
    const z = Number(options.z);
    const centerX = Number(options.centerX);
    const centerY = Number(options.centerY);
    const ring = Math.max(1, Number(options.ring) || 1);
    const key = `${z}/${centerX}/${centerY}/r${ring}`;
    if (key === activeKey) return pendingBuildPromise;
    const retiringBuildPromise = pendingBuildPromise;
    activeKey = key;
    generation += 1;
    elevationAbortController?.abort?.('far-terrain-generation-replaced');
    elevationAbortController = new AbortController();
    const requestGeneration = generation;
    const generationSignal = elevationAbortController.signal;
    const inner = innerWorldBounds(z, centerX, centerY, ring);
    // A square terrain patch must extend beyond the circular camera far plane
    // even along its diagonal. Otherwise aircraft expose its hard outer edge.
    const outerHalfExtent = Math.max(
      FAR_FIELD_OUTER_DISTANCE_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1),
      Number(appCtx.camera?.far || 0) * 1.6
    );
    const outer = {
      minX: -outerHalfExtent,
      maxX: outerHalfExtent,
      minZ: -outerHalfExtent,
      maxZ: outerHalfExtent
    };
    const contextHalfExtent = Math.min(
      outerHalfExtent,
      FAR_CONTEXT_HALF_EXTENT_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1)
    );
    const contextOuter = {
      minX: -contextHalfExtent,
      maxX: contextHalfExtent,
      minZ: -contextHalfExtent,
      maxZ: contextHalfExtent
    };
    const geographic = geographicBounds(outer);
    const preferredSourceZoom = Math.max(0, z - FAR_FIELD_SOURCE_ZOOM_OFFSET);
    const sourceZoom = sourceZoomForTileBudget(geographic, preferredSourceZoom);
    const detailedCoverage = completeDetailedTileCoverage(z, centerX, centerY, ring);
    setState({ status: 'queued', sourceZoom });
    const beginBuild = () => {
      if (generationSignal.aborted || requestGeneration !== generation) return undefined;
      return buildAndPublish({
        inner,
        detailedCoverage,
        innerGeographic: geographicBounds(inner),
        outer,
        geographic,
        contextGeographic: geographicBounds(contextOuter),
        sourceZoom,
        preferredSourceZoom
      }, requestGeneration, generationSignal);
    };
    pendingBuildPromise = (retiringBuildPromise
      ? waitForGenerationDrain(retiringBuildPromise).then(beginBuild)
      : Promise.resolve(beginBuild())
    ).catch((error) => {
      if (generationSignal.aborted || requestGeneration !== generation) return;
      throw error;
    }).finally(() => {
      if (requestGeneration === generation) {
        pendingBuildPromise = null;
        elevationAbortController = null;
      }
    });
    return pendingBuildPromise;
  }

  async function waitForFarTerrainClipmap(timeoutMs = 20000) {
    if (appCtx.farTerrainClipmapState?.status === 'ready') return true;
    const activePromise = pendingBuildPromise;
    if (!activePromise) return false;
    let timeoutId = null;
    try {
      await Promise.race([
        activePromise,
        new Promise((resolve) => {
          timeoutId = setTimeout(resolve, Math.max(0, Number(timeoutMs) || 0));
        })
      ]);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
    return appCtx.farTerrainClipmapState?.status === 'ready';
  }

  return {
    refreshFarTerrainSurfaceColors,
    resetFarTerrainClipmap,
    scheduleFarTerrainSurfaceRefresh,
    updateFarTerrainClipmap,
    waitForFarTerrainClipmap
  };
}

export {
  FAR_CONTEXT_HALF_EXTENT_METERS,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  FAR_FIELD_GRID_INTERVAL_METERS,
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_FIELD_SEAM_BLEND_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  parentTerrainTile,
  buildClipmapAxis,
  cellInsideDetailedCoverage,
  cellInsideHole,
  createFarFieldTerrainApi
};
