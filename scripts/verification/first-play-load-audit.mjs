import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright';

const baseUrl = String(process.argv[2] || process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4222').replace(/\/$/, '');
const outputDir = String(process.env.WE3D_VERIFY_OUTPUT_DIR || 'output/verification/first-play-load-audit');
const cacheDisabled = process.env.WE3D_AUDIT_CACHE_DISABLED !== '0';
const auditRevisit = process.env.WE3D_AUDIT_REVISIT === '1';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled });
await page.addInitScript(() => {
  globalThis.__WE3D_LOAD_AUDIT__ = { longTasks: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      globalThis.__WE3D_LOAD_AUDIT__.longTasks.push({
        startTime: Math.round(entry.startTime),
        duration: Math.round(entry.duration)
      });
    }
  }).observe({ type: 'longtask', buffered: true });
});

const requests = new Map();
page.on('request', (request) => {
  const url = request.url();
  requests.set(url, (requests.get(url) || 0) + 1);
});

const navigationStartedAt = performance.now();
await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&mode=walk`, {
  waitUntil: 'load',
  timeout: 120_000
});
await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
  await page.locator('#analyticsConsentDenyBtn').click();
}
const titleReadyMs = Math.round(performance.now() - navigationStartedAt);

const launchStartedAt = performance.now();
await page.locator('#globeSelectorStartBtn').click();
await page.waitForTimeout(3_000);
await page.screenshot({ path: `${outputDir}/loading-3s.png` });
await page.waitForFunction(() => {
  const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
  return state.gameStarted === true && state.worldLoading === false &&
    document.getElementById('loading')?.classList.contains('show') !== true &&
    Number(state.worldCounts?.roads || 0) > 0 && Number(state.worldCounts?.buildings || 0) > 0;
}, null, { timeout: 180_000 });
const firstPlayableMs = Math.round(performance.now() - launchStartedAt);
await page.screenshot({ path: `${outputDir}/playable.png` });

const browserState = await page.evaluate(() => {
  const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
  const resources = performance.getEntriesByType('resource').map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    startTime: Math.round(entry.startTime),
    duration: Math.round(entry.duration),
    transferSize: Number(entry.transferSize || 0),
    decodedBodySize: Number(entry.decodedBodySize || 0)
  }));
  return {
    worldLoad: diagnostics.worldLoad ? {
      status: diagnostics.worldLoad.status,
      startedAt: diagnostics.worldLoad.startedAt,
      finishedAt: diagnostics.worldLoad.finishedAt,
      phaseTotals: diagnostics.worldLoad.phaseTotals,
      gameplayRuntimeDurationMs: diagnostics.worldLoad.gameplayRuntimeDurationMs,
      gameplayStartupDurationsMs: diagnostics.worldLoad.gameplayStartupDurationsMs,
      providerAvailability: diagnostics.worldLoad.providerAvailability,
      providers: diagnostics.worldLoad.session?.providers
    } : null,
    worldCounts: diagnostics.worldCounts,
    onDemandModes: diagnostics.onDemandModes,
    transportCompilation: diagnostics.transportCompilation,
    terrainSurfaceCompilation: diagnostics.terrainSurfaceCompilation,
    workload: diagnostics.workloadPolicy || globalThis.getWorkloadPolicySnapshot?.() || null,
    longTasks: globalThis.__WE3D_LOAD_AUDIT__?.longTasks || [],
    resources
  };
});

let revisit = null;
if (auditRevisit) {
  const revisitNavigationStartedAt = performance.now();
  await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&mode=walk`, {
    waitUntil: 'load',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const revisitTitleReadyMs = Math.round(performance.now() - revisitNavigationStartedAt);
  const revisitLaunchStartedAt = performance.now();
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false &&
      document.getElementById('loading')?.classList.contains('show') !== true &&
      Number(state.worldCounts?.roads || 0) > 0 && Number(state.worldCounts?.buildings || 0) > 0;
  }, null, { timeout: 180_000 });
  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  revisit = {
    titleReadyMs: revisitTitleReadyMs,
    firstPlayableMs: Math.round(performance.now() - revisitLaunchStartedAt),
    phaseTotals: diagnostics.worldLoad?.phaseTotals || null,
    gameplayRuntimeDurationMs: diagnostics.worldLoad?.gameplayRuntimeDurationMs || null,
    providerAvailability: diagnostics.worldLoad?.providerAvailability || null,
    worldCounts: diagnostics.worldCounts || null,
    onDemandModes: diagnostics.onDemandModes || null,
    transportCompilation: diagnostics.transportCompilation || null,
    terrainSurfaceCompilation: diagnostics.terrainSurfaceCompilation || null
  };
}

const duplicateRequests = [...requests.entries()]
  .filter(([, count]) => count > 1)
  .map(([url, count]) => ({ url, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 40);
const slowResources = browserState.resources
  .filter((entry) => entry.duration >= 250)
  .sort((a, b) => b.duration - a.duration)
  .slice(0, 30);
const blockingLongTasks = browserState.longTasks
  .filter((entry) => entry.startTime >= titleReadyMs)
  .sort((a, b) => b.duration - a.duration)
  .slice(0, 30);

const report = {
  contract: 'first-play-load-audit-v1',
  cacheDisabled,
  viewport: { width: 390, height: 844 },
  titleReadyMs,
  firstPlayableMs,
  revisit,
  worldLoad: browserState.worldLoad,
  worldCounts: browserState.worldCounts,
  onDemandModes: browserState.onDemandModes,
  transportCompilation: browserState.transportCompilation,
  terrainSurfaceCompilation: browserState.terrainSurfaceCompilation,
  workload: browserState.workload,
  requestCount: [...requests.values()].reduce((sum, count) => sum + count, 0),
  uniqueRequestCount: requests.size,
  duplicateRequests,
  slowResources,
  blockingLongTasks
};
await writeFile(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

await context.close();
await browser.close();
