import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

const root = process.cwd();
const servedRoot = path.resolve(root, process.env.WE3D_VERIFY_ROOT || '.');
const server = await startStaticServer({ rootDir: servedRoot, ports: [4392, 4393, 4394, 4395] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const outputDir = path.join(root, 'output', 'verification', 'analytics-lifecycle');
const stagingConfig = JSON.parse(await fs.readFile(path.join(root, 'config', 'firebase.staging.json'), 'utf8'));
const safeConfig = Object.freeze({ ...stagingConfig, measurementId: 'G-WE3DLOCAL' });
let browser = null;
const allBrowserErrors = [];

async function createContext(options) {
  // These are independent cold-start consent cases, not a retained-world test.
  // Release the previous process as well as its context between cases.
  await browser?.close();
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--js-flags=--max-old-space-size=1024'] });
  const context = await browser.newContext(options);
  await configureStagingAppCheck(context, baseUrl);
  context.on('page', page => {
    page.verificationErrors = [];
    collectBrowserGraphicsErrors(page, page.verificationErrors);
    collectBrowserGraphicsErrors(page, allBrowserErrors);
    page.on('pageerror', error => { const message = String(error.stack || error); page.verificationErrors.push(message); allBrowserErrors.push(message); });
  });
  // Exercise the real SDK against an explicit local collection fixture. The
  // shipped project-config script otherwise replaces addInitScript overrides.
  await context.route('**/js/firebase-project-config.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.WORLD_EXPLORER_FIREBASE_ENV = 'staging'; window.WORLD_EXPLORER_FIREBASE = ${JSON.stringify(safeConfig)};`
  }));
  await context.route('https://firebase.googleapis.com/v1alpha/projects/-/apps/*/webConfig*', route => route.fulfill({
    json: { appId: safeConfig.appId, projectId: safeConfig.projectId, measurementId: safeConfig.measurementId }
  }));
  // A Firebase installation is not required to verify local event formation.
  await context.route('https://firebaseinstallations.googleapis.com/**', route => route.fulfill({ status: 503, json: { error: 'local analytics fixture' } }));
  // Page-level collectors below capture requests first; this also blocks any
  // collection formed before those handlers or after a page transition.
  await context.route(/https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|analytics\.google\.com|app-measurement\.com)\//i,
    route => route.fulfill({ status: 204, body: '' }));
  return context;
}

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

async function saveFailure(page, name, error) {
  const evidence = await page.evaluate(() => ({
    analytics: globalThis.getWorldExplorerAnalyticsSnapshot?.() || null,
    firebaseProjectId: globalThis.WORLD_EXPLORER_FIREBASE?.projectId || null,
    measurementId: globalThis.WORLD_EXPLORER_FIREBASE?.measurementId || null,
    url: location.href
  })).catch(() => null);
  await fs.writeFile(path.join(outputDir, `${name}-failure.json`), JSON.stringify({
    error: String(error?.stack || error), evidence, browserErrors: page.verificationErrors || []
  }, null, 2));
}

async function openStartHub(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 120_000 });
  await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
}

async function verifyGrantedDestination(destination) {
  const context = await createContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({config, origin}) => {
    // Playwright runs this in third-party/sandboxed frames too. Seed only our
    // owned page; a provider iframe is not an app storage-failure fixture.
    if (location.origin !== origin) return;
    globalThis.WORLD_EXPLORER_FIREBASE = config;
    localStorage.setItem('worldExplorer3D.analyticsConsent.v1', 'granted');
  }, {config: safeConfig, origin: new URL(baseUrl).origin});
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
      if (document.getElementById('loading')?.classList.contains('show')) return false;
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      if (runtime.gameStarted !== true || runtime.titleVisible === true) return false;
      if (expectedEnvironment === 'earth') return runtime.environment === 'EARTH';
      if (expectedEnvironment === 'moon') return runtime.environment === 'MOON';
      if (expectedEnvironment === 'mars') return runtime.environment === 'MARS';
      if (expectedEnvironment === 'space') return runtime.environment === 'SPACE_FLIGHT';
      return runtime.environment === 'OCEAN';
    }, destination.environment, { timeout: 240_000, polling: 500 });
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
    await page.screenshot({ path: path.join(outputDir, `${destination.id}-analytics-ready.png`), fullPage: false });
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
  } catch (error) {
    await saveFailure(page, destination.id, error);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyDefaultStoredFirstEntry() {
  const context = await createContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: devices['iPhone 13'].userAgent, hasTouch: true });
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
  } catch (error) {
    await saveFailure(page, 'default-entry', error);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyStorageBlockedConsent() {
  const context = await createContext({ viewport: { width: 900, height: 700 } });
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
const result = {
  ok: false, contract: 'default-standard-analytics-with-explicit-limited-mode',
  servedRoot, complete: requestedDestinations.size === 0,
  evidenceMode: 'real-sdk-local-collection-fixture', productionDeliveryVerified: false,
  measurementId: safeConfig.measurementId,
  storageBlocked: null, defaultStorage: null, destinations: []
};
try {
  result.storageBlocked = await verifyStorageBlockedConsent();
  result.defaultStorage = await verifyDefaultStoredFirstEntry();
  for (const destination of destinations) result.destinations.push(await verifyGrantedDestination(destination));
  result.browserErrors = allBrowserErrors;
  result.ok = allBrowserErrors.length === 0 && result.storageBlocked.ok && result.defaultStorage.ok && result.destinations.every((entry) => entry.ok);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
} catch (error) {
  result.error = String(error?.stack || error);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  throw error;
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
}
