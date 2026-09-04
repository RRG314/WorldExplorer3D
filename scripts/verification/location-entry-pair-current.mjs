import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({
  rootDir: process.cwd(),
  ports: [4511, 4512, 4513]
});
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = String(
  process.env.WE3D_VERIFY_OUTPUT_DIR || 'output/verification/location-entry-pair-current'
);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];

async function dismissAnalytics(page) {
  const deny = page.locator('#analyticsConsentDenyBtn');
  if (await deny.isVisible().catch(() => false)) await deny.click();
}

async function openSelector(page) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await dismissAnalytics(page);
}

async function inspectPair(page) {
  return page.evaluate(() => {
    const pair = document.querySelector('.globe-location-entry-pair');
    const current = document.getElementById('globeSelectorLocateBtn');
    const live = document.getElementById('globeSelectorLiveGpsBtn');
    const search = document.querySelector('.globe-selector-mobile-search');
    const box = (element) => element?.getBoundingClientRect();
    const pairBox = box(pair);
    const currentBox = box(current);
    const liveBox = box(live);
    const searchBox = box(search);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pair: pairBox && { x: pairBox.x, y: pairBox.y, width: pairBox.width, height: pairBox.height },
      current: currentBox && {
        x: currentBox.x, y: currentBox.y, width: currentBox.width, height: currentBox.height,
        label: current?.querySelector('[data-location-entry-label]')?.textContent?.trim(),
        helper: current?.querySelector('small')?.textContent?.trim()
      },
      live: liveBox && {
        x: liveBox.x, y: liveBox.y, width: liveBox.width, height: liveBox.height,
        label: live?.querySelector('[data-location-entry-label]')?.textContent?.trim(),
        helper: live?.querySelector('small')?.textContent?.trim()
      },
      searchTop: searchBox?.top ?? null,
      pairVisible: pair instanceof HTMLElement && pair.offsetParent !== null,
      currentVisible: current instanceof HTMLElement && current.offsetParent !== null,
      liveVisible: live instanceof HTMLElement && live.offsetParent !== null
    };
  });
}

function assertPair(snapshot, { mobile = false } = {}) {
  assert.equal(snapshot.pairVisible, true, 'location entry pair must be visible');
  assert.equal(snapshot.currentVisible, true, 'Current Location must be visible');
  assert.equal(snapshot.liveVisible, true, 'Live GPS must be visible');
  assert.equal(snapshot.current.label, 'Current Location');
  assert.equal(snapshot.current.helper, 'Explore here once');
  assert.equal(snapshot.live.label, 'Live GPS');
  assert.equal(snapshot.live.helper, 'Follow as I move');
  assert.ok(Math.abs(snapshot.current.y - snapshot.live.y) <= 2, 'both choices must share one row');
  assert.ok(Math.abs(snapshot.current.width - snapshot.live.width) <= 2, 'both choices must have equal widths');
  assert.ok(snapshot.current.width >= snapshot.pair.width * 0.4, 'Current Location must occupy about half the row');
  assert.ok(snapshot.current.width <= snapshot.pair.width * 0.55, 'Current Location must not dominate the row');
  assert.ok(snapshot.live.width >= snapshot.pair.width * 0.4, 'Live GPS must occupy about half the row');
  assert.ok(snapshot.live.width <= snapshot.pair.width * 0.55, 'Live GPS must not dominate the row');
  if (snapshot.searchTop !== null) {
    assert.ok(snapshot.pair.y < snapshot.searchTop, 'paired choices must appear above location search');
  }
  if (mobile) {
    assert.ok(snapshot.current.height >= 48, 'mobile Current Location target must be at least 48px high');
    assert.ok(snapshot.live.height >= 48, 'mobile Live GPS target must be at least 48px high');
  }
}

async function runViewport({ id, width, height, mobile = false, exerciseActions = false }) {
  const pageErrors = [];
  const failedLocalResources = [];
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    geolocation: { latitude: 39.2904, longitude: -76.6122, accuracy: 6 },
    permissions: ['geolocation']
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failedLocalResources.push({ url: response.url(), status: response.status() });
    }
  });
  try {
    await openSelector(page);
    const snapshot = await inspectPair(page);
    assertPair(snapshot, { mobile });
    await page.screenshot({ path: `${outputDir}/${id}.png`, fullPage: true });

    const actions = {};
    if (exerciseActions) {
      await page.locator('#globeSelectorLiveGpsBtn').click();
      await page.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 20_000 });
      actions.liveGpsConsentTitle = (await page.locator('#liveGpsPermissionTitle').textContent())?.trim();
      assert.match(actions.liveGpsConsentTitle || '', /Live GPS/i, 'Live GPS must open its consent flow');
      await page.locator('#liveGpsPermissionCancel').click();
      await page.waitForFunction(() => !document.getElementById('liveGpsPermissionPanel')?.classList.contains('show'), null, {
        timeout: 20_000
      });

      await page.locator('#globeSelectorLocateBtn').click();
      await page.waitForFunction(() => {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return diagnostics.gameStarted === true && diagnostics.worldLoading === false &&
          document.getElementById('loading')?.classList.contains('show') !== true &&
          Number(diagnostics.worldCounts?.roads || 0) > 0 &&
          Number(diagnostics.worldCounts?.buildings || 0) > 0;
      }, null, { timeout: 180_000 });
      actions.currentLocation = await page.evaluate(() => {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return {
          gameStarted: diagnostics.gameStarted === true,
          worldLoading: diagnostics.worldLoading === true,
          worldLoadStatus: diagnostics.worldLoad?.status || null,
          liveGpsActive: diagnostics.liveGps?.active === true,
          activeMode: diagnostics.activeActor?.mode || null,
          location: diagnostics.location || diagnostics.worldLocation || null
        };
      });
      assert.equal(actions.currentLocation.gameStarted, true);
      assert.equal(actions.currentLocation.worldLoading, false);
      assert.equal(actions.currentLocation.liveGpsActive, false, 'Current Location must not activate GPS-follow');
      assert.ok(actions.currentLocation.activeMode, 'Current Location must enter a playable traversal mode');
      await page.screenshot({ path: `${outputDir}/${id}-current-location-gameplay.png` });
    }

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(failedLocalResources, [], `failed local resources: ${JSON.stringify(failedLocalResources)}`);
    const result = { id, snapshot, actions, pageErrors, failedLocalResources, ok: true };
    results.push(result);
    return result;
  } finally {
    await context.close();
  }
}

try {
  await runViewport({ id: 'desktop', width: 1440, height: 900 });
  await runViewport({ id: 'mobile-390x844', width: 390, height: 844, mobile: true, exerciseActions: true });
  const report = { contract: 'location-entry-pair-current-v1', baseUrl, results, ok: true };
  await writeFile(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
