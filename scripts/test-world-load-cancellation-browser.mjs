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

    const captureSurfaceRenderEvidence = () => {
      const mesh = (ctx.terrainGroup?.children || [])
        .filter((candidate) =>
          candidate?.userData?.isTerrainMesh &&
          candidate?.userData?.worldCoverResult?.surfaceBuiltWeights &&
          Number(candidate?.userData?.worldCoverBuiltBlend?.maxWeight || 0) >= 0.8
        )
        .sort((left, right) =>
          Math.hypot(left.position?.x || 0, left.position?.z || 0) -
          Math.hypot(right.position?.x || 0, right.position?.z || 0)
        )[0];
      if (!mesh || !ctx.renderer || typeof THREE === 'undefined') return null;

      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      const width = Math.max(1, bounds.max.x - bounds.min.x);
      const depth = Math.max(1, bounds.max.z - bounds.min.z);
      const centerY = (bounds.min.y + bounds.max.y) * 0.5;
      const renderSize = 256;
      const target = new THREE.WebGLRenderTarget(renderSize, renderSize, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat
      });
      const scene = new THREE.Scene();
      scene.background = null;
      const renderMesh = new THREE.Mesh(mesh.geometry, mesh.material);
      renderMesh.frustumCulled = false;
      scene.add(renderMesh);
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const cameraHeight = Math.max(width, depth) * 2;
      const camera = new THREE.OrthographicCamera(
        -width * 0.5,
        width * 0.5,
        depth * 0.5,
        -depth * 0.5,
        0.1,
        cameraHeight * 2
      );
      camera.position.set(0, centerY + cameraHeight, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, centerY, 0);
      camera.updateProjectionMatrix();

      const previousTarget = ctx.renderer.getRenderTarget();
      const previousClearColor = ctx.renderer.getClearColor(new THREE.Color()).clone();
      const previousClearAlpha = ctx.renderer.getClearAlpha();
      ctx.renderer.setRenderTarget(target);
      ctx.renderer.setClearColor(0x000000, 0);
      ctx.renderer.clear(true, true, true);
      ctx.renderer.render(scene, camera);
      const pixels = new Uint8Array(renderSize * renderSize * 4);
      ctx.renderer.readRenderTargetPixels(target, 0, 0, renderSize, renderSize, pixels);
      ctx.renderer.setRenderTarget(previousTarget);
      ctx.renderer.setClearColor(previousClearColor, previousClearAlpha);

      const result = mesh.userData.worldCoverResult;
      const weights = result.surfaceBuiltWeights;
      const weightSize = Number(result.surfaceBuiltWeightSize || 0);
      const sampleWeight = (u, v) => {
        const sourceX = Math.max(0, Math.min(weightSize - 1, u * (weightSize - 1)));
        const sourceY = Math.max(0, Math.min(weightSize - 1, (1 - v) * (weightSize - 1)));
        const x0 = Math.floor(sourceX);
        const y0 = Math.floor(sourceY);
        const x1 = Math.min(weightSize - 1, x0 + 1);
        const y1 = Math.min(weightSize - 1, y0 + 1);
        const tx = sourceX - x0;
        const ty = sourceY - y0;
        const north = weights[y0 * weightSize + x0] * (1 - tx) + weights[y0 * weightSize + x1] * tx;
        const south = weights[y1 * weightSize + x0] * (1 - tx) + weights[y1 * weightSize + x1] * tx;
        return (north * (1 - ty) + south * ty) / 255;
      };
      const groups = {
        built: { count: 0, red: 0, green: 0, blue: 0 },
        natural: { count: 0, red: 0, green: 0, blue: 0 }
      };
      for (let y = 4; y < renderSize - 4; y += 2) {
        for (let x = 4; x < renderSize - 4; x += 2) {
          const offset = (y * renderSize + x) * 4;
          if (pixels[offset + 3] < 250) continue;
          const weight = sampleWeight((x + 0.5) / renderSize, (y + 0.5) / renderSize);
          const group = weight >= 0.8 ? groups.built : weight <= 0.2 ? groups.natural : null;
          if (!group) continue;
          group.count += 1;
          group.red += pixels[offset];
          group.green += pixels[offset + 1];
          group.blue += pixels[offset + 2];
        }
      }
      const average = (group) => ({
        count: group.count,
        rgb: group.count ? [group.red, group.green, group.blue].map((value) => value / group.count) : null
      });
      const built = average(groups.built);
      const natural = average(groups.natural);
      const colorDistance = built.rgb && natural.rgb
        ? Math.hypot(...built.rgb.map((value, index) => value - natural.rgb[index]))
        : 0;

      const evidenceCanvas = document.createElement('canvas');
      evidenceCanvas.width = renderSize;
      evidenceCanvas.height = renderSize;
      const evidenceContext = evidenceCanvas.getContext('2d');
      const image = evidenceContext.createImageData(renderSize, renderSize);
      for (let y = 0; y < renderSize; y += 1) {
        const sourceOffset = y * renderSize * 4;
        const destinationOffset = (renderSize - 1 - y) * renderSize * 4;
        image.data.set(pixels.subarray(sourceOffset, sourceOffset + renderSize * 4), destinationOffset);
      }
      evidenceContext.putImageData(image, 0, 0);
      const pngDataUrl = evidenceCanvas.toDataURL('image/png');

      target.dispose();
      scene.clear();
      return {
        tileKey: mesh.userData.terrainTileKey,
        builtBlend: mesh.userData.worldCoverBuiltBlend,
        built,
        natural,
        colorDistance,
        pngDataUrl
      };
    };
    const surfaceRenderEvidence = captureSurfaceRenderEvidence();

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
      surfaceRenderEvidence,
      farTerrain: ctx.farTerrainClipmapState || null
    };
  }, { replacementLocation });

  const surfacePngDataUrl = report.surfaceRenderEvidence?.pngDataUrl || '';
  if (surfacePngDataUrl.startsWith('data:image/png;base64,')) {
    await fs.writeFile(
      path.join(outputDir, `${artifactPrefix}-worldcover-surface.png`),
      Buffer.from(surfacePngDataUrl.slice('data:image/png;base64,'.length), 'base64')
    );
  }
  if (report.surfaceRenderEvidence) delete report.surfaceRenderEvidence.pngDataUrl;

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
  assert.ok(report.surfaceRenderEvidence, 'replacement location produced no rendered WorldCover evidence');
  assert.equal(report.surfaceRenderEvidence.builtBlend?.shaderCompiled, true);
  assert.ok(
    Object.values(report.surfaceRenderEvidence.builtBlend?.shaderInjection || {}).every(Boolean),
    'the built-surface shader did not replace every required Three.js shader chunk'
  );
  assert.ok(report.surfaceRenderEvidence.built.count >= 500, 'render evidence had insufficient built pixels');
  assert.ok(report.surfaceRenderEvidence.natural.count >= 100, 'render evidence had insufficient natural pixels');
  assert.ok(
    report.surfaceRenderEvidence.colorDistance >= 8,
    `rendered built and natural surface samples were visually indistinguishable (${report.surfaceRenderEvidence.colorDistance})`
  );
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
