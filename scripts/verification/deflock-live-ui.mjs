import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const verifyRoot = process.env.WE3D_VERIFY_ROOT || process.cwd();
const server = externalUrl ? null : await startStaticServer({ rootDir: verifyRoot, ports: [4421, 4422, 4423] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const pageErrors = [];

async function openDeFlock(context, screenshotName) {
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const consent = page.locator('#analyticsConsentDenyBtn');
  if (await consent.isVisible()) await consent.click();
  await page.locator('[data-globe-destination="live-earth"]').click();

  assert.equal(await page.locator('#globeHubOverlay:not([hidden])').count(), 0, 'Live Data must not cover its own globe.');
  assert.equal(await page.locator('.globe-selector-side > #globeSelectorLiveEarthPanel.active').count(), 1, 'Live Data controls must remain beside the globe.');
  const stage = await page.locator('.globe-selector-stage').boundingBox();
  assert.ok(stage && stage.width >= 300 && stage.height >= 200, 'The DeFlock globe must remain visible and navigable.');

  await page.getByRole('button', { name: 'DeFlock', exact: true }).click();
  await page.waitForFunction(() => /[1-9][\d,]+ mapped/.test(document.querySelector('.globe-selector-live-layer-status')?.textContent || ''), null, { timeout: 60_000 });
  const mappedCount = Number((await page.locator('.globe-selector-live-layer-status').textContent())?.replace(/\D/g, '') || 0);
  assert.ok(mappedCount > 100_000, 'The complete DeFlock point index must be loaded.');

  const nearest = page.getByRole('button', { name: /Select Nearest Camera/ });
  assert.equal(await nearest.isEnabled(), true, 'The selected location must offer an accessible camera choice.');
  await nearest.click();
  await page.waitForFunction(() => {
    const details = document.querySelector('.deflock-live-detail')?.textContent || '';
    const button = [...document.querySelectorAll('[data-live-earth-action="travel-deflock"]')][0];
    const detailResolved = /osm:(?:node|way):\d+|Exact camera direction and metadata are temporarily unavailable/i.test(details);
    return detailResolved && button instanceof HTMLButtonElement && button.disabled === false;
  }, null, { timeout: 90_000 });

  const start = page.getByRole('button', { name: 'Start DeFlock Here' });
  const focus = page.getByRole('button', { name: 'Focus Camera' });
  assert.equal(await start.isEnabled(), true);
  assert.equal(await focus.isEnabled(), true);
  await focus.click();
  const coverage = page.getByRole('button', { name: 'Show View Coverage' });
  let coverageToggle = 'not-mapped';
  if (await coverage.count()) {
    await coverage.click();
    await page.waitForSelector('[data-live-earth-action="toggle-deflock-coverage"]', { state: 'visible' });
    coverageToggle = (await page.getByRole('button', { name: 'Hide View Coverage' }).count()) ? 'working' : 'failed';
    assert.equal(coverageToggle, 'working');
  }
  await page.screenshot({ path: `output/verification/deflock-live-ui/${screenshotName}`, fullPage: true });
  return { mappedCount, stage, coverageToggle, selectedText: (await page.locator('.deflock-live-detail').textContent())?.replace(/\s+/g, ' ').trim() || '' };
}

try {
  await mkdir('output/verification/deflock-live-ui', { recursive: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await openDeFlock(desktop, 'desktop-camera-selected.png');
  await desktop.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobileResult = await openDeFlock(mobile, 'mobile-camera-selected.png');
  await mobile.close();
  const report = {
    ok: pageErrors.length === 0,
    contract: 'deflock-live-globe-and-actions-v2',
    desktop: desktopResult,
    mobile: mobileResult,
    pageErrors
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await browser.close();
  await server?.close();
}
