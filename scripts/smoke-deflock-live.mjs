import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'deflock-live');
const baseUrl = String(process.env.DEFLOCK_LIVE_URL || 'http://127.0.0.1:4192/app/?deflock-live-smoke=1');
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DEFLOCK_LIVE_HEADED !== '1' });
const report = {
  ok: false,
  browser: 'Google Chrome',
  baseUrl,
  proxyRequests: 0,
  providerWarnings: [],
  fatalErrors: []
};

function isRecoverableProviderMessage(message = '') {
  return /Failed to load resource|net::ERR_|blocked by CORS|Could not reach Cloud Firestore|\b(?:429|500|502|503|504)\b|Overpass|WorldCover|Shortbread|Terrarium|tile/i.test(message);
}

try {
  await fs.mkdir(outputDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.on('request', (request) => {
    if (/\/api\/geospatial\/deflock-cameras(?:\?|$)/.test(request.url())) report.proxyRequests += 1;
  });
  page.on('pageerror', (error) => report.fatalErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (isRecoverableProviderMessage(text)) report.providerWarnings.push(text);
    else report.fatalErrors.push(text);
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && typeof ctx.getDeFlockSnapshot === 'function';
  }, null, { timeout: 90000 });
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#globeFavoritesTabBtn').click();
  await page.locator('#globeCityList').getByText('Baltimore', { exact: true }).click();
  await page.locator('[data-globe-destination="games"]').click();
  assert.equal(await page.locator('#tab-games .mode-grid > .mode').first().getAttribute('data-mode'), 'deflock');
  await page.locator('.mode[data-mode="deflock"]').click();
  await page.locator('#globeHubOverlayCloseBtn').click();
  await page.locator('#globeSelectorStartBtn:not([disabled])').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const snapshot = globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock;
    return snapshot?.active === true && snapshot.loading === false && snapshot.progress?.total > 0;
  }, null, { timeout: 300000 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 30000 });

  const tutorialClose = page.locator('[aria-label="Dismiss tutorial hint"]');
  if (await tutorialClose.isVisible()) await tutorialClose.click();
  const before = await page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    const marker = ctx.deFlockMapMarkers?.find((item) => item && Number.isFinite(item.x) && Number.isFinite(item.z));
    if (!marker) throw new Error('No live DeFlock marker was published');
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(marker.x, marker.z)?.position?.y) || 0;
    ctx.setTravelMode?.('walk', { source: 'deflock-live-smoke', force: true, emitTutorial: false });
    const walker = ctx.Walk?.state?.walker;
    if (!walker) throw new Error('Walking actor is unavailable');
    Object.assign(walker, { x: marker.x + 1.2, y: terrainY + 1.7, z: marker.z + 1.2, vx: 0, vy: 0, vz: 0 });
    if (ctx.Walk.state.characterMesh) {
      ctx.Walk.state.characterMesh.position.set(walker.x, terrainY, walker.z);
      ctx.Walk.state.characterMesh.updateMatrixWorld(true);
    }
    ctx.updateDeFlockMode?.(0.016);
    ctx.camera.position.set(marker.x + 9.5, terrainY + 7, marker.z + 9.5);
    ctx.camera.lookAt(marker.x, terrainY + 2.2, marker.z);
    ctx.camera.updateMatrixWorld(true);
    ctx.renderer?.render?.(ctx.scene, ctx.camera);
    return { marker, snapshot: ctx.getDeFlockSnapshot?.() };
  }));
  assert(before.snapshot?.nearbySourceId, 'approaching a live mapped camera did not make it interactive');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.progress?.disabled === 1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, 'baltimore-live-disabled.png'), fullPage: false });

  report.snapshot = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock);
  report.status = await page.locator('#deFlockStatus').innerText();
  report.ok = report.proxyRequests >= 1 &&
    report.snapshot?.progress?.total > 0 &&
    report.snapshot?.progress?.disabled === 1 &&
    report.snapshot?.renderInstances === report.snapshot?.progress?.total &&
    /Virtual Camera Disabled/.test(report.status) &&
    report.fatalErrors.length === 0;
  assert(report.ok, `live DeFlock journey failed: ${JSON.stringify(report)}`);
  await page.locator('#mainMenuBtn').click({ force: true });
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().deflock?.active), false);
  await context.close();
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = String(error?.stack || error);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
