import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4250').replace(/\/$/, '');
const outputDir = 'output/verification/airport-exclusion-current';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});
await page.route('https://nominatim.openstreetmap.org/search**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      place_id: 'downtown-baltimore-regression',
      osm_type: 'node',
      osm_id: 'downtown-baltimore-regression',
      lat: '39.2910',
      lon: '-76.6103',
      category: 'place',
      type: 'city',
      name: 'Downtown Baltimore',
      display_name: 'Downtown Baltimore, Maryland, United States',
      namedetails: { name: 'Downtown Baltimore' },
      address: { city: 'Baltimore', state: 'Maryland', country: 'United States', country_code: 'us' },
      extratags: {}
    }])
  });
});

try {
  await page.goto(`${baseUrl}/app/?diagnostics=1`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.locator('#globeLocationSearch').fill('Downtown Baltimore');
  await page.locator('#globeLocationSearchBtn').click();
  const result = page.locator('#globeLocationSearchResults [role="option"]').first();
  await result.waitFor({ state: 'visible', timeout: 30_000 });
  await result.click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics?.worldLoad?.status === 'ready';
  }, null, { timeout: 180_000 });
  const later = page.getByRole('button', { name: 'Later', exact: true }).first();
  if (await later.isVisible().catch(() => false)) await later.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outputDir}/downtown-baltimore.png`, fullPage: true });
  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const checks = {
    airportSourceNotRequested: diagnostics?.worldLoad?.airportGeometry?.status === 'not-requested',
    noAirportLayout: !diagnostics?.aviation?.airportLayoutAuthority,
    noFixedWingFleet: diagnostics?.aviation?.fleetCount === 0,
    noGeneratedRunway: diagnostics?.aviation?.generatedRunwayFallback === false,
    noRuntimeErrors: (diagnostics?.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: failedLocalResources.length === 0
  };
  const report = { ok: Object.values(checks).every(Boolean), checks, pageErrors, failedLocalResources };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Downtown Baltimore published airport-only infrastructure.');
} finally {
  await context.close();
  await browser.close();
}
