import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4539, 4540, 4541] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/maritime-sandbox-current';
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
  const journey = Object.freeze({
    lat: Number(process.env.WE3D_MARITIME_LAT || 51.948),
    lon: Number(process.env.WE3D_MARITIME_LON || 4.14),
    name: String(process.env.WE3D_MARITIME_NAME || 'Port of Rotterdam')
  });
  const params = new URLSearchParams({
    loc: 'custom', lat: String(journey.lat), lon: String(journey.lon), lname: journey.name,
    launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  console.log('[maritime] shell loaded');
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  console.log(`[maritime] loading ${journey.name} world`);
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.maritime?.fleetCount > 0;
  }, null, { timeout: 360_000 });
  console.log(`[maritime] ${journey.name} world ready`);

  const initial = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const initialMaritime = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.());
  if (!Array.isArray(initialMaritime?.vessels)) {
    console.log(JSON.stringify({ diagnosticMaritime: initial.maritime, supportMaritime: initialMaritime }, null, 2));
  }
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().maritime?.underwayVesselCount > 0, null, { timeout: 20_000 });
  const trafficBefore = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().maritime);
  const movingVessel = trafficBefore.vessels.find((vessel) => vessel.traffic?.state === 'underway');
  assert.ok(movingVessel, 'No generated harbor vessel entered its bounded traffic route.');
  await page.evaluate((id) => globalThis.__WE3D_MARITIME_SUPPORT__?.moveNear(id), movingVessel.id);
  await page.waitForTimeout(1600);
  const trafficAfter = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().maritime);
  const movedVessel = trafficAfter.vessels.find((vessel) => vessel.id === movingVessel.id);
  const ambientTravel = Math.hypot(movedVessel.x - movingVessel.x, movedVessel.z - movingVessel.z);
  await page.screenshot({ path: `${outputDir}/rotterdam-harbor-traffic.png`, fullPage: true });
  console.log('[maritime] harbor traffic verified');

  const cargo = initialMaritime.vessels.find((vessel) => vessel.catalogId === 'container-cargo-ship');
  assert.ok(cargo, 'The mapped-port cargo ship was not published.');
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_MARITIME_SUPPORT__?.moveNear(id), cargo.id), true);
  await page.waitForFunction(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.().interaction?.action === 'enter_vessel');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.boat === true && diagnostics.activeActor?.identity?.catalogId === 'container-cargo-ship';
  }, null, { timeout: 30_000 });
  console.log('[maritime] cargo ship boarded');
  const entered = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const start = entered.activeActor;
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3500);
  const slowStart = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  const slowStartTravel = Math.hypot(
    Number(slowStart.position.x) - Number(start.position.x),
    Number(slowStart.position.z) - Number(start.position.z)
  );
  await page.evaluate(() => globalThis.advanceTime?.(18_000));
  const beforeTurn = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor);
  await page.keyboard.down('ArrowLeft');
  const rudderInput = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      keyHeld: ctx.keys?.ArrowLeft === true,
      steer: Number(ctx.readControlActions?.('boat')?.steer || 0),
      speed: Number(ctx.boat?.forwardSpeed || 0),
      turnRate: Number(ctx.boat?.turnRate || 0)
    };
  });
  await page.waitForTimeout(8000);
  const rudderResponse = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      steer: Number(ctx.readControlActions?.('boat')?.steer || 0),
      speed: Number(ctx.boat?.forwardSpeed || 0),
      turnRate: Number(ctx.boat?.turnRate || 0)
    };
  });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);
  const underway = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  console.log('[maritime] cargo handling measured');
  const travel = Math.hypot(
    Number(underway.activeActor.position.x) - Number(start.position.x),
    Number(underway.activeActor.position.z) - Number(start.position.z)
  );
  const cargoYawChange = Math.abs(Math.atan2(
    Math.sin(Number(underway.activeActor.orientation.yaw) - Number(beforeTurn.orientation.yaw)),
    Math.cos(Number(underway.activeActor.orientation.yaw) - Number(beforeTurn.orientation.yaw))
  ));
  const screenshotPath = `${outputDir}/rotterdam-cargo-underway.png`;
  const cameraFraming = underway.boatNavigation?.cameraFraming;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const dockedThroughBoatAuthority = await page.evaluate((id) => globalThis.__WE3D_MARITIME_SUPPORT__?.dock(id), cargo.id);
  await page.waitForFunction(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.().interaction?.action === 'exit_vessel');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.walking === true, null, { timeout: 30_000 });
  const exited = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const exitedMaritime = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.());
  const returnedCargo = exitedMaritime.vessels.find((vessel) => vessel.id === cargo.id);

  const checks = Object.freeze({
    sevenClassFleetPublished: initialMaritime.fleetCount === 7 && initialMaritime.playableCount === 7,
    mappedPortAnchors: initialMaritime.mappedAnchorCount > 0,
    generatedTruthBoundary: initialMaritime.generatedActivityCount === initialMaritime.fleetCount,
    boundedHarborTrafficMoved: trafficBefore.underwayVesselCount > 0 && ambientTravel > .2,
    enteredLargeShipThroughVisiblePrompt: entered.activeActor?.identity?.catalogId === 'container-cargo-ship',
    sharedBoatAuthorityActive: initialMaritime.authority === 'shared-transport-maritime-adapter' && entered.modes?.boat === true,
    classSpecificLargeShipBounds: entered.activeActor?.bounds?.radius >= 100 && entered.activeActor?.bounds?.height === 48,
    largeShipHasDisplacementInertia: slowStartTravel < 3,
    largeShipUnderway: travel > 5,
    largeShipTurnsGradually: rudderInput.keyHeld === true && rudderInput.steer > .9 &&
      cargoYawChange > .001 && cargoYawChange < .08 && Math.abs(rudderResponse.turnRate) < .025,
    shoreLayersAvailableForNavigation: underway.boatNavigation?.shoreVisible === true,
    channelCameraIsBounded: !['harbor', 'channel'].includes(underway.boatNavigation?.waterKind) || (
      Number(cameraFraming?.chaseDistance) > Number(cameraFraming?.classLength) * .5 + 4 &&
      Number(cameraFraming?.lookAhead) > Number(cameraFraming?.classLength) * .5 + 15
    ),
    exitedToWalkingAndVesselPersisted: dockedThroughBoatAuthority === true && exited.modes?.walking === true && returnedCargo?.available === true,
    noRuntimeErrors: (exited.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = {
    ok: Object.values(checks).every(Boolean),
    checks,
    travel,
    slowStartTravel,
    cargoYawChange,
    rudderInput,
    rudderResponse,
    dockedThroughBoatAuthority,
    ambientTravel,
    trafficBefore,
    trafficAfter,
    initialDiagnosticsMaritime: initial.maritime,
    initialMaritime,
    entered: { actor: entered.activeActor, boat: entered.boat, maritime: entered.maritime },
    underway: { actor: underway.activeActor, boat: underway.boat, maritime: underway.maritime },
    exited: { actor: exited.activeActor, boat: exited.boat, maritime: exitedMaritime },
    pageErrors,
    localFailures,
    screenshotPath,
    trafficScreenshotPath: `${outputDir}/rotterdam-harbor-traffic.png`
  };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Maritime boarding, large-ship control, or persistence journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
