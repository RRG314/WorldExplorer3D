import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'live-gps-browser');
const deFlockFixture = await fs.readFile(path.join(rootDir, 'scripts', 'fixtures', 'deflock-surveillance.json'), 'utf8');
const externalBaseUrl = String(process.env.LIVE_GPS_BROWSER_URL || '').trim().replace(/\/$/, '');
const server = externalBaseUrl ? null : await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4320, 4321, 4322, 4323]
});
const origin = externalBaseUrl || `http://127.0.0.1:${server.port}`;
const baseUrl = `${origin}/app/?live-gps-browser=1`;
const initialFix = { latitude: 39.2904, longitude: -76.6122, accuracy: 8 };

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: process.env.LIVE_GPS_BROWSER_HEADED !== '1', channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  geolocation: initialFix,
  permissions: ['geolocation']
});
await context.grantPermissions(['geolocation'], { origin });
const page = await context.newPage();
const fatalErrors = [];
const providerWarnings = [];

function recoverableProviderMessage(message = '') {
  return /Failed to load resource|net::ERR_|blocked by CORS|Cloud Firestore|\b(?:429|500|502|503|504)\b|Overpass|WorldCover|Shortbread|Terrarium|tile/i.test(message);
}

await page.route(/https:\/\/[^/]+\/api\/interpreter(?:\?.*)?$/, async (route) => {
  const request = route.request();
  const form = new URLSearchParams(request.postData() || '');
  if (request.method() === 'POST' && /node\["man_made"="surveillance"\]/.test(form.get('data') || '')) {
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: deFlockFixture });
    return;
  }
  await route.continue();
});

page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const value = message.text();
  if (recoverableProviderMessage(value)) providerWarnings.push(value);
  else fatalErrors.push(value);
});

async function readState() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk?.state?.walker;
    return {
      gps: ctx.getLiveGpsSnapshot?.(),
      postReadyLoadRoadsCalls: Number(globalThis.__liveGpsPostReadyLoadRoadsCalls || 0),
      worldRequestId: ctx.worldPublication?.requestId || null,
      worldLoading: ctx.worldLoading === true,
      travelMode: ctx.getCurrentTravelMode?.() || ctx.Walk?.state?.mode || null,
      walker: walker ? { x: Number(walker.x), y: Number(walker.y), z: Number(walker.z) } : null,
      quality: ctx.getRenderQualityLevel?.() || ctx.renderQualityLevel || null
    };
  });
}

async function setFix(latitude, longitude, accuracy = 8, waitMs = 1300) {
  await context.setGeolocation({ latitude, longitude, accuracy });
  await page.waitForTimeout(waitMs);
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true &&
      typeof ctx.triggerTitleStart === 'function' &&
      typeof ctx.getLiveGpsSnapshot === 'function' &&
      typeof ctx.resolveLiveGpsWalkerTarget === 'function';
  }, null, { timeout: 90000 });
  await page.locator('#globeSelectorScreen.show').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-globe-destination="games"]').click();
  await page.locator('#globeHubOverlay:not([hidden])').waitFor({ state: 'visible' });
  const firstModes = await page.locator('#tab-games .mode-grid > .mode').evaluateAll((elements) =>
    elements.slice(0, 2).map((element) => element.getAttribute('data-mode'))
  );
  assert.deepEqual(firstModes, ['deflock', 'livegps'], 'DeFlock and Live GPS are not first in Missions and Games');
  await page.locator('.mode[data-mode="livegps"]').click();
  await page.locator('#globeHubOverlayCloseBtn').click();
  await page.locator('#globeSelectorStartBtn:not([disabled])').click();

  await page.locator('#liveGpsPermissionPanel.show').waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: path.join(outputDir, 'permission-desktop.png') });
  await page.locator('#liveGpsPermissionContinue').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.active === true, null, {
    timeout: 180000
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.worldLoading !== true && document.getElementById('liveGpsHud')?.classList.contains('show');
  }, null, { timeout: 60000 });
  await page.waitForTimeout(700);

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const originalLoadRoads = ctx.loadRoads;
    if (typeof originalLoadRoads !== 'function') throw new Error('Earth loader was not installed after bootstrap');
    globalThis.__liveGpsPostReadyLoadRoadsCalls = 0;
    ctx.loadRoads = async (...args) => {
      globalThis.__liveGpsPostReadyLoadRoadsCalls += 1;
      return originalLoadRoads(...args);
    };
  });
  const ready = await readState();
  assert(ready.worldRequestId, 'Live GPS did not publish its initial fixed Earth world');
  assert.equal(ready.gps?.active, true, 'Live GPS did not activate');
  assert.equal(ready.gps?.following, true, 'GPS-follow did not start');
  assert.equal(ready.gps?.watchActive, true, 'GPS watch is not active');
  assert.equal(ready.gps?.hasFix, true, 'The initial GPS fix became stale while the fixed world loaded');
  assert.equal(ready.travelMode, 'walk', 'Live GPS did not force walking mode');
  assert(ready.gps?.accuracyMeters <= 10, `Unexpected initial GPS accuracy: ${ready.gps?.accuracyMeters}`);

  await setFix(39.29046, -76.61218);
  await setFix(39.29052, -76.61216);
  await setFix(39.29058, -76.61214, 7, 1800);
  const moved = await readState();
  const gpsTravel = Math.hypot(moved.walker.x - ready.walker.x, moved.walker.z - ready.walker.z);
  assert(gpsTravel > 0.15, `GPS fixes did not move the walker locally: ${gpsTravel}`);
  assert.equal(moved.postReadyLoadRoadsCalls, 0, 'Ordinary GPS movement triggered another world load');
  assert.equal(moved.worldRequestId, ready.worldRequestId, 'Ordinary GPS movement replaced the fixed world');

  await page.locator('#liveGpsPauseBtn').click();
  const pausedStart = await readState();
  assert.equal(pausedStart.gps?.following, false, 'Pause GPS did not release translation ownership');
  await setFix(39.29064, -76.61212, 7, 1600);
  const pausedAfterFix = await readState();
  assert(Math.hypot(pausedAfterFix.walker.x - pausedStart.walker.x, pausedAfterFix.walker.z - pausedStart.walker.z) < 0.05,
    'Walker moved from a GPS update while GPS-follow was paused');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(150);
  const manualAction = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.readControlActions?.('walk') || null;
  });
  assert(Number(manualAction?.move) > 0.05, `Manual forward input did not reach walking controls: ${JSON.stringify(manualAction)}`);
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  const manual = await readState();
  const manualTravel = Math.hypot(manual.walker.x - pausedAfterFix.walker.x, manual.walker.z - pausedAfterFix.walker.z);
  assert(manualTravel > 0.01,
    `Manual walking was not restored while GPS-follow was paused: ${JSON.stringify({ manualAction, pausedAfterFix, manual, manualTravel })}`);

  await page.locator('#liveGpsPauseBtn').click();
  await page.locator('#liveGpsLowPowerBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.lowPower === true);
  const lowPower = await readState();
  assert.equal(lowPower.gps?.following, true, 'GPS-follow did not resume');
  assert.equal(lowPower.gps?.lowPower, true, 'Low Power Mode did not activate');
  assert.equal(lowPower.quality, 'low', 'Low Power Mode did not lower rendering quality');
  assert.equal(lowPower.postReadyLoadRoadsCalls, 0, 'Pause/resume or Low Power Mode reloaded the world');

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.gameMode = 'deflock';
    ctx.startGameplayPlugin?.('deflock', { source: 'live-gps-coexistence-test' });
  });
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.liveGps?.active === true && diagnostics?.gameplayPlugins?.activeId === 'deflock';
  }, null, { timeout: 15000 });
  await page.screenshot({ path: path.join(outputDir, 'gameplay-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => {
    const bounds = (id) => {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      gps: bounds('liveGpsHud'),
      main: bounds('hud'),
      minimap: bounds('minimap'),
      deflock: bounds('deFlockHud')
    };
  });
  assert(mobileLayout.gps && mobileLayout.gps.left >= 0 && mobileLayout.gps.right <= mobileLayout.viewport.width,
    `Live GPS HUD escaped the phone viewport: ${JSON.stringify(mobileLayout)}`);
  assert(mobileLayout.gps.width <= 190 && mobileLayout.gps.height <= 180,
    `Live GPS HUD blocks too much phone gameplay: ${JSON.stringify(mobileLayout)}`);
  const gpsOverlapsMinimap = mobileLayout.minimap && !(
    mobileLayout.gps.right <= mobileLayout.minimap.left || mobileLayout.gps.left >= mobileLayout.minimap.right ||
    mobileLayout.gps.bottom <= mobileLayout.minimap.top || mobileLayout.gps.top >= mobileLayout.minimap.bottom
  );
  assert.equal(gpsOverlapsMinimap, false, `Live GPS HUD overlaps the phone minimap: ${JSON.stringify(mobileLayout)}`);
  const gpsOverlapsDeFlock = mobileLayout.deflock && !(
    mobileLayout.gps.right <= mobileLayout.deflock.left || mobileLayout.gps.left >= mobileLayout.deflock.right ||
    mobileLayout.gps.bottom <= mobileLayout.deflock.top || mobileLayout.gps.top >= mobileLayout.deflock.bottom
  );
  assert.equal(gpsOverlapsDeFlock, false, `Live GPS HUD overlaps DeFlock on the phone: ${JSON.stringify(mobileLayout)}`);
  await page.screenshot({ path: path.join(outputDir, 'gameplay-phone.png') });

  await page.locator('#liveGpsStopBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.active !== true);
  const stopped = await readState();
  assert.equal(stopped.gps?.active, false, 'Stop did not end the GPS session');
  assert.equal(await page.locator('#liveGpsHud').evaluate((element) => element.classList.contains('show')), false,
    'Stop left the Live GPS HUD visible');
  assert.equal(await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().gameplayPlugins?.activeId), 'deflock',
    'Stopping GPS also stopped DeFlock');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.stopGameplayPlugin?.('live-gps-browser-cleanup', { resumeFree: false });
  });
  assert.deepEqual(fatalErrors, [], `Live GPS browser errors: ${fatalErrors.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    browser: 'Google Chrome',
    baseUrl,
    ready,
    gpsTravelWorldUnits: Number(gpsTravel.toFixed(3)),
    lowPower,
    mobileLayout,
    stopped,
    providerWarningCount: providerWarnings.length,
    screenshots: [
      path.join(outputDir, 'permission-desktop.png'),
      path.join(outputDir, 'gameplay-desktop.png'),
      path.join(outputDir, 'gameplay-phone.png')
    ]
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
