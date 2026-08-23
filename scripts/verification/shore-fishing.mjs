import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const server = await startStaticServer({ rootDir: process.cwd(), ports: [4380, 4381, 4382] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const startGeo = Object.freeze({ latitude: 39.28305, longitude: -76.61270 });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  geolocation: { ...startGeo, accuracy: 6 },
  permissions: ['geolocation']
});
await context.grantPermissions(['geolocation'], { origin: new URL(baseUrl).origin });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const browserErrors = [];
const localFailures = [];
const movementDebug = {};
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
});

try {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorLiveGpsBtn').click();
  await page.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 30_000 });
  await page.locator('#liveGpsPermissionContinue').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.worldLoading === false && diagnostics.liveGps?.active === true && diagnostics.activeActor?.mode === 'walk';
  }, null, { timeout: 240_000 });
  await page.locator('#gameBtn').click();
  await page.waitForSelector('#gameMenu.open #fFishing', { timeout: 30_000 });
  await page.locator('#fFishing').click();
  await page.waitForFunction(() => {
    const fishing = globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing;
    return fishing?.open === true || fishing?.accessContext?.outcome;
  }, null, { timeout: 30_000 });
  let diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  if (diagnostics.fishing?.accessContext?.outcome === 'no_safe_bank' && diagnostics.fishing.accessContext.castTarget) {
    const currentWorld = diagnostics.liveGps.fieldWorld;
    const edge = diagnostics.fishing.accessContext.castTarget;
    const awayX = Number(currentWorld.x) - Number(edge.x);
    const awayZ = Number(currentWorld.z) - Number(edge.z);
    const awayLength = Math.hypot(awayX, awayZ) || 1;
    const bankWorld = { x: Number(edge.x) + awayX / awayLength * 18, z: Number(edge.z) + awayZ / awayLength * 18 };
    const worldUnitsPerDegree = 100_000;
    const targetLatitude = startGeo.latitude - (bankWorld.z - Number(currentWorld.z)) / worldUnitsPerDegree;
    const targetLongitude = startGeo.longitude + (bankWorld.x - Number(currentWorld.x)) /
      (worldUnitsPerDegree * Math.cos(startGeo.latitude * Math.PI / 180));
    Object.assign(movementDebug, { currentWorld, edge, bankWorld, targetLatitude, targetLongitude });
    for (let index = 0; index < 10; index += 1) {
      await cdp.send('Emulation.setGeolocationOverride', { latitude: targetLatitude, longitude: targetLongitude, accuracy: 6, speed: 1.2, heading: 0 });
      await page.waitForTimeout(650);
    }
    const menuOpen = await page.locator('#gameMenu').evaluate((element) => element.classList.contains('open'));
    if (!menuOpen) await page.locator('#gameBtn').click();
    await page.locator('#fFishing').click();
    await page.waitForTimeout(1_500);
    diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    movementDebug.afterWorld = diagnostics.liveGps?.fieldWorld;
    movementDebug.afterAccess = diagnostics.fishing?.accessContext;
  }
  const fishing = diagnostics.fishing || {};
  if (fishing.open) {
    await page.locator('#fishingActionBtn').click();
    await page.waitForFunction(() => {
      const stage = globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage;
      return stage === 'bite';
    }, null, { timeout: 20_000 });
    await page.locator('#fishingActionBtn').click();
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing?.stage === 'fighting', null, { timeout: 10_000 });
    diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
    await mkdir('output/verification/live-gps-field', { recursive: true });
    await page.screenshot({ path: 'output/verification/live-gps-field/shore-fishing-mobile.png', fullPage: true });
  }
  const verifiedFishing = diagnostics.fishing || fishing;
  const checks = {
    shorelineEvaluated: ['shore_eligible', 'access_unknown'].includes(verifiedFishing.accessContext?.outcome),
    shoreGameOpened: verifiedFishing.open === true && verifiedFishing.accessMode === 'shore',
    shoreCastAndHook: verifiedFishing.active === true && verifiedFishing.stage === 'fighting',
    mappedWaterIdentity: !!verifiedFishing.accessContext?.waterbodyId && verifiedFishing.accessContext?.sourceDataset !== 'synthetic-transition',
    privacyGeneralizationReady: verifiedFishing.accessContext?.rewardEligible === false || verifiedFishing.accessContext?.accessTruth === 'mapped-explicit',
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = { ok: Object.values(checks).every(Boolean), contract: 'live-gps-mapped-shore-fishing-entry', checks, fishing: verifiedFishing, movementDebug, browserErrors, localFailures };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Live GPS shoreline fishing entry failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
