import { markGroundSurfaceChanged } from './surface-revision.js';
import { createRegionalSceneryScheduler, requireCompleteTravelScenery, readRegionalSceneryPreference, writeRegionalSceneryPreference } from './regional-scenery-scheduler.js';
import { createRegionBuild } from '../earth-core/region-build.js';
import { leaseRoadOverview } from './road-overview-owner.js';
import { buildRegionalRoadCoverageMask } from './regional-road-coverage.js';
import {
  FAR_CONTEXT_BUILDING_COVERAGE_TARGET,
  FAR_CONTEXT_BUILDING_MAX_TILES,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_MAX_BUILDING_INSTANCES,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  contextTileCount,
  loadFarMappedContext,
  pointInMappedLandArea,
  pointInMappedWaterArea
} from './far-field-mapped-context.js?v=20';
import { buildFarBuildingInstanceBatches } from './far-building-instance-batches.js?v=1';
import { FarBuildingInstanceStorage } from './far-building-instance-storage.js';
import { resolveFarBuildingMassing, farBuildingRenderFootprint } from './far-building-massing.js?v=2';
import { applyFarBuildingFacadeDetail } from './far-building-facade-material.js?v=4';
import { loadFarTerrainElevationWithParentFallback } from './far-field-elevation-loader.js?v=2';
import { applyTerrainPortalMasksForContext, terrainHeightWithPortalCuts } from './structure-terrain-portals.js?v=2';
import {
  cellInsideDetailedCoverage,
  cellInsideHole
} from './far-field-coverage.js?v=2';
import {
  buildClipmapAxis,
  createFarFieldGeometryPlanner,
  disposeFarFieldMesh,
  parentTerrainTile,
  resolveFarFieldFallbackDatum,
  sampleFarFieldGridWorldY
} from './far-field-geometry.js?v=18';
import {
  classifyWorldCoverSurface,
  loadWorldCoverBaseline
} from './worldcover-baseline.js?v=17';
import {
  applyMappedSemanticVertexTints,
  applyTerrainSemanticMaterialBlend,
  applyWorldCoverVertexTints,
  ensureTerrainTextureSet
} from './surface-profiles.js?v=54';
import {
  applyWorldCoverSurfaceMaterialMix,
  setNormalizedTerrainAttribute,
  ensureTerrainSurfaceMixAttributes,
  setTerrainSurfaceMaterialMixAt,
  applyTerrainProfileSurfaceMaterialMix
} from './surface-material-blend.js?v=2';
import { resolveWorldCoverDetailMode } from './worldcover-detail-mode.js?v=1';
import {
  FAR_WATER_SURFACE_CLEARANCE_WORLD,
  FAR_WATER_TERRAIN_MASK_SIZE,
  applyMappedWaterTerrainOwnership,
  buildFarWaterGeometry,
  publishedWaterDetailAreas,
  buildMappedWaterTerrainOwnershipMask,
  createFarWaterMesh
} from './far-field-water.js?v=7';
import { FIXED_REGIONAL_CONTEXT_RADIUS_METERS } from '../world/fixed-regional-context.js?v=9';
import { yieldToMainThread } from '../world/cooperative-scheduling.js?v=1';

const FAR_FIELD_SOURCE_ZOOM_OFFSET = 3;
const FAR_FIELD_OUTER_DISTANCE_METERS = 22000;
// Keep the accepted fixed-location ground mesh density. Ground appearance is
// owned by the shared PBR/WorldCover presentation; structure and facade work
// must not silently replace its geometry with a different terrain product.
const FAR_FIELD_GRID_INTERVAL_METERS = 320;
const FAR_FIELD_GAP_FILL_INTERVAL_METERS = 40;
const FAR_FIELD_WORLDCOVER_SIZE = 256;
const FAR_FIELD_SEAM_BLEND_METERS = 550;
const FAR_CONTEXT_HALF_EXTENT_METERS = FIXED_REGIONAL_CONTEXT_RADIUS_METERS;

function createFarFieldTerrainApi(deps = {}) {
  const {
    appCtx,
    clampElevationMeters,
    getOrLoadTerrainTile,
    pruneTerrainTileCache,
    latLonToTileXY,
    sampleAcceptedGroundAtLatLon,
    sampleAcceptedGroundElevationAtLatLon,
    sampleDetailedTerrainMetersAtLatLon,
    sampleTileElevationMeters,
    terrainTileDeps,
    tileXYToLatLonBounds,
    waitForTerrainTileReadyAtZoom,
    worldToLatLon,
    loadMappedContext = loadFarMappedContext,
    loadWorldCover = loadWorldCoverBaseline
  } = deps;

  let generation = 0;
  let activeKey = '';
  let farFieldMesh = null;
  let farContextMesh = null;
  let farWaterMesh = null;
  let regionalRoadCoverage = null;
  let pendingFarWaterContext = null;
  let pendingBuildPromise = null;
  let elevationAbortController = null;
  let farFieldSurfaceState = null;
  let surfaceRefreshTimer = null;
  let lastAppliedDetailMode = '';
  let lastAppliedFallbackMode = '';
  let locationTerrainRequest = null;
  const scenery = createRegionalSceneryScheduler({ request: anchor => {
    if (!locationTerrainRequest) throw new Error('The starting terrain is not ready');
    return updateFarTerrainClipmap({ ...locationTerrainRequest, anchor });
  } });
  scenery.setEnabled(readRegionalSceneryPreference());
  function updateRegionalSceneryFocus() {
    if (!locationTerrainRequest || !farFieldMesh || !appCtx.gameStarted || appCtx.worldLoading ||
        appCtx.onMoon || appCtx.onMars || appCtx.activePlanetaryBodyId || appCtx.activeShipInterior ||
        (appCtx.isEnv && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH))) return;
    const actor = appCtx.activeEarthActorPosition?.();
    if (actor) scenery.step(actor, Math.min(6000, Number(appCtx.farTerrainClipmapState?.contextHalfExtentWorld || 14000) * .45));
  }
  function setRegionalSceneryEnabled(enabled) {
    scenery.setEnabled(enabled);
    writeRegionalSceneryPreference(enabled);
    updateRegionalSceneryFocus();
  }


  function acceptedGroundCoversBounds(bounds) {
    const latitudes = [
      Number(bounds?.latS),
      (Number(bounds?.latS) + Number(bounds?.latN)) * 0.5,
      Number(bounds?.latN)
    ];
    const longitudes = [
      Number(bounds?.lonW),
      (Number(bounds?.lonW) + Number(bounds?.lonE)) * 0.5,
      Number(bounds?.lonE)
    ];
    if (![...latitudes, ...longitudes].every(Number.isFinite)) return false;
    return latitudes.every((latitude) => longitudes.every((longitude) => {
      const sample = sampleAcceptedGroundAtLatLon(latitude, longitude);
      return sample?.status === 'available' &&
        Number.isFinite(Number(sample.groundElevationMeters));
    }));
  }

  function waitForGenerationDrain(buildPromise) {
    if (!buildPromise) return Promise.resolve();
    return Promise.resolve(buildPromise).catch(() => undefined);
  }

  function setState(next) {
    appCtx.farTerrainClipmapState = Object.freeze({ generation, key: activeKey, ...(next || {}) });
  }

  function untrackWaterMesh(mesh) {
    if (!mesh?.material || !appCtx.waterWaveVisuals?.includes(mesh.material)) return;
    appCtx.replaceWorldCollection('waterWaveVisuals', appCtx.waterWaveVisuals.filter(material => material !== mesh.material));
  }

  function removeCurrentMesh() {
    regionalRoadCoverage?.mask.dispose();regionalRoadCoverage=null;
    appCtx.fixedRegionalStructureWaterAreas = [];
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
      untrackWaterMesh(farWaterMesh);
      farWaterMesh.parent?.remove?.(farWaterMesh);
      disposeFarFieldMesh(farWaterMesh);
      farWaterMesh = null;
    }
    farFieldSurfaceState = null;
    lastAppliedDetailMode = '';
    lastAppliedFallbackMode = '';
  }

  function resetFarTerrainClipmap() {
    scenery.reset();
    locationTerrainRequest = null;
    appCtx.structureTerrainPortalDescriptors = [];
    const retiringBuildPromise = pendingBuildPromise;
    generation += 1;
    elevationAbortController?.abort?.('far-terrain-generation-reset');
    elevationAbortController = null;
    if (surfaceRefreshTimer !== null) clearTimeout(surfaceRefreshTimer);
    surfaceRefreshTimer = null;
    activeKey = '';
    removeCurrentMesh();
    const drain = waitForGenerationDrain(retiringBuildPromise);
    pendingBuildPromise = drain;
    void drain.finally(() => { if (pendingBuildPromise === drain) pendingBuildPromise = null; });
    appCtx.fixedLocationMappedSurfaceContext = null;
    pendingFarWaterContext = null;
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
    farFieldGapFillIntervalMeters: FAR_FIELD_GAP_FILL_INTERVAL_METERS,
    farFieldSeamBlendMeters: FAR_FIELD_SEAM_BLEND_METERS,
    latLonToTileXY,
    sampleAcceptedGroundAtLatLon,
    sampleAcceptedGroundElevationAtLatLon,
    sampleDetailedTerrainMetersAtLatLon,
    sampleTileElevationMeters,
    terrainTileDeps,
    tileXYToLatLonBounds,
    worldToLatLon,
    pointInMappedWaterArea,
    pointInMappedLandArea
  });

  function applyMappedSurfaceTintOwnership(mesh) {
    const colors = mesh?.geometry?.attributes?.color;
    const mappedTints = mesh?.userData?.mappedSurfaceTints;
    const mappedModes = mesh?.userData?.mappedSurfaceModes;
    if (!colors || !mappedTints || mappedTints.length !== colors.count * 3) return false;
    const materialMix = ensureTerrainSurfaceMixAttributes(mesh.geometry);
    let owned = 0;
    for (let index = 0; index < colors.count; index += 1) {
      const offset = index * 3;
      if (!Number.isFinite(mappedTints[offset])) continue;
      setNormalizedTerrainAttribute(colors, index, [
        mappedTints[offset],
        mappedTints[offset + 1],
        mappedTints[offset + 2]
      ]);
      setTerrainSurfaceMaterialMixAt(materialMix, index, mappedModes?.[index] || 'grass');
      owned += 1;
    }
    if (owned > 0) {
      colors.needsUpdate = true;
      if (materialMix) {
        materialMix.mixA.needsUpdate = true;
        materialMix.mixB.needsUpdate = true;
      }
    }
    mesh.userData.mappedSurfaceTintVertices = owned;
    return owned > 0;
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
    if (['snow', 'snowRock', 'rock', 'sand'].includes(worldHint)) return worldHint;
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
    // Match the detailed terrain's six-world-unit grass scale. Mip filtering
    // handles the aerial LOD; changing texel scale at the seam does not.
    const repeats = Math.max(1, spanMeters * unitsPerMeter / 6);
    const detailTextures = ensureTerrainTextureSet(mesh, repeats, 'grass');
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
    if (worldCoverResult) applyWorldCoverSurfaceMaterialMix(mesh, worldCoverResult);
    else applyTerrainProfileSurfaceMaterialMix(mesh, detailMode);
    applyMappedSurfaceTintOwnership(mesh);
    applyTerrainSemanticMaterialBlend(mesh, repeats);
    material.color.setHex(0xffffff);
    material.roughness = 0.96;
    material.metalness = 0;
    material.needsUpdate = true;
    mesh.userData.terrainTextureRepeats = repeats;
    mesh.userData.terrainDetailProvenance = {
      kind: tinted
        ? 'fixed-location-spatial-worldcover-mapped-semantic-pbr'
        : 'fixed-location-semantic-pbr',
      source: worldCoverResult?.source || 'fixed-location-profile',
      mode: 'semantic-pbr',
      hardscapeOwner: 'exact-mapped-surface-geometry'
    };
    mesh.userData.farSurfaceDetailMode = 'semantic-pbr';
    mesh.userData.farSurfaceFallbackMode = detailMode;
    return true;
  }

  async function buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext, isCurrent=()=>true) {
    const positions = [];
    const colors = [];
    const indices = [];
    const unitsPerMeter = Number(appCtx.WORLD_UNITS_PER_METER || 1);
    const yExaggeration = Number(appCtx.TERRAIN_Y_EXAGGERATION || 1);
    let exactPublished = 0;
    let mappedHeightBuildings = 0;
    let inferredHeightBuildings = 0;
    let majorBuildings = 0;
    let simplifiedFootprintFallbacks = 0;
    const rejectedBuildings = { outside: 0, missingGround: 0, implausibleMassing: 0 };
    const groundMetersAt = (latitude, longitude) => {
      const accepted = sampleAcceptedGroundAtLatLon(latitude, longitude);
      const acceptedMeters = Number(accepted?.groundElevationMeters);
      if (accepted?.status === 'available' && Number.isFinite(acceptedMeters)) {
        return acceptedMeters;
      }
      const sampledSourceMeters = sampleSourceMeters(
        latitude,
        longitude,
        spec.sourceZoom,
        loadedTiles
      );
      const sourceMeters = Number.isFinite(sampledSourceMeters)
        ? sampledSourceMeters
        : Number(spec.fallbackElevationMeters);
      return Number.isFinite(sourceMeters) ? sourceMeters + offsetMeters : null;
    };

    const mappedBuildings = mappedContext?.buildings || [];
    const packedDescriptors = typeof mappedBuildings.read === 'function';
    const descriptorScratch = { massing: { color: [0,0,0] } };
    const centerScratch = {};
    const retireDescriptors = () => packedDescriptors ? mappedBuildings.dispose() : (mappedBuildings.length = 0);
    const instances=new FarBuildingInstanceStorage(mappedBuildings.length);
    let buildingSliceStarted = performance.now();
    try {
    for (let buildingIndex = 0; buildingIndex < mappedBuildings.length; buildingIndex += 1) {
      if ((buildingIndex & 63) === 0 && !isCurrent())throw new DOMException('Regional buildings superseded','AbortError');
      if ((buildingIndex & 63) === 0 && performance.now() - buildingSliceStarted >= 8) {
        await yieldToMainThread();
        buildingSliceStarted = performance.now();
      }
      const building = packedDescriptors ? mappedBuildings.read(buildingIndex, descriptorScratch) : mappedBuildings[buildingIndex];
      // The loader hands this compiler exclusive descriptors. Retire each one
      // as it is consumed instead of promoting an entire second city into the
      // main-thread old generation while GPU construction is underway.
      if (!packedDescriptors) mappedBuildings[buildingIndex]=null;
      // Ground, height and eligibility are shared by both visual LODs. Losing
      // vertices while simplifying a polygon must not delete a valid building.
      const center = appCtx.geoToWorld(building.centerLat, building.centerLon, centerScratch);
      if (center.x < spec.outer.minX || center.x > spec.outer.maxX ||
          center.z < spec.outer.minZ || center.z > spec.outer.maxZ) {
        rejectedBuildings.outside++; continue;
      }
      const groundMeters = groundMetersAt(building.centerLat, building.centerLon);
      if (!Number.isFinite(groundMeters)) { rejectedBuildings.missingGround++; continue; }
      const areaWorld = Number(building.areaMeters) * unitsPerMeter * unitsPerMeter;
      const massing = packedDescriptors ? (building.validMassing ? building.massing : null)
        : resolveFarBuildingMassing(building, null, areaWorld, unitsPerMeter);
      if (!massing) { rejectedBuildings.implausibleMassing++; continue; }
      const baseY = groundMeters * unitsPerMeter * yExaggeration + 0.25;
      const footprint = farBuildingRenderFootprint(building, appCtx.geoToWorld, unitsPerMeter);
      const topTriangles = footprint ? THREE.ShapeUtils.triangulateShape(
        footprint.map(point => new THREE.Vector2(point.x, point.z)), []
      ) : [];
      const exact = footprint && topTriangles.length > 0;
      if (massing.heightSource === 'explicit_height' || massing.heightSource === 'levels') {
        mappedHeightBuildings++;
      } else inferredHeightBuildings++;
      if (building.priority >= 1000000) majorBuildings++;
      if (!exact) {
        if (Array.isArray(building.ring)) simplifiedFootprintFallbacks++;
        instances.append(center.x,center.z,baseY,
          Number(building.widthMeters)*unitsPerMeter,Number(building.depthMeters)*unitsPerMeter,
          massing.heightMeters*unitsPerMeter,Number(building.rotationY)||0,massing.color,massing.roofFraction);
        continue;
      }
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
      for (const triangle of topTriangles) {
        indices.push(
          baseIndex + triangle[0] * 2 + 1,
          baseIndex + triangle[1] * 2 + 1,
          baseIndex + triangle[2] * 2 + 1
        );
      }
      exactPublished += 1;
    }

    retireDescriptors();
    let geometry = null;
    if (exactPublished > 0) {
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
    if (!geometry && instances.length === 0) {instances.dispose();return null;}
    return {
      geometry,
      instances,
      exactBuildings: exactPublished,
      instancedBuildings: instances.length,
      mappedHeightBuildings,
      inferredHeightBuildings,
      majorBuildings,
      rejectedBuildings,
      simplifiedFootprintFallbacks,
      heightAuthority: 'shared-building-semantics',
      buildings: exactPublished + instances.length
    };
    } catch(error) {retireDescriptors();instances.dispose();throw error;}
  }

  async function buildAndPublish(spec, requestGeneration, parentSignal) {
    const build = createRegionBuild(parentSignal);
    const signal = build.signal;
    const isCurrent = () => requestGeneration === generation && !signal.aborted;
    try {
    const dependencyStartedAt=performance.now();
    const dependencyDurationsMs={};
    const measureDependency=(name,promise)=>Promise.resolve(promise).finally(()=>{
      dependencyDurationsMs[name]=Math.round(performance.now()-dependencyStartedAt);
      if(requestGeneration===generation) setState({...appCtx.farTerrainClipmapState,dependencyDurationsMs:{...dependencyDurationsMs}});
    });
    const acceptedRegionalGround = acceptedGroundCoversBounds(spec.geographic);
    const sourceTiles = acceptedRegionalGround
      ? []
      : sourceTileRange(spec.geographic, spec.sourceZoom);
    setState({ status: 'loading-elevation-and-context', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length, anchor: spec.anchor, previousRegionRetained: !!farFieldMesh });
    const [elevation, mappedContext, worldCoverContext] = await build.loadAll([
      { load: () => measureDependency('elevation', acceptedRegionalGround
        ? Promise.resolve({
            ready: true,
            missingSourceTiles: [],
            fallbackTiles: [],
            fallback: null,
            primary: { started: 0, maxInFlight: 0 }
          })
        : loadFarTerrainElevationWithParentFallback({
            tiles: sourceTiles,
            isActive: isCurrent,
            parentTile: parentTerrainTile,
            loadTile: (tile) => waitForTerrainTileReadyAtZoom(
              tile.z, tile.tx, tile.ty, 10000, deps, { signal }
            )
          })) },
      { load: () => measureDependency('mappedContext', loadMappedContext(
        spec.contextGeographic,
        spec.detailExclusionGeographic,
        spec.geographic,
        {
          signal,
          concurrency: spec.travelRefresh ? 4 : 8,
          detailedBuildingFrame: { origin: {lat: appCtx.LOC.lat, lon: appCtx.LOC.lon}, scale: appCtx.SCALE,
            radius: Number(appCtx.worldLoadRuntimeState?.buildingVisibleRadiusWorld) },
          roadCoverageFrame: { bounds: spec.contextOuter, geoToWorld: appCtx.geoToWorld,
            maxTextureSize: appCtx.renderer?.capabilities?.maxTextureSize || 4096,
            unitsPerMeter: Number(appCtx.WORLD_UNITS_PER_METER || 1) },
          // The provider rectangle is only a coarse exclusion. Detailed
          // publication clips to a circle, including on low-detail clients.
          // A corner outside that circle belongs to the regional LOD.
          isWithinDetailedBuildingDomain: (latitude, longitude) => {
            const point = appCtx.geoToWorld(latitude, longitude);
            const radius = Number(appCtx.worldLoadRuntimeState?.buildingVisibleRadiusWorld);
            return Number.isFinite(radius) && radius > 0 && Math.hypot(point.x, point.z) <= radius;
          }
        }
      )), retire: context => {
        context?.buildings?.dispose?.();
        context?.roadCoveragePlan?.dispose?.();
      } },
      { load: () => measureDependency('worldCover', loadWorldCover(spec.geographic, {
        size: FAR_FIELD_WORLDCOVER_SIZE,
        key: `far-field:${activeKey}`,
        signal,
        priority: -10
      }).catch(() => null)) }
    ]);
    if (!isCurrent()) return;
    if (spec.travelRefresh) requireCompleteTravelScenery(mappedContext);
    // The detailed mesh queue must settle before the far mesh chooses its
    // holes. Otherwise late near tiles cover a far surface that was compiled
    // through their still-empty slots, leaving two terrain owners.
    await appCtx.waitForLocationTerrainPublication?.();
    if(requestGeneration!==generation || signal.aborted)return;
    const coverageRequest = spec.detailedCoverageRequest || {};
    spec = {
      ...spec,
      detailedCoverage: completeDetailedTileCoverage(
        Number(coverageRequest.z),
        Number(coverageRequest.centerX),
        Number(coverageRequest.centerY),
        Number(coverageRequest.ring)
      )
    };
    const missingSourceTiles = elevation.missingSourceTiles;
    const fallbackTiles = elevation.fallbackTiles;
    const fallbackElevation = elevation.fallback;
    const elevationFallbackMode = elevation.ready ? null : 'accepted-ground-flat-datum';
    const fallbackElevationMeters = elevation.ready
      ? null
      : resolveFarFieldFallbackDatum(sampleAcceptedGroundAtLatLon(appCtx.LOC.lat, appCtx.LOC.lon));
    spec = { ...spec, fallbackElevationMeters };
    const loadedTiles = new Map([
      ...sourceTiles.map((tile) => [tile.key, getOrLoadTerrainTile(tile.z, tile.tx, tile.ty, deps)]),
      ...fallbackTiles.map((tile) => [tile.key, getOrLoadTerrainTile(tile.z, tile.tx, tile.ty, deps)])
    ]);
    const offsetMeters = acceptedRegionalGround
      ? 0
      : elevation.ready
      ? normalizationOffset(spec.inner, spec.sourceZoom, loadedTiles)
      : 0;
    if (!Number.isFinite(offsetMeters)) {
      setState({ status: 'unavailable', reason: 'far-field-datum-normalization-unavailable' });
      return;
    }
    prepareMappedWaterSurfaces(
      mappedContext,
      spec.sourceZoom,
      loadedTiles,
      offsetMeters,
      fallbackElevationMeters
    );

    setState({ status: 'building-geometry', sourceZoom: spec.sourceZoom, sourceTiles: sourceTiles.length, offsetMeters });
    const geometryBuildStartedAt = performance.now();
    const built = await buildFarFieldGeometry(spec, loadedTiles, offsetMeters, mappedContext);
    build.own(built?.geometry);
    if (!isCurrent()) return;
    const terrainGeometryBuildMs = performance.now() - geometryBuildStartedAt;
    const buildingBuildStartedAt = performance.now();
    const builtBuildings = await buildFarBuildingGeometry(spec, loadedTiles, offsetMeters, mappedContext, isCurrent);
    build.own(builtBuildings?.geometry);
    build.own(builtBuildings?.instances);
    if (!isCurrent()) return;
    const buildingGeometryBuildMs = performance.now() - buildingBuildStartedAt;
    const waterBuildStartedAt = performance.now();
    const waterDetailReady=appCtx.detailedWaterPublicationSequence===appCtx._worldLoadSequence;
    const builtWater = buildFarWaterGeometry(appCtx, mappedContext, null, {
      detailedAreas:waterDetailReady ? publishedWaterDetailAreas(appCtx) : []
    });
    build.own(builtWater?.geometry);
    const publishedWaterAreaIdentities = builtWater?.publishedAreaIdentities || new Set();
    const fixedRegionalStructureWaterAreas = (mappedContext?.waterAreas || [])
      .filter((area) =>
        Number.isFinite(Number(area?.surfaceMeters)) &&
        publishedWaterAreaIdentities.has(String(area?.identity || ''))
      )
      .map((area) => {
        const pts = (area.outer || []).map((coordinate) => {
          const lon = Number(coordinate?.[0]);
          const lat = Number(coordinate?.[1]);
          return Number.isFinite(lat) && Number.isFinite(lon) ? appCtx.geoToWorld(lat, lon) : null;
        }).filter(Boolean);
        return {
          pts,
          surfaceY: Number(area.surfaceMeters) * Number(appCtx.WORLD_UNITS_PER_METER || 1) *
            Number(appCtx.TERRAIN_Y_EXAGGERATION || 1) + FAR_WATER_SURFACE_CLEARANCE_WORLD,
          source: 'fixed-regional-mapped-water'
        };
      })
      .filter((area) => area.pts.length >= 3);
    const waterGeometryBuildMs = performance.now() - waterBuildStartedAt;
    const waterMaskBuildStartedAt = performance.now();
    const waterTerrainMask = await buildMappedWaterTerrainOwnershipMask(
      appCtx,
      mappedContext,
      spec,
      publishedWaterAreaIdentities
    );
    build.own(waterTerrainMask?.texture);
    if (!isCurrent()) return;
    const waterTerrainMaskBuildMs = performance.now() - waterMaskBuildStartedAt;
    let builtRoadCoverage = null, roadCoverageError = null;
    try {
      builtRoadCoverage = await buildRegionalRoadCoverageMask(appCtx,mappedContext.roadCoveragePlan,{signal});
      build.own(builtRoadCoverage?.mask);
    } catch (error) { roadCoverageError = String(error?.message || error); }
    if (!isCurrent()) return;
    if (!built) {
      setState({ status: 'unavailable', reason: 'far-field-elevation-sampling-failed' });
      return;
    }

    // Prepare all owners off-scene. The previous complete region stays usable
    // while instance matrices yield, and failures retire only this draft.
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
    build.own(material);
    const mesh = build.own(new THREE.Mesh(built.geometry, material), disposeFarFieldMesh);
    build.transfer(built.geometry);
    build.transfer(material);
    mesh.name = 'FixedLocationTerrainLod';
    mesh.renderOrder = 0;
    // The geometry planner computes bounds and refreshes them after seam edits.
    mesh.frustumCulled = true;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.isFarTerrainClipmap = true;
    mesh.userData.isFixedLocationTerrainLod = true;
    mesh.userData.mappedSurfaceTints = built.mappedSurfaceTints;
    mesh.userData.mappedSurfaceModes = built.mappedSurfaceModes;
    const nextSurfaceState = {
      spec,
      worldCoverResult: worldCoverContext,
      surfaceGrid: built.surfaceGrid,
      refreshBoundaryHeights:built.refreshBoundaryHeights
    };
    applyFixedLocationSurfaceMaterial(mesh, worldCoverContext, spec);
    applyMappedSurfaceTintOwnership(mesh);
    if (applyMappedWaterTerrainOwnership(mesh, material, waterTerrainMask)) {
      build.transfer(waterTerrainMask?.texture);
    }
    const centerAcceptedGround = sampleAcceptedGroundAtLatLon(
      appCtx.LOC.lat,
      appCtx.LOC.lon
    );
    const hasPolarSurface = !acceptedRegionalGround && !elevationFallbackMode &&
      [...loadedTiles.values()].some(tile => Number(tile?.polarSampleCount || 0) > 0);
    mesh.userData.renderProvenance = {
      version: 1,
      profile: 'fixed-location-terrain-lod',
      provider: acceptedRegionalGround
        ? centerAcceptedGround?.providerId
        : elevationFallbackMode ? 'accepted-ground-flat-datum' : hasPolarSurface ? 'rema-mapzen-surface-composite' : 'mapzen-terrarium',
      dataset: acceptedRegionalGround
        ? centerAcceptedGround?.artifactId
        : elevationFallbackMode
        ? 'Degraded fixed-location flat datum with mapped surface semantics'
        : hasPolarSurface ? 'REMA orthometric surface with Mapzen void fallback' : 'Mapzen Terrarium elevation-derived landscape',
      verticalDatum: centerAcceptedGround?.verticalDatum || (hasPolarSurface ? 'EGM2008 for REMA samples; mixed-source datum for fallback cells' : null),
      normalizationOffsetMeters: offsetMeters,
      layer: 'terrain',
      role: 'fixed-location-terrain-lod',
      sources: [
        ...(acceptedRegionalGround
          ? [centerAcceptedGround?.artifactId].filter(Boolean)
          : elevationFallbackMode ? ['accepted-ground-flat-datum'] : hasPolarSurface ? ['pgc-rema-orthometric', 'mapzen-terrarium'] : ['mapzen-terrarium']),
        'openstreetmap-shortbread',
        ...(worldCoverContext ? ['esa-worldcover-2021'] : [])
      ],
      fallback: !acceptedRegionalGround && (!!elevationFallbackMode || (
        offsetMeters === 0 &&
        typeof terrainTileDeps?.usesAcceptedGround === 'function' &&
        !terrainTileDeps.usesAcceptedGround()
      ))
    };

    let buildingContext = null;
    if (builtBuildings) {
      const buildingMaterial = builtBuildings.geometry ? applyFarBuildingFacadeDetail(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        flatShading: true,
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
        fog: true
      })) : null;
      build.own(buildingMaterial);
      buildingContext = build.own(builtBuildings.geometry
        ? new THREE.Mesh(builtBuildings.geometry, buildingMaterial)
        : new THREE.Group(), disposeFarFieldMesh);
      build.transfer(builtBuildings.geometry);
      build.transfer(buildingMaterial);
      buildingContext.name = 'FarMappedBuildingContext';
      buildingContext.renderOrder = 1;
      buildingContext.castShadow = false;
      buildingContext.receiveShadow = false;
      buildingContext.userData.isFarMappedContext = true;
      buildingContext.userData.renderProvenance = {
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
        const instanceMaterial = applyFarBuildingFacadeDetail(new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.94,
          metalness: 0,
          side: THREE.FrontSide,
          fog: true
        }));
        build.own(instanceMaterial);
        const batches = await buildFarBuildingInstanceBatches(
            THREE, builtBuildings.instances, instanceMaterial, { yieldControl: async()=>{
              await yieldToMainThread();
              if(requestGeneration!==generation||signal.aborted)throw new DOMException('Regional buildings superseded','AbortError');
            } }
          );
        for (const batch of batches) buildingContext.add(batch);
        if (batches.length) build.transfer(instanceMaterial);
      }
      builtBuildings.instances.dispose();
      build.transfer(builtBuildings.instances);
    }
    if (!isCurrent()) return;
    const waterMesh = build.own(createFarWaterMesh(builtWater, FAR_CONTEXT_HALF_EXTENT_METERS, { track: false }), disposeFarFieldMesh);
    if (waterMesh) build.transfer(builtWater.geometry);

    // No await is allowed across this handoff. Scene, sampling and water/road
    // registries must describe the same generation at the next rendered frame.
    removeCurrentMesh();
    farFieldMesh = build.transfer(mesh);
    farContextMesh = build.transfer(buildingContext);
    farWaterMesh = build.transfer(waterMesh);
    farFieldSurfaceState = nextSurfaceState;
    appCtx.clearTerrainHeightCache?.();
    markGroundSurfaceChanged(appCtx);
    lastAppliedDetailMode = mesh.userData.farSurfaceDetailMode;
    lastAppliedFallbackMode = mesh.userData.farSurfaceFallbackMode;
    appCtx.fixedRegionalStructureWaterAreas = fixedRegionalStructureWaterAreas;
    appCtx.terrainGroup.add(farFieldMesh);
    if (farContextMesh) appCtx.terrainGroup.add(farContextMesh);
    if (farWaterMesh) {
      appCtx.terrainGroup.add(farWaterMesh);
      appCtx.replaceWorldCollection('waterWaveVisuals', [...(appCtx.waterWaveVisuals || []), farWaterMesh.material]);
    }
    regionalRoadCoverage = builtRoadCoverage ? {
      stats: builtRoadCoverage.stats,
      mask: leaseRoadOverview(appCtx, build.transfer(builtRoadCoverage.mask), 20)
    } : null;
    regionalRoadCoverage?.mask.syncMaterials();
    if (appCtx.structureTerrainPortalDescriptors?.length) {
      applyTerrainPortalMasksForContext(appCtx, appCtx.structureTerrainPortalDescriptors);
    }
    pendingFarWaterContext = waterDetailReady || !farWaterMesh ? null : { waterAreas: mappedContext.waterAreas };
    if (appCtx.detailedWaterPublicationSequence === appCtx._worldLoadSequence) refreshFarWaterDetailCoverage();
    appCtx.fixedLocationMappedSurfaceContext = Object.freeze({
      contextZoom: mappedContext.contextZoom,
      landAreas: Number(mappedContext.landAreas || 0),
      landAreasByTile: mappedContext.landAreasByTile,
      landAreaSpatialByTile: mappedContext.landAreaSpatialByTile,
      surfaceFallbackByTile: mappedContext.surfaceFallbackByTile
    });
    let detailedMappedSurfaceTintVertices = 0;
    for (const detailedMesh of appCtx.terrainGroup?.children || []) {
      if (detailedMesh?.userData?.isTerrainMesh !== true || detailedMesh.userData?.isFarTerrainClipmap) continue;
      if (!isCurrent()) return;
      detailedMappedSurfaceTintVertices += applyMappedSemanticVertexTints(detailedMesh, appCtx.fixedLocationMappedSurfaceContext);
      await yieldToMainThread();
    }
    if (!isCurrent()) return;
    setState({
      status: 'ready',
      anchor: spec.anchor,
      contextHalfExtentWorld: spec.contextHalfExtentWorld,
      dependencyDurationsMs,
      contextBatchMetrics:mappedContext.contextBatchMetrics,
      waterBatchMetrics:mappedContext.waterBatchMetrics,
      contextMissingTiles:mappedContext.contextMissingTiles,
      waterMissingTiles:mappedContext.waterMissingTiles,
      sourceZoom: spec.sourceZoom,
      preferredSourceZoom: spec.preferredSourceZoom,
      sourceTiles: sourceTiles.length,
      elevationRequestsStarted: elevation.primary.started,
      elevationMaxInFlight: elevation.primary.maxInFlight,
      missingSourceTiles: missingSourceTiles.length,
      fallbackSourceTiles: fallbackTiles.length,
      fallbackElevationRequestsStarted: Number(fallbackElevation?.started || 0),
      fallbackElevationMaxInFlight: Number(fallbackElevation?.maxInFlight || 0),
      elevationFallbackMode,
      groundAuthority: acceptedRegionalGround
        ? 'accepted-ground-stack'
        : elevationFallbackMode || (hasPolarSurface ? 'rema-mapzen-surface-composite' : 'mapzen-terrarium-offset'),
      fallbackElevationMeters,
      offsetMeters,
      columns: built.columns,
      rows: built.rows,
      vertices: built.geometry.attributes.position.count,
      triangles: built.geometry.index.count / 3,
      minElevationMeters: built.minElevationMeters,
      maxElevationMeters: built.maxElevationMeters,
      waterMaskedVertices: built.waterMaskedVertices,
      terrainCoverage: built.coverage,
      surfaceColor: worldCoverContext
        ? 'shared-worldcover-pbr-with-mapped-semantic-overrides'
        : Number(mappedContext.landAreas || 0) > 0
          ? 'mapped-shortbread-semantic-pbr'
          : 'shared-semantic-pbr',
      surfaceMaterialOwner: 'single-terrain-semantic-pbr',
      surfaceDetailMode: lastAppliedDetailMode,
      worldCoverSurfaceStatus: worldCoverContext ? 'ready' : 'unavailable',
      mappedSurfaceTintAreas: Number(mappedContext.landAreas || 0),
      mappedSurfaceTintVertices: Number(mesh.userData.mappedSurfaceTintVertices || 0),
      detailedMappedSurfaceTintVertices,
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
        ? 'published-water-geometry-fragment-mask'
        : null,
      terrainGeometryBuildMs,
      buildingGeometryBuildMs,
      waterGeometryBuildMs,
      waterTerrainMaskBuildMs,
      skippedDuplicateNearBuildings: mappedContext.skippedNearBuildings,
      farBuildingsAvailable: mappedContext.availableBuildings,
      regionalBuildingCompiler: mappedContext.compiler || {mode: 'main-thread'},
      farBuildingsSource: mappedContext.sourceBuildings,
      regionalRoadCoverage: regionalRoadCoverage?.stats || { status:'unavailable', reason:roadCoverageError },
      farBuildingsInvalid: mappedContext.invalidBuildings,
      farBuildingsOutside: mappedContext.outsideBuildings,
      farMajorBuildingsAvailable: mappedContext.majorBuildingsAvailable,
      farMajorBuildingsSelected: mappedContext.majorBuildingsSelected,
      farMajorBuildingsRendered: builtBuildings?.majorBuildings || 0,
      farBuildingRejections: builtBuildings?.rejectedBuildings || null,
      farBuildingSimplificationFallbacks: builtBuildings?.simplifiedFootprintFallbacks || 0,
      farBuildingBudgetExceeded: mappedContext.buildingBudgetExceeded,
      farBuildingSourceCoverageComplete: mappedContext.sourceCoverageComplete,
      farBuildingCoverageStatus: mappedContext.coverageStatus,
      farBuildingSelectionTarget: mappedContext.selectedBuildingTarget,
      farBuildingSelectionCoverage: mappedContext.selectedBuildingCoverage,
      farBuildingPublishedCoverage: mappedContext.availableBuildings > 0
        ? (builtBuildings?.buildings || 0) / mappedContext.availableBuildings
        : 1,
      farExactBuildings: builtBuildings?.exactBuildings || 0,
      farInstancedBuildings: builtBuildings?.instancedBuildings || 0,
      farMappedHeightBuildings: builtBuildings?.mappedHeightBuildings || 0,
      farInferredHeightBuildings: builtBuildings?.inferredHeightBuildings || 0,
      farBuildingHeightAuthority: builtBuildings?.heightAuthority || null,
      geometryBuildPasses: 1,
      farBuildings: builtBuildings?.buildings || 0,
      detailedTerrainTilesExcluded: spec.detailedCoverage?.length || 0,
      outerDistanceMeters: FAR_FIELD_OUTER_DISTANCE_METERS
    });
    } finally { build.dispose(); }
  }

  function refreshFarWaterDetailCoverage() {
    if(!pendingFarWaterContext || !farWaterMesh)return false;
    const built=buildFarWaterGeometry(appCtx,pendingFarWaterContext,null,{detailedAreas:publishedWaterDetailAreas(appCtx)});
    const previous=farWaterMesh.geometry;
    if(built){farWaterMesh.geometry=built.geometry;farWaterMesh.userData.detailedWaterAreaCount=built.detailedAreaCount;}
    else {
      farWaterMesh.parent?.remove(farWaterMesh);
      appCtx.replaceWorldCollection('waterWaveVisuals',(appCtx.waterWaveVisuals||[]).filter(m=>m!==farWaterMesh.material));
      farWaterMesh.material.dispose();farWaterMesh=null;
    }
    previous.dispose();pendingFarWaterContext=null;
    return true;
  }

  function refreshFarTerrainSurfaceColors() {
    regionalRoadCoverage?.mask.syncMaterials();
    if (!farFieldMesh || !farFieldSurfaceState || farFieldMesh.userData?.farFieldDisposed) return false;
    const nextMode = fixedLocationDetailMode(farFieldSurfaceState.worldCoverResult);
    if (nextMode === lastAppliedFallbackMode) return false;
    if (!applyFixedLocationSurfaceMaterial(
      farFieldMesh,
      farFieldSurfaceState.worldCoverResult,
      farFieldSurfaceState.spec
    )) return false;
    applyMappedSurfaceTintOwnership(farFieldMesh);
    lastAppliedDetailMode = farFieldMesh.userData.farSurfaceDetailMode;
    lastAppliedFallbackMode = farFieldMesh.userData.farSurfaceFallbackMode;
    setState({
      ...appCtx.farTerrainClipmapState,
      surfaceDetailMode: 'semantic-pbr',
      surfaceRefreshes: Number(appCtx.farTerrainClipmapState?.surfaceRefreshes || 0) + 1
    });
    return true;
  }

  function sampleFarTerrainWorldYAt(x, z, options = {}) {
    if (!farFieldMesh || !farFieldSurfaceState || farFieldMesh.userData?.farFieldDisposed) return null;
    const height = sampleFarFieldGridWorldY(
      Number(x),
      Number(z),
      farFieldSurfaceState.surfaceGrid
    );
    return options.ignorePortalCuts ? height :
      terrainHeightWithPortalCuts(farFieldMesh.userData.structureTerrainPortalDescriptors, x, z, height);
  }

  function refreshFarTerrainBoundaryHeights() {
    if(!farFieldMesh || !farFieldSurfaceState)return 0;
    return farFieldSurfaceState.refreshBoundaryHeights?.(appCtx.terrainGroup?.children)||0;
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
    if (!options.anchor) locationTerrainRequest = { z, centerX, centerY, ring };
    const anchor = { x: Number(options.anchor?.x) || 0, z: Number(options.anchor?.z) || 0 };
    const key = `${z}/${centerX}/${centerY}/r${ring}/a${anchor.x}:${anchor.z}`;
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
      minX: anchor.x - outerHalfExtent,
      maxX: anchor.x + outerHalfExtent,
      minZ: anchor.z - outerHalfExtent,
      maxZ: anchor.z + outerHalfExtent
    };
    let contextHalfExtent = Math.min(
      outerHalfExtent,
      FAR_CONTEXT_HALF_EXTENT_METERS * Number(appCtx.WORLD_UNITS_PER_METER || 1)
    );
    const windowAt = radius => ({ minX: anchor.x - radius, maxX: anchor.x + radius,
      minZ: anchor.z - radius, maxZ: anchor.z + radius });
    // At high latitudes the same metric area contains more z14 tiles. Keep a
    // complete smaller moving window rather than dropping whole source sectors.
    if (options.anchor) {
      const bounds = geographicBounds(outer);
      if (![bounds.latS,bounds.latN,bounds.lonW,bounds.lonE].every(Number.isFinite) ||
          Math.max(Math.abs(bounds.latS),Math.abs(bounds.latN)) > 85 || bounds.lonE-bounds.lonW > 10) {
        activeKey = ''; pendingBuildPromise = null;
        return Promise.reject(new Error('Regional scenery reached the supported map projection boundary'));
      }
      while (contextTileCount(geographicBounds(windowAt(contextHalfExtent)), FAR_CONTEXT_ZOOM) > FAR_CONTEXT_BUILDING_MAX_TILES)
        contextHalfExtent *= .9;
    }
    const contextOuter = windowAt(contextHalfExtent);
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
    setState({ status: 'queued', sourceZoom, anchor, previousRegionRetained: !!farFieldMesh });
    const beginBuild = () => {
      if (generationSignal.aborted || requestGeneration !== generation) return undefined;
      return buildAndPublish({
        anchor,
        travelRefresh: !!options.anchor,
        contextHalfExtentWorld: contextHalfExtent,
        inner,
        detailedCoverage: [],
        detailedCoverageRequest: { z, centerX, centerY, ring },
        detailExclusionGeographic: geographicBounds(detailExclusion),
        outer,
        geographic,
        contextOuter,
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
      setState({ status: 'failed', reason: String(error?.message || error), previousRegionRetained: !!farFieldMesh });
      // The same geographic request may recover; its failed key must not be
      // mistaken for an already completed or still pending publication.
      activeKey = '';
      throw error;
    }).finally(() => {
      if (requestGeneration === generation) {
        // Compilation has finished using its source arrays. The published
        // regional grid now owns sampling; retain only the detailed working set.
        pruneTerrainTileCache?.();
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
    refreshFarWaterDetailCoverage,
    refreshFarTerrainSurfaceColors,
    refreshFarTerrainBoundaryHeights,
    resetFarTerrainClipmap,
    sampleFarTerrainWorldYAt,
    getFarTerrainSurfaceSnapshot: () => farFieldSurfaceState ? {grid:farFieldSurfaceState.surfaceGrid,portals:farFieldMesh?.userData?.structureTerrainPortalDescriptors || []} : null,
    scheduleFarTerrainSurfaceRefresh,
    updateFarTerrainClipmap,
    updateRegionalSceneryFocus,
    setRegionalSceneryEnabled,
    getRegionalSceneryState: () => scenery.snapshot(),
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
  FAR_FIELD_GAP_FILL_INTERVAL_METERS,
  FAR_FIELD_WORLDCOVER_SIZE,
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_FIELD_SEAM_BLEND_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  parentTerrainTile,
  buildClipmapAxis,
  cellInsideDetailedCoverage,
  cellInsideHole,
  createFarFieldTerrainApi
};
