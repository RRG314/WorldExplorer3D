import assert from 'node:assert/strict';
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
  viewport: { width: 1440, height: 900 },
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
  const url = `${baseUrl}/app/?loc=custom&lat=39.290400&lon=-76.612200&lname=Live%20GPS%20Baltimore&gm=livegps`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
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

  const fastFixes = [39.29058, 39.29072, 39.29086, 39.29100, 39.29114, 39.29128];
  for (const latitude of fastFixes) {
    await cdp.send('Emulation.setGeolocationOverride', {
      latitude,
      longitude: -76.6122,
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
    gpsActive: walking.liveGps?.active === true && walking.liveGps?.following === true,
    walkingMovedFromGps: distance2d(initial.activeActor?.position, walking.activeActor?.position) > 0.2,
    walkingCameraReturnsBehind:
      Number(walking.cameraFollow?.headingAlignmentDegrees) <= 12 &&
      Number(walking.cameraFollow?.trailingDistance) > 0,
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
