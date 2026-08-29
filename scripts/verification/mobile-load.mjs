import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({
  rootDir: requestedRoot || process.cwd(),
  ports: [4397, 4398, 4399]
});
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function createMobilePage() {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 39.2904, longitude: -76.6122, accuracy: 6 },
    permissions: ['geolocation']
  });
  await context.grantPermissions(['geolocation'], { origin: new URL(baseUrl).origin });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  return { context, page, browserErrors, localFailures };
}

async function waitForPlayable(page, requireLiveGps = false) {
  const startedAt = performance.now();
  let last = null;
  while (performance.now() - startedAt < 180_000) {
    last = await page.evaluate((liveGps) => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const loadingVisible = document.getElementById('loading')?.classList.contains('show') === true;
      return {
        ready: state.gameStarted === true && state.worldLoading === false && !loadingVisible &&
          Number(state.worldCounts?.roads || 0) > 0 &&
          Number(state.worldCounts?.buildings || 0) > 0 &&
          (!liveGps || (state.liveGps?.active === true && state.liveGps?.watchActive === true)),
        loadingVisible,
        gameStarted: state.gameStarted,
        worldLoading: state.worldLoading,
        worldCounts: state.worldCounts,
        worldLoad: state.worldLoad ? {
          status: state.worldLoad.status,
          activePhases: state.worldLoad.activePhases,
          lastCompletedPhase: state.worldLoad.lastCompletedPhase,
          geometryReady: state.worldLoad.geometryReady,
          providers: state.worldLoad.session?.providers,
          loadProfile: state.worldLoad.loadProfile,
          regionalTransportSelection: state.worldLoad.regionalTransportSelection
        } : null,
        liveGps: state.liveGps
      };
    }, requireLiveGps);
    if (last.ready) break;
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs % 20_000 < 1_200) {
      console.error(JSON.stringify({ mobileLoadProgressMs: elapsedMs, ...last }));
    }
    await page.waitForTimeout(1_000);
  }
  if (!last?.ready) {
    throw new Error(`Mobile world did not become playable: ${JSON.stringify(last)}`);
  }
  await page.waitForTimeout(1_000);
}

async function openTitle(page) {
  const startedAt = performance.now();
  await page.goto(
    `${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&mode=walk`,
    { waitUntil: 'load', timeout: 120_000 }
  );
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await page.locator('#analyticsConsentDenyBtn').click();
  }
  return Math.round(performance.now() - startedAt);
}

async function runStandardJourney() {
  const client = await createMobilePage();
  try {
    const titleReadyMs = await openTitle(client.page);
    const startedAt = performance.now();
    await client.page.locator('#globeSelectorStartBtn').click();
    await waitForPlayable(client.page, false);
    const firstPlayableMs = Math.round(performance.now() - startedAt);
    const diagnostics = await client.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    await client.page.screenshot({ path: '/tmp/worldexplorer-mobile-load-standard.png', fullPage: true });
    return {
      titleReadyMs,
      firstPlayableMs,
      worldCounts: diagnostics.worldCounts,
      loadProfile: diagnostics.worldLoad?.loadMetrics?.loadProfile || diagnostics.worldLoad?.loadProfile || null,
      phases: diagnostics.worldLoad?.phaseTotals || diagnostics.worldLoad?.loadMetrics?.phases || null,
      regionalTransportSelection: diagnostics.worldLoad?.regionalTransportSelection ||
        diagnostics.worldLoad?.loadMetrics?.regionalTransportSelection || null,
      farTerrain: diagnostics.farTerrain || diagnostics.terrain?.farField || null,
      browserErrors: client.browserErrors,
      localFailures: client.localFailures
    };
  } finally {
    await client.context.close();
  }
}

async function runLiveGpsJourney() {
  const client = await createMobilePage();
  try {
    const titleReadyMs = await openTitle(client.page);
    const startedAt = performance.now();
    await client.page.locator('#globeSelectorLiveGpsBtn').click();
    await client.page.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 30_000 });
    const permissionStartedAt = performance.now();
    await client.page.locator('#liveGpsPermissionContinue').click();
    await waitForPlayable(client.page, true);
    const permissionToPlayableMs = Math.round(performance.now() - permissionStartedAt);
    const entryToPlayableMs = Math.round(performance.now() - startedAt);
    const diagnostics = await client.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    await client.page.screenshot({ path: '/tmp/worldexplorer-mobile-load-live-gps.png', fullPage: true });
    return {
      titleReadyMs,
      entryToPlayableMs,
      permissionToPlayableMs,
      liveGps: diagnostics.liveGps,
      worldCounts: diagnostics.worldCounts,
      phases: diagnostics.worldLoad?.phaseTotals || diagnostics.worldLoad?.loadMetrics?.phases || null,
      browserErrors: client.browserErrors,
      localFailures: client.localFailures
    };
  } finally {
    await client.context.close();
  }
}

try {
  const standard = await runStandardJourney();
  const liveGps = await runLiveGpsJourney();
  const checks = {
    standardFirstPlayUnder38Seconds: standard.firstPlayableMs <= 38_000,
    liveGpsPermissionToPlayUnder40Seconds: liveGps.permissionToPlayableMs <= 40_000,
    mobileProfileActuallyActive:
      standard.loadProfile?.dynamicBudgetScale <= 0.28 &&
      standard.loadProfile?.regionalContextRadiusMeters === 9_000 &&
      standard.loadProfile?.optionalProviderTimeoutMs <= 2_500 &&
      standard.loadProfile?.overpassTimeoutMs <= 12_000 &&
      standard.loadProfile?.maxTotalLoadMs <= 32_000,
    regionalContextRespectsMobileBudget:
      Number(standard.regionalTransportSelection?.regionalCap || Infinity) <= 900,
    standardMappedWorldPresent:
      Number(standard.worldCounts?.roads || 0) >= 900 &&
      Number(standard.worldCounts?.buildings || 0) >= 2400,
    liveGpsMappedWorldPresent:
      Number(liveGps.worldCounts?.roads || 0) >= 900 &&
      Number(liveGps.worldCounts?.buildings || 0) >= 2400,
    liveGpsActiveAndWatching: liveGps.liveGps?.active === true && liveGps.liveGps?.watchActive === true,
    noBrowserErrors: standard.browserErrors.length === 0 && liveGps.browserErrors.length === 0,
    noFailedLocalResources: standard.localFailures.length === 0 && liveGps.localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'mobile-cold-start-and-live-gps-current-v2',
    measurementAuthority: 'installed Chrome, 390x844 touch/mobile emulation; owner device proof remains required',
    checks,
    standard,
    liveGps
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Mobile cold-start and Live GPS timing journey failed.');
} finally {
  await browser.close();
  await server?.close();
}
