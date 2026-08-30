import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4250').replace(/\/$/, '');
const outputDir = 'output/verification/cross-platform-browser-current';
await fs.mkdir(outputDir, { recursive: true });

const engines = [
  { name: 'chromium', type: chromium },
  { name: 'firefox', type: firefox }
];
const reports = [];

for (const engine of engines) {
  const browser = await engine.type.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const pageErrors = [];
  const failedLocalResources = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failedLocalResources.push({ status: response.status(), url: response.url() });
    }
  });
  await page.route('**/nominatim.openstreetmap.org/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        place_id: 314159,
        lat: '39.1774',
        lon: '-76.6684',
        display_name: 'Baltimore/Washington International Airport, Maryland, United States',
        name: 'BWI Airport',
        type: 'aerodrome',
        class: 'aeroway',
        address: { city: 'Baltimore', state: 'Maryland', country: 'United States', country_code: 'us' },
        extratags: { iata: 'BWI' }
      }])
    });
  });

  try {
    const params = new URLSearchParams({
      loc: 'custom', lat: '39.1774', lon: '-76.6684', lname: 'BWI Airport',
      launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.waitForFunction(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return diagnostics?.gameStarted && !diagnostics.worldLoading &&
        diagnostics?.aviation?.airportLayoutAuthority === 'compiled-airport-operational-layout' &&
        diagnostics?.aviation?.fleetCount >= 7;
    }, null, { timeout: 360_000 });
    const later = page.getByRole('button', { name: 'Later', exact: true }).first();
    if (await later.isVisible().catch(() => false)) await later.click();

    const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
    const report = {
      engine: engine.name,
      gameStarted: diagnostics?.gameStarted === true,
      worldLoaded: diagnostics?.worldLoading === false,
      airportAuthority: diagnostics?.aviation?.airportLayoutAuthority,
      aircraft: diagnostics?.aviation?.fleetCount || 0,
      runtimeErrors: diagnostics?.runtimeErrors || [],
      pageErrors,
      failedLocalResources
    };
    report.ok = report.gameStarted && report.worldLoaded &&
      report.airportAuthority === 'compiled-airport-operational-layout' &&
      report.aircraft >= 7 && report.runtimeErrors.length === 0 &&
      report.pageErrors.length === 0 && report.failedLocalResources.length === 0;
    reports.push(report);
    await page.screenshot({ path: `${outputDir}/${engine.name}-bwi.png`, fullPage: true });
    assert.equal(report.ok, true, `${engine.name} gameplay smoke failed`);
  } finally {
    await context.close();
    await browser.close();
  }
}

const result = { ok: reports.every((report) => report.ok), reports };
await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
assert.equal(result.ok, true, 'Cross-browser gameplay verification failed.');
