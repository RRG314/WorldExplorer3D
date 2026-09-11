import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/landing-user-count-current');
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
const failures = [];

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } }
]) {
  const context = await browser.newContext({ viewport: scenario.viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.route('**/getPublicSiteStats', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    body: JSON.stringify({ totalUsers: 1234, updatedAtMs: Date.now() })
  }));
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
    assert.equal(evidence.value, '1,234');
    assert.equal(evidence.label, 'explorers have joined');
    assert.match(evidence.ariaLabel || '', /1,234 registered explorers/);
    assert.ok(evidence.left >= 0 && evidence.right <= evidence.viewportWidth, JSON.stringify(evidence));
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: path.join(evidenceDir, `${scenario.name}.png`), fullPage: false });
    results.push({ ...scenario, evidence });
  } catch (error) {
    failures.push(`${scenario.name}: ${error.stack || error}`);
  } finally {
    await context.close();
  }
}

await browser.close();
const report = { ok: failures.length === 0, results, failures };
await writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
