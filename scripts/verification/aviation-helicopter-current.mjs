import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4527, 4528, 4529] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/aviation-helicopter-current';
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
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.aviation?.fleetCount >= 5;
  }, null, { timeout: 360_000 });

  const initial = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const helicopter = initial.aviation.vehicles.find(({ catalogId }) => catalogId === 'utility-helicopter');
  assert.ok(helicopter, 'The utility helicopter was not published.');
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), helicopter.id), true);
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.data?.aircraftId?.endsWith('utility-helicopter'));
  await page.keyboard.press('KeyE');
  await page.locator('dialog.airport-hub[open] .airport-hub__primary').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.identity?.catalogId === 'utility-helicopter');
  const start = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);

  await page.keyboard.down('Space');
  await page.waitForFunction((startY) => {
    const actor = globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor;
    return actor?.identity?.catalogId === 'utility-helicopter' && actor.contact?.grounded === false && actor.position.y > startY + 18;
  }, start.position.y, { timeout: 30_000 });
  await page.keyboard.up('Space');
  const hover = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(1600);
  await page.keyboard.up('ArrowDown');
  const translated = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.screenshot({ path: `${outputDir}/bwi-helicopter-flight.png`, fullPage: true });

  await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(() => {
    const actor = globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor;
    return actor?.identity?.catalogId === 'utility-helicopter' && actor.contact?.grounded === true;
  }, null, { timeout: 35_000 });
  await page.keyboard.up('ShiftLeft');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.data?.canExit === true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.walking === true);
  const landed = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const horizontalTravel = Math.hypot(
    Number(translated.position.x) - Number(hover.position.x),
    Number(translated.position.z) - Number(hover.position.z)
  );
  const parkedHelicopter = landed.aviation?.vehicles?.find(({ catalogId }) => catalogId === 'utility-helicopter');
  const checks = Object.freeze({
    enteredMappedFacilityHelicopter: start.identity?.catalogId === 'utility-helicopter',
    verticalTakeoff: hover.contact?.grounded === false && hover.position.y > start.position.y + 18,
    controllableForwardFlight: horizontalTravel > 3,
    manualLanding: translated.contact?.grounded === false && parkedHelicopter?.available === true,
    exitedToWalking: landed.modes?.walking === true,
    helicopterRemainsPlayable: parkedHelicopter?.condition > .05,
    noRuntimeErrors: (landed.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = {
    ok: Object.values(checks).every(Boolean), checks, horizontalTravel,
    start, hover, translated, parkedHelicopter, pageErrors, localFailures,
    screenshotPath: `${outputDir}/bwi-helicopter-flight.png`
  };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Helicopter takeoff, flight, landing, or exit journey failed.');
} finally {
  await page.keyboard.up('Space').catch(() => {});
  await page.keyboard.up('ShiftLeft').catch(() => {});
  await context.close();
  await browser.close();
  await server?.close();
}
