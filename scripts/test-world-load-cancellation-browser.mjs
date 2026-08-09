import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'world-load-cancellation');
const replacementLocation = String(process.env.WORLD_LOAD_REPLACEMENT_LOCATION || 'monaco').trim().toLowerCase();
const artifactPrefix = replacementLocation.replace(/[^a-z0-9_-]+/g, '-') || 'replacement';
await fs.mkdir(outputDir, { recursive: true });

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4235, 4236, 4237, 4238]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
const consoleErrors = [];
let farTerrainInFlight = 0;
let farTerrainMaxInFlight = 0;
let farTerrainStarted = 0;
let farTerrainFailed = 0;
const farTerrainActiveRequests = new Map();
const farTerrainStartCounts = new Map();
let farTerrainPeakUrls = [];

const isFarTerrainRequest = (url) => /elevation-tiles-prod\/terrarium\/12\//.test(url);
page.on('request', (request) => {
  if (!isFarTerrainRequest(request.url())) return;
  farTerrainStarted += 1;
  farTerrainInFlight += 1;
  farTerrainActiveRequests.set(request, request.url());
  farTerrainStartCounts.set(request.url(), Number(farTerrainStartCounts.get(request.url()) || 0) + 1);
  farTerrainMaxInFlight = Math.max(farTerrainMaxInFlight, farTerrainInFlight);
  if (farTerrainInFlight === farTerrainMaxInFlight) {
    farTerrainPeakUrls = [...farTerrainActiveRequests.values()];
  }
});
page.on('requestfinished', (request) => {
  if (isFarTerrainRequest(request.url())) {
    farTerrainActiveRequests.delete(request);
    farTerrainInFlight = Math.max(0, farTerrainInFlight - 1);
  }
});
page.on('requestfailed', (request) => {
  if (isFarTerrainRequest(request.url())) {
    farTerrainFailed += 1;
    farTerrainActiveRequests.delete(request);
    farTerrainInFlight = Math.max(0, farTerrainInFlight - 1);
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/Failed to load resource|Could not reach Cloud Firestore|blocked by CORS/i.test(text)) return;
  consoleErrors.push(text);
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?loc=baltimore&world-load-cancellation=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  const report = await page.evaluate(async ({ replacementLocation }) => {
    const deadline = performance.now() + 120000;
    let ctx = null;
    while (performance.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (typeof ctx?.loadRoads === 'function') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (typeof ctx?.loadRoads !== 'function') throw new Error('World loader initialization timed out.');
    const { ENV, switchEnv } = await import('/app/js/env.js?v=58');
    if (!ctx.selectPresetLocation?.('baltimore')) throw new Error('Baltimore preset selection failed.');
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    switchEnv(ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });

    const baltimorePromise = ctx.loadRoads();
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!ctx.selectPresetLocation?.(replacementLocation)) {
      throw new Error(`${replacementLocation} preset selection failed.`);
    }
    const replacementPromise = ctx.loadRoads();
    const baltimoreSession = await baltimorePromise;
    let replacementSceneStage = ctx.getEarthScenePublicationState?.() || null;
    while (
      performance.now() < deadline &&
      (replacementSceneStage?.stage?.sequence !== 3 ||
      replacementSceneStage?.stage?.status !== 'building'
      )
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      replacementSceneStage = ctx.getEarthScenePublicationState?.() || null;
    }
    const replacementSession = await replacementPromise;
    ctx.Walk?.setModeWalk?.();
    ctx.startMode?.();
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const terrainPresentation = (ctx.terrainGroup?.children || [])
      .filter((mesh) => mesh?.userData?.isTerrainMesh)
      .sort((left, right) =>
        Math.hypot(left.position?.x || 0, left.position?.z || 0) -
        Math.hypot(right.position?.x || 0, right.position?.z || 0)
      )
      .slice(0, 5)
      .map((mesh) => ({
        key: mesh.userData?.terrainTileKey || null,
        worldCoverStatus: mesh.userData?.worldCoverStatus || null,
        profile: mesh.userData?.terrainVisualProfile || null,
        worldCoverSummary: mesh.userData?.worldCoverSummary || null,
        detail: mesh.userData?.terrainDetailProvenance || null,
        builtBlend: mesh.userData?.worldCoverBuiltBlend || null
      }));

    const captureSurfaceAuthorityEvidence = () => {
      const terrainMeshes = (ctx.terrainGroup?.children || [])
        .filter((candidate) => candidate?.userData?.isTerrainMesh);
      return {
        readyWorldCoverTerrain: terrainMeshes.filter((mesh) =>
          mesh.userData?.worldCoverStatus === 'ready'
        ).length,
        builtRasterResultMeshes: terrainMeshes.filter((mesh) =>
          mesh.userData?.worldCoverResult?.surfaceBuiltWeights ||
          mesh.userData?.worldCoverResult?.surfaceBuiltWeightSize
        ).length,
        builtWeightAttributeMeshes: terrainMeshes.filter((mesh) =>
          mesh.geometry?.attributes?.surfaceBuiltWeight
        ).length,
        builtShaderMeshes: terrainMeshes.filter((mesh) =>
          mesh.userData?.worldCoverBuiltBlend ||
          String(mesh.material?.customProgramCacheKey?.() || '').includes('worldcover-built')
        ).length,
        mappedHardscapeMeshes: (ctx.landuseMeshes || []).filter((mesh) => {
          const type = String(mesh?.userData?.landuseType || '').toLowerCase();
          return ['buildingground', 'parking', 'commercial', 'industrial', 'retail'].includes(type);
        }).length,
        roadMeshes: (ctx.roadMeshes || []).filter((mesh) => mesh?.isMesh).length
      };
    };
    const surfaceAuthorityEvidence = captureSurfaceAuthorityEvidence();

    return {
      baltimoreSession,
      replacementSession,
      currentSession: ctx.worldLoadRuntimeState?.session || null,
      runtimeStatus: ctx.worldLoadRuntimeState?.status || null,
      selection: ctx.selLoc,
      location: ctx.LOC ? { lat: ctx.LOC.lat, lon: ctx.LOC.lon } : null,
      worldLoading: !!ctx.worldLoading,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.length : 0,
      publication: ctx.worldPublication ? {
        type: ctx.worldPublication.type,
        requestId: ctx.worldPublication.requestId,
        sequence: ctx.worldPublication.sequence,
        counts: ctx.worldPublication.counts,
        layers: Object.fromEntries(Object.entries(ctx.worldPublication.layers || {}).map(([name, layer]) => [
          name,
          {
            authority: layer.authority,
            completeness: layer.completeness,
            collectionEntryCount: layer.records?.[0]?.collectionEntryCount || 0,
            compilation: layer.records?.[0]?.compilation || null
          }
        ]))
      } : null,
      layerProducts: ctx.worldLoadRuntimeState?.layerProducts ? {
        frozen: Object.isFrozen(ctx.worldLoadRuntimeState.layerProducts),
        layers: Object.fromEntries(Object.entries(ctx.worldLoadRuntimeState.layerProducts).map(([name, product]) => [
          name,
          {
            type: product.type,
            requestId: product.requestId,
            canonical: product.source?.canonical === true,
            compiler: product.source?.compiler || null,
            frozen: Object.isFrozen(product),
            compilationFrozen: product.record ? Object.isFrozen(product.record.compilation) : true
          }
        ]))
      } : null,
      worldSnapshotRevision: ctx.worldSnapshotStore?.snapshot?.().revision || 0,
      replacementSceneStage,
      scenePublication: ctx.getEarthScenePublicationState?.() || null,
      terrainPresentation,
      surfaceAuthorityEvidence,
      farTerrain: ctx.farTerrainClipmapState || null
    };
  }, { replacementLocation });

  await page.screenshot({ path: path.join(outputDir, `${artifactPrefix}-after-superseded-baltimore.png`) });
  const result = {
    report,
    network: {
      farTerrainStarted,
      farTerrainFailed,
      farTerrainMaxInFlight,
      farTerrainInFlight,
      farTerrainPeakUrls,
      duplicateUrls: [...farTerrainStartCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([url, count]) => ({ url, count }))
    },
    consoleErrors
  };
  await fs.writeFile(path.join(outputDir, `report-${artifactPrefix}.json`), JSON.stringify(result, null, 2));
  if (replacementLocation === 'monaco') {
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(result, null, 2));
  }

  assert.equal(report.baltimoreSession?.state, 'superseded');
  assert.match(report.baltimoreSession?.requestId || '', /^world-load:1:/);
  assert.equal(report.baltimoreSession?.providers?.['osm-overpass']?.aborted, 1);
  assert.equal(report.replacementSession?.state, 'published');
  assert.match(report.replacementSession?.requestId || '', /^world-load:3:/);
  assert.equal(report.currentSession?.state, 'published');
  assert.equal(report.runtimeStatus, 'ready');
  assert.equal(report.selection, replacementLocation);
  assert.equal(report.worldLoading, false);
  assert.ok(report.roads > 0, 'replacement location published no roads');
  assert.ok(report.buildings > 0, 'replacement location published no buildings');
  assert.equal(report.publication?.type, 'WorldSnapshot');
  assert.equal(report.publication?.requestId, report.replacementSession?.requestId);
  assert.equal(report.publication?.sequence, report.replacementSession?.sequence);
  assert.equal(report.publication?.counts?.roads, report.roads);
  assert.equal(report.publication?.counts?.buildingMeshes, report.buildings);
  assert.equal(report.publication?.layers?.terrain?.completeness, 'partial');
  assert.equal(report.publication?.layers?.terrain?.compilation?.ready, true);
  assert.equal(report.publication?.layers?.terrain?.compilation?.pending, 0);
  assert.equal(report.publication?.layers?.terrain?.compilation?.timedOut, false);
  assert.equal(report.publication?.layers?.transport?.completeness, 'partial');
  assert.equal(report.publication?.layers?.buildings?.completeness, 'partial');
  assert.equal(report.layerProducts?.frozen, true);
  assert.deepEqual(Object.keys(report.layerProducts?.layers || {}).sort(), [
    'buildings', 'hydrology', 'landuse', 'places', 'terrain', 'transport'
  ]);
  assert.ok(
    Object.values(report.layerProducts?.layers || {}).every((product) =>
      product.type === 'WorldLayerProduct' &&
      product.requestId === report.publication?.requestId &&
      product.canonical === true &&
      !!product.compiler &&
      product.frozen === true &&
      product.compilationFrozen === true
    ),
    'published snapshot did not consume six matching immutable compiler products'
  );
  assert.equal(report.worldSnapshotRevision, 1);
  assert.equal(report.replacementSceneStage?.rootVisible, false);
  assert.equal(report.replacementSceneStage?.stage?.status, 'building');
  assert.equal(report.replacementSceneStage?.stage?.sequence, report.replacementSession?.sequence);
  assert.equal(report.scenePublication?.rootAttached, true);
  assert.equal(report.scenePublication?.rootVisible, true);
  assert.equal(report.scenePublication?.terrainAttached, true);
  assert.equal(report.scenePublication?.stage?.status, 'published');
  assert.equal(report.scenePublication?.stage?.sequence, report.publication?.sequence);
  assert.equal(report.scenePublication?.directSceneTrackedMeshCount, 0);
  assert.equal(
    report.scenePublication?.adoptedTrackedMeshCount,
    report.scenePublication?.trackedMeshCount,
    'published world meshes escaped the Earth scene publication root'
  );
  assert.ok(report.surfaceAuthorityEvidence, 'replacement location produced no terrain surface authority evidence');
  assert.ok(
    report.surfaceAuthorityEvidence.readyWorldCoverTerrain >= 1,
    'replacement location produced no ready WorldCover natural-terrain classification'
  );
  assert.equal(
    report.surfaceAuthorityEvidence.builtRasterResultMeshes,
    0,
    'WorldCover results retained the retired built-up hardscape raster'
  );
  assert.equal(
    report.surfaceAuthorityEvidence.builtWeightAttributeMeshes,
    0,
    'terrain geometry retained the retired built-up hardscape attribute'
  );
  assert.equal(
    report.surfaceAuthorityEvidence.builtShaderMeshes,
    0,
    'terrain retained the retired built-up hardscape shader'
  );
  assert.ok(report.surfaceAuthorityEvidence.roadMeshes > 0, 'exact mapped roads did not publish');
  assert.equal(report.farTerrain?.contextSource, 'openstreetmap-shortbread');
  assert.equal(report.farTerrain?.waterOwner, 'exact-mapped-polygon-pipelines');
  assert.ok(
    report.replacementSession?.providers?.['openstreetmap-shortbread']?.started >= 1,
    'mapped-water provider work was not owned by the replacement session'
  );
  assert.ok(
    report.replacementSession?.providers?.['bundled-landmarks']?.started >= 1,
    'landmark provider work was not owned by the replacement session'
  );
  assert.ok(
    Object.values(report.replacementSession?.providers || {}).every((provider) => provider.inFlight === 0),
    'published replacement retained provider work in flight'
  );
  assert.ok(
    Number(report.farTerrain?.elevationMaxInFlight || 0) <= 12,
    `far-terrain scheduler concurrency exceeded 12 (${report.farTerrain?.elevationMaxInFlight})`
  );
  assert.deepEqual(
    result.network.duplicateUrls,
    [],
    'far terrain requested the same Terrain-RGB URL more than once'
  );
  assert.ok(farTerrainFailed <= 12, `more than one superseded terrain batch was aborted (${farTerrainFailed})`);
  assert.equal(farTerrainInFlight, 0);
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
