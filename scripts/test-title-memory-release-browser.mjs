import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4350, 4351, 4352] });
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--enable-precise-memory-info']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const fatalErrors = [];

page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource|ERR_|Overpass|WorldCover|Shortbread|Terrarium|tile|429|500|502|503|504/i.test(message.text())) {
    fatalErrors.push(message.text());
  }
});

async function collectGarbage() {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.detach();
  await page.waitForTimeout(500);
}

async function snapshot() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { getShortbreadRuntimeCacheStats } = await import('/app/js/world/shortbread-source.js?v=17');
    const { getOverpassRuntimeCacheStats } = await import('/app/js/world/osm-loader.js?v=18');
    return {
      heap: Number(performance.memory?.usedJSHeapSize || 0),
      roads: Number(ctx.roads?.length || 0),
      buildings: Number(ctx.buildings?.length || 0),
      roadMeshes: Number(ctx.roadMeshes?.length || 0),
      buildingMeshes: Number(ctx.buildingMeshes?.length || 0),
      geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
      textures: Number(ctx.renderer?.info?.memory?.textures || 0),
      shortbread: getShortbreadRuntimeCacheStats(),
      overpass: getOverpassRuntimeCacheStats(),
      worldLoading: !!ctx.worldLoading,
      worldReady: !!ctx.initialEarthWorldReady
    };
  });
}

async function loadNewYork() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.selLoc = 'newyork';
    ctx.customLocTransient = false;
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.ensureEarthRuntimeReady?.();
    await ctx.loadRoads();
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.worldLoading === false && ctx.initialEarthWorldReady === true && (ctx.roads?.length || 0) > 300;
  }, null, { timeout: 180000 });
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?diagnostics=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  await loadNewYork();
  await collectGarbage();
  const loaded = await snapshot();
  assert.ok(loaded.roads > 300 && loaded.geometries > 100, `Dense world did not load: ${JSON.stringify(loaded)}`);
  assert.equal(loaded.shortbread.decodedTileCount, 0);
  assert.equal(loaded.overpass.entryCount, 0);

  const releaseResult = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.releaseEarthWorldForTitle?.();
  });
  assert.equal(releaseResult?.released, true);
  await collectGarbage();
  const released = await snapshot();
  assert.equal(released.roads, 0);
  assert.equal(released.buildings, 0);
  assert.equal(released.roadMeshes, 0);
  assert.equal(released.buildingMeshes, 0);
  assert.equal(released.worldLoading, false);
  assert.equal(released.worldReady, false);
  assert.equal(released.shortbread.decodedTileCount, 0);
  assert.equal(released.overpass.entryCount, 0);
  assert.ok(released.geometries < loaded.geometries, `WebGL geometries were not released: ${JSON.stringify({ loaded, released })}`);
  assert.ok(released.heap < loaded.heap, `Used JS heap did not fall after title release: ${JSON.stringify({ loaded, released })}`);

  await loadNewYork();
  await collectGarbage();
  const reloaded = await snapshot();
  assert.ok(reloaded.roads > 300 && reloaded.worldReady, `Earth did not reload after title release: ${JSON.stringify(reloaded)}`);
  assert.equal(reloaded.shortbread.decodedTileCount, 0);
  assert.equal(reloaded.overpass.entryCount, 0);
  assert.deepEqual(fatalErrors, []);

  console.log(JSON.stringify({
    ok: true,
    loaded,
    released,
    reloaded,
    heapReleasedBytes: loaded.heap - released.heap,
    geometryReleased: loaded.geometries - released.geometries
  }, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
