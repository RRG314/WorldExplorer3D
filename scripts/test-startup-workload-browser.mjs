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
  totalRequests: Number(process.env.WE3D_STARTUP_REQUEST_BUDGET || 360),
  localScripts: Number(process.env.WE3D_STARTUP_SCRIPT_BUDGET || 330),
  localEncodedBytes: Number(process.env.WE3D_STARTUP_LOCAL_BYTES_BUDGET || 4_500_000),
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
  '/app/assets/textures/earth/'
];
const optionalFamilies = Object.freeze({
  interiors: /\/app\/js\/interiors(?:\/|\.js)/,
  fishing: /\/app\/js\/fishing(?:\/|-game\.js)/,
  challenges: /\/app\/js\/flower-challenge(?:\/|\.js)/,
  blockBuilder: /\/app\/js\/(?:blocks\.js|block-builder\/)/,
  liveEarth: /\/app\/js\/live-earth\//,
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

  assert.ok(report.measurements.runtimeReadyMs <= budgets.runtimeReadyMs,
    `title runtime-ready exceeded ${budgets.runtimeReadyMs} ms: ${report.measurements.runtimeReadyMs}`);
  assert.ok(report.measurements.totalRequests <= budgets.totalRequests,
    `title requests exceeded ${budgets.totalRequests}: ${report.measurements.totalRequests}`);
  assert.ok(report.measurements.localScripts <= budgets.localScripts,
    `title script requests exceeded ${budgets.localScripts}: ${report.measurements.localScripts}`);
  assert.ok(report.measurements.localEncodedBytes <= budgets.localEncodedBytes,
    `title local bytes exceeded ${budgets.localEncodedBytes}: ${report.measurements.localEncodedBytes}`);
  assert.ok(report.measurements.maximumLongTaskMs <= budgets.maximumLongTaskMs,
    `title long task exceeded ${budgets.maximumLongTaskMs} ms: ${report.measurements.maximumLongTaskMs}`);
  assert.equal(report.measurements.eagerOptionalFamilies.interiors, 0,
    'idle title loaded the on-demand interiors implementation');
  assert.equal(report.measurements.eagerOptionalFamilies.fishing, 0,
    'idle title loaded the on-demand fishing implementation');
  assert.deepEqual(forbiddenRequests, [], `idle title requested Earth/location providers: ${JSON.stringify(forbiddenRequests)}`);
  assert.deepEqual(forbiddenLocalAssetRequests, [], `idle title requested deferred gameplay assets: ${JSON.stringify(forbiddenLocalAssetRequests)}`);
  assert.deepEqual(localFailures, [], `idle title had local request failures: ${JSON.stringify(localFailures)}`);
  assert.deepEqual(pageErrors, [], `idle title emitted page errors: ${JSON.stringify(pageErrors)}`);
  assert.equal(afterDiagnostics.terrain?.entries, beforeDiagnostics.terrain?.entries,
    'runtime diagnostics changed the terrain cache');
  assert.equal(terrainRequestsAfterDiagnostics, terrainRequestsBeforeDiagnostics,
    'runtime diagnostics initiated a Terrarium request');

  const deferredActivationStartedAt = performance.now();
  await page.locator('#globeSelectorStartBtn').click();
  let gaiaRequested = false;
  let earthPbrRequested = false;
  for (let attempt = 0; attempt < 40 && (!gaiaRequested || !earthPbrRequested); attempt += 1) {
    gaiaRequested = requests.some((entry) => new URL(entry.url).pathname === forbiddenTitlePaths[0]);
    earthPbrRequested = requests.some((entry) => new URL(entry.url).pathname.startsWith(forbiddenTitlePaths[1]));
    if (!gaiaRequested || !earthPbrRequested) await page.waitForTimeout(100);
  }
  report.deferredGameplayActivation = {
    elapsedMs: Number((performance.now() - deferredActivationStartedAt).toFixed(2)),
    gaiaRequested,
    earthPbrRequested
  };
  const deferredSubsystemActivation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await Promise.all([ctx.ensureInteriorsReady?.(), ctx.ensureFishingReady?.()]);
    return {
      interiorActionReady: typeof ctx.enterInteriorForSupport === 'function',
      fishingActionReady: typeof ctx.openFishingGame === 'function'
    };
  });
  report.deferredSubsystemActivation = deferredSubsystemActivation;
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  assert.equal(gaiaRequested, true, 'Explore did not start the deferred Gaia catalog request');
  assert.equal(earthPbrRequested, true, 'Explore did not start deferred Earth PBR requests');
  assert.equal(deferredSubsystemActivation.interiorActionReady, true, 'on-demand interiors did not initialize');
  assert.equal(deferredSubsystemActivation.fishingActionReady, true, 'on-demand fishing did not initialize');

  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
