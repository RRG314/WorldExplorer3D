import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4441, 4442, 4443] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = 'output/verification/explorer-play-shell';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];
const externalNetworkWarnings = [];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  const sourceUrl = String(message.location()?.url || '');
  const externalSource = (sourceUrl && !sourceUrl.startsWith(baseUrl)) || /https:\/\/[^\s]+/.test(text);
  if (externalSource) externalNetworkWarnings.push({ text, sourceUrl });
  else browserErrors.push(text);
});
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

await page.addInitScript(() => {
  localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({
    version: 4,
    enabled: true,
    completed: true,
    skipped: false,
    stage: 'complete',
    distanceMoved: 8,
    startedAtMs: Date.now() - 1000,
    completedAtMs: Date.now(),
    analyticsBegan: true,
    contextSeen: {}
  }));
});

function textState() {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

function layoutSnapshot() {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const overlaps = (left, right) => !!left && !!right && left.x < right.right && left.right > right.x && left.y < right.bottom && left.bottom > right.y;
    const hud = rect('#hudBox');
    const quick = rect('#worldQuickControls');
    const map = rect('#minimap');
    const journey = rect('#currentJourneyCard');
    const dock = rect('#floatMenuContainer');
    return {
      hud,
      quick,
      map,
      journey,
      dock,
      quickInsideHud: !!hud && !!quick && quick.x >= hud.x && quick.right <= hud.right && quick.y >= hud.y && quick.bottom <= hud.bottom,
      journeyClearsMap: !overlaps(journey, map),
      journeyClearsDock: !overlaps(journey, dock),
      dockLabels: [...document.querySelectorAll('.floatBtn')].map((button) => button.getAttribute('data-mobile-label') || button.textContent.trim()).filter(Boolean),
      quickTimeLabel: document.getElementById('quickTimeOfDay')?.getAttribute('aria-label') || '',
      quickWeatherLabel: document.getElementById('quickWeatherMode')?.getAttribute('aria-label') || ''
    };
  });
}

try {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.gameStarted === true && state.worldLoading === false && state.environment === 'EARTH' && state.worldDiscovery?.active === true;
  }, null, { timeout: 360_000 });
  await page.waitForSelector('#currentJourneyCard:not([hidden])', { timeout: 60_000 });
  await page.waitForSelector('#worldQuickControls:not([hidden])');

  const initialState = await textState();
  assert.equal(initialState.worldConditions?.skyMode, 'live');
  assert.equal(initialState.worldConditions?.weatherMode, 'live');

  await page.locator('#quickTimeOfDay').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').worldConditions?.skyMode === 'day');
  await page.locator('#quickWeatherMode').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').worldConditions?.weatherMode === 'clear');

  assert.match(await page.locator('#quickTimeOfDay').getAttribute('aria-label'), /Current: Day/i);
  assert.match(await page.locator('#quickWeatherMode').getAttribute('aria-label'), /Current: Clear/i);
  assert.equal(await page.locator('#quickTimeOfDay').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#quickWeatherMode').getAttribute('aria-pressed'), 'true');

  await page.locator('#travelBtn').click();
  await page.waitForSelector('#travelMenu.open');
  assert.match(await page.locator('#fTimeOfDay').textContent(), /Day/i);
  assert.match(await page.locator('#fWeatherMode').textContent(), /Clear/i);
  await page.locator('#travelBtn').click();

  const desktopLayout = await layoutSnapshot();
  assert.equal(desktopLayout.quickInsideHud, true, 'Quick world controls must remain inside the HUD.');
  assert.equal(desktopLayout.journeyClearsDock, true, 'Current Journey must clear the destination dock.');
  assert.ok(desktopLayout.dock?.width <= 622, `Desktop destination dock is still oversized: ${desktopLayout.dock?.width}`);
  assert.deepEqual(desktopLayout.dockLabels, ['Explore', 'Travel', 'Create', 'Community', 'My Explorer']);
  await page.screenshot({ path: `${evidenceDir}/01-desktop-play-shell.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobileLayout = await layoutSnapshot();
  assert.equal(mobileLayout.quickInsideHud, true, 'Mobile quick world controls must remain inside the HUD.');
  assert.equal(mobileLayout.journeyClearsMap, true, 'Current Journey must sit beside, not across, the mobile map.');
  assert.equal(mobileLayout.journeyClearsDock, true, 'Current Journey must clear the mobile destination dock.');
  assert.ok(mobileLayout.dock?.height <= 65, `Mobile destination dock is still oversized: ${mobileLayout.dock?.height}`);
  assert.ok(mobileLayout.journey?.right <= 390 && mobileLayout.journey?.x >= 0, 'Current Journey must remain in the mobile viewport.');

  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open');
  assert.equal(await page.locator('#exploreBtn').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#fWorldDiscovery').isVisible(), true);
  await page.locator('#exploreBtn').click();
  await page.screenshot({ path: `${evidenceDir}/02-mobile-play-shell.png`, fullPage: true });

  const finalState = await textState();
  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'focused-explorer-play-shell',
    checks: {
      existingTimeAuthorityChanged: finalState.worldConditions?.skyMode === 'day',
      existingWeatherAuthorityChanged: finalState.worldConditions?.weatherMode === 'clear',
      travelMenuReflectsQuickControls: true,
      desktopQuickControlsInsideHud: desktopLayout.quickInsideHud,
      desktopJourneyClearsDock: desktopLayout.journeyClearsDock,
      mobileQuickControlsInsideHud: mobileLayout.quickInsideHud,
      mobileJourneyClearsMap: mobileLayout.journeyClearsMap,
      mobileJourneyClearsDock: mobileLayout.journeyClearsDock,
      mobileExploreMenuStillWorks: true,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    desktopLayout,
    mobileLayout,
    finalState: {
      environment: finalState.environment,
      worldConditions: finalState.worldConditions,
      gameStarted: finalState.gameStarted,
      worldLoading: finalState.worldLoading
    },
    browserErrors,
    failedLocalResources,
    externalNetworkWarnings
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
