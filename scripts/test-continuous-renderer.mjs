import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-renderer');
const externalBaseUrl = String(process.env.CONTINUOUS_RENDERER_BASE_URL || '').replace(/\/$/, '');
const injectTerrainFailure = process.env.CONTINUOUS_RENDERER_INJECT_TERRAIN_FAILURE === '1';
const sharedContextUrl = '/app/js/shared-context.js?v=55';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForRuntime(page) {
  await page.waitForFunction(async (moduleUrl) => {
    const { ctx } = await import(moduleUrl);
    return !!(ctx?.ENV?.EARTH && ctx.loadRoads && ctx.setContinuousWorldEnabled && ctx.setTravelMode);
  }, sharedContextUrl, { timeout: 120000 });
}

async function startEarth(page) {
  return page.evaluate(async (moduleUrl) => {
    const deadline = performance.now() + 60000;
    let ctx = null;
    while (performance.now() < deadline) {
      ({ ctx } = await import(moduleUrl));
      if (ctx?.ENV?.EARTH && ctx.loadRoads && ctx.setContinuousWorldEnabled && ctx.setTravelMode) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (!ctx?.ENV?.EARTH) throw new Error('Earth runtime contract did not stabilize.');
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.selLoc = 'baltimore';
    ctx.switchEnv(ctx.ENV.EARTH);
    await ctx.setContinuousWorldEnabled(true, { reloadIfNeeded: false });
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.setTravelMode('walk', { source: 'continuous_renderer_test', emitTutorial: false, force: true });
    ctx.spawnOnRoad?.();
    return {
      initialEarthWorldReady: ctx.initialEarthWorldReady === true,
      initialEarthWorldRetired: ctx.initialEarthWorldRetired === true,
      profile: ctx.SurfaceQuery?.getSourceProfile?.() || null,
      snapshot: ctx.getEarthStreamingSnapshot?.() || null,
      roads: (ctx.roads || []).length,
      nonStreamRoads: (ctx.roads || []).filter((road) => !road?._streamChunkKey).length,
      buildings: (ctx.buildings || []).length,
      nonStreamBuildings: (ctx.buildings || []).filter((building) => !building?._streamChunkKey).length
    };
  }, sharedContextUrl);
}

async function moveWalker(page, x, z) {
  await page.evaluate(({ moduleUrl, nextX, nextZ }) => import(moduleUrl).then(({ ctx }) => {
    ctx.setTravelMode('walk', { source: 'continuous_renderer_test', emitTutorial: false, force: true });
    const terrainY = Number(ctx.terrainMeshHeightAt?.(nextX, nextZ) ?? ctx.elevationWorldYAtWorldXZ?.(nextX, nextZ) ?? 0);
    const walker = ctx.Walk?.state?.walker;
    if (walker) {
      walker.x = nextX;
      walker.z = nextZ;
      walker.y = terrainY;
      walker.vx = 0;
      walker.vz = 0;
    }
    if (ctx.Walk?.state?.characterMesh) {
      ctx.Walk.state.characterMesh.position.set(nextX, terrainY, nextZ);
    }
    ctx.updateTerrainAround?.(nextX, nextZ);
    ctx.resumeEarthStreaming?.(0);
  }), { moduleUrl: sharedContextUrl, nextX: x, nextZ: z });
}

async function waitForStream(page, predicate, timeoutMs = 90000) {
  const startedAt = Date.now();
  let snapshot = null;
  while (Date.now() - startedAt < timeoutMs) {
    snapshot = await page.evaluate(async (moduleUrl) => {
      const { ctx } = await import(moduleUrl);
      ctx.updateEarthWorldStreaming?.(1);
      return {
        retired: !!ctx.initialEarthWorldRetired,
        snapshot: ctx.getEarthStreamingSnapshot?.() || null
      };
    }, sharedContextUrl);
    if (predicate(snapshot)) return snapshot;
    await page.waitForTimeout(300);
  }
  throw new Error(`Continuous stream did not reach the expected state: ${JSON.stringify(snapshot)}`);
}

async function snapToMappedRoad(page) {
  return page.evaluate(async (moduleUrl) => {
    const { ctx } = await import(moduleUrl);
    const preferred = /motorway|trunk|primary|secondary|tertiary|residential|unclassified/;
    let selected = null;
    for (const road of ctx.roads || []) {
      if (!road?._streamChunkKey || road.driveable === false || !preferred.test(String(road.type || ''))) continue;
      for (let index = 0; index < (road.pts?.length || 0); index += 1) {
        const point = road.pts[index];
        const distance = Math.hypot(point.x, point.z);
        if (!selected || distance < selected.distance) selected = { road, point, index, distance };
      }
    }
    if (!selected) return null;
    const roadY = Number(selected.road.surfaceHeights?.[selected.index]);
    const terrainY = Number(ctx.terrainMeshHeightAt?.(selected.point.x, selected.point.z));
    const walker = ctx.Walk?.state?.walker;
    if (walker) {
      walker.x = selected.point.x;
      walker.z = selected.point.z;
      walker.y = Number.isFinite(roadY) ? roadY : terrainY;
      walker.vx = 0;
      walker.vz = 0;
    }
    if (ctx.Walk?.state?.characterMesh) {
      ctx.Walk.state.characterMesh.position.set(walker.x, walker.y, walker.z);
    }
    ctx.updateWorldLod?.(true);
    const rayOriginY = Math.max(Number(roadY) || 0, Number(terrainY) || 0) + 30;
    const surfaceRay = new THREE.Raycaster(
      new THREE.Vector3(selected.point.x, rayOriginY, selected.point.z),
      new THREE.Vector3(0, -1, 0),
      0,
      60
    );
    const topSurfaceHit = surfaceRay.intersectObjects(ctx.roadMeshes || [], true).find((hit) =>
      hit.object?.userData?.isRoadBatch && hit.object?.userData?.earthStreamingChunk
    );
    return {
      name: selected.road.name,
      type: selected.road.type,
      source: selected.road.geometrySource,
      x: selected.point.x,
      z: selected.point.z,
      roadY: Number.isFinite(roadY) ? roadY : null,
      terrainY: Number.isFinite(terrainY) ? terrainY : null,
      delta: Number.isFinite(roadY) && Number.isFinite(terrainY) ? roadY - terrainY : null,
      topSurface: topSurfaceHit ? {
        y: Number(topSurfaceHit.point.y),
        normalY: Number(topSurfaceHit.face?.normal?.y),
        role: String(topSurfaceHit.object.userData?.renderProvenance?.role || '')
      } : null
    };
  }, sharedContextUrl);
}

async function rendererMetrics(page) {
  return page.evaluate(async (moduleUrl) => {
    const { ctx } = await import(moduleUrl);
    const streamMeshes = [];
    const sceneGeometries = new Set();
    const streamGeometries = new Set();
    ctx.scene?.traverse?.((object) => {
      if (object?.geometry) sceneGeometries.add(object.geometry);
      if (object?.isMesh && object.userData?.earthStreamingChunk) {
        streamMeshes.push(object);
        if (object.geometry) streamGeometries.add(object.geometry);
      }
    });
    const roles = {};
    let missingProvenance = 0;
    for (const mesh of streamMeshes) {
      const role = String(mesh.userData?.renderProvenance?.role || 'missing');
      roles[role] = Number(roles[role] || 0) + 1;
      if (role === 'missing') missingProvenance += 1;
    }
    const retainedBuildingMeshes = (ctx.buildingMeshes || []).filter((mesh) =>
      mesh?.userData?.earthStreamingChunk
    );
    const retainedBuildingSources = retainedBuildingMeshes.reduce(
      (sum, mesh) => sum + Math.max(1, Number(mesh.userData?.batchCount || 1)),
      0
    );
    const visibleBuildingMeshes = retainedBuildingMeshes.filter((mesh) => mesh.visible !== false);
    const visibleBuildingSources = visibleBuildingMeshes.reduce(
      (sum, mesh) => sum + Math.max(1, Number(mesh.userData?.batchCount || 1)),
      0
    );
    const buildingFeatureBudgets = {};
    visibleBuildingMeshes.forEach((mesh) => {
      const key = String(mesh.userData?.streamChunkKey || '');
      const budget = mesh.userData?.featureBudget;
      if (key && budget && !buildingFeatureBudgets[key]) buildingFeatureBudgets[key] = { ...budget };
    });
    const terrainSurfaceModes = {};
    let terrainImageryOwners = 0;
    let classifiedTextureOwners = 0;
    let terrainDetailMapOwners = 0;
    let semanticPbrOwners = 0;
    let unclassifiedDetailOwners = 0;
    const terrainRasterUrls = [];
    for (const mesh of ctx.terrainGroup?.children || []) {
      const mode = String(mesh.userData?.terrainVisualProfile?.visualMode || mesh.userData?.terrainVisualProfile?.mode || 'unknown');
      terrainSurfaceModes[mode] = Number(terrainSurfaceModes[mode] || 0) + 1;
      if (mesh.userData?.terrainImageryTexture || mesh.userData?.terrainImageryStatus) terrainImageryOwners += 1;
      if (mesh.userData?.worldCoverTexture && mesh.material?.map === mesh.userData.worldCoverTexture) classifiedTextureOwners += 1;
      if (mesh.material?.normalMap || mesh.material?.roughnessMap) {
        terrainDetailMapOwners += 1;
        if (mesh.userData?.terrainDetailProvenance?.kind === 'semantic-pbr') semanticPbrOwners += 1;
        else unclassifiedDetailOwners += 1;
      }
      const source = String(mesh.material?.map?.image?.currentSrc || mesh.material?.map?.image?.src || '');
      if (/arcgisonline|World_Imagery/i.test(source)) terrainRasterUrls.push(source);
    }
    const visibleLandCover = streamMeshes.filter((mesh) =>
      mesh.userData?.renderProvenance?.role === 'land-cover' && mesh.visible !== false
    );
    return {
      streamMeshes: streamMeshes.length,
      sceneGeometries: sceneGeometries.size,
      streamGeometries: streamGeometries.size,
      missingProvenance,
      roles,
      visibleRoadMeshes: (ctx.roadMeshes || []).filter((mesh) => mesh?.userData?.earthStreamingChunk && mesh.visible !== false).length,
      visibleBuildingMeshes: visibleBuildingMeshes.length,
      visibleBuildingSources,
      retainedBuildingSources,
      buildingFeatureBudgets,
      visibleLandCoverMeshes: visibleLandCover.length,
      opaqueLandCoverMeshes: visibleLandCover.filter((mesh) =>
        mesh.material?.transparent !== true && Number(mesh.material?.opacity ?? 1) >= 0.99
      ).length,
      terrainSurface: {
        modes: terrainSurfaceModes,
        imageryOwners: terrainImageryOwners,
        classifiedTextureOwners,
        detailMapOwners: terrainDetailMapOwners,
        semanticPbrOwners,
        unclassifiedDetailOwners,
        rasterUrls: terrainRasterUrls
      },
      gpu: {
        geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
        textures: Number(ctx.renderer?.info?.memory?.textures || 0)
      },
      terrainMeshes: Number(ctx.terrainGroup?.children?.length || 0),
      terrainCache: ctx.terrainTileCacheSnapshot?.() || null,
      streaming: ctx.getEarthStreamingSnapshot?.() || null,
      vectorResources: ctx.getStreamingVectorResourceSnapshot?.() || null,
      actor: {
        mode: ctx.getCurrentTravelMode?.(),
        walker: ctx.Walk?.state?.walker ? { x: ctx.Walk.state.walker.x, y: ctx.Walk.state.walker.y, z: ctx.Walk.state.walker.z } : null,
        drone: ctx.drone ? { x: ctx.drone.x, y: ctx.drone.y, z: ctx.drone.z } : null
      },
      rendererContextLost: !!ctx.renderer?.getContext?.().isContextLost?.()
    };
  }, sharedContextUrl);
}

async function enterDrone(page) {
  return page.evaluate(async (moduleUrl) => {
    const { ctx } = await import(moduleUrl);
    const walker = ctx.Walk?.state?.walker ? { ...ctx.Walk.state.walker } : null;
    ctx.setTravelMode('drone', { source: 'continuous_renderer_test', emitTutorial: false, force: true });
    const groundY = Number(ctx.terrainMeshHeightAt?.(ctx.drone.x, ctx.drone.z) ?? 0);
    ctx.drone.y = groundY + 220;
    ctx.drone.pitch = -0.68;
    ctx.drone.roll = 0;
    ctx.updateWorldLod?.(true);
    return {
      walker,
      drone: { x: ctx.drone.x, y: ctx.drone.y, z: ctx.drone.z },
      horizontalHandoffDistance: walker ? Math.hypot(ctx.drone.x - walker.x, ctx.drone.z - walker.z) : null
    };
  }, sharedContextUrl);
}

async function waitForVectorDisposal(page, timeoutMs = 15000) {
  await page.waitForFunction(async (moduleUrl) => {
    const { ctx } = await import(moduleUrl);
    const snapshot = ctx.getStreamingVectorResourceSnapshot?.();
    return Number(snapshot?.pendingGeometryDisposals || 0) === 0 && Number(snapshot?.idleForMs || 0) >= 750;
  }, sharedContextUrl, { timeout: timeoutMs });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const server = externalBaseUrl ? null : await startStaticRootServer({
    rootDir,
    host: '127.0.0.1',
    candidatePorts: [4250, 4251, 4252]
  });
  const baseUrl = externalBaseUrl || `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  let injectedTerrainFailures = 0;
  if (injectTerrainFailure) {
    await page.route('**/elevation-tiles-prod/terrarium/**', async (route) => {
      if (injectedTerrainFailures === 0) {
        injectedTerrainFailures += 1;
        await route.abort('connectionfailed');
        return;
      }
      await route.continue();
    });
  }
  const errors = [];
  const externalWarnings = [];
  const requestedUrls = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const entry = `${response.status()} ${response.url()}`;
    if (response.url().startsWith(baseUrl)) errors.push(entry);
    else externalWarnings.push(entry);
  });
  page.on('requestfailed', (request) => {
    const entry = `${request.failure()?.errorText || 'request failed'} ${request.url()}`;
    if (request.url().startsWith(baseUrl)) errors.push(entry);
    else externalWarnings.push(entry);
  });

  const report = { generatedAt: new Date().toISOString(), baseUrl, injectTerrainFailure, pass: false };
  try {
    await page.goto(`${baseUrl}/app/?continuous-renderer=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForRuntime(page);
    report.bootstrap = await startEarth(page);
    report.sourceRequests = {
      overpass: requestedUrls.filter((url) => /\/api\/interpreter|overpass-api|overpass\.private/i.test(url)),
      shortbread: requestedUrls.filter((url) => /^https:\/\/vector\.openstreetmap\.org\/shortbread/i.test(url)),
      overture: requestedUrls.filter((url) => /overturemaps|overture.*\.pmtiles/i.test(url))
    };
    assert(report.bootstrap.initialEarthWorldReady, 'Continuous Earth did not become ready at its starting location.');
    assert(report.bootstrap.initialEarthWorldRetired, 'Continuous Earth retained a legacy initial world.');
    assert(report.bootstrap.profile === 'continuous_global', `Continuous Earth reported ${report.bootstrap.profile || 'no'} source profile.`);
    assert(Number(report.bootstrap.snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9, 'The starting OSM neighborhood was incomplete.');
    assert(report.bootstrap.nonStreamRoads === 0, 'Continuous cold start retained non-streamed roads.');
    assert(report.bootstrap.nonStreamBuildings === 0, 'Continuous cold start retained non-streamed buildings.');
    assert(report.sourceRequests.overpass.length === 0, 'Continuous cold start requested Overpass data.');
    assert(report.sourceRequests.shortbread.length >= 9, 'Continuous cold start did not request its OSM Shortbread neighborhood.');
    assert(report.sourceRequests.overture.length === 0, 'Continuous cold start requested Overture data.');
    const bootstrapCenterKey = report.bootstrap.snapshot.centerKey;
    await moveWalker(page, 9500, 900);
    report.seamTravel = await waitForStream(page, ({ snapshot }) =>
      snapshot?.centerKey &&
      snapshot.centerKey !== bootstrapCenterKey &&
      Number(snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9 &&
      Number(snapshot?.activeLoads || 0) === 0
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outputDir, 'baltimore-seam-walk.png') });
    const traveledCenterKey = report.seamTravel.snapshot.centerKey;
    await moveWalker(page, 0, 0);
    report.denseReturn = await waitForStream(page, ({ snapshot }) =>
      snapshot?.actorSource === 'walk' &&
      snapshot?.centerKey === bootstrapCenterKey && snapshot.centerKey !== traveledCenterKey &&
      Number(snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9 &&
      Number(snapshot?.activeLoads || 0) === 0
    );
    report.resourcePlateau = { firstReturn: await rendererMetrics(page) };
    await moveWalker(page, 9500, 900);
    await waitForStream(page, ({ snapshot }) =>
      snapshot?.centerKey === traveledCenterKey &&
      Number(snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9 &&
      Number(snapshot?.activeLoads || 0) === 0
    );
    await moveWalker(page, 0, 0);
    await waitForStream(page, ({ snapshot }) =>
      snapshot?.centerKey === bootstrapCenterKey &&
      Number(snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9 &&
      Number(snapshot?.activeLoads || 0) === 0
    );
    await page.waitForTimeout(2500);
    await waitForVectorDisposal(page);
    report.resourcePlateau.secondReturn = await rendererMetrics(page);
    await moveWalker(page, 9500, 900);
    await waitForStream(page, ({ snapshot }) =>
      snapshot?.centerKey === traveledCenterKey &&
      Number(snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9 &&
      Number(snapshot?.activeLoads || 0) === 0
    );
    await moveWalker(page, 0, 0);
    await waitForStream(page, ({ snapshot }) =>
      snapshot?.centerKey === bootstrapCenterKey &&
      Number(snapshot?.layers?.['global-vector']?.loadedNearCenter || 0) >= 9 &&
      Number(snapshot?.activeLoads || 0) === 0
    );
    await page.waitForTimeout(2500);
    await waitForVectorDisposal(page);
    report.resourcePlateau.thirdReturn = await rendererMetrics(page);
    const warmResources = report.resourcePlateau.secondReturn;
    const plateauResources = report.resourcePlateau.thirdReturn;
    assert(Number(plateauResources.streaming?.layers?.['global-vector']?.loaded || 0) <= 20, 'Vector chunks exceeded their active budget.');
    assert(Number(plateauResources.terrainCache?.entries || 0) <= Number(plateauResources.terrainCache?.limit || 0), 'Terrain cache exceeded its entry budget.');
    assert(Number(plateauResources.terrainCache?.failed || 0) === 0, 'A failed terrain tile remained cached after seam travel.');
    assert(Number(plateauResources.streaming?.layers?.['global-vector']?.retrying || 0) === 0, 'A vector chunk remained in retry backoff after seam travel.');
    assert(!plateauResources.streaming?.lastError, `Streaming retained an unresolved error: ${plateauResources.streaming?.lastError}`);
    if (injectTerrainFailure) {
      assert(injectedTerrainFailures === 1, 'The terrain recovery fixture did not inject exactly one request failure.');
      assert(Number(plateauResources.terrainCache?.recovered || 0) >= 1, 'The injected terrain request failure did not recover.');
    }
    assert(plateauResources.streamMeshes <= warmResources.streamMeshes + 10, 'Stream mesh count kept growing after warm-up.');
    assert(plateauResources.streamGeometries <= warmResources.streamGeometries + 10, 'Reachable stream geometry ownership kept growing after warm-up.');
    assert(plateauResources.sceneGeometries <= warmResources.sceneGeometries + 12, 'Reachable scene geometry ownership kept growing after warm-up.');
    assert(
      plateauResources.gpu.geometries <= plateauResources.sceneGeometries + 64,
      'Renderer geometry resources exceeded reachable scene ownership.'
    );
    assert(plateauResources.gpu.textures <= warmResources.gpu.textures + 2, 'GPU texture count kept growing after warm-up.');
    assert(plateauResources.vectorResources?.pendingGeometryDisposals === 0, 'Vector geometry disposal queue did not drain.');
    report.road = await snapToMappedRoad(page);
    assert(report.road, 'No preferred streamed road was available near dense Baltimore.');
    assert(Math.hypot(report.road.x, report.road.z) <= 2000, 'Dense return selected a road outside the Baltimore detail area.');
    assert(Number.isFinite(report.road.delta), 'Streamed road did not expose a finite terrain surface profile.');
    assert(Math.abs(report.road.delta - 0.1) <= 0.08, `Streamed road elevation delta was ${report.road.delta}.`);
    assert(report.road.topSurface?.role === 'road', 'The streamed road was not visible from the gameplay side.');
    assert(report.road.topSurface.normalY > 0.8, `The streamed road top face pointed downward (${report.road.topSurface.normalY}).`);
    await page.waitForTimeout(1000);
    report.walk = await rendererMetrics(page);
    await page.screenshot({ path: path.join(outputDir, 'baltimore-walk.png') });
    report.droneHandoff = await enterDrone(page);
    assert(report.droneHandoff.horizontalHandoffDistance <= 0.5, 'Drone did not inherit the walker horizontal position.');
    await page.waitForTimeout(1200);
    report.drone = await rendererMetrics(page);
    await page.screenshot({ path: path.join(outputDir, 'baltimore-drone.png') });
    assert(report.drone.visibleRoadMeshes >= 9, 'Continuous road batches were not visible in drone mode.');
    assert(report.drone.retainedBuildingSources >= 10000, 'Dense Baltimore did not retain enough mapped building sources.');
    assert(report.drone.visibleBuildingSources >= 3200, 'Dense Baltimore fell below the minimum aerial LOD building budget.');
    const centerBuildingBudget = report.drone.buildingFeatureBudgets?.[report.drone.streaming?.centerKey];
    assert(centerBuildingBudget, 'The active tile did not expose its building feature budget.');
    assert(
      centerBuildingBudget.selected === Math.min(centerBuildingBudget.requested, 3600),
      'The active tile dropped mapped buildings below its bounded detail ceiling.'
    );
    assert(report.drone.visibleLandCoverMeshes > 0, 'Continuous land-cover semantics were not visible.');
    assert(report.drone.opaqueLandCoverMeshes === report.drone.visibleLandCoverMeshes, 'Mapped land cover was not visually authoritative.');
    assert(report.drone.terrainSurface.imageryOwners === 0, 'A terrain mesh still retained a satellite-imagery owner.');
    assert(report.drone.terrainSurface.rasterUrls.length === 0, 'A terrain material still referenced satellite imagery.');
    assert(report.drone.terrainSurface.detailMapOwners > 0, 'Continuous terrain lost its semantic PBR surface detail.');
    assert(
      report.drone.terrainSurface.semanticPbrOwners === report.drone.terrainSurface.detailMapOwners,
      'A continuous terrain detail map is missing semantic PBR provenance.'
    );
    assert(report.drone.terrainSurface.unclassifiedDetailOwners === 0, 'Continuous terrain retained an unclassified detail map.');
    assert(report.drone.missingProvenance === 0, 'A continuous renderer mesh is missing source provenance.');
    assert(!report.drone.rendererContextLost, 'WebGL context was lost during the renderer check.');
    assert(errors.length === 0, `Browser errors: ${errors.join(' | ')}`);
    report.pass = true;
  } finally {
    report.errors = errors;
    report.externalWarnings = externalWarnings;
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    await server?.close();
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
