import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

try {
  await mkdir('output/verification/explorer-coherence', { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Featured Cities' }).click();
  await page.locator('#globeCityList').getByText('New York', { exact: true }).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true && diagnostics.worldLoading === false &&
      diagnostics.environment === 'EARTH' && diagnostics.worldDiscovery?.active === true &&
      Number(diagnostics.worldCounts?.roads || 0) > 0;
  }, null, { timeout: 360_000 });

  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open');
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show');
  const sectionGuide = page.locator('#discoverySectionTutorial:not([hidden])');
  if (await sectionGuide.isVisible().catch(() => false)) await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.locator('[data-discovery-tab="guide"]').click();
  if (await sectionGuide.isVisible().catch(() => false)) await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.waitForFunction(() => /REGIONAL LIFE LIST/.test(document.querySelector('#discoveryLifeList')?.textContent || ''));
  const guideCopy = await page.locator('.discoveryPane[data-discovery-pane="guide"]').textContent();
  assert.match(guideCopy || '', /0\s*\/\s*12/);
  assert.match(guideCopy || '', /New York area/i);
  assert.doesNotMatch(guideCopy || '', /Baltimore|pilot|Unknown .* Taxon|procedural encounter|pipeline/i);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.locator('#discoveryPanel').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(overflow, false);
  await page.screenshot({ path: 'output/verification/explorer-coherence/mobile-guide-new-york.png' });

  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'fresh-current-new-york-regional-guide',
    checks: {
      actualNewYorkWorld: true,
      regionalGuideTarget: /0\s*\/\s*12/.test(guideCopy || ''),
      correctRegionalScope: /New York area/i.test(guideCopy || ''),
      noBaltimoreLeak: !/Baltimore/i.test(guideCopy || ''),
      mobileNoHorizontalOverflow: !overflow,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    browserErrors,
    failedLocalResources
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
}
