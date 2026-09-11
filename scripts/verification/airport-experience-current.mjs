import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4250').replace(/\/$/, '');
const outputDir = 'output/verification/airport-experience-current';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) failedLocalResources.push({ status: response.status(), url: response.url() });
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
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.aviation?.fleetCount >= 14 &&
      diagnostics.aviation?.airportLayoutAuthority === 'compiled-airport-operational-layout';
  }, null, { timeout: 360_000 });
  const later = page.getByRole('button', { name: 'Later', exact: true }).first();
  if (await later.isVisible().catch(() => false)) await later.click();

  const initial = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const taxiing = initial.aviation.vehicles.find((vehicle) => vehicle.boardable && (vehicle.traffic?.state === 'underway' || vehicle.flightTrafficState === 'taxiing')) ||
    initial.aviation.vehicles.find((vehicle) => vehicle.boardable);
  assert.ok(taxiing, 'No boardable aircraft was published.');
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), taxiing.id), true);
  await page.waitForFunction((id) => {
    const interaction = globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction;
    return interaction?.action === 'aircraft_options' && interaction?.data?.aircraftId === id;
  }, taxiing.id, { timeout: 20_000 });
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.openHub('aircraft', id), taxiing.id), true);
  await page.waitForSelector('.airport-hub[open]', { timeout: 10_000 });
  await page.screenshot({ path: `${outputDir}/airport-hub-desktop.png`, fullPage: true });
  const hubText = await page.locator('.airport-hub').innerText();
  assert.match(hubText, /Where do you want to fly\?/);
  assert.match(hubText, /Pilot/);
  assert.match(hubText, /Passenger/);
  assert.match(hubText, /Fly locally/);
  await page.getByRole('button', { name: 'Fly locally', exact: true }).click();
  await page.waitForFunction((catalogId) => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.plane === true && diagnostics.activeActor?.identity?.catalogId === catalogId;
  }, taxiing.catalogId, { timeout: 20_000 });
  const boarded = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  assert.equal(boarded.aviation.activeAircraftId, taxiing.id);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.walking === true, null, { timeout: 20_000 });

  assert.equal(await page.evaluate(() => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNearTicket()), true);
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.action === 'airport_hub', null, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => globalThis.__WE3D_AVIATION_SUPPORT__?.openHub('ticket_hall')), true);
  await page.waitForSelector('.airport-hub[open]', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Passenger', exact: true }).click();
  await page.locator('#airportDestinationSearch').fill('BWI Airport');
  await page.locator('.airport-hub__search button').click();
  await page.waitForSelector('.airport-hub__result', { timeout: 10_000 });
  await page.locator('.airport-hub__result').first().click();
  await page.screenshot({ path: `${outputDir}/airport-destination-selected.png`, fullPage: true });
  await page.locator('.airport-hub__travel').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.plane === true && diagnostics.flightDynamics?.passengerMode === true && !diagnostics.worldLoading;
  }, null, { timeout: 30_000 });
  const passenger = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outputDir}/passenger-tour.png`, fullPage: true });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.walking === true && diagnostics.urbanSandbox?.parachute?.skydiving === true;
  }, null, { timeout: 20_000 });
  const freefall = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  await page.keyboard.press('Space');
  await page.waitForTimeout(750);
  const deployment = await page.evaluate(() => ({
    diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.(),
    equipped: globalThis.__WE3D_APP_CONTEXT__?.playerBackpackInventory?.equipped?.() || null
  }));
  await fs.writeFile(`${outputDir}/parachute-deployment-debug.json`, JSON.stringify({ freefall, deployment }, null, 2));
  assert.equal(deployment.diagnostics?.urbanSandbox?.parachute?.phase, 'canopy', 'Space did not leave the parachute in its canopy phase.');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowLeft');
  const canopy = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  await page.screenshot({ path: `${outputDir}/canopy-bank.png`, fullPage: true });

  const checks = Object.freeze({
    denseFleet: initial.aviation.fleetCount >= 14 && initial.aviation.parkedAircraftCount > initial.aviation.fleetCount / 2,
    ambientTakeoffLandingCircuit: initial.aviation.vehicles.some((vehicle) => vehicle.flightTrafficState),
    realAircraftColliders: initial.aviation.vehicles.every((vehicle) => vehicle.collisionColliderCount >= 1),
    taxiingOrParkedAircraftBoarded: boarded.activeActor?.identity?.catalogId === taxiing.catalogId,
    singleAirportHubFlow: /game journeys, not real airline schedules/i.test(hubText),
    passengerTourStarted: passenger.flightDynamics?.passengerMode === true,
    jumpEnteredFreefall: freefall.urbanSandbox?.parachute?.phase === 'freefall',
    canopyBanked: canopy.urbanSandbox?.parachute?.phase === 'canopy' && Math.abs(canopy.urbanSandbox.parachute.bank) > .05,
    noRuntimeErrors: (canopy.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: failedLocalResources.length === 0
  });
  const report = { ok: Object.values(checks).every(Boolean), checks, initial: initial.aviation, boarded: boarded.aviation, passenger: passenger.flightDynamics, freefall: freefall.urbanSandbox?.parachute, canopy: canopy.urbanSandbox?.parachute, pageErrors, failedLocalResources };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Airport gameplay journey failed.');
} finally {
  await context.close();
  await browser.close();
}
