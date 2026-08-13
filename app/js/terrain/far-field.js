import {
  FAR_CONTEXT_BUILDING_COVERAGE_TARGET,
  FAR_CONTEXT_BUILDING_MAX_TILES,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_MAX_BUILDING_INSTANCES,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  loadFarMappedContext,
  pointInMappedWaterArea
} from './far-field-mapped-context.js?v=9';
import { resolveFarBuildingMassing } from './far-building-massing.js?v=1';
import { loadFarTerrainElevationWithParentFallback } from './far-field-elevation-loader.js?v=2';
import {
  cellInsideDetailedCoverage,
  cellInsideHole
} from './far-field-coverage.js?v=1';
import {
  buildClipmapAxis,
  createFarFieldGeometryPlanner,
  disposeFarFieldMesh,
  parentTerrainTile,
  sampleFarFieldGridWorldY
} from './far-field-geometry.js?v=11';
import {
  classifyWorldCoverSurface,
  loadWorldCoverBaseline
} from './worldcover-baseline.js?v=15';
import {
  applyWorldCoverVertexTints,
  ensureTerrainTextureSet
} from './surface-profiles.js?v=44';
import { resolveWorldCoverDetailMode } from './worldcover-detail-mode.js?v=1';
import {
  FAR_WATER_SURFACE_CLEARANCE_WORLD,
  FAR_WATER_TERRAIN_MASK_SIZE,
  applyMappedWaterTerrainOwnership,
  buildFarWaterGeometry,
  buildMappedWaterTerrainOwnershipMask,
  createFarWaterMesh
} from './far-field-water.js?v=1';

const FAR_FIELD_SOURCE_ZOOM_OFFSET = 3;
const FAR_FIELD_OUTER_DISTANCE_METERS = 22000;
const FAR_FIELD_GRID_INTERVAL_METERS = 320;
const FAR_FIELD_SEAM_BLEND_METERS = 550;
const FAR_CONTEXT_HALF_EXTENT_METERS = 8000;

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

  const {
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
  } = createFarFieldGeometryPlanner({
    appCtx,
    clampElevationMeters,
    farFieldGridIntervalMeters: FAR_FIELD_GRID_INTERVAL_METERS,
    farFieldSeamBlendMeters: FAR_FIELD_SEAM_BLEND_METERS,
    latLonToTileXY,
    sampleAcceptedGroundAtLatLon,
    sampleTileElevationMeters,
    terrainTileDeps,
    tileXYToLatLonBounds,
    worldToLatLon,
    pointInMappedWaterArea
  });

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

  function buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext) {
    const positions = [];
    const colors = [];
    const indices = [];
    const instances = [];
    const unitsPerMeter = Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const yExaggeration = Number(appCtx.TERRAIN_Y_EXAGGERATION || 1);
    let exactPublished = 0;

    for (const building of mappedContext?.buildings || []) {
      if (!Array.isArray(building.ring)) {
        const center = appCtx.geoToWorld(building.centerLat, building.centerLon);
        if (center.x < spec.outer.minX || center.x > spec.outer.maxX ||
            center.z < spec.outer.minZ || center.z > spec.outer.maxZ) continue;
        const sourceMeters = sampleSourceMeters(
          building.centerLat,
          building.centerLon,
          spec.sourceZoom,
          loadedTiles
        );
        if (!Number.isFinite(sourceMeters)) continue;
        const widthWorld = Number(building.widthMeters) * unitsPerMeter;
        const depthWorld = Number(building.depthMeters) * unitsPerMeter;
        const areaWorld = Number(building.areaMeters) * unitsPerMeter * unitsPerMeter;
        const footprint = [
          { x: center.x - widthWorld * 0.5, z: center.z - depthWorld * 0.5 },
          { x: center.x + widthWorld * 0.5, z: center.z - depthWorld * 0.5 },
          { x: center.x + widthWorld * 0.5, z: center.z + depthWorld * 0.5 },
          { x: center.x - widthWorld * 0.5, z: center.z + depthWorld * 0.5 }
        ];
        const massing = resolveFarBuildingMassing(building, footprint, areaWorld, unitsPerMeter);
        if (!massing) continue;
        instances.push({
          x: center.x,
          z: center.z,
          baseY: (sourceMeters + offsetMeters) * unitsPerMeter * yExaggeration + 0.25,
          width: widthWorld,
          depth: depthWorld,
          height: massing.heightMeters * unitsPerMeter,
          rotationY: Number(building.rotationY) || 0,
          color: massing.color
        });
        continue;
      }
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
      exactPublished += 1;
    }

    let geometry = null;
    if (exactPublished > 0) {
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
    if (!geometry && instances.length === 0) return null;
    return {
      geometry,
      instances,
      exactBuildings: exactPublished,
      instancedBuildings: instances.length,
      buildings: exactPublished + instances.length
    };
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
        spec.detailExclusionGeographic,
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
    const geometryBuildStartedAt = performance.now();
    const built = buildFarFieldGeometry(spec, loadedTiles, offsetMeters, mappedContext);
    const terrainGeometryBuildMs = performance.now() - geometryBuildStartedAt;
    const buildingBuildStartedAt = performance.now();
    const builtBuildings = buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext);
    const buildingGeometryBuildMs = performance.now() - buildingBuildStartedAt;
    const waterBuildStartedAt = performance.now();
    const builtWater = buildFarWaterGeometry(appCtx, mappedContext);
    const waterGeometryBuildMs = performance.now() - waterBuildStartedAt;
    const waterMaskBuildStartedAt = performance.now();
    const waterTerrainMask = buildMappedWaterTerrainOwnershipMask(appCtx, mappedContext, spec);
    const waterTerrainMaskBuildMs = performance.now() - waterMaskBuildStartedAt;
    if (requestGeneration !== generation) {
      built?.geometry?.dispose?.();
      builtBuildings?.geometry?.dispose?.();
      builtWater?.geometry?.dispose?.();
      waterTerrainMask?.texture?.dispose?.();
      return;
    }
    if (!built) {
      builtBuildings?.geometry?.dispose?.();
      builtWater?.geometry?.dispose?.();
      waterTerrainMask?.texture?.dispose?.();
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
    farFieldSurfaceState = {
      spec,
      worldCoverResult: worldCoverContext,
      surfaceGrid: built.surfaceGrid
    };
    applyFixedLocationSurfaceMaterial(mesh, worldCoverContext, spec);
    applyMappedWaterTerrainOwnership(mesh, material, waterTerrainMask);
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
      farContextMesh = builtBuildings.geometry
        ? new THREE.Mesh(builtBuildings.geometry, buildingMaterial)
        : new THREE.Group();
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
      if (builtBuildings.instances.length > 0) {
        const instanceGeometry = new THREE.BoxGeometry(1, 1, 1);
        instanceGeometry.translate(0, 0.5, 0);
        const instanceMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.94,
          metalness: 0,
          side: THREE.FrontSide,
          fog: true
        });
        const instanceMesh = new THREE.InstancedMesh(
          instanceGeometry,
          instanceMaterial,
          builtBuildings.instances.length
        );
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const color = new THREE.Color();
        const up = new THREE.Vector3(0, 1, 0);
        builtBuildings.instances.forEach((building, index) => {
          position.set(building.x, building.baseY, building.z);
          rotation.setFromAxisAngle(up, building.rotationY);
          scale.set(building.width, building.height, building.depth);
          matrix.compose(position, rotation, scale);
          instanceMesh.setMatrixAt(index, matrix);
          color.setRGB(building.color[0], building.color[1], building.color[2]);
          instanceMesh.setColorAt(index, color);
        });
        instanceMesh.instanceMatrix.needsUpdate = true;
        if (instanceMesh.instanceColor) instanceMesh.instanceColor.needsUpdate = true;
        instanceMesh.name = 'FarMappedBuildingInstances';
        instanceMesh.renderOrder = 1;
        instanceMesh.castShadow = false;
        instanceMesh.receiveShadow = false;
        instanceMesh.frustumCulled = false;
        instanceMesh.userData.isFarMappedBuildingInstances = true;
        farContextMesh.add(instanceMesh);
      }
      appCtx.terrainGroup.add(farContextMesh);
    }
    farWaterMesh = createFarWaterMesh(builtWater, FAR_CONTEXT_HALF_EXTENT_METERS);
    if (farWaterMesh) {
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
      waterMaskedVertices: built.waterMaskedVertices,
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
      farWaterTerrainMaskPolygons: waterTerrainMask?.polygons || 0,
      farWaterTerrainMaskSize: waterTerrainMask?.size || 0,
      farWaterTerrainMaskAuthority: waterTerrainMask
        ? 'mapped-water-polygon-fragment-mask'
        : null,
      terrainGeometryBuildMs,
      buildingGeometryBuildMs,
      waterGeometryBuildMs,
      waterTerrainMaskBuildMs,
      skippedDuplicateNearBuildings: mappedContext.skippedNearBuildings,
      farBuildingsAvailable: mappedContext.availableBuildings,
      farBuildingSelectionTarget: mappedContext.selectedBuildingTarget,
      farBuildingSelectionCoverage: mappedContext.selectedBuildingCoverage,
      farBuildingPublishedCoverage: mappedContext.availableBuildings > 0
        ? (builtBuildings?.buildings || 0) / mappedContext.availableBuildings
        : 1,
      farExactBuildings: builtBuildings?.exactBuildings || 0,
      farInstancedBuildings: builtBuildings?.instancedBuildings || 0,
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

  function sampleFarTerrainWorldYAt(x, z) {
    if (!farFieldMesh || !farFieldSurfaceState || farFieldMesh.userData?.farFieldDisposed) return null;
    return sampleFarFieldGridWorldY(
      Number(x),
      Number(z),
      farFieldSurfaceState.surfaceGrid
    );
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
    const plannedDetailRadius = Math.max(
      800,
      Number(appCtx.plannedEarthDetailRadiusWorld || appCtx.initialEarthDetailRadius || 0)
    );
    const detailExclusion = {
      minX: -plannedDetailRadius,
      maxX: plannedDetailRadius,
      minZ: -plannedDetailRadius,
      maxZ: plannedDetailRadius
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
        detailExclusionGeographic: geographicBounds(detailExclusion),
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
    sampleFarTerrainWorldYAt,
    scheduleFarTerrainSurfaceRefresh,
    updateFarTerrainClipmap,
    waitForFarTerrainClipmap
  };
}

export {
  FAR_CONTEXT_BUILDING_COVERAGE_TARGET,
  FAR_CONTEXT_BUILDING_MAX_TILES,
  FAR_CONTEXT_HALF_EXTENT_METERS,
  FAR_WATER_SURFACE_CLEARANCE_WORLD,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_MAX_BUILDING_INSTANCES,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  FAR_WATER_TERRAIN_MASK_SIZE,
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
