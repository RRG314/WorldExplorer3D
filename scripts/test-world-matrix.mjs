import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { WORLD_TEST_LOCATIONS } from './world-test-locations.mjs';
import { captureDroneView, captureViewport } from './world-matrix-visuals.mjs';
import { assertWorldMatrixLocation } from './world-matrix-assertions.mjs';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputLabel = /^[a-z0-9._-]+$/i.test(String(process.env.WORLD_MATRIX_OUTPUT_LABEL || '')) ?
  String(process.env.WORLD_MATRIX_OUTPUT_LABEL) : '';
const outputDir = path.join(rootDir, 'output', 'playwright', 'world-matrix', outputLabel);
const externalBaseUrl = String(process.env.WORLD_MATRIX_BASE_URL || '').replace(/\/$/, '');
const exerciseTraversalModes = process.env.WORLD_MATRIX_EXERCISE_MODES !== '0';
const captureDroneViews = process.env.WORLD_MATRIX_CAPTURE_DRONE === '1';
const forceDaylight = process.env.WORLD_MATRIX_FORCE_DAYLIGHT === '1';
const requireWorldCover = process.env.WORLD_MATRIX_REQUIRE_WORLDCOVER === '1';
const blockWorldCover = process.env.WORLD_MATRIX_BLOCK_WORLDCOVER === '1';
const locationDelayMs = Math.max(0, Number(process.env.WORLD_MATRIX_LOCATION_DELAY_MS ?? 1200) || 0);
const buildingDetailWaitLimitMs = 32000;
const reportName = /^[a-z0-9._-]+$/i.test(String(process.env.WORLD_MATRIX_REPORT_NAME || '')) ?
  String(process.env.WORLD_MATRIX_REPORT_NAME) :
  'report.json';
const requestedLocationIds = new Set(
  String(process.env.WORLD_MATRIX_IDS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const testLocations = requestedLocationIds.size > 0 ?
  WORLD_TEST_LOCATIONS.filter((location) => requestedLocationIds.has(String(location.id).toLowerCase())) :
  WORLD_TEST_LOCATIONS;

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(400|429|500|502|503|504)/i.test(msg) ||
    /Failed to load resource:\s+net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|HTTP2_PROTOCOL_ERROR|ABORTED|BLOCKED_BY_CLIENT|FAILED)/i.test(msg) ||
    /blocked by CORS policy/i.test(msg)
  );
}

function fatalConsoleEntries(consoleErrors, requestFailures, baseUrl) {
  const transientRequests = requestFailures.filter((failure) =>
    /ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|HTTP2_PROTOCOL_ERROR|ABORTED|BLOCKED_BY_CLIENT|FAILED)/i.test(failure.errorText || '')
  );
  const transientOnlyExternal = transientRequests.length > 0 && transientRequests.every((failure) =>
    !String(failure.url || '').startsWith(baseUrl)
  );
  return consoleErrors.filter((entry) => {
    if (isTransientNetworkConsoleError(entry) && transientOnlyExternal) return false;
    const statusMatch = String(entry).match(/status of\s+(\d+)/i);
    if (statusMatch) {
      const matchingResponses = requestFailures.filter((failure) => failure.errorText === `HTTP ${statusMatch[1]}`);
      if (matchingResponses.length > 0 && matchingResponses.every((failure) => !String(failure.url || '').startsWith(baseUrl))) {
        return false;
      }
    }
    return true;
  });
}

async function ensureRuntime(page) {
  await page.goto('http://127.0.0.1:4173/app/', { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(async () => {
    // The static server port is resolved dynamically and patched below.
  });
}

async function bootstrapRuntime(page, baseUrl) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return !!(
      ctx &&
      typeof ctx.loadRoads === 'function' &&
      typeof ctx.switchEnv === 'function' &&
      ctx.ENV?.EARTH
    );
  }, { timeout: 120000 });

  await page.evaluate(async () => {
    const deadline = performance.now() + 60000;
    let ctx = null;
    while (performance.now() < deadline) {
      const mod = await import('/app/js/shared-context.js?v=55');
      ctx = mod?.ctx || {};
      if (
        ctx &&
        typeof ctx.loadRoads === 'function' &&
        typeof ctx.switchEnv === 'function' &&
        ctx.ENV?.EARTH
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (!ctx?.ENV?.EARTH) {
      throw new Error('Earth runtime helpers unavailable during world matrix bootstrap');
    }
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords', 'historicBtn'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
  });
}

async function loadLocation(page, spec) {
  return await page.evaluate(async ({ locationSpec, exerciseModes, requireBaseline, buildingDetailWaitLimit }) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const startedAt = performance.now();
    const expectedStart = locationSpec.expectedStart || 'land';
    ctx._lastCustomStructureProbe = null;

    if (locationSpec.kind === 'custom') {
      const customLatInput = document.getElementById('customLat');
      const customLonInput = document.getElementById('customLon');
      if (customLatInput) customLatInput.value = String(locationSpec.lat);
      if (customLonInput) customLonInput.value = String(locationSpec.lon);
      ctx.customLoc = {
        lat: Number(locationSpec.lat),
        lon: Number(locationSpec.lon),
        name: String(locationSpec.label || 'Custom Location')
      };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
    } else {
      ctx.selLoc = String(locationSpec.key);
    }

    await ctx.loadRoads();
    const loadMs = performance.now() - startedAt;
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const buildingDetailWaitStartedAt = performance.now();
    while (
      ctx.worldDetailState?.buildings?.status === 'loading' &&
      performance.now() - buildingDetailWaitStartedAt < buildingDetailWaitLimit
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    const buildingDetailWaitMs = performance.now() - buildingDetailWaitStartedAt;
    const landmarkWaitStartedAt = performance.now();
    if (locationSpec.expectedLandmarkKind) {
      while (
        !(ctx.historicMarkers || []).some((mesh) =>
          mesh?.userData?.isHistoricLandmark &&
          mesh.userData.landmarkKind === locationSpec.expectedLandmarkKind
        ) &&
        performance.now() - landmarkWaitStartedAt < 18000
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    }
    const landmarkWaitMs = performance.now() - landmarkWaitStartedAt;

    let initialSpawn = null;
    if (locationSpec.kind === 'custom' && typeof ctx.applyCustomLocationSpawn === 'function') {
      initialSpawn = ctx.applyCustomLocationSpawn('walk', {
        emitTutorial: false,
        preferBoatIfWater: expectedStart === 'water',
        source: expectedStart === 'water' ? 'world_matrix_custom_water' : 'world_matrix_custom_land'
      });
    } else if (typeof ctx.spawnOnRoad === 'function') {
      initialSpawn = ctx.spawnOnRoad();
    }

    const baselineWaitStartedAt = performance.now();
    if (requireBaseline && expectedStart !== 'water') {
      while (
        !(ctx.terrainGroup?.children || []).some((mesh) => mesh?.userData?.worldCoverStatus === 'ready') &&
        performance.now() - baselineWaitStartedAt < 9000
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    }
    const baselineWaitMs = performance.now() - baselineWaitStartedAt;

    let walkSwitchMs = 0;
    let driveSwitchMs = 0;
    if (exerciseModes && expectedStart !== 'water') {
      const switchWalkAt = performance.now();
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('walk', { source: 'world_matrix', emitTutorial: false });
      } else if (ctx.Walk?.setModeWalk) {
        ctx.Walk.setModeWalk();
      }
      walkSwitchMs = performance.now() - switchWalkAt;

      const switchDriveAt = performance.now();
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drive', { source: 'world_matrix', emitTutorial: false });
      } else if (ctx.Walk?.setModeDrive) {
        ctx.Walk.setModeDrive();
      }
      driveSwitchMs = performance.now() - switchDriveAt;
    }

    let actorX = ctx.boatMode?.active ? Number(ctx.boat?.x || 0) : Number.isFinite(ctx.car?.x) ? ctx.car.x : Number(ctx.Walk?.state?.walker?.x || 0);
    let actorZ = ctx.boatMode?.active ? Number(ctx.boat?.z || 0) : Number.isFinite(ctx.car?.z) ? ctx.car.z : Number(ctx.Walk?.state?.walker?.z || 0);
    let actorFeetY = Number(ctx.car?.y) - 1.2;
    const driveSpawn = expectedStart !== 'water' && typeof ctx.resolveSafeWorldSpawn === 'function' ?
      ctx.resolveSafeWorldSpawn(actorX, actorZ, { mode: 'drive', source: 'world_matrix_drive' }) :
      null;
    const walkSpawn = expectedStart !== 'water' && typeof ctx.resolveSafeWorldSpawn === 'function' ?
      ctx.resolveSafeWorldSpawn(actorX, actorZ, { mode: 'walk', source: 'world_matrix_walk' }) :
      null;
    let nearestRoad = expectedStart !== 'water' && typeof ctx.findNearestRoad === 'function' ?
      ctx.findNearestRoad(actorX, actorZ, {
        y: Number.isFinite(actorFeetY) ? actorFeetY : NaN,
        maxVerticalDelta: 18,
        preferredRoad: ctx.car?.road || null
      }) :
      null;
    let roadSegments = Array.isArray(nearestRoad?.road?.pts) ? nearestRoad.road.pts.slice(0, -1).map((point, index) =>
      Math.hypot(nearestRoad.road.pts[index + 1].x - point.x, nearestRoad.road.pts[index + 1].z - point.z)
    ) : [];
    const boatCameraDistance = ctx.boatMode?.active && ctx.camera?.position ?
      Math.hypot(
        Number(ctx.camera.position.x || 0) - Number(ctx.boat?.x || 0),
        Number(ctx.camera.position.y || 0) - Number(ctx.boat?.y || 0),
        Number(ctx.camera.position.z || 0) - Number(ctx.boat?.z || 0)
      ) :
      null;
    const visibleBoatSceneMeshes = [];
    let maxWaterGeometryYSpan = 0;
    if (ctx.boatMode?.active && ctx.scene?.traverse) {
      ctx.scene.traverse((object) => {
        if (
          object?.isMesh &&
          object.userData?.landuseType === 'water' &&
          Number.isFinite(object.userData?.waterFlattenFactor) &&
          object.geometry
        ) {
          if (!object.geometry.boundingBox) object.geometry.computeBoundingBox?.();
          const bounds = object.geometry.boundingBox;
          if (bounds) maxWaterGeometryYSpan = Math.max(maxWaterGeometryYSpan, bounds.max.y - bounds.min.y);
        }
        if (!object?.isMesh || object.visible === false || visibleBoatSceneMeshes.length >= 80) return;
        const worldPosition = new THREE.Vector3();
        object.getWorldPosition(worldPosition);
        const distance = Math.hypot(worldPosition.x - actorX, worldPosition.z - actorZ);
        if (distance > 8000) return;
        if (!object.geometry?.boundingSphere) object.geometry?.computeBoundingSphere?.();
        const radius = Number(object.geometry?.boundingSphere?.radius || 0);
        if (radius < 100 && distance > 500 && object !== ctx.boatMode?.waterPatch) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        visibleBoatSceneMeshes.push({
          name: object.name || '(unnamed)',
          parent: object.parent?.name || '(unnamed)',
          distance: Number(distance.toFixed(1)),
          worldY: Number(worldPosition.y.toFixed(1)),
          radius: Number(radius.toFixed(1)),
          colors: materials.map((material) => material?.color?.getHexString?.() || null).filter(Boolean),
          terrain: !!object.userData?.isTerrainMesh,
          water: object === ctx.boatMode?.waterPatch || object.userData?.landuseType === 'water'
        });
      });
    }

    const terrainProfiles = {};
    const terrainVisualModes = {};
    const terrainProfileSamples = [];
    for (const mesh of ctx.terrainGroup?.children || []) {
      if (!mesh?.userData?.isTerrainMesh) continue;
      const profile = mesh.userData?.terrainVisualProfile || {};
      const mode = String(profile.mode || 'unknown');
      const visualMode = String(profile.visualMode || mode);
      const reason = String(profile.reason || 'unknown');
      terrainProfiles[mode] ||= { count: 0, reasons: {} };
      terrainProfiles[mode].count += 1;
      terrainProfiles[mode].reasons[reason] = (terrainProfiles[mode].reasons[reason] || 0) + 1;
      terrainVisualModes[visualMode] = Number(terrainVisualModes[visualMode] || 0) + 1;
      terrainProfileSamples.push({
        mode,
        visualMode,
        reason,
        distance: Number(Math.hypot(Number(mesh.position?.x || 0) - actorX, Number(mesh.position?.z || 0) - actorZ).toFixed(1)),
        localSignals: profile.localSignals || null
      });
    }
    terrainProfileSamples.sort((a, b) => a.distance - b.distance);

    const landusePresentation = {};
    for (const mesh of ctx.landuseMeshes || []) {
      const type = String(mesh?.userData?.landuseType || 'unknown');
      const sourceCount = Math.max(1, Number(mesh?.userData?.batchCount || 1));
      landusePresentation[type] ||= { meshes: 0, sources: 0, visibleSources: 0 };
      landusePresentation[type].meshes += 1;
      landusePresentation[type].sources += sourceCount;
      if (mesh?.visible !== false) landusePresentation[type].visibleSources += sourceCount;
    }

    const structurePresentation = { roads: {}, waterways: {}, nonNavigableWaterways: 0 };
    for (const road of ctx.roads || []) {
      const kind = String(road?.structureSemantics?.structureKind || 'at_grade');
      structurePresentation.roads[kind] = (structurePresentation.roads[kind] || 0) + 1;
    }
    for (const waterway of ctx.waterways || []) {
      const kind = String(waterway?.structureSemantics?.structureKind || 'at_grade');
      structurePresentation.waterways[kind] = (structurePresentation.waterways[kind] || 0) + 1;
      if (waterway?.navigable === false) structurePresentation.nonNavigableWaterways += 1;
    }

    let customStructureProbe = null;
    if (locationSpec.expectedRoadStructure) {
      const targetRoad = (ctx.roads || []).find((road) =>
        road?.structureSemantics?.structureKind === locationSpec.expectedRoadStructure &&
        Array.isArray(road.pts) && road.pts.length >= 2
      );
      if (targetRoad) {
        let segmentIndex = 0;
        let segmentLength = -1;
        for (let i = 0; i < targetRoad.pts.length - 1; i += 1) {
          const length = Math.hypot(
            targetRoad.pts[i + 1].x - targetRoad.pts[i].x,
            targetRoad.pts[i + 1].z - targetRoad.pts[i].z
          );
          if (length > segmentLength) {
            segmentLength = length;
            segmentIndex = i;
          }
        }
        const start = targetRoad.pts[segmentIndex];
        const end = targetRoad.pts[segmentIndex + 1];
        const x = (start.x + end.x) * 0.5;
        const z = (start.z + end.z) * 0.5;
        const angle = Math.atan2(-(end.x - start.x), -(end.z - start.z));
        const surfaceY = Number(ctx.sampleFeatureSurfaceY?.(targetRoad, x, z, { segIndex: segmentIndex, t: 0.5 }));
        const renderedY = Number.isFinite(surfaceY) && ctx.GroundHeight?._raycastMeshY ?
          ctx.GroundHeight._raycastMeshY(ctx.roadMeshes || [], x, z, surfaceY + 2.2, 5) :
          null;
        const probeSpawn = Number.isFinite(surfaceY) ? {
          valid: true,
          mode: 'drive',
          x,
          z,
          angle,
          carY: surfaceY + 1.2,
          walkY: surfaceY + 1.7,
          onRoad: true,
          road: targetRoad,
          source: 'world_matrix_structure_probe'
        } : null;
        if (probeSpawn && typeof ctx.applyResolvedWorldSpawn === 'function') {
          ctx.setTravelMode?.('drive', { source: 'world_matrix_structure_probe', emitTutorial: false, force: true });
          ctx.applyResolvedWorldSpawn(probeSpawn, { mode: 'drive' });
          actorX = x;
          actorZ = z;
          actorFeetY = surfaceY;
        }
        const nearest = typeof ctx.findNearestRoad === 'function' ? ctx.findNearestRoad(x, z, {
          y: surfaceY,
          maxVerticalDelta: 8,
          preferredRoad: targetRoad
        }) : null;
        customStructureProbe = {
          kind: targetRoad.structureSemantics?.structureKind || null,
          terrainMode: targetRoad.structureSemantics?.terrainMode || null,
          segmentLength: Number(segmentLength.toFixed(2)),
          surfaceY: Number.isFinite(surfaceY) ? Number(surfaceY.toFixed(2)) : null,
          renderedY: Number.isFinite(renderedY) ? Number(renderedY.toFixed(2)) : null,
          renderedDelta: Number.isFinite(surfaceY) && Number.isFinite(renderedY) ? Number(Math.abs(surfaceY - renderedY).toFixed(2)) : null,
          nearestKind: nearest?.road?.structureSemantics?.structureKind || null,
          nearestDistance: Number.isFinite(nearest?.dist) ? Number(nearest.dist.toFixed(2)) : null,
          applied: !!probeSpawn
        };
        ctx._lastCustomStructureProbe = customStructureProbe;
        nearestRoad = nearest;
        roadSegments = Array.isArray(nearest?.road?.pts) ? nearest.road.pts.slice(0, -1).map((point, index) =>
          Math.hypot(nearest.road.pts[index + 1].x - point.x, nearest.road.pts[index + 1].z - point.z)
        ) : [];
      }
    }

    const buildingPresentation = {
      meshCount: 0,
      visibleMeshCount: 0,
      sourceCount: 0,
      visibleSourceCount: 0,
      detailedSourceCount: 0,
      visibleDetailedSourceCount: 0,
      wallFacadeSourceCount: 0,
      visibleWallFacadeSourceCount: 0,
      tiers: {}
    };
    let buildingDimensions = null;
    try {
      const diagnosticsModule = await import('/scripts/world-matrix-building-diagnostics.mjs?v=3');
      buildingDimensions = diagnosticsModule.collectBuildingDimensions(ctx.buildings || []);
    } catch {
      buildingDimensions = { unavailable: true };
    }
    for (const mesh of ctx.buildingMeshes || []) {
      if (!mesh?.isMesh) continue;
      const sourceCount = Math.max(1, Number(mesh.userData?.batchCount || 1));
      const tier = String(mesh.userData?.lodTier || 'unknown');
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const hasSurfaceDetail = materials.some((material) => !!material?.map);
      const hasWallFacade = materials.some((material) => material?.userData?.facadeWallsOnly === true);
      buildingPresentation.meshCount += 1;
      buildingPresentation.sourceCount += sourceCount;
      if (hasSurfaceDetail) buildingPresentation.detailedSourceCount += sourceCount;
      if (hasWallFacade) buildingPresentation.wallFacadeSourceCount += sourceCount;
      buildingPresentation.tiers[tier] ||= { meshes: 0, sources: 0, visibleMeshes: 0, visibleSources: 0 };
      buildingPresentation.tiers[tier].meshes += 1;
      buildingPresentation.tiers[tier].sources += sourceCount;
      if (mesh.visible !== false) {
        buildingPresentation.visibleMeshCount += 1;
        buildingPresentation.visibleSourceCount += sourceCount;
        if (hasSurfaceDetail) buildingPresentation.visibleDetailedSourceCount += sourceCount;
        if (hasWallFacade) buildingPresentation.visibleWallFacadeSourceCount += sourceCount;
        buildingPresentation.tiers[tier].visibleMeshes += 1;
        buildingPresentation.tiers[tier].visibleSources += sourceCount;
      }
    }

    const lastLoad = ctx.perfStats?.lastLoad || {};
    const loadDiagnostics = {
      source: lastLoad.overpassSource || null,
      endpoint: lastLoad.overpassEndpoint || null,
      buildings: lastLoad.buildings || null,
      lod: lastLoad.lod || null,
      buildingBatching: lastLoad.buildingBatching || null,
      buildingDimensions: lastLoad.buildingDimensions || null,
      vectorWater: lastLoad.vectorWater || null,
      surfaceProfile: lastLoad.surfaceProfile || null,
      warnings: lastLoad.warnings || [],
      providerUnavailable: !!lastLoad.providerUnavailable,
      error: lastLoad.error || null,
      phases: lastLoad.phases || null,
      loadProfile: lastLoad.loadProfile || null,
      dynamicBudget: lastLoad.dynamicBudget || null
    };
    loadDiagnostics.landmarks = lastLoad.landmarks || null;
    const landmarkPresentation = {};
    for (const mesh of ctx.historicMarkers || []) {
      if (!mesh?.userData?.isHistoricLandmark) continue;
      const kind = String(mesh.userData.landmarkKind || 'unknown');
      landmarkPresentation[kind] ||= { meshes: 0, visibleMeshes: 0 };
      landmarkPresentation[kind].meshes += 1;
      if (mesh.visible !== false) landmarkPresentation[kind].visibleMeshes += 1;
    }
    let roadProfileY = Number(nearestRoad?.y);
    let exactRenderedRoadY = expectedStart !== 'water' && ctx.GroundHeight?._raycastMeshY ?
      ctx.GroundHeight._raycastMeshY(
        Array.isArray(ctx.roadMeshes) ? ctx.roadMeshes : [],
        actorX,
        actorZ,
        Number.isFinite(actorFeetY) ? actorFeetY + (locationSpec.expectedRoadStructure ? 2.2 : 5.5) : 1500,
        Number.isFinite(actorFeetY) ? (locationSpec.expectedRoadStructure ? 5 : 26) : Infinity
      ) :
      null;
    let renderedRoadY = expectedStart !== 'water' && ctx.GroundHeight?.roadMeshY ?
      ctx.GroundHeight.roadMeshY(actorX, actorZ, roadProfileY) :
      null;
    const terrainMeshY = expectedStart !== 'water' && typeof ctx.terrainMeshHeightAt === 'function' ?
      ctx.terrainMeshHeightAt(actorX, actorZ) :
      null;
    const terrainMeshesAtActor = [];
    for (const mesh of ctx.terrainGroup?.children || []) {
      const info = mesh?.userData?.terrainTile;
      const positions = mesh?.geometry?.attributes?.position;
      if (!info || !positions || positions.count < 4) continue;
      const segments = Number(ctx.TERRAIN_SEGMENTS || 0);
      const verticesPerSide = segments + 1;
      if (!(segments > 0) || positions.count < verticesPerSide * verticesPerSide) continue;
      const localX = actorX - Number(mesh.position?.x || 0);
      const localZ = actorZ - Number(mesh.position?.z || 0);
      const minX = positions.getX(0);
      const maxX = positions.getX(segments);
      const minZ = positions.getZ(0);
      const maxZ = positions.getZ(segments * verticesPerSide);
      if (localX < minX || localX > maxX || localZ < minZ || localZ > maxZ) continue;
      const key = `${info.z}/${info.tx}/${info.ty}`;
      const tile = ctx.terrainTileCache?.get?.(key) || null;
      terrainMeshesAtActor.push({
        key,
        pending: !!mesh.userData?.pendingTerrainTile,
        meshY: Number(Number(mesh.position?.y || 0).toFixed(2)),
        minElevation: Number.isFinite(mesh.userData?.minElevation) ? Number(mesh.userData.minElevation.toFixed(2)) : null,
        maxElevation: Number.isFinite(mesh.userData?.maxElevation) ? Number(mesh.userData.maxElevation.toFixed(2)) : null,
        tileLoaded: !!tile?.loaded,
        tileFailed: !!tile?.failed
      });
    }
    let vegetationPlacementCandidates = null;
    try {
      const vegetationModule = await import('/app/js/world/vegetation.js?v=1');
      vegetationPlacementCandidates = vegetationModule.collectWorldVegetationPlacements().length;
    } catch {
      vegetationPlacementCandidates = null;
    }
    let traversalDiagnostics = null;
    try {
      const navigationModule = await import('/app/js/world/navigation.js?v=1');
      const traversalModule = await import('/app/js/world/traversal.js?v=1');
      const spatialModule = await import('/app/js/world/building-spatial-index.js?v=2');
      const runtimeRoads = navigationModule.runtimeRoadFeatures();
      traversalModule.buildTraversalNetworks();
      traversalDiagnostics = {
        runtimeRoads: runtimeRoads.length,
        suppressedRoads: (ctx.roads || []).filter((road) => spatialModule.isSuppressedBaseRoad(road)).length,
        walkEligible: traversalModule.traversableFeaturesForMode('walk').length,
        driveEligible: traversalModule.traversableFeaturesForMode('drive').length,
        suppressionRoadIds: ctx.overlaySuppression?.roadIds instanceof Set ? ctx.overlaySuppression.roadIds.size : (ctx.overlaySuppression?.roadIds || []).length,
        sourceIdSamples: runtimeRoads.slice(0, 3).map((road) => road.sourceFeatureId || null)
      };
    } catch (err) {
      traversalDiagnostics = { error: err?.message || String(err) };
    }

    const worldCoverMeshes = Array.isArray(ctx.terrainGroup?.children) ? ctx.terrainGroup.children : [];
    const worldCoverStatus = {};
    const terrainRasterUrls = [];
    let terrainImageryOwners = 0;
    for (const mesh of worldCoverMeshes) {
      const status = String(mesh?.userData?.worldCoverStatus || 'not_requested');
      worldCoverStatus[status] = Number(worldCoverStatus[status] || 0) + 1;
      if (mesh?.userData?.terrainImageryTexture || mesh?.userData?.terrainImageryStatus) terrainImageryOwners += 1;
      const source = String(mesh?.material?.map?.image?.currentSrc || mesh?.material?.map?.image?.src || '');
      if (/arcgisonline|World_Imagery/i.test(source)) terrainRasterUrls.push(source);
    }

    // Keep actor pose and road evidence from the same frame. The nearest-road API
    // reuses one result object, and the diagnostics above can yield while the game
    // continues to reconcile streamed terrain.
    if (expectedStart !== 'water') {
      actorX = Number.isFinite(ctx.car?.x) ? ctx.car.x : Number(ctx.Walk?.state?.walker?.x || 0);
      actorZ = Number.isFinite(ctx.car?.z) ? ctx.car.z : Number(ctx.Walk?.state?.walker?.z || 0);
      actorFeetY = Number(ctx.car?.y) - 1.2;
      const finalNearestRoad = typeof ctx.findNearestRoad === 'function' ?
        ctx.findNearestRoad(actorX, actorZ, {
          y: Number.isFinite(actorFeetY) ? actorFeetY : NaN,
          maxVerticalDelta: 18,
          preferredRoad: ctx.car?.road || null
        }) :
        null;
      nearestRoad = finalNearestRoad ? {
        road: finalNearestRoad.road || null,
        dist: Number(finalNearestRoad.dist),
        pt: finalNearestRoad.pt ? { x: Number(finalNearestRoad.pt.x), z: Number(finalNearestRoad.pt.z) } : null,
        y: Number(finalNearestRoad.y),
        verticalDelta: Number(finalNearestRoad.verticalDelta),
        distanceAlong: Number(finalNearestRoad.distanceAlong),
        distanceToEndpoint: Number(finalNearestRoad.distanceToEndpoint),
        distanceToTransitionZone: Number(finalNearestRoad.distanceToTransitionZone)
      } : null;
      roadSegments = Array.isArray(nearestRoad?.road?.pts) ? nearestRoad.road.pts.slice(0, -1).map((point, index) =>
        Math.hypot(nearestRoad.road.pts[index + 1].x - point.x, nearestRoad.road.pts[index + 1].z - point.z)
      ) : [];
      roadProfileY = Number(nearestRoad?.y);
      exactRenderedRoadY = ctx.GroundHeight?._raycastMeshY ?
        ctx.GroundHeight._raycastMeshY(
          Array.isArray(ctx.roadMeshes) ? ctx.roadMeshes : [],
          actorX,
          actorZ,
          Number.isFinite(actorFeetY) ? actorFeetY + (locationSpec.expectedRoadStructure ? 2.2 : 5.5) : 1500,
          Number.isFinite(actorFeetY) ? (locationSpec.expectedRoadStructure ? 5 : 26) : Infinity
        ) :
        null;
      renderedRoadY = ctx.GroundHeight?.roadMeshY ?
        ctx.GroundHeight.roadMeshY(actorX, actorZ, roadProfileY) :
        null;
    }

    return {
      id: locationSpec.id,
      label: locationSpec.label,
      kind: locationSpec.kind,
      category: locationSpec.category,
      expectedStart,
      loadMs: Number(loadMs.toFixed(1)),
      buildingDetailWaitMs: Number(buildingDetailWaitMs.toFixed(1)),
      landmarkWaitMs: Number(landmarkWaitMs.toFixed(1)),
      baselineWaitMs: Number(baselineWaitMs.toFixed(1)),
      buildingDetail: ctx.worldDetailState?.buildings || null,
      walkSwitchMs: Number(walkSwitchMs.toFixed(1)),
      driveSwitchMs: Number(driveSwitchMs.toFixed(1)),
      counts: {
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx.buildings) ? ctx.buildings.filter(Boolean).length : 0,
        buildingMeshes: Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.filter((mesh) => mesh?.isMesh).length : 0,
        landuses: Array.isArray(ctx.landuses) ? ctx.landuses.length : 0,
        landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
        waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
        waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0,
        vegetationMeshes: Array.isArray(ctx.vegetationMeshes) ? ctx.vegetationMeshes.length : 0,
        vegetationFeatures: Array.isArray(ctx.vegetationFeatures) ? ctx.vegetationFeatures.length : 0,
        vegetationPlacementCandidates,
        streetFurnitureMeshes: Array.isArray(ctx.streetFurnitureMeshes) ? ctx.streetFurnitureMeshes.length : 0,
        historicLandmarkMeshes: Array.isArray(ctx.historicMarkers) ? ctx.historicMarkers.filter((mesh) => mesh?.userData?.isHistoricLandmark).length : 0,
        terrainTilesLoaded: ctx.terrainTileCache instanceof Map ? [...ctx.terrainTileCache.values()].filter((tile) => tile?.loaded).length : 0
      },
      terrainProfiles,
      terrainVisualModes,
      terrainProfileSamples: terrainProfileSamples.slice(0, 5),
      worldCover: {
        stats: ctx.worldCoverStats ? JSON.parse(JSON.stringify(ctx.worldCoverStats)) : null,
        status: worldCoverStatus,
        samples: worldCoverMeshes
          .filter((mesh) => mesh?.userData?.worldCoverSummary)
          .slice(0, 5)
          .map((mesh) => ({ ...mesh.userData.worldCoverSummary }))
      },
      terrainSurface: {
        imageryOwners: terrainImageryOwners,
        rasterUrls: terrainRasterUrls,
        samples: worldCoverMeshes.slice(0, 5).map((mesh) => ({
          key: mesh?.userData?.terrainTileKey || null,
          visualMode: mesh?.userData?.terrainVisualProfile?.visualMode || mesh?.userData?.terrainVisualProfile?.mode || null,
          worldCoverMode: mesh?.userData?.worldCoverSurfaceMode || null,
          mapSource: mesh?.material?.map?.image?.currentSrc || mesh?.material?.map?.image?.src || null
        }))
      },
      landusePresentation,
      structurePresentation,
      buildingPresentation,
      buildingDimensions,
      landmarkPresentation,
      loadDiagnostics,
      traversal: {
        walkSegments: Number(ctx.traversalNetworks?.walk?.segmentCount || 0),
        driveSegments: Number(ctx.traversalNetworks?.drive?.segmentCount || 0)
      },
      traversalDiagnostics,
      actor: {
        x: Number(actorX.toFixed(2)),
        z: Number(actorZ.toFixed(2)),
        currentMode: typeof ctx.getCurrentTravelMode === 'function' ? ctx.getCurrentTravelMode() : (ctx.droneMode ? 'drone' : ctx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive')
      },
      initialSpawn: initialSpawn ? {
        valid: initialSpawn.valid !== false,
        mode: initialSpawn.mode || null,
        source: initialSpawn.source || null,
        structureKind: initialSpawn.road?.structureSemantics?.structureKind || null,
        terrainMode: initialSpawn.road?.structureSemantics?.terrainMode || null,
        featureEndpointClearance: Number.isFinite(initialSpawn.featureEndpointClearance) ?
          Number(initialSpawn.featureEndpointClearance.toFixed(2)) : null,
        endpointConnected: initialSpawn.endpointConnected ?? null
      } : null,
      customStructureProbe,
      boatActive: !!ctx.boatMode?.active,
      boatPresentation: ctx.boatMode?.active ? {
        meshVisible: !!ctx.boatMode?.mesh?.visible,
        waterKind: String(ctx.boatMode?.waterKind || ''),
        boatY: Number(Number(ctx.boat?.y || 0).toFixed(2)),
        waterPatchY: Number(Number(ctx.boatMode?.waterPatch?.position?.y || 0).toFixed(2)),
        surfaceEnvelope: Object.fromEntries(
          Object.entries(ctx.boatMode?.surfaceEnvelope || {}).map(([key, value]) => [
            key,
            Number.isFinite(value) ? Number(Number(value).toFixed(key === 'sampledAt' ? 3 : 2)) : null
          ])
        ),
        maxWaterGeometryYSpan: Number(maxWaterGeometryYSpan.toFixed(3)),
        cameraMode: Number(ctx.camMode),
        cameraDistance: Number(boatCameraDistance.toFixed(2)),
        visibleSceneMeshes: visibleBoatSceneMeshes
      } : null,
      landPresentation: expectedStart !== 'water' ? {
        carY: Number(Number(ctx.car?.y || 0).toFixed(2)),
        walkerY: Number(Number(ctx.Walk?.state?.walker?.y || 0).toFixed(2)),
        terrainY: Number(Number(ctx.elevationWorldYAtWorldXZ?.(actorX, actorZ) || 0).toFixed(2)),
        terrainMeshY: Number.isFinite(terrainMeshY) ? Number(terrainMeshY.toFixed(2)) : null,
        actorX: Number(Number(actorX || 0).toFixed(2)),
        actorZ: Number(Number(actorZ || 0).toFixed(2)),
        terrainMeshesAtActor,
        exactRenderedRoadY: Number.isFinite(exactRenderedRoadY) ? Number(exactRenderedRoadY.toFixed(2)) : null,
        renderedRoadY: Number.isFinite(renderedRoadY) ? Number(renderedRoadY.toFixed(2)) : null,
        nearestRoad: nearestRoad?.road ? {
          distance: Number(Number(nearestRoad.dist || 0).toFixed(2)),
          width: Number(nearestRoad.road.width || 0),
          type: String(nearestRoad.road.type || ''),
          name: String(nearestRoad.road.name || ''),
          pointCount: nearestRoad.road.pts?.length || 0,
          maxSegment: Number(Math.max(0, ...roadSegments).toFixed(2)),
          terrainMode: String(nearestRoad.road.structureSemantics?.terrainMode || ''),
          activeWorldOwner: Array.isArray(ctx.roads) && ctx.roads.includes(nearestRoad.road),
          terrainSamplerActive: typeof nearestRoad.road.surfaceTerrainSampler === 'function',
          terrainSamplerY: typeof nearestRoad.road.surfaceTerrainSampler === 'function' && nearestRoad.pt ?
            Number(Number(nearestRoad.road.surfaceTerrainSampler(nearestRoad.pt.x, nearestRoad.pt.z)).toFixed(2)) :
            null,
          verticalDelta: Number.isFinite(nearestRoad.verticalDelta) ? Number(nearestRoad.verticalDelta.toFixed(2)) : null,
          surfaceY: Number.isFinite(roadProfileY) ? Number(roadProfileY.toFixed(2)) : null,
          surfaceMinY: Number(Number(nearestRoad.road.structureSurfaceMinY || 0).toFixed(2)),
          surfaceMaxY: Number(Number(nearestRoad.road.structureSurfaceMaxY || 0).toFixed(2))
        } : null
      } : null,
      driveSpawn: driveSpawn ? {
        valid: driveSpawn.valid !== false,
        source: driveSpawn.source || null,
        onRoad: !!driveSpawn.onRoad,
        reason: driveSpawn.reason || null
      } : null,
      walkSpawn: walkSpawn ? {
        valid: walkSpawn.valid !== false,
        source: walkSpawn.source || null,
        onRoad: !!walkSpawn.onRoad,
        reason: walkSpawn.reason || null
      } : null,
      worldLoading: !!ctx.worldLoading,
      interiorActive: !!ctx.activeInterior
    };
  }, {
    locationSpec: spec,
    exerciseModes: exerciseTraversalModes,
    requireBaseline: requireWorldCover,
    buildingDetailWaitLimit: buildingDetailWaitLimitMs
  });
}

async function main() {
  if (testLocations.length === 0) {
    throw new Error(`WORLD_MATRIX_IDS did not match a configured location: ${[...requestedLocationIds].join(', ')}`);
  }
  await mkdirp(outputDir);
  const server = externalBaseUrl ? null : await startStaticRootServer({ rootDir, host, candidatePorts });
  const baseUrl = externalBaseUrl || `http://${host}:${server.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  if (blockWorldCover) await page.route('https://titiler.terrascope.be/**', (route) => route.abort('blockedbyclient'));
  const consoleErrors = [];
  const requestFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err?.message || err));
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      errorText: request.failure()?.errorText || 'request failed'
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    requestFailures.push({
      url: response.url(),
      errorText: `HTTP ${response.status()}`
    });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    locations: []
  };
  const locationFailures = [];

  try {
    await bootstrapRuntime(page, baseUrl);

    for (const spec of testLocations) {
      console.log(`[world-matrix] loading ${spec.id}`);
      const result = await loadLocation(page, spec);
      report.locations.push(result);
      await fs.writeFile(path.join(outputDir, reportName), JSON.stringify(report, null, 2));
      try {
        assertWorldMatrixLocation(spec, result);
        if ((spec.minimumBuildings || /urban|city|downtown/.test(String(spec.category || ''))) && !result.worldCover?.status?.ready) {
          assert(Number(result.counts?.roads || 0) > 0, `${spec.id}: mapped city has no explicit road surface`);
        }
        if (requireWorldCover && result.expectedStart !== 'water') {
          assert(
            Number(result.worldCover?.status?.ready || 0) > 0,
            `${spec.id}: no active ESA WorldCover baseline tile reached ready state`
          );
        }
      } catch (err) {
        result.assertionError = String(err?.message || err);
        locationFailures.push(result.assertionError);
      }

      try {
        if (forceDaylight) {
          await page.evaluate(async () => {
            const { ctx } = await import('/app/js/shared-context.js?v=55');
            ctx?.setTimeOfDay?.('day');
          });
          await page.waitForTimeout(400);
        }
        await page.waitForTimeout(800);
        result.visualDiagnostics = await captureViewport(page, path.join(outputDir, `${spec.id}.png`));
        if (captureDroneViews && result.expectedStart !== 'water') {
          await captureDroneView(page, spec, result, outputDir);
          if (result.counts.buildings >= 1000 && Number(result.dronePresentation?.totalNearSources || 0) >= 100) {
            const nearVisibilityRatio =
              Number(result.dronePresentation.visibleNearSources || 0) /
              Number(result.dronePresentation.totalNearSources || 1);
            assert(
              nearVisibilityRatio >= 0.85,
              `${spec.id}: drone LOD hid nearby building neighborhoods ${JSON.stringify(result.dronePresentation)}`
            );
          }
        }
      } catch (err) {
        result.screenshotWarning = String(err?.message || err);
        if (/drone LOD hid nearby building neighborhoods/.test(result.screenshotWarning)) {
          result.assertionError = result.screenshotWarning;
          locationFailures.push(result.screenshotWarning);
        }
      }
      console.log(`[world-matrix] ready ${spec.id} (${result.loadMs}ms, ${result.counts.roads} roads)`);
      if (locationDelayMs > 0) await page.waitForTimeout(locationDelayMs);
    }

    const fatalConsoleErrors = fatalConsoleEntries(consoleErrors, requestFailures, baseUrl);
    report.consoleErrors = consoleErrors;
    report.requestFailures = requestFailures;
    report.fatalConsoleErrors = fatalConsoleErrors;
    report.locationFailures = locationFailures;
    report.pass = fatalConsoleErrors.length === 0 && locationFailures.length === 0;
    await fs.writeFile(path.join(outputDir, reportName), JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server?.close();
  }

  const fatalConsoleErrors = fatalConsoleEntries(consoleErrors, requestFailures, baseUrl);
  if (fatalConsoleErrors.length > 0) {
    throw new Error(`Console/page errors detected during world matrix run:\n${fatalConsoleErrors.join('\n')}`);
  }
  if (locationFailures.length > 0) throw new Error(`World matrix location failures:\n${locationFailures.join('\n')}`);
}

main().catch(async (err) => {
  try {
    await mkdirp(outputDir);
    const reportPath = path.join(outputDir, reportName);
    let existingReport = {};
    try {
      existingReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    } catch {
      // A startup failure may happen before the first report snapshot exists.
    }
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          ...existingReport,
          generatedAt: new Date().toISOString(),
          pass: false,
          error: String(err?.message || err)
        },
        null,
        2
      )
    );
  } catch {
    // Ignore report write failures during fatal exit.
  }
  console.error(err);
  process.exitCode = 1;
});
