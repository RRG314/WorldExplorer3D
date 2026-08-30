import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4530, 4531, 4532] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/aviation-fleet-visual-current';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const localFailures = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ status: response.status(), url: response.url() });
});

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.1774', lon: '-76.6684', lname: 'BWI Airport',
    launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.aviation?.fleetCount === 5;
  }, null, { timeout: 360_000 });
  const later = page.getByRole('button', { name: 'Later', exact: true }).first();
  if (await later.isVisible().catch(() => false)) await later.click();

  const catalogIds = ['expedition-prop', 'business-jet', 'regional-jet', 'long-range-airliner', 'utility-helicopter'];
  const captures = [];
  for (const catalogId of catalogIds) {
    const fleet = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.vehicles || []);
    const aircraft = fleet.find((vehicle) => vehicle.catalogId === catalogId);
    assert.ok(aircraft, `${catalogId} was not available for the fleet visual audit.`);
    assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), aircraft.id), true);
    await page.waitForFunction((id) => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.data?.aircraftId === id, aircraft.id);
    await page.keyboard.press('KeyE');
    await page.waitForFunction((id) => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.identity?.catalogId === id, catalogId);
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(420);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(80);
    const path = `${outputDir}/${catalogId}.png`;
    await page.screenshot({ path, fullPage: true });
    const actor = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
    captures.push({ catalogId, path, actor });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.walking === true);
  }
  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const checks = Object.freeze({
    allFiveEnteredAndCaptured: captures.length === 5 && captures.every(({ actor, catalogId }) => actor?.identity?.catalogId === catalogId),
    allReturnedToFleet: diagnostics.aviation?.vehicles?.filter(({ available }) => available).length === 5,
    noRuntimeErrors: (diagnostics.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = { ok: Object.values(checks).every(Boolean), checks, captures, pageErrors, localFailures };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Aircraft fleet visual journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
