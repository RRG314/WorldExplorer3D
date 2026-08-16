import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const outputDir = path.join(rootDir, 'output', 'playwright', 'startup-workload');
const browserChannel = String(process.env.WE3D_BROWSER_CHANNEL || '').trim();
const budgets = Object.freeze({
  runtimeReadyMs: Number(process.env.WE3D_STARTUP_READY_BUDGET_MS || 10000),
  totalRequests: Number(process.env.WE3D_STARTUP_REQUEST_BUDGET || 220),
  localScripts: Number(process.env.WE3D_STARTUP_SCRIPT_BUDGET || 190),
  localEncodedBytes: Number(process.env.WE3D_STARTUP_LOCAL_BYTES_BUDGET || 3_100_000),
  maximumLongTaskMs: Number(process.env.WE3D_STARTUP_LONG_TASK_BUDGET_MS || 3000)
});
const forbiddenTitleHosts = [
  's3.amazonaws.com',
  'titiler.terrascope.be',
  'vector.openstreetmap.org',
  'overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com',
  'overpass-api.de',
  'overpass.private.coffee',
  'lz4.overpass-api.de',
  'wms.gebco.net',
  'nominatim.openstreetmap.org',
  'api.open-meteo.com',
  'tile.openstreetmap.org'
];
const forbiddenTitlePaths = [
  '/app/assets/data/universe/gaia-dr3-nearby-bright.csv',
  '/app/assets/textures/earth/',
  '/app/js/planetary/mars-world.js',
  '/app/js/runtime/earth-runtime.js',
  '/app/js/ground.js',
  '/app/js/terrain.js',
  '/app/js/world.js'
];
const optionalFamilies = Object.freeze({
  earthWorld: /\/app\/js\/(?:runtime\/earth-runtime|ground|terrain|world)\.js/,
  interiors: /\/app\/js\/interiors(?:\/|\.js)/,
  fishing: /\/app\/js\/fishing(?:\/|-game\.js)/,
  challenges: /\/app\/js\/flower-challenge(?:\/|\.js)/,
  blockBuilder: /\/app\/js\/(?:blocks\.js|block-builder\/)/,
  liveEarth: /\/app\/js\/live-earth\//,
  locationGames: /\/app\/js\/(?:deflock|live-gps)\//,
  planetaryWorlds: /\/app\/js\/planetary\/(?:mars-world|vehicles|astronaut|moon-sky|tracks)\.js/
});

await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({
  rootDir,
  host,
  candidatePorts: [4280, 4281, 4282, 4283]
});
const baseUrl = `http://${host}:${server.port}`;
const browser = await chromium.launch({
  headless: true,
  ...(browserChannel ? { channel: browserChannel } : {})
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const requests = [];
const pageErrors = [];
const localFailures = [];

page.on('request', (request) => {
  const url = request.url();
  let hostname = 'invalid';
  try { hostname = new URL(url).hostname; } catch {}
  requests.push({ url, hostname, resourceType: request.resourceType() });
});
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({ url: request.url(), reason: request.failure()?.errorText || 'request failed' });
  }
});
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

try {
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(5000);
    globalThis.__we3dStartupLongTasks = [];
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          globalThis.__we3dStartupLongTasks.push({
            startTime: Number(entry.startTime.toFixed(2)),
            duration: Number(entry.duration.toFixed(2))
          });
        });
      }).observe({ entryTypes: ['longtask'] });
    } catch {}
  });

  const navigationStartedAt = performance.now();
  await page.goto(`${baseUrl}/app/?startup-workload=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, {
    timeout: 120000
  });
  const runtimeReadyMs = performance.now() - navigationStartedAt;
  await page.waitForTimeout(2000);

  const beforeDiagnostics = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      terrain: ctx.terrainTileCacheSnapshot?.() || null,
      requestCount: performance.getEntriesByType('resource').length
    };
  });
  const terrainRequestsBeforeDiagnostics = requests.filter((entry) => entry.hostname === 's3.amazonaws.com').length;
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) globalThis.render_game_to_text?.();
  });
  await page.waitForTimeout(250);
  const afterDiagnostics = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      terrain: ctx.terrainTileCacheSnapshot?.() || null,
      requestCount: performance.getEntriesByType('resource').length
    };
  });
  const terrainRequestsAfterDiagnostics = requests.filter((entry) => entry.hostname === 's3.amazonaws.com').length;

  const browserMetrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    return {
      resources: resources.map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        encodedBodySize: Number(entry.encodedBodySize || 0),
        transferSize: Number(entry.transferSize || 0)
      })),
      longTasks: globalThis.__we3dStartupLongTasks || []
    };
  });
  const rendererEligibility = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const gl = ctx.renderer?.getContext?.() || null;
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info') || null;
    const renderer = String(debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl?.getParameter?.(gl.RENDERER) || '');
    const vendor = String(debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl?.getParameter?.(gl.VENDOR) || '');
    const software = !renderer || /swiftshader|software|llvmpipe/i.test(`${vendor} ${renderer}`);
    return {
      vendor,
      renderer,
      software,
      longTaskBudgetEligible: !software
    };
  });
  const localResources = browserMetrics.resources.filter((entry) => entry.name.startsWith(baseUrl));
  const localScripts = requests.filter((entry) =>
    entry.url.startsWith(baseUrl) && entry.resourceType === 'script'
  );
  const largestLocalResources = localResources
    .filter((entry) => entry.encodedBodySize > 0)
    .sort((left, right) => right.encodedBodySize - left.encodedBodySize)
    .slice(0, 20)
    .map((entry) => ({
      path: new URL(entry.name).pathname,
      initiatorType: entry.initiatorType,
      encodedBodySize: entry.encodedBodySize
    }));
  const maximumLongTaskMs = Math.max(0, ...browserMetrics.longTasks.map((entry) => entry.duration));
  const eagerOptionalFamilies = Object.fromEntries(Object.entries(optionalFamilies).map(([id, pattern]) => [
    id,
    localScripts.filter((entry) => pattern.test(new URL(entry.url).pathname)).length
  ]));
  const forbiddenRequests = requests.filter((entry) => forbiddenTitleHosts.includes(entry.hostname));
  const forbiddenLocalAssetRequests = requests.filter((entry) => {
    if (!entry.url.startsWith(baseUrl)) return false;
    const pathname = new URL(entry.url).pathname;
    return forbiddenTitlePaths.some((prefix) => pathname.startsWith(prefix));
  });
  const report = {
    generatedAt: new Date().toISOString(),
    browser: browserChannel || 'playwright-chromium',
    url: `${baseUrl}/app/`,
    budgets,
    measurements: {
      runtimeReadyMs: Number(runtimeReadyMs.toFixed(2)),
      totalRequests: requests.length,
      localScripts: localScripts.length,
      localEncodedBytes: localResources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      maximumLongTaskMs,
      longTaskCount: browserMetrics.longTasks.length,
      rendererEligibility,
      titleHostCounts: requests.reduce((counts, entry) => {
        counts[entry.hostname] = Number(counts[entry.hostname] || 0) + 1;
        return counts;
      }, {}),
      eagerOptionalFamilies,
      largestLocalResources
    },
    diagnostics: {
      before: beforeDiagnostics,
      after: afterDiagnostics,
      terrainRequestsBefore: terrainRequestsBeforeDiagnostics,
      terrainRequestsAfter: terrainRequestsAfterDiagnostics
    },
    forbiddenRequests,
    forbiddenLocalAssetRequests,
    localFailures,
    pageErrors
  };

  await page.screenshot({ path: path.join(outputDir, 'title.png'), fullPage: true });

  if (report.measurements.rendererEligibility.longTaskBudgetEligible) {
    assert.ok(report.measurements.runtimeReadyMs <= budgets.runtimeReadyMs,
      `hardware-eligible title runtime-ready exceeded ${budgets.runtimeReadyMs} ms: ${report.measurements.runtimeReadyMs}`);
  }
  assert.ok(report.measurements.totalRequests <= budgets.totalRequests,
    `title requests exceeded ${budgets.totalRequests}: ${report.measurements.totalRequests}`);
  assert.ok(report.measurements.localScripts <= budgets.localScripts,
    `title script requests exceeded ${budgets.localScripts}: ${report.measurements.localScripts}`);
  assert.ok(report.measurements.localEncodedBytes <= budgets.localEncodedBytes,
    `title local bytes exceeded ${budgets.localEncodedBytes}: ${report.measurements.localEncodedBytes}`);
  if (report.measurements.rendererEligibility.longTaskBudgetEligible) {
    assert.ok(report.measurements.maximumLongTaskMs <= budgets.maximumLongTaskMs,
      `hardware-eligible title long task exceeded ${budgets.maximumLongTaskMs} ms: ${report.measurements.maximumLongTaskMs}`);
  }
  assert.equal(report.measurements.eagerOptionalFamilies.interiors, 0,
    'idle title loaded the on-demand interiors implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.earthWorld, 0,
    'idle title loaded the on-demand Earth world implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.fishing, 0,
    'idle title loaded the on-demand fishing implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.challenges, 0,
    'idle title loaded the on-demand Challenge implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.blockBuilder, 0,
    'idle title loaded the on-demand block-builder implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.liveEarth, 0,
    'idle title loaded the on-demand Live Earth implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.locationGames, 0,
    'idle title loaded an on-demand location game implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.planetaryWorlds, 4,
    'idle title loaded a planetary world outside the retained Moon support modules');
  assert.deepEqual(forbiddenRequests, [], `idle title requested Earth/location providers: ${JSON.stringify(forbiddenRequests)}`);
  assert.deepEqual(forbiddenLocalAssetRequests, [], `idle title requested deferred gameplay assets: ${JSON.stringify(forbiddenLocalAssetRequests)}`);
  assert.deepEqual(localFailures, [], `idle title had local request failures: ${JSON.stringify(localFailures)}`);
  assert.deepEqual(pageErrors, [], `idle title emitted page errors: ${JSON.stringify(pageErrors)}`);
  assert.equal(afterDiagnostics.terrain?.entries, beforeDiagnostics.terrain?.entries,
    'runtime diagnostics changed the terrain cache');
  assert.equal(terrainRequestsAfterDiagnostics, terrainRequestsBeforeDiagnostics,
    'runtime diagnostics initiated a Terrarium request');

  await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
  await page.locator('#flowerChallengeToggleBtn').click();
  await page.locator('#flowerChallengePanel.open').waitFor({ state: 'visible', timeout: 10000 });
  const deferredChallengeActivation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      challengeReady: typeof ctx.startFlowerChallenge === 'function' &&
        ctx.getFlowerChallengeBackendStatus?.().backend !== 'not-loaded',
      panelOpen: document.getElementById('flowerChallengePanel')?.classList.contains('open') === true
    };
  });
  report.deferredChallengeActivation = deferredChallengeActivation;
  await page.screenshot({ path: path.join(outputDir, 'challenge-panel.png'), fullPage: true });
  await page.locator('#flowerChallengeToggleBtn').click();

  await page.locator('.globe-app-rail [data-globe-destination="live-earth"]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.ensureLiveEarthReady?.();
  });
  await page.waitForFunction(() =>
    globalThis.__WE3D_RUNTIME_READY__ === true &&
      document.getElementById('globeSelectorLiveEarthPanel')?.hidden === false &&
      document.querySelectorAll('.globe-selector-live-chip').length > 0,
  null, { timeout: 15000 });
  const deferredLiveEarthActivation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      ready: ctx.liveEarth?.ready === true,
      panelMode: ctx.liveEarth?.getPanelMode?.() || '',
      categoryCount: ctx.liveEarth?.categories?.length || 0,
      layerCount: Object.keys(ctx.liveEarth?.layers || {}).length
    };
  });
  report.deferredLiveEarthActivation = deferredLiveEarthActivation;
  await page.screenshot({ path: path.join(outputDir, 'live-earth-panel.png'), fullPage: true });
  await page.locator('.globe-app-rail [data-globe-destination="location"]').click();
  await page.locator('#globeSelectorStartBtn').waitFor({ state: 'visible', timeout: 10000 });

  const deferredActivationStartedAt = performance.now();
  await page.locator('#globeSelectorStartBtn').click();
  let gaiaRequested = false;
  let earthPbrRequested = false;
  let earthRuntimeRequested = false;
  for (let attempt = 0; attempt < 80 && (!gaiaRequested || !earthPbrRequested || !earthRuntimeRequested); attempt += 1) {
    gaiaRequested = requests.some((entry) => new URL(entry.url).pathname === forbiddenTitlePaths[0]);
    earthPbrRequested = requests.some((entry) => new URL(entry.url).pathname.startsWith(forbiddenTitlePaths[1]));
    earthRuntimeRequested = requests.some((entry) => new URL(entry.url).pathname === forbiddenTitlePaths[3]);
    if (!gaiaRequested || !earthPbrRequested || !earthRuntimeRequested) await page.waitForTimeout(100);
  }
  report.deferredGameplayActivation = {
    elapsedMs: Number((performance.now() - deferredActivationStartedAt).toFixed(2)),
    gaiaRequested,
    earthPbrRequested,
    earthRuntimeRequested
  };
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEarthRuntimeSnapshot?.().ready === true;
  }, null, { timeout: 15000 });
  report.deferredGameplayActivation.earthRuntimeReady = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEarthRuntimeSnapshot?.().ready === true;
  });
  const deferredSubsystemActivation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await Promise.all([
      ctx.ensureInteriorsReady?.(),
      ctx.ensureFishingReady?.(),
      ctx.ensureBlockBuilderReady?.(),
      ctx.ensureMarsRuntimeReady?.()
    ]);
    return {
      interiorActionReady: typeof ctx.enterInteriorForSupport === 'function',
      fishingActionReady: typeof ctx.openFishingGame === 'function',
      blockBuilderReady: typeof ctx.placeBuildBlock === 'function',
      marsRuntimeReady: typeof ctx.directTravelToMars === 'function' && typeof ctx.arriveAtMars === 'function'
    };
  });
  report.deferredSubsystemActivation = deferredSubsystemActivation;
  await page.keyboard.press('b');
  await page.waitForTimeout(100);
  const blockBuilderInteraction = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getBlockBuilderSnapshot?.() || null;
  });
  await page.keyboard.press('b');
  report.blockBuilderInteraction = blockBuilderInteraction;
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  assert.equal(gaiaRequested, true, 'Explore did not start the deferred Gaia catalog request');
  assert.equal(earthPbrRequested, true, 'Explore did not start deferred Earth PBR requests');
  assert.equal(earthRuntimeRequested, true, 'Explore did not start the deferred Earth world runtime');
  assert.equal(report.deferredGameplayActivation.earthRuntimeReady, true,
    'Explore requested the Earth world runtime but did not finish installing it');
  assert.equal(deferredChallengeActivation.challengeReady, true, 'on-demand Challenge runtime did not initialize');
  assert.equal(deferredChallengeActivation.panelOpen, true, 'Challenge title control did not open its panel');
  assert.equal(deferredLiveEarthActivation.ready, true, 'on-demand Live Earth runtime did not initialize');
  assert.equal(deferredLiveEarthActivation.panelMode, 'live-earth', 'Live Earth intent did not activate its panel mode');
  assert.ok(deferredLiveEarthActivation.categoryCount > 0, 'Live Earth intent did not render its category controls');
  assert.equal(deferredLiveEarthActivation.layerCount, 9, 'Live Earth intent did not expose the complete layer registry');
  assert.equal(deferredSubsystemActivation.interiorActionReady, true, 'on-demand interiors did not initialize');
  assert.equal(deferredSubsystemActivation.fishingActionReady, true, 'on-demand fishing did not initialize');
  assert.equal(deferredSubsystemActivation.blockBuilderReady, true, 'on-demand block builder did not initialize');
  assert.equal(deferredSubsystemActivation.marsRuntimeReady, true, 'on-demand Mars runtime did not initialize');
  assert.equal(blockBuilderInteraction?.enabled, true, 'B did not enable the deferred block builder');

  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
