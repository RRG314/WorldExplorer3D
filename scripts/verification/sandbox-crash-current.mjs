import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'verification', 'sandbox-crash-current');
const server = await startStaticServer({ rootDir: root, ports: [4491, 4492, 4493] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const localFailures = [];

async function launchBaltimore(page) {
  const params = new URLSearchParams({
    loc: 'custom',
    lat: '39.2904',
    lon: '-76.6122',
    lname: 'Baltimore Inner Harbor',
    launch: 'earth',
    gm: 'free',
    mode: 'walk',
    diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.activeActor?.mode === 'walk' &&
      state.livingWorld?.active === true && state.urbanSandbox?.active === true &&
      Number(state.urbanSandbox?.vehicleCount || 0) >= 2 &&
      !!globalThis.__WE3D_URBAN_CRASH_SUPPORT__;
  }, null, { timeout: 360_000 });
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function supportSnapshot(page) {
  return page.evaluate(() => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.snapshot?.() || null);
}

async function advance(page, milliseconds) {
  await page.evaluate((duration) => globalThis.advanceTime?.(duration), milliseconds);
}

async function enterFirstVehicle(page) {
  const vehicleId = await page.evaluate(() => {
    const snapshot = globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.snapshot?.();
    return snapshot?.vehicles?.find((vehicle) => !vehicle.attachedToPlayer && !vehicle.occupied)?.id || '';
  });
  assert.ok(vehicleId, 'The loaded world did not provide an enterable vehicle.');
  const started = await page.evaluate((id) => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.enterVehicle?.(id), vehicleId);
  assert.equal(started, true, 'The real enter-vehicle transition did not start.');
  await advance(page, 800);
  await page.waitForFunction((id) => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.activeActor?.mode === 'drive' && state.urbanSandbox?.activeVehicleId === id;
  }, vehicleId, { timeout: 10_000 });
  return vehicleId;
}

async function runImpact(page, targetKind, speedMph, lateralOffset = 0) {
  const before = await supportSnapshot(page);
  const previousAt = Number(before?.lastCrashAction?.at || 0);
  const prepared = await page.evaluate(
    ({ kind, speed, offset }) => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.prepare?.(kind, speed, offset),
    { kind: targetKind, speed: speedMph, offset: lateralOffset }
  );
  assert.ok(prepared?.id, `Could not prepare a ${targetKind} collision using the active loaded actors.`);
  const preparedState = await supportSnapshot(page);
  for (let step = 0; step < 18; step += 1) {
    await advance(page, 50);
    const current = await supportSnapshot(page);
    if (Number(current?.lastCrashAction?.at || 0) > previousAt && current.lastCrashAction.targetId === prepared.id) {
      return { prepared, before, preparedState, after: current };
    }
  }
  assert.fail(`The normal drive simulation did not resolve the prepared ${targetKind} collision.`);
}

await mkdir(outputDir, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ status: response.status(), url: response.url() });
  }
});
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({ reason: request.failure()?.errorText || 'failed', url: request.url() });
  }
});

let report;
try {
  await launchBaltimore(page);
  const activeVehicleId = await enterFirstVehicle(page);

  const carCrash = await runImpact(page, 'vehicle', 30);
  const carTargetAfter = carCrash.after.vehicles.find((vehicle) => vehicle.id === carCrash.prepared.id);
  const playerAfterCar = carCrash.after.vehicles.find((vehicle) => vehicle.id === activeVehicleId);
  await page.screenshot({ path: path.join(outputDir, 'car-to-car.png') });

  await advance(page, 900);
  const personCrash = await runImpact(page, 'npc', 30);
  const personAfter = personCrash.after.interactiveNpcs.find((npc) => npc.id === personCrash.prepared.id);
  await page.screenshot({ path: path.join(outputDir, 'car-to-person.png') });

  await advance(page, 900);
  const lowBefore = await supportSnapshot(page);
  const lowTarget = await page.evaluate(() => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.prepare?.('vehicle', 2, 0));
  assert.ok(lowTarget?.id, 'Could not prepare the low-speed contact scenario.');
  const lowPrepared = await supportSnapshot(page);
  await advance(page, 600);
  const lowAfter = await supportSnapshot(page);
  const lowVehicleBefore = lowPrepared.vehicles.find((vehicle) => vehicle.id === lowTarget.id);
  const lowVehicleAfter = lowAfter.vehicles.find((vehicle) => vehicle.id === lowTarget.id);

  const checks = {
    realVehicleEntryPath: carCrash.after.activeVehicleId === activeVehicleId && carCrash.after.phase === 'driving',
    carCrashRecordedAtActualClosingSpeed:
      carCrash.after.lastCrashAction?.targetKind === 'vehicle' &&
      carCrash.after.lastCrashAction?.closingMph >= 27 &&
      carCrash.after.lastCrashAction?.closingMph <= 33,
    carReceivesTransferredMotion:
      Number(carTargetAfter?.crashMotion?.velocityMps || 0) > 0.5,
    playerNotReducedToOldFixedPenalty:
      Number(carCrash.after.playerVehicle?.speedMph || 0) > 30 * 0.18 + 1,
    bothVehiclesTakeConditionDamage:
      Number(carTargetAfter?.condition ?? 1) < 1 && Number(playerAfterCar?.condition ?? 1) < 1,
    personImpactUsesKnockdownState:
      personCrash.after.lastCrashAction?.targetKind === 'npc' &&
      personCrash.after.lastCrashAction?.secondary !== true &&
      !!personAfter && (personAfter.knockedDown === true || personAfter.reaction === 'downed') &&
      Number(personAfter.crashVelocityMps || 0) > 0.5,
    lowSpeedContactDoesNotCreateCrashDamage:
      Number(lowAfter.lastCrashAction?.at || 0) === Number(lowBefore.lastCrashAction?.at || 0) &&
      Number(lowVehicleAfter?.condition ?? 0) === Number(lowVehicleBefore?.condition ?? 1),
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };

  report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'sandbox-crash-current-normal-runtime-v1',
    checks,
    evidence: {
      activeVehicleId,
      carCrash: carCrash.after.lastCrashAction,
      playerAfterCar: carCrash.after.playerVehicle,
      targetAfterCar: carTargetAfter,
      personCrash: personCrash.after.lastCrashAction,
      personAfter,
      lowSpeedTargetCondition: { before: lowVehicleBefore?.condition, after: lowVehicleAfter?.condition }
    },
    browserErrors,
    localFailures
  };
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'The actual sandbox crash journey failed its current contract.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
