import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const server = await startStaticServer({ rootDir: root, ports: [4392, 4393, 4394, 4395] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const outputDir = path.join(root, 'output', 'verification', 'analytics-lifecycle');
const productionConfig = JSON.parse(await fs.readFile(path.join(root, 'config', 'firebase.production.json'), 'utf8'));
const safeConfig = Object.freeze({ ...productionConfig });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

const allDestinations = Object.freeze([
  Object.freeze({ id: 'earth', selector: '#globeSelectorStartBtn', environment: 'earth' }),
  Object.freeze({ id: 'moon', selector: '#globeSelectorMoonBtn', environment: 'moon' }),
  Object.freeze({ id: 'mars', selector: '#globeSelectorMarsBtn', environment: 'mars' }),
  Object.freeze({ id: 'space', selector: '#globeSelectorSpaceBtn', environment: 'space' }),
  Object.freeze({ id: 'ocean', selector: '#globeSelectorOceanBtn', environment: 'ocean' })
]);
const requestedDestinations = new Set(String(process.env.WE3D_ANALYTICS_DESTINATIONS || '').split(',').map((value) => value.trim()).filter(Boolean));
const destinations = requestedDestinations.size > 0
  ? allDestinations.filter((destination) => requestedDestinations.has(destination.id))
  : allDestinations;

async function analyticsSnapshot(page) {
  return page.evaluate(() => globalThis.getWorldExplorerAnalyticsSnapshot?.() || null);
}

async function openStartHub(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 120_000 });
  await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
}

async function verifyGrantedDestination(destination) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((config) => {
    globalThis.WORLD_EXPLORER_FIREBASE = config;
    localStorage.setItem('worldExplorer3D.analyticsConsent.v1', 'granted');
  }, safeConfig);
  const page = await context.newPage();
  const browserErrors = [];
  const failedLocalResources = [];
  const collectionRequests = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failedLocalResources.push(request.url());
  });
  await page.route(/https:\/\/(?:www\.|region\d+\.)?(?:google-analytics\.com|analytics\.google\.com|app-measurement\.com)\/.*collect/i, async (route) => {
    const request = route.request();
    collectionRequests.push(`${request.url()}&${request.postData() || ''}`);
    await route.fulfill({ status: 204, body: '' });
  });

  try {
    await openStartHub(page);
    const banner = page.locator('#analyticsConsentBanner');
    assert.equal(await banner.isVisible(), false, `${destination.id}: stored analytics preference must not interrupt entry`);

    await page.locator(destination.selector).click();
    await page.waitForFunction((expectedEnvironment) => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      if (runtime.gameStarted !== true || runtime.titleVisible === true) return false;
      if (expectedEnvironment === 'earth') return runtime.environment === 'EARTH';
      if (expectedEnvironment === 'moon') return runtime.environment === 'MOON';
      if (expectedEnvironment === 'mars') return runtime.environment === 'MARS';
      if (expectedEnvironment === 'space') return runtime.environment === 'SPACE_FLIGHT';
      return runtime.environment === 'OCEAN';
    }, destination.environment, { timeout: 240_000 });
    try {
      await page.waitForFunction((expectedEnvironment) => {
        const analytics = globalThis.getWorldExplorerAnalyticsSnapshot?.();
        return analytics?.trackingStarted === true &&
          analytics?.ready === true &&
          analytics?.worldSessionActive === true &&
          analytics?.currentEnvironment === expectedEnvironment &&
          analytics?.recentEvents?.includes('we3d_runtime_ready') &&
          analytics?.recentEvents?.includes('we3d_world_session_start');
      }, destination.environment, { timeout: destination.id === 'earth' ? 240_000 : 45_000 });
    } catch (error) {
      const evidence = await page.evaluate(() => ({
        analytics: globalThis.getWorldExplorerAnalyticsSnapshot?.() || null,
        runtime: globalThis.getWorldExplorerRuntimeDiagnostics?.() || null,
        consent: localStorage.getItem('worldExplorer3D.analyticsConsent.v1'),
        url: location.href
      }));
      throw new Error(`${destination.id} analytics did not become ready: ${JSON.stringify(evidence)}; ${error.message}`);
    }

    const snapshot = await analyticsSnapshot(page);
    const consentEvidence = await page.evaluate(() => ({
      stored: localStorage.getItem('worldExplorer3D.analyticsConsent.v1'),
      memory: globalThis.__WE3D_ANALYTICS_CONSENT__ || null
    }));
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const evidence = collectionRequests.join('\n');
      if (/we3d_runtime_ready/.test(evidence) && /we3d_world_session_start/.test(evidence)) break;
      await page.waitForTimeout(250);
    }
    const collectionEvidence = collectionRequests.join('\n');
    await page.screenshot({ path: path.join(outputDir, `${destination.id}-analytics-ready.png`), fullPage: true });
    assert.equal(snapshot.consent, 'granted', `${destination.id}: ${JSON.stringify({ consentEvidence, snapshot })}`);
    assert.equal(snapshot.deliveryState, 'ready_explicit');
    assert.equal(snapshot.worldSessionCount, 1);
    assert.equal(snapshot.errors.length, 0);
    assert.match(collectionEvidence, /we3d_runtime_ready/, `${destination.id}: runtime-ready collection request was not formed`);
    assert.match(collectionEvidence, /we3d_world_session_start/, `${destination.id}: session-start collection request was not formed`);
    assert.equal(browserErrors.length, 0, `${destination.id}: browser errors`);
    assert.equal(failedLocalResources.length, 0, `${destination.id}: failed local resources`);
    return {
      id: destination.id,
      ok: true,
      currentEnvironment: snapshot.currentEnvironment,
      deliveryState: snapshot.deliveryState,
      recentEvents: snapshot.recentEvents,
      eventLoggedCount: snapshot.eventLoggedCount,
      collectionRequestCount: collectionRequests.length
    };
  } finally {
    await context.close();
  }
}

async function verifyDefaultStoredFirstEntry() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript((config) => {
    globalThis.WORLD_EXPLORER_FIREBASE = config;
  }, safeConfig);
  const page = await context.newPage();
  const collectionRequests = [];
  await page.route(/https:\/\/(?:www\.|region\d+\.)?(?:google-analytics\.com|analytics\.google\.com|app-measurement\.com)\/.*collect/i, async (route) => {
    const request = route.request();
    collectionRequests.push(`${request.url()}&${request.postData() || ''}`);
    await route.fulfill({ status: 204, body: '' });
  });
  try {
    await openStartHub(page);
    const initial = await page.evaluate(() => ({
      consent: localStorage.getItem('worldExplorer3D.analyticsConsent.v1'),
      gameStarted: globalThis.getWorldExplorerRuntimeDiagnostics?.().gameStarted === true,
      bannerVisible: !document.getElementById('analyticsConsentBanner')?.hidden,
      focusedControl: document.activeElement?.id || ''
    }));
    assert.equal(initial.consent, null, 'First entry must begin with analytics storage unset');
    assert.equal(initial.gameStarted, false);
    assert.equal(initial.bannerVisible, false, 'Analytics preference must not interrupt first entry');
    await page.locator('#globeSelectorSpaceBtn').click();
    await page.waitForFunction(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return runtime.gameStarted === true && runtime.environment === 'SPACE_FLIGHT';
    }, null, { timeout: 180_000 });
    await page.waitForFunction(() => {
      const analytics = globalThis.getWorldExplorerAnalyticsSnapshot?.();
      return analytics?.trackingStarted === true && analytics?.ready === true &&
        analytics?.worldSessionActive === true && analytics?.recentEvents?.includes('we3d_runtime_ready') &&
        analytics?.recentEvents?.includes('we3d_world_session_start');
    }, null, { timeout: 30_000 });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const evidence = collectionRequests.join('\n');
      if (/we3d_runtime_ready/.test(evidence) && /we3d_world_session_start/.test(evidence)) break;
      await page.waitForTimeout(250);
    }
    const snapshot = await analyticsSnapshot(page);
    assert.equal(snapshot.consent, 'unset');
    assert.equal(snapshot.deliveryState, 'ready_default');
    assert.equal(snapshot.worldSessionActive, true);
    assert.ok(snapshot.eventLoggedCount >= 2);
    assert.match(collectionRequests.join('\n'), /we3d_runtime_ready/);
    assert.match(collectionRequests.join('\n'), /we3d_world_session_start/);
    assert.match(collectionRequests.join('\n'), /[?&](?:gcs|gcd)=/);
    const defaultAnalyticsCookies = (await context.cookies(baseUrl)).filter((cookie) => /^_ga(?:_|$)/.test(cookie.name));
    assert.ok(defaultAnalyticsCookies.length > 0, 'Default analytics must create a stable first-party analytics identifier');

    await page.evaluate(async () => {
      const consent = await import('/js/analytics-consent.js?v=3');
      consent.writeAnalyticsConsent('denied');
    });
    await page.waitForFunction(() => globalThis.getWorldExplorerAnalyticsSnapshot?.().deliveryState === 'cookieless_denied');
    const deniedSnapshot = await analyticsSnapshot(page);
    assert.equal(deniedSnapshot.worldSessionCount, 1, 'Denying storage must not restart the active play session');
    const deniedAnalyticsCookies = (await context.cookies(baseUrl)).filter((cookie) => /^_ga(?:_|$)/.test(cookie.name));
    assert.equal(deniedAnalyticsCookies.length, 0, 'Limited analytics must remove first-party analytics cookies');

    await page.evaluate(async () => {
      const consent = await import('/js/analytics-consent.js?v=3');
      consent.writeAnalyticsConsent('granted');
    });
    await page.waitForFunction(() => {
      const analytics = globalThis.getWorldExplorerAnalyticsSnapshot?.();
      return analytics?.consent === 'granted' &&
        analytics?.worldSessionActive === true &&
        analytics?.worldSessionCount === 1 && analytics?.deliveryState === 'ready_explicit';
    }, null, { timeout: 30_000 });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const evidence = collectionRequests.join('\n');
      if (/we3d_runtime_ready/.test(evidence) && /we3d_world_session_start/.test(evidence)) break;
      await page.waitForTimeout(250);
    }
    const grantedSnapshot = await analyticsSnapshot(page);
    assert.match(collectionRequests.join('\n'), /we3d_runtime_ready/);
    assert.match(collectionRequests.join('\n'), /we3d_world_session_start/);
    assert.equal(grantedSnapshot.worldSessionCount, 1, 'Granting after entry must start exactly one current session');
    return {
      ok: true,
      initial,
      defaultDeliveryState: snapshot.deliveryState,
      defaultEventLoggedCount: snapshot.eventLoggedCount,
      defaultAnalyticsCookieCount: defaultAnalyticsCookies.length,
      deniedDeliveryState: deniedSnapshot.deliveryState,
      deniedAnalyticsCookieCount: deniedAnalyticsCookies.length,
      grantedDeliveryState: grantedSnapshot.deliveryState,
      grantedSessionCount: grantedSnapshot.worldSessionCount
    };
  } finally {
    await context.close();
  }
}

async function verifyStorageBlockedConsent() {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await context.addInitScript((config) => {
    globalThis.WORLD_EXPLORER_FIREBASE = config;
    const key = 'worldExplorer3D.analyticsConsent.v1';
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function getItem(name) {
      if (name === key) throw new DOMException('Storage blocked for verification', 'SecurityError');
      return originalGetItem.call(this, name);
    };
    Storage.prototype.setItem = function setItem(name, value) {
      if (name === key) throw new DOMException('Storage blocked for verification', 'SecurityError');
      return originalSetItem.call(this, name, value);
    };
  }, safeConfig);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.evaluate(() => globalThis.dispatchEvent(new CustomEvent('we3d:analytics-consent-request')));
    await page.waitForSelector('#analyticsConsentAllowBtn', { state: 'visible', timeout: 30_000 });
    await page.locator('#analyticsConsentAllowBtn').click();
    const evidence = await page.evaluate(async () => {
      const consent = await import('/js/analytics-consent.js?v=3');
      return {
        readValue: consent.readAnalyticsConsent(),
        memoryValue: globalThis.__WE3D_ANALYTICS_CONSENT__ || null
      };
    });
    assert.equal(evidence.readValue, 'granted');
    assert.equal(evidence.memoryValue, 'granted');
    return { ok: true, ...evidence };
  } finally {
    await context.close();
  }
}

await fs.mkdir(outputDir, { recursive: true });
const result = { ok: false, contract: 'default-standard-analytics-with-explicit-limited-mode', storageBlocked: null, defaultStorage: null, destinations: [] };
try {
  result.storageBlocked = await verifyStorageBlockedConsent();
  result.defaultStorage = await verifyDefaultStoredFirstEntry();
  for (const destination of destinations) result.destinations.push(await verifyGrantedDestination(destination));
  result.ok = result.storageBlocked.ok && result.defaultStorage.ok && result.destinations.every((entry) => entry.ok);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
