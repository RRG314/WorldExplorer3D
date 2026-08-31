import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const publicRoot = path.resolve(root, process.env.WE3D_VERIFY_ROOT || root);
const server = await startStaticServer({ rootDir: publicRoot, ports: [4396, 4397, 4398] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const outputDir = path.join(root, 'output', 'verification', 'analytics-consent-mode');
const productionConfig = JSON.parse(await fs.readFile(path.join(root, 'config', 'firebase.production.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const collectionRequests = [];
const pageErrors = [];
const failedLocalResources = [];

await fs.mkdir(outputDir, { recursive: true });
await context.addInitScript((config) => {
  globalThis.WORLD_EXPLORER_FIREBASE = config;
}, productionConfig);

page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) failedLocalResources.push(request.url());
});
await page.route(/https:\/\/(?:www\.|region\d+\.)?(?:google-analytics\.com|analytics\.google\.com|app-measurement\.com)\/.*collect/i, async (route) => {
  const request = route.request();
  collectionRequests.push(`${request.url()}&${request.postData() || ''}`);
  await route.fulfill({ status: 204, body: '' });
});

async function analyticsSnapshot() {
  return page.evaluate(() => globalThis.getWorldExplorerAnalyticsSnapshot?.() || null);
}

async function analyticsCookies() {
  const cookies = await context.cookies(baseUrl);
  return cookies.filter((cookie) => /^_ga(?:_|$)|^_gid$/.test(cookie.name));
}

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 60_000 });
  const standaloneLink = page.locator('.footer-project-links a', { hasText: 'Run locally' });
  assert.equal(await standaloneLink.count(), 1, 'The landing page should expose one Run locally link in the Project footer group.');
  assert.equal(
    await standaloneLink.getAttribute('href'),
    'https://github.com/RRG314/WorldExplorer3D/blob/steven/local-standalone-5.1.0/docs/LOCAL_STANDALONE.md'
  );
  assert.equal(await standaloneLink.getAttribute('target'), '_blank');
  assert.equal(await page.locator('.hero a', { hasText: 'Run locally' }).count(), 0, 'Run locally should not compete with the main hero actions.');
  await standaloneLink.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, 'landing-footer-desktop.png'), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await standaloneLink.scrollIntoViewIfNeeded();
  const mobileLinkBox = await standaloneLink.boundingBox();
  assert.ok(mobileLinkBox, 'The mobile Run locally link should be rendered.');
  assert.ok(mobileLinkBox.x >= 0 && mobileLinkBox.x + mobileLinkBox.width <= 390, 'The mobile Run locally link should remain inside the viewport.');
  await page.screenshot({ path: path.join(outputDir, 'landing-footer-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });

  const banner = page.locator('#analyticsConsentBanner');
  assert.equal(await banner.isVisible(), true, 'The non-blocking analytics privacy choice should be visible on first visit.');
  assert.equal(await page.evaluate(() => localStorage.getItem('worldExplorer3D.analyticsConsent.v1')), null);
  await page.screenshot({ path: path.join(outputDir, 'analytics-choice-nonblocking.png'), fullPage: false });

  const startAccepted = await page.evaluate(() => {
    document.getElementById('globeSelectorSpaceBtn')?.click();
    return true;
  });
  assert.equal(startAccepted, true);
  await page.waitForFunction(() => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return runtime.gameStarted === true && runtime.titleVisible === false && runtime.environment === 'SPACE_FLIGHT';
  }, null, { timeout: 180_000 });

  await page.waitForFunction(() => {
    const analytics = globalThis.getWorldExplorerAnalyticsSnapshot?.();
    return analytics?.trackingStarted === true &&
      analytics?.ready === true &&
      analytics?.deliveryState === 'ready_cookieless' &&
      analytics?.worldSessionActive === true &&
      analytics?.currentEnvironment === 'space' &&
      analytics?.recentEvents?.includes('we3d_runtime_ready') &&
      analytics?.recentEvents?.includes('we3d_world_session_start');
  }, null, { timeout: 60_000 });

  const cookielessSnapshot = await analyticsSnapshot();
  assert.equal(cookielessSnapshot.consent, 'unset');
  assert.equal(cookielessSnapshot.deliveryState, 'ready_cookieless');
  assert.equal(cookielessSnapshot.currentUserId, '');
  assert.equal((await analyticsCookies()).length, 0, 'Analytics cookies must not be created before permission.');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const evidence = collectionRequests.join('\n');
    if (/we3d_runtime_ready/.test(evidence) && /we3d_world_session_start/.test(evidence)) break;
    await page.waitForTimeout(250);
  }
  assert.match(collectionRequests.join('\n'), /we3d_runtime_ready/);
  assert.match(collectionRequests.join('\n'), /we3d_world_session_start/);
  await page.screenshot({ path: path.join(outputDir, 'space-cookieless-measurement.png'), fullPage: false });

  await page.evaluate(async () => {
    const consent = await import('/js/analytics-consent.js?v=1');
    consent.writeAnalyticsConsent('granted');
    globalThis.dispatchEvent(new CustomEvent('we3d:product-telemetry', {
      detail: { name: 'leaderboard_view', params: { leaderboard: 'explorer' } }
    }));
  });
  await page.waitForFunction(() => {
    const analytics = globalThis.getWorldExplorerAnalyticsSnapshot?.();
    return analytics?.consent === 'granted' &&
      analytics?.deliveryState === 'ready_full' &&
      analytics?.recentEvents?.includes('leaderboard_view');
  }, null, { timeout: 30_000 });

  const fullSnapshot = await analyticsSnapshot();
  assert.equal(fullSnapshot.deliveryState, 'ready_full');
  assert.ok(fullSnapshot.eventLoggedCount > cookielessSnapshot.eventLoggedCount);
  for (let attempt = 0; attempt < 40 && !/leaderboard_view/.test(collectionRequests.join('\n')); attempt += 1) {
    await page.waitForTimeout(250);
  }
  assert.match(collectionRequests.join('\n'), /leaderboard_view/);
  assert.equal(pageErrors.length, 0, `Page errors:\n${pageErrors.join('\n')}`);
  assert.equal(failedLocalResources.length, 0, `Failed local resources:\n${failedLocalResources.join('\n')}`);

  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify({
    ok: true,
    firstEntryBlocked: false,
    cookieless: cookielessSnapshot,
    full: fullSnapshot,
    collectionRequestCount: collectionRequests.length,
    analyticsCookieCountBeforePermission: 0
  }, null, 2)}\n`);

  console.log('PASS first play does not wait for an analytics choice');
  console.log('PASS production landing page exposes the local-run guide in its Project footer on desktop and mobile');
  console.log('PASS unset consent produces cookieless Firebase Analytics events without analytics cookies');
  console.log('PASS granting analytics cookies upgrades the same session to full measurement');
  console.log('PASS direct Space entry starts the shared analytics authority');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
