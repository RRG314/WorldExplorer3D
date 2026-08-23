import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({
  rootDir: process.cwd(),
  ports: [4370, 4371, 4372]
});
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  geolocation: { latitude: 39.2904, longitude: -76.6122, accuracy: 6 },
  permissions: ['geolocation']
});
await context.grantPermissions(['geolocation'], { origin });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ url: response.url(), status: response.status() });
  }
});

const snapshot = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
const distance2d = (left, right) => Math.hypot(
  Number(right?.x || 0) - Number(left?.x || 0),
  Number(right?.z || 0) - Number(left?.z || 0)
);

try {
  const url = `${baseUrl}/app/`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const liveGpsEntry = page.locator('#globeSelectorLiveGpsBtn');
  await liveGpsEntry.waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await liveGpsEntry.isEnabled(), true, 'Live GPS entry must be enabled in the mobile start hub.');
  await liveGpsEntry.click();
  await page.waitForSelector('#liveGpsPermissionPanel.show', { timeout: 30_000 });
  await page.locator('#liveGpsPermissionContinue').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.worldLoading === false && diagnostics.liveGps?.active === true &&
      diagnostics.activeActor?.mode === 'walk';
  }, null, { timeout: 240_000 });
  await page.waitForTimeout(1_200);

  const initial = await snapshot();
  await page.mouse.move(1040, 460);
  await page.mouse.down();
  await page.mouse.move(1210, 460, { steps: 8 });
  await page.mouse.up();

  await page.waitForTimeout(2_200);
  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: 39.290445,
    longitude: -76.6122,
    accuracy: 6,
    speed: 1.4,
    heading: 0
  });
  await page.waitForTimeout(2_200);
  const walking = await snapshot();

  await page.locator('#liveGpsFieldBtn').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 30_000 });
  await page.waitForSelector('#discoveryFieldSession:not([hidden])', { timeout: 30_000 });
  if (await page.locator('#discoveryTutorial:not([hidden])').isVisible().catch(() => false)) {
    await page.locator('#discoveryTutorialDoneBtn').click();
  }
  if (await page.locator('#discoverySectionTutorial:not([hidden])').isVisible().catch(() => false)) {
    await page.locator('#discoverySectionTutorialDoneBtn').click();
  }
  await page.waitForTimeout(300);
  const fieldToday = await page.evaluate(() => ({
    sessionText: document.getElementById('discoveryFieldSession')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    objectiveCount: document.querySelectorAll('#discoveryExpeditionList [data-field-objective]').length,
    objectiveText: [...document.querySelectorAll('#discoveryExpeditionList [data-field-objective]')]
      .map((entry) => entry.textContent?.replace(/\s+/g, ' ').trim() || '')
  }));
  await mkdir('output/verification/live-gps-field', { recursive: true });
  await page.screenshot({ path: 'output/verification/live-gps-field/field-today-mobile.png', fullPage: true });
  const fieldBefore = await snapshot();
  const firstObjective = fieldBefore.worldDiscovery?.fieldExpedition?.objectives?.[0];
  assert.ok(firstObjective?.targetWorld, 'Field Today must expose a deterministic first objective to diagnostics.');
  const gpsWorld = fieldBefore.liveGps?.fieldWorld;
  const latitudeBeforeObjective = 39.290445;
  const longitudeBeforeObjective = -76.6122;
  const metersPerDegree = 111_320;
  const targetLatitude = latitudeBeforeObjective -
    (Number(firstObjective.targetWorld.z) - Number(gpsWorld.z)) / metersPerDegree;
  const targetLongitude = longitudeBeforeObjective +
    (Number(firstObjective.targetWorld.x) - Number(gpsWorld.x)) /
      (metersPerDegree * Math.cos(latitudeBeforeObjective * Math.PI / 180));
  await page.locator('#discoveryExpeditionList [data-field-objective]').first().click();
  for (let index = 0; index < 9; index += 1) {
    await cdp.send('Emulation.setGeolocationOverride', {
      latitude: targetLatitude,
      longitude: targetLongitude,
      accuracy: 6,
      speed: 1.4,
      heading: 0
    });
    await page.waitForTimeout(620);
  }
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction?.phase === 'revealed', null, { timeout: 30_000 });
  await page.locator('#liveGpsFieldBtn').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 30_000 });
  await page.locator('#discoveryPrimaryBtn').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.fieldExpedition?.completedCount === 1, null, { timeout: 30_000 });
  const firstStopRecorded = await snapshot();
  await page.screenshot({ path: 'output/verification/live-gps-field/first-stop-recorded-mobile.png', fullPage: true });
  await page.locator('#discoveryCloseBtn').click();

  let currentLatitude = targetLatitude;
  let currentLongitude = targetLongitude;
  for (let expectedCompleted = 2; expectedCompleted <= 3; expectedCompleted += 1) {
    const beforeStop = await snapshot();
    const objective = beforeStop.worldDiscovery?.fieldExpedition?.objectives?.find((entry) => !entry.complete);
    assert.ok(objective?.targetWorld, `Field stop ${expectedCompleted} must remain stable and available.`);
    const currentWorld = beforeStop.liveGps?.fieldWorld;
    const deltaX = Number(objective.targetWorld.x) - Number(currentWorld.x);
    const deltaZ = Number(objective.targetWorld.z) - Number(currentWorld.z);
    const stopLatitude = currentLatitude - deltaZ / metersPerDegree;
    const stopLongitude = currentLongitude + deltaX /
      (metersPerDegree * Math.cos(currentLatitude * Math.PI / 180));
    await page.locator('#liveGpsFieldBtn').click();
    await page.waitForSelector('#discoveryPanel.show', { timeout: 30_000 });
    await page.locator('#discoveryExpeditionList [data-field-objective]').evaluateAll((buttons, slotId) => {
      buttons.find((button) => button.dataset.fieldObjective === slotId)?.click();
    }, objective.slotId);
    await page.waitForFunction((slotId) => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction?.targetId === slotId, objective.slotId, { timeout: 30_000 });
    const routeSteps = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaZ) / 12));
    for (let step = 1; step <= routeSteps + 10; step += 1) {
      const amount = Math.min(1, step / routeSteps);
      await cdp.send('Emulation.setGeolocationOverride', {
        latitude: currentLatitude + (stopLatitude - currentLatitude) * amount,
        longitude: currentLongitude + (stopLongitude - currentLongitude) * amount,
        accuracy: 6,
        speed: 1.4,
        heading: 0
      });
      await page.waitForTimeout(620);
    }
    try {
      await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction?.phase === 'revealed', null, { timeout: 30_000 });
    } catch (error) {
      const failedStop = await snapshot();
      console.error(JSON.stringify({ expectedCompleted, objective, liveGps: failedStop.liveGps, interaction: failedStop.worldDiscovery?.interaction }, null, 2));
      throw error;
    }
    await page.locator('#liveGpsFieldBtn').click();
    await page.waitForSelector('#discoveryPanel.show', { timeout: 30_000 });
    await page.locator('#discoveryPrimaryBtn').click();
    await page.waitForFunction((count) => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.fieldExpedition?.completedCount === count, expectedCompleted, { timeout: 30_000 });
    currentLatitude = stopLatitude;
    currentLongitude = stopLongitude;
    if (expectedCompleted < 3) await page.locator('#discoveryCloseBtn').click();
  }
  const expeditionComplete = await snapshot();
  await page.screenshot({ path: 'output/verification/live-gps-field/expedition-complete-mobile.png', fullPage: true });
  await page.locator('#discoveryCloseBtn').click();

  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: currentLatitude + 0.00002,
    longitude: currentLongitude,
    accuracy: 60,
    speed: 1.2,
    heading: 0
  });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.fieldSession?.pauseReason === 'accuracy-hold', null, { timeout: 30_000 });
  const accuracyHeld = await snapshot();

  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: currentLatitude + 0.00004,
    longitude: currentLongitude,
    accuracy: 6,
    speed: 1.4,
    heading: 0
  });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().liveGps?.fieldSession?.pauseReason === null, null, { timeout: 30_000 });

  const fastFixes = [0.00014, 0.00028, 0.00042, 0.00056, 0.00070, 0.00084].map((offset) => currentLatitude + offset);
  for (const latitude of fastFixes) {
    await cdp.send('Emulation.setGeolocationOverride', {
      latitude,
      longitude: currentLongitude,
      accuracy: 6,
      speed: 15,
      heading: 0
    });
    await page.waitForTimeout(850);
  }
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.liveGps?.travelMode === 'drive' && diagnostics.activeActor?.mode === 'drive';
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(1_200);
  const driving = await snapshot();

  const checks = {
    mobileEntryVisible: true,
    gpsActive: walking.liveGps?.active === true && walking.liveGps?.following === true,
    walkingMovedFromGps: distance2d(initial.activeActor?.position, walking.activeActor?.position) > 0.2,
    walkingCameraReturnsBehind:
      Number(walking.cameraFollow?.headingAlignmentDegrees) <= 12 &&
      Number(walking.cameraFollow?.trailingDistance) > 0,
    fieldTodayVisible: fieldToday.sessionText.includes('LIVE GPS WALK') && fieldToday.objectiveCount === 3,
    fieldTodayHasThreeStops: fieldToday.objectiveText.length === 3 && fieldToday.objectiveText.every((entry) => /\d+ m|Waiting for GPS/.test(entry)),
    firstStopRecordsOnce: firstStopRecorded.worldDiscovery?.fieldExpedition?.completedCount === 1 &&
      firstStopRecorded.worldDiscovery?.interaction?.claimState === 'claimed',
    expeditionCompletesThreeStops: expeditionComplete.worldDiscovery?.fieldExpedition?.completedCount === 3 &&
      expeditionComplete.worldDiscovery?.fieldExpedition?.complete === true,
    poorAccuracyHoldsFieldRewards: accuracyHeld.liveGps?.fieldSession?.eligible === false && accuracyHeld.liveGps?.fieldSession?.pauseReason === 'accuracy-hold',
    vehicleSpeedDetected:
      driving.liveGps?.travelMode === 'drive' && driving.liveGps?.movementClass === 'fast',
    vehicleActorSelected: driving.activeActor?.mode === 'drive',
    vehicleCameraReturnsBehind:
      Number(driving.cameraFollow?.headingAlignmentDegrees) <= 12 &&
      Number(driving.cameraFollow?.trailingDistance) > 0,
    gpsWatchRemainsActive: driving.liveGps?.watchActive === true,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'visible-live-gps-walk-drive-camera-follow',
    checks,
    initial: { actor: initial.activeActor, gps: initial.liveGps, cameraFollow: initial.cameraFollow },
    walking: { actor: walking.activeActor, gps: walking.liveGps, cameraFollow: walking.cameraFollow },
    fieldToday,
    firstStopRecorded: {
      gps: firstStopRecorded.liveGps,
      interaction: firstStopRecorded.worldDiscovery?.interaction,
      expedition: firstStopRecorded.worldDiscovery?.fieldExpedition
    },
    expeditionComplete: {
      gps: expeditionComplete.liveGps,
      interaction: expeditionComplete.worldDiscovery?.interaction,
      expedition: expeditionComplete.worldDiscovery?.fieldExpedition
    },
    accuracyHeld: { gps: accuracyHeld.liveGps },
    driving: { actor: driving.activeActor, gps: driving.liveGps, cameraFollow: driving.cameraFollow },
    browserErrors,
    localFailures
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Live GPS visible journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
