import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { closeOwnedBrowser } from './owned-browser.mjs';

const root = process.cwd();
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const initialOnly = process.env.WE3D_VERIFY_INITIAL_ONLY === '1';
const server = externalUrl ? null : await startStaticServer({ rootDir: process.env.WE3D_VERIFY_ROOT || root, ports: [4431, 4432, 4433] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = process.env.WE3D_VERIFY_OUTPUT_DIR || `${root}/output/verification/city-switch-lifecycle`;
const ownedBrowser = await chromium.launchServer({ headless: true, channel: 'chrome' });
const browser = await chromium.connect(ownedBrowser.wsEndpoint());
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await configureStagingAppCheck(page, baseUrl);
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');

const browserErrors = [];
const localFailures = [];
const cancelledLocationRequests = [];
const pendingRequests = new Set();
const supersededRequests = new WeakMap();
page.on('request', request => pendingRequests.add(request));
page.on('requestfinished', request => pendingRequests.delete(request));
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ url: response.url(), status: response.status() });
  }
});
page.on('requestfailed', (request) => {
  pendingRequests.delete(request);
  if (supersededRequests.has(request) && request.failure()?.errorText === 'net::ERR_ABORTED') {
    cancelledLocationRequests.push({ url: request.url(), reason: supersededRequests.get(request) });
    return;
  }
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({ url: request.url(), reason: request.failure()?.errorText || 'failed' });
  }
});

function markSupersededLocationRequests(reason = 'superseded-location') {
  for (const request of pendingRequests) {
    const url = new URL(request.url());
    if (url.origin === baseUrl && url.pathname === '/api/geospatial/marine') supersededRequests.set(request, reason);
  }
}

function metric(metrics, name) {
  return Number(metrics.find((entry) => entry.name === name)?.value || 0);
}

async function memorySnapshot(collect = false) {
  if (collect) await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const { metrics = [] } = await cdp.send('Performance.getMetrics');
  return {
    jsHeapUsedBytes: metric(metrics, 'JSHeapUsedSize'),
    jsHeapTotalBytes: metric(metrics, 'JSHeapTotalSize'),
    nodes: metric(metrics, 'Nodes'),
    documents: metric(metrics, 'Documents'),
    listeners: metric(metrics, 'JSEventListeners')
  };
}

async function frameHeartbeat(durationMs = 1200) {
  return page.evaluate((sampleMs) => new Promise((resolve) => {
    let frames = 0;
    let worstFrameMs = 0;
    const startedAt = performance.now();
    let previous = startedAt;
    const tick = (now) => {
      frames += 1;
      worstFrameMs = Math.max(worstFrameMs, now - previous);
      previous = now;
      if (now - startedAt >= sampleMs) resolve({ frames, worstFrameMs, elapsedMs: now - startedAt });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), durationMs);
}

async function runtimeSnapshot(label) {
  const runtime = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  return {
    label,
    earthOrigin: runtime.earthOrigin || null,
    worldLoading: runtime.worldLoading === true,
    loadStatus: runtime.worldLoad?.status || null,
    loadSequence: Number(runtime.worldLoad?.sequence || 0),
    locationName: runtime.worldLoad?.location?.name || null,
    publicationRadiusWorld: runtime.worldLoad?.buildingVisibleRadiusWorld || null,
    presentationLodScale: runtime.worldLoad?.loadProfile?.dynamicLodScale || null,
    worldCounts: runtime.worldCounts || null,
    renderer: runtime.renderer || null,
    runtimeErrorCount: Array.isArray(runtime.runtimeErrors) ? runtime.runtimeErrors.length : 0,
    heartbeat: await frameHeartbeat(),
    memory: await memorySnapshot(true)
  };
}

async function waitForWorld(latitude, longitude, afterSequence = -1, timeout = 300_000) {
  await page.waitForFunction(({ lat, lon, afterSequence }) => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const origin = runtime.earthOrigin || {};
    return runtime.gameStarted === true && runtime.worldLoading === false &&
      runtime.worldLoad?.status === 'ready' &&
      Number(runtime.worldLoad?.sequence) > afterSequence &&
      Math.abs(Number(origin.lat) - lat) < 0.001 &&
      Math.abs(Number(origin.lon) - lon) < 0.001 &&
      Number(runtime.worldCounts?.roads || 0) > 0;
  }, { lat: latitude, lon: longitude, afterSequence }, { timeout });
  await page.waitForTimeout(1500);
}

function logStep(message) {
  console.log(`[city-switch] ${message}`);
}

let report;
const snapshots = [];
const originalFavorites = [];
let failedLoad = null;
let invalidAdmission = null;
try {
  await mkdir(outputDir, { recursive: true });
  await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, {
    waitUntil: 'load',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await page.locator('#analyticsConsentDenyBtn').click();
  }
  await page.locator('#globeSaveFavoriteBtn').click();
  originalFavorites.push(...await page.evaluate(() => JSON.parse(localStorage.getItem('worldExplorer3D.globeSelector.savedFavorites') || '[]')));
  assert.ok(originalFavorites.length > 0, 'The current selected place must be saved');
  logStep('injecting one ground-provider failure before entry, then retrying through the visible menu');
  // Match only marine requests already pending at the deliberately triggered
  // retirement boundary. Do not ignore unrelated aborts or HTTP failures.
  await page.exposeFunction('__we3dAuditProviderWillFail', () => markSupersededLocationRequests('injected-failure-retirement'));
  await page.evaluate(async () => {
    const {ctx} = await import('/app/js/shared-context.js?v=55');
    await ctx.ensureEarthRuntimeReady();
    globalThis.__WE3D_LIFECYCLE_CONTEXT__ = ctx;
    const prepare = ctx.prepareAcceptedGroundFromCatalog;
    if (typeof prepare !== 'function') throw Error('Ground provider boundary unavailable');
    ctx.prepareAcceptedGroundFromCatalog = async (...args) => {
      ctx.prepareAcceptedGroundFromCatalog = prepare;
      await globalThis.__we3dAuditProviderWillFail();
      throw Error('audit-injected-ground-failure');
    };
  });
  markSupersededLocationRequests('first-world-entry');
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const ctx = globalThis.__WE3D_LIFECYCLE_CONTEXT__;
    return ctx.worldLoadRuntimeState?.status === 'failed' && !ctx.worldLoading &&
      document.getElementById('globeSelectorScreen')?.classList.contains('show');
  }, null, {timeout: 60000});
  failedLoad = await page.evaluate(async () => {
    const {ctx} = await import('/app/js/shared-context.js?v=55');
    return {started:ctx.gameStarted, ready:ctx.initialEarthWorldReady, publication:!!ctx.worldPublication,
      loading:ctx.worldLoading, buildings:ctx.buildings.length, roads:ctx.roads.length,
      providers:ctx.worldLoadRuntimeState.session.outstandingProviderWork,
      error:ctx.worldLoadRuntimeState.error, failureMessage:document.getElementById('globeLocationSearchStatus').textContent, explorationPrompt:getComputedStyle(document.getElementById('explorationModeMsg')).display, loadingCover:document.getElementById('loading').classList.contains('show')};
  });
  assert.equal(failedLoad.started, false);assert.equal(failedLoad.ready, false);
  assert.equal(failedLoad.publication, false);assert.equal(failedLoad.loadingCover, false);
  assert.equal(failedLoad.explorationPrompt, 'none');
  assert.match(failedLoad.failureMessage, /could not finish loading/);
  assert.equal(failedLoad.buildings, 0);assert.equal(failedLoad.roads, 0);assert.equal(failedLoad.providers, 0);
  assert.match(failedLoad.error, /audit-injected-ground-failure/);
  await page.screenshot({path:`${outputDir}/failed-load-recovered-menu.png`});
  markSupersededLocationRequests('failed-world-retry');
  await page.locator('#globeSelectorStartBtn').click();
  logStep('waiting for initial Baltimore world');
  await waitForWorld(39.2904, -76.6122);
  const baseline = await runtimeSnapshot('custom-baltimore');
  snapshots.push(baseline);
  invalidAdmission = await page.evaluate(async () => {
    const {ctx} = await import('/app/js/shared-context.js?v=55');
    const snapshot = () => ({sequence:ctx._worldLoadSequence,publication:ctx.worldPublication?.requestId,
      buildings:ctx.buildings.length,roads:ctx.roads.length,ready:ctx.initialEarthWorldReady,
      loading:ctx.worldLoading,started:ctx.gameStarted,x:ctx.car.x,z:ctx.car.z});
    const before=snapshot(),resolve=ctx.resolveLocationSelection;
    try {
      ctx.resolveLocationSelection=()=>null;
      const result=await ctx.loadRoads();
      return {before,after:snapshot(),aborted:result?.aborted===true};
    } finally {ctx.resolveLocationSelection=resolve;}
  });
  assert.equal(invalidAdmission.aborted,true);
  assert.deepEqual(invalidAdmission.after,invalidAdmission.before,'Invalid admission must preserve the live world and pose');

  let sameAreaReload = null;
  let qualityReload = null;
  let hollywood = null;
  let repeatProbe = null;
  let repeatOriginBefore = null;
  if (!initialOnly) {
    logStep('reopening the same location after lowering automatic presentation quality');
    markSupersededLocationRequests();
    await page.locator('#mainMenuBtn').click();
    await page.waitForSelector('#globeSelectorScreen.show');
    await page.evaluate(async () => {
      const {ctx} = await import('/app/js/shared-context.js?v=55');
      ctx.setPerfAutoQualityEnabled(true, {persist:false});
      ctx.setPerfAutoQualityTier(ctx.PERF_QUALITY_TIER_PERFORMANCE, {reason:'coverage-regression-check'});
    });
    await page.locator('#globeSelectorStartBtn').click();
    await waitForWorld(39.2904, -76.6122, baseline.loadSequence);
    qualityReload = await runtimeSnapshot('same-location-lower-quality');
    snapshots.push(qualityReload);

    logStep('switching custom Baltimore to preset Baltimore');
    markSupersededLocationRequests();
    await page.keyboard.press('Shift+KeyN');
    await waitForWorld(39.2904, -76.6122, qualityReload.loadSequence);
    sameAreaReload = await runtimeSnapshot('preset-baltimore');
    snapshots.push(sameAreaReload);

    logStep('switching Baltimore to Hollywood');
    markSupersededLocationRequests();
    await page.keyboard.press('Shift+KeyN');
    await waitForWorld(34.0928, -118.3287, sameAreaReload.loadSequence);
    hollywood = await runtimeSnapshot('hollywood');
    snapshots.push(hollywood);

    repeatOriginBefore = hollywood.earthOrigin;
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'KeyN',
        key: 'n',
        shiftKey: true,
        repeat: true
      }));
    });
    await page.waitForTimeout(750);
    repeatProbe = await page.evaluate(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        earthOrigin: runtime.earthOrigin || null,
        worldLoading: runtime.worldLoading === true,
        loadStatus: runtime.worldLoad?.status || null,
        loadSequence: Number(runtime.worldLoad?.sequence || 0)
      };
    });
  }

  await page.screenshot({
    path: `${outputDir}/${initialOnly ? 'baltimore-initial-ready.png' : 'hollywood-after-city-switch.png'}`,
    fullPage: false
  });
  if (!initialOnly) {
    logStep('returning to Baltimore through the same location loader as the city control');
    markSupersededLocationRequests();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.selectPresetLocation('baltimore');
      await ctx.loadRoads();
    });
    await waitForWorld(39.2904, -76.6122, hollywood.loadSequence);
    snapshots.push(await runtimeSnapshot('returned-baltimore'));
    await page.screenshot({ path: `${outputDir}/baltimore-return.png` });
  }
  const afterFavorites = await page.evaluate(() => JSON.parse(localStorage.getItem('worldExplorer3D.globeSelector.savedFavorites') || '[]'));
  const checks = {
    failedLoadRetiredBeforeRetry: failedLoad?.started === false && failedLoad?.providers === 0 && baseline.loadStatus === 'ready',
    invalidRequestPreservesWorld: invalidAdmission?.aborted === true && JSON.stringify(invalidAdmission.before) === JSON.stringify(invalidAdmission.after),
    lowerQualityPreservesDistrict: initialOnly || (
      qualityReload.presentationLodScale < baseline.presentationLodScale &&
      qualityReload.publicationRadiusWorld === baseline.publicationRadiusWorld &&
      qualityReload.worldCounts.buildings >= baseline.worldCounts.buildings * .99 &&
      qualityReload.worldCounts.roads >= baseline.worldCounts.roads * .99
    ),
    savedPlacesPreserved: originalFavorites.every(before => afterFavorites.some(after => JSON.stringify(before) === JSON.stringify(after))),
    completeWorldAfterEachSwitch: snapshots.every(entry => !entry.worldLoading && entry.loadStatus === 'ready'),
    liveFramesAfterEachSwitch: snapshots.every((entry) =>
      Number(entry.heartbeat?.frames || 0) >= 10 && Number(entry.heartbeat?.worstFrameMs || Infinity) <= 500),
    rendererContextHealthy: snapshots.every((entry) => entry.renderer?.contextLost !== true && Number(entry.renderer?.glError || 0) === 0),
    worldCoverageAfterEachSwitch: snapshots.every((entry) => Number(entry.worldCounts?.roads || 0) > 0),
    noRuntimeErrors: snapshots.every((entry) => entry.runtimeErrorCount === 0) && browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0,
    heldKeyDoesNotStartAnotherWorldLoad: initialOnly || (
      repeatProbe.worldLoading === false && repeatProbe.loadSequence === hollywood.loadSequence &&
      Number(repeatProbe.earthOrigin?.lat) === Number(repeatOriginBefore?.lat) &&
      Number(repeatProbe.earthOrigin?.lon) === Number(repeatOriginBefore?.lon)
    )
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    baseUrl,
    scope: initialOnly ? 'initial-world-only' : 'in-session-city-switches',
    checks,
    snapshots,
    failedLoad,
    invalidAdmission,
    repeatProbe,
    browserErrors,
    localFailures,
    cancelledLocationRequests
  };
  await writeFile(`${outputDir}/${initialOnly ? 'report-initial.json' : 'report.json'}`, `${JSON.stringify(report, null, 2)}\n`);
  Object.entries(checks).forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  assert.equal(report.ok, true, `City-switch lifecycle verification failed: ${JSON.stringify(checks)}`);
} catch (error) {
  if (!report) {
    const lastWorld = await page.evaluate(() => {
      const d = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return { origin: d?.earthOrigin, loading: d?.worldLoading, status: d?.worldLoad?.status, sequence: d?.worldLoad?.sequence, phases: d?.worldLoad?.activePhases };
    }).catch(() => null);
    await writeFile(`${outputDir}/failure.json`, JSON.stringify({ ok: false, error: error.message, snapshots, lastWorld, browserErrors, localFailures, cancelledLocationRequests }, null, 2));
  }
  throw error;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await closeOwnedBrowser(ownedBrowser);
  await server?.close().catch(() => {});
}
