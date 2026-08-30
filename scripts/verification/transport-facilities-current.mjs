import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4516, 4517, 4518] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const journeys = Object.freeze({
  bwi: Object.freeze({ id: 'bwi', name: 'BWI Airport', lat: 39.1774, lon: -76.6684, requiredDomain: 'aviation' }),
  rotterdam: Object.freeze({ id: 'rotterdam', name: 'Port of Rotterdam', lat: 51.948, lon: 4.14, requiredDomain: 'maritime' })
});
const selected = journeys[String(process.env.WE3D_TRANSPORT_FACILITY_JOURNEY || 'bwi')];
assert.ok(selected, 'Unknown transport facility journey.');
await fs.mkdir('output/verification/transport-facilities-current', { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const localFailures = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ status: response.status(), url: response.url() });
  }
});

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: String(selected.lat), lon: String(selected.lon),
    lname: selected.name, launch: 'earth', gm: 'free', mode: 'walking'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true && diagnostics.worldLoading === false &&
      diagnostics.livingWorld?.active === true && diagnostics.urbanSandbox?.active === true;
  }, null, { timeout: 360_000 });
  await page.waitForTimeout(2500);
  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const facilities = diagnostics.transportFacilities || {};
  const requiredCount = Number(facilities[selected.requiredDomain] || 0);
  const checks = Object.freeze({
    enteredThroughVisibleUi: diagnostics.gameStarted === true && diagnostics.titleVisible === false,
    worldwideCompilerActive: facilities.active === true && facilities.authority === 'compiled-mapped-transport-facilities',
    boundedProviderScope: facilities.bounded === true,
    mappedTruthBoundary: facilities.mappedOnly === true,
    requiredDomainPresent: requiredCount > 0,
    facilityGeometryAttached: facilities.visualAttached === true && Number(facilities.visualCount || 0) > 0,
    ordinaryGameplayReady: diagnostics.livingWorld?.active === true && diagnostics.urbanSandbox?.active === true,
    noRuntimeErrors: (diagnostics.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const screenshotPath = `output/verification/transport-facilities-current/${selected.id}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = {
    ok: Object.values(checks).every(Boolean),
    journey: selected,
    checks,
    facilities,
    worldLoadTransportFacilities: diagnostics.worldLoad?.transportFacilities || null,
    pageErrors,
    localFailures,
    screenshotPath
  };
  await fs.writeFile(`output/verification/transport-facilities-current/${selected.id}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, `Transport facility journey failed: ${selected.id}`);
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
