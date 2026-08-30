import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4521, 4522, 4523] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/aviation-sandbox-current';
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

  const initial = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const firstAircraft = initial.aviation.vehicles.find((vehicle) => vehicle.catalogId === 'expedition-prop');
  assert.ok(firstAircraft, 'The expedition aircraft was not published.');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.taxiingAircraftCount > 0, null, { timeout: 15_000 });
  const trafficBefore = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation);
  const movingAircraft = trafficBefore.vehicles.find((vehicle) => vehicle.traffic?.state === 'underway');
  assert.ok(movingAircraft, 'No aircraft entered the bounded airport taxi route.');
  await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), movingAircraft.id);
  await page.waitForTimeout(1500);
  const trafficAfter = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation);
  const movedAircraft = trafficAfter.vehicles.find((vehicle) => vehicle.id === movingAircraft.id);
  const taxiTravel = Math.hypot(movedAircraft.x - movingAircraft.x, movedAircraft.z - movingAircraft.z);
  await page.screenshot({ path: `${outputDir}/bwi-tarmac-traffic.png`, fullPage: true });

  const airliner = trafficAfter.vehicles.find((vehicle) => vehicle.catalogId === 'long-range-airliner');
  assert.ok(airliner, 'The large airliner was not published.');
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.dock(id), airliner.id), true);
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), airliner.id), true);
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.data?.aircraftId?.includes('long-range-airliner'));
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().flightDynamics?.catalogId === 'long-range-airliner');
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(3200);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('Space');
  const largeAircraftGroundResponse = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().flightDynamics);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ControlLeft');
  await page.waitForTimeout(4200);
  await page.keyboard.up('ControlLeft');
  await page.keyboard.up('ShiftLeft');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.data?.canExit === true, null, { timeout: 15_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.walking === true);

  const recoveryAircraft = initial.aviation.vehicles.find((vehicle) => vehicle.id !== firstAircraft.id);
  const aircraftRecovered = recoveryAircraft
    ? await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.ageDisabled(id), recoveryAircraft.id)
    : false;
  assert.equal(aircraftRecovered, true);
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), firstAircraft.id), true);
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.action === 'enter_aircraft');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.plane === true && diagnostics.activeActor?.identity?.catalogId === 'expedition-prop';
  });

  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    const plane = diagnostics?.activeActor;
    const interaction = diagnostics?.aviation?.interaction;
    return diagnostics?.modes?.plane === true && plane?.contact?.grounded === false &&
      interaction?.action === 'exit_aircraft' && interaction?.data?.canJump === true && interaction?.data?.autoEquip === true;
  }, null, { timeout: 30_000 });
  const aerodynamicRotation = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().flightDynamics);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const interaction = globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction;
    return interaction?.action === 'exit_aircraft' && interaction?.data?.canJump === true && interaction?.data?.autoEquip === true;
  });
  const beforeJump = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.screenshot({ path: `${outputDir}/bwi-flight.png`, fullPage: true });
  // Screenshot capture takes long enough for a fast aircraft to travel many
  // metres. Measure the handoff from the pose at the actual exit input, not
  // from the earlier frame used for visual evidence.
  const exitStart = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.walking === true && diagnostics.urbanSandbox?.parachute?.skydiving === true &&
      diagnostics.urbanSandbox?.equipment?.equippedId === 'parachute';
  });
  const freefall = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  await page.keyboard.press('Space');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.parachute?.deployed === true);
  const canopyStart = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const canopySteered = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.screenshot({ path: `${outputDir}/bwi-canopy.png`, fullPage: true });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.parachute?.skydiving === false, null, { timeout: 45_000 });
  const landed = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const horizontalCanopyTravel = Math.hypot(
    Number(canopySteered.position.x) - Number(canopyStart.position.x),
    Number(canopySteered.position.z) - Number(canopyStart.position.z)
  );
  const checks = Object.freeze({
    catalogPublished: initial.aviation.fleetCount === 5 && initial.aviation.playableCount === 5,
    mappedFacilityAnchors: initial.aviation.mappedAnchorCount > 0,
    disabledAircraftRecoveredAtFacility: aircraftRecovered === true,
    boundedTaxiTrafficMoved: trafficBefore.taxiingAircraftCount > 0 && taxiTravel > .25,
    largeAircraftRequiredGroundRoll: largeAircraftGroundResponse?.airborne === false && largeAircraftGroundResponse?.airspeed < 49,
    aerodynamicPathLagsNose: aerodynamicRotation?.angleOfAttack > .01 && aerodynamicRotation?.liftLoad > 1 &&
      aerodynamicRotation?.pitch > aerodynamicRotation?.flightPathAngle,
    enteredThroughVisiblePrompt: beforeJump?.identity?.catalogId === 'expedition-prop',
    manualTakeoffReachedSafeHeight: beforeJump?.contact?.grounded === false && beforeJump.position.y > 20,
    airbornePoseHandoff: Math.hypot(
      Number(freefall.activeActor?.position?.x) - Number(exitStart.position.x),
      Number(freefall.activeActor?.position?.z) - Number(exitStart.position.z)
    ) < 8,
    parachuteAutoEquipped: freefall.urbanSandbox?.equipment?.equippedId === 'parachute',
    unmannedAircraftContinued: freefall.aviation?.unmannedAircraftCount === 1,
    canopySteered: horizontalCanopyTravel > 1,
    landedBackInWalking: landed.modes?.walking === true && landed.urbanSandbox?.parachute?.skydiving === false,
    noRuntimeErrors: (landed.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = {
    ok: Object.values(checks).every(Boolean),
    checks,
    initialAviation: initial.aviation,
    trafficBefore,
    trafficAfter,
    taxiTravel,
    largeAircraftGroundResponse,
    aerodynamicRotation,
    aircraftRecovered,
    beforeJump,
    exitStart,
    freefall: { actor: freefall.activeActor, parachute: freefall.urbanSandbox?.parachute, aviation: freefall.aviation },
    canopyStart,
    canopySteered,
    horizontalCanopyTravel,
    landed: { actor: landed.activeActor, parachute: landed.urbanSandbox?.parachute, aviation: landed.aviation },
    pageErrors,
    localFailures,
    screenshotPaths: [`${outputDir}/bwi-tarmac-traffic.png`, `${outputDir}/bwi-flight.png`, `${outputDir}/bwi-canopy.png`]
  };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Aviation boarding, takeoff, skydiving, or landing journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
