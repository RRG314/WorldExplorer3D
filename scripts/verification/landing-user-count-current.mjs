import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/landing-user-count-current');
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const stagingConfig = JSON.parse(await readFile('config/firebase.staging.json', 'utf8'));
const results = [];
const failures = [];

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'desktop-sdk-unavailable', blockSdk: true, viewport: { width: 1440, height: 900 } },
  { name: 'mobile-sdk-unavailable', blockSdk: true, viewport: { width: 390, height: 844 } },
  { name: 'count-route-fallback', failDirect: true, totalUsers: 1, viewport: { width: 390, height: 844 } }
]) {
  const context = await browser.newContext({ viewport: scenario.viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  const requests = [], requestFailures = [];
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  // Production artifacts retain their original bytes on disk. Explicitly use
  // staging in this browser fixture, just as the analytics lifecycle gate does.
  await context.route('**/js/firebase-project-config.js*', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging'; globalThis.WORLD_EXPLORER_FIREBASE = ${JSON.stringify({ ...stagingConfig, measurementId: '', appCheckSiteKey: '' })};`
  }));
  if (scenario.blockSdk) await context.route('https://www.gstatic.com/firebasejs/**', (route) => route.abort());
  await page.route('**/getPublicSiteStats', (route) => {
    requests.push(route.request().url());
    assert.ok(!route.request().url().includes('worldexplorer3d-d9b83'), 'No production API calls in this fixture');
    return route.fulfill({
      status: scenario.failDirect && new URL(route.request().url()).origin !== baseUrl ? 503 : 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
      body: JSON.stringify({ totalUsers: scenario.totalUsers ?? 1234, updatedAtMs: Date.now() })
    });
  });
  try {
    await page.goto(`${baseUrl}/?user-count=${scenario.name}-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const count = page.locator('#landingExplorerCount');
    await count.waitFor({ state: 'visible', timeout: 20_000 });
    const evidence = await count.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const value = element.querySelector('#landingExplorerCountValue')?.textContent?.trim() || '';
      const label = element.querySelector('.community-count-label')?.textContent?.trim() || '';
      return {
        value,
        label,
        ariaLabel: element.getAttribute('aria-label'),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    assert.equal(evidence.value, scenario.totalUsers === 1 ? '1' : '1,234');
    assert.equal(evidence.label, scenario.totalUsers === 1 ? 'explorer has joined' : 'explorers have joined');
    assert.equal(evidence.ariaLabel, scenario.totalUsers === 1 ? '1 registered explorer' : '1,234 registered explorers');
    assert.ok(evidence.left >= 0 && evidence.right <= evidence.viewportWidth, JSON.stringify(evidence));
    assert.deepEqual(pageErrors, []);
    if (scenario.failDirect) assert.equal(requests.length, 2, 'Failed direct endpoint falls back to hosting');
    if (scenario.blockSdk) {
      assert.ok(requestFailures.some(({ url }) => url.includes('/firebasejs/')), 'SDK outage was actually exercised');
      for (const selector of ['#landingSecondaryCta', '#donateSupporterBtn']) {
        await page.locator(selector).click();
        await page.waitForFunction(() => document.querySelector('#multiplayerStatus')?.textContent.includes('Sign-in could not load'), null, { timeout: 5000 });
        assert.equal(await page.locator(selector).isEnabled(), true, 'Failed sign-in releases the button');
        assert.equal(new URL(page.url()).pathname, '/', 'Failed sign-in does not navigate');
      }
      await count.scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: path.join(evidenceDir, `${scenario.name}.png`), fullPage: false });
    results.push({ ...scenario, evidence, requests, requestFailures });
  } catch (error) {
    failures.push({ scenario: scenario.name, error: String(error.stack || error), pageErrors, requests, requestFailures });
    await page.screenshot({ path: path.join(evidenceDir, `${scenario.name}-failure.png`) }).catch(() => {});
  } finally {
    await context.close();
  }
}

await browser.close();
const report = { ok: failures.length === 0, results, failures };
await writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
