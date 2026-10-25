import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { closeOwnedBrowser } from './owned-browser.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';

// One actual game session; no city/multiplayer/release sweep. Sensor samples
// are synthetic browser events, not evidence of a physical phone sensor.
const out = process.env.WE3D_VEHICLE_OUTPUT || 'output/research/mobile-vehicle-controls-2026-10-25/source-browser';
await fs.mkdir(out, { recursive: true });
const requestedBase = process.env.WE3D_VEHICLE_BASE;
if (requestedBase) assert.equal(new URL(requestedBase).origin, 'https://we3d-staging-20260712.web.app');
const server = requestedBase ? null : await startStaticServer({ rootDir: path.resolve(process.env.WE3D_VERIFY_ROOT || '.'), ports: [4535] });
const base = requestedBase || `http://127.0.0.1:${server.port}`;
const owned = await chromium.launchServer({ channel: 'chrome', headless: true, args: ['--js-flags=--max-old-space-size=1536'] });
const report = { passed: false, scope: 'Actual game touch controls on desktop Chrome, synthetic orientation, one selected location; not physical phone performance.', checks: [], pageErrors: [], consoleErrors: [] };
let page;
try {
  const browser = await chromium.connect(owned.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 500)); });
  await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=driving&distribution=google-play`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  await page.evaluate(async () => { globalThis.vehicleQa = (await import('/app/js/shared-context.js?v=55')).ctx; vehicleQa.renderer.domElement.setAttribute('data-vehicle-controls-main', 'true'); });
  for (const selector of ['#analyticsConsentDenyBtn', '#testerInvitationClose']) if (await page.locator(selector).isVisible()) await page.locator(selector).click();
  if (await page.locator('#globeSelectorStartBtn').isVisible()) await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => vehicleQa.gameStarted && !vehicleQa.worldLoading && !vehicleQa.titleLaunchPending && vehicleQa.worldLoadRuntimeState?.gameplayRuntimesReady, null, { timeout: 180000, polling: 500 });
  console.log('vehicle-controls: world ready');
  if (await page.locator('#tutorialSkipBtn').isVisible()) await page.locator('#tutorialSkipBtn').click();
  await page.locator('#mobileTouchControls.show').waitFor({ state: 'visible' });
  const later = page.getByRole('button', { name: 'Show this tutorial step later' });
  if (await later.isVisible()) await later.click();
  const touch = await context.newCDPSession(page);
  const dispatch = (type, points) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
  const center = async selector => { const b = await page.locator(selector).boundingBox(); assert.ok(b, selector); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const controls = () => page.evaluate(() => vehicleQa.readControlActions(vehicleQa.getCurrentTravelMode()));
  const pose = () => page.evaluate(() => ({ x: vehicleQa.car.x, z: vehicleQa.car.z, angle: vehicleQa.car.angle, speed: vehicleQa.car.speed }));
  const turnBefore = await pose(), [sx, sy] = await center('#mobileMovePad'), [gx, gy] = await center('#mobileDriveAccelerate');
  await dispatch('touchStart', [[1, sx, sy]]);
  await dispatch('touchMove', [[1, sx + 24, sy - 30]]);
  assert.equal((await controls()).throttle, 0, 'steering cannot accelerate');
  await dispatch('touchStart', [[1, sx + 24, sy - 30], [2, gx, gy]]);
  const held = await controls(); assert.ok(held.steer < -.1); assert.equal(held.throttle, 1);
  await page.waitForTimeout(1200); const turnAfter = await pose();
  assert.ok(Math.hypot(turnAfter.x - turnBefore.x, turnAfter.z - turnBefore.z) > .1, 'actual car moves with independent gas');
  assert.ok(Math.abs(turnAfter.angle - turnBefore.angle) > .01, 'actual car turns');
  await dispatch('touchCancel', []); assert.equal((await controls()).throttle, 0); assert.equal((await controls()).steer, 0);
  report.checks.push({ id: 'independent-steering-pedals-cancellation', held, before: turnBefore, after: turnAfter });
  await page.screenshot({ path: `${out}/car-portrait.png` });

  await page.locator('#controlsBarBtn').click();
  await page.locator('#mobileTiltEnable').scrollIntoViewIfNeeded();
  await page.locator('#mobileTiltEnable').click();
  assert.equal(await page.locator('#mobileTiltEnable').getAttribute('aria-pressed'), 'true');
  await page.locator('#mobileTiltSpeed').check();
  await page.screenshot({ path: `${out}/tilt-settings.png` });
  await page.locator('#ctrlHeader').click();
  const orient = (beta, gamma) => page.evaluate(({ beta, gamma }) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta, gamma, alpha: 0 })), { beta, gamma });
  await controls(); await orient(40, 0); await controls();
  await orient(15, 30); await page.waitForTimeout(150); const tilt = await controls();
  assert.ok(tilt.steer < 0); assert.ok(tilt.throttle > 0);
  await page.locator('#mobileTiltQuickRecenter').click();
  await orient(15, 30); const neutral = await controls(); assert.equal(neutral.steer, 0); assert.equal(neutral.throttle, 0);
  await orient(65, 30); await page.waitForTimeout(100); const brake = await controls();
  assert.ok(brake.serviceBrake > 0); assert.equal(brake.reverse, 0);
  await page.waitForTimeout(650); const stale = await controls(); assert.equal(stale.steer, 0); assert.equal(stale.throttle, 0);
  report.checks.push({ id: 'tilt-car-speed-recenter-stale', tilt, neutral, brake, stale });

  await page.locator('#controlsBarBtn').click();
  await orient(0, -50); assert.equal((await controls()).mobileTilt, undefined);
  await page.locator('#mobileTiltEnable').scrollIntoViewIfNeeded(); await page.locator('#mobileTiltEnable').click();
  await page.locator('#ctrlHeader').click();
  for (const viewport of [{ width: 844, height: 390 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(width => innerWidth === width && document.documentElement.scrollWidth === width, viewport.width);
    const hitTargets = await page.evaluate(() => ['mobileMovePad', 'mobileDriveAccelerate', 'mobileDriveBrakeReverse', 'mobileActionPrimary', 'mobileLookPad'].map(id => {
      const e = document.getElementById(id), b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { id, x: b.x, y: b.y, width: b.width, height: b.height, hit: hit === e || e.contains(hit), visible: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };
    }));
    for (const target of hitTargets) { assert.equal(target.visible, true, JSON.stringify(target)); assert.equal(target.hit, true, JSON.stringify(target)); }
    report.checks.push({ id: 'touch-layout', viewport, hitTargets });
    await page.screenshot({ path: `${out}/car-${viewport.width}x${viewport.height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Prescribed skill choreography, existing game frame owner; no second world.
  await runPrescribedGameActions(page, out, [{ buttons: ['up'], frames: 8 }, { buttons: [], frames: 4 }], 'canvas[data-vehicle-controls-main]');
  assert.equal((await controls()).throttle, 0);
  // The same accepted world and real travel commands; no pose setters.
  await page.locator('#travelBtn').click(); await page.locator('#fWalk').click();
  assert.equal((await controls()).mobileTilt, undefined);
  await page.locator('#travelBtn').click(); await page.locator('#fPlane').click();
  await page.waitForFunction(() => vehicleQa.planeMode?.active === true);
  await page.locator('#controlsBarBtn').click(); await page.locator('#mobileTiltEnable').scrollIntoViewIfNeeded();
  await page.locator('#mobileTiltEnable').click(); await page.locator('#ctrlHeader').click();
  await controls(); await orient(40, 0); await controls(); await orient(60, 25);
  await page.waitForTimeout(100); const planeTilt = await controls();
  assert.ok(planeTilt.pitch > 0); assert.ok(planeTilt.roll < 0);
  const flightStart = await center('#mobileMovePad');
  await dispatch('touchStart', [[1, ...flightStart]]);
  await dispatch('touchMove', [[1, flightStart[0] - 25, flightStart[1] - 25]]);
  const manualPlane = await controls(); assert.ok(manualPlane.roll > 0); assert.ok(manualPlane.pitch < 0);
  await dispatch('touchEnd', []);
  await page.screenshot({ path: `${out}/plane-tilt.png` });
  report.checks.push({ id: 'plane-tilt-and-touch-override', planeTilt, manualPlane });
  await page.locator('#travelBtn').click(); await page.locator('#fSpaceRocket').click();
  await page.waitForFunction(() => vehicleQa.spaceFlight?.active && !vehicleQa.paused && vehicleQa.spaceFlight?.renderer?.info.render.frame > 0, null, { timeout: 90000 });
  await page.locator('#mobileTouchControls.show.mode-rocket').waitFor({ state: 'visible' });
  await controls(); await orient(40, 0); await controls(); await orient(60, 25);
  await page.waitForTimeout(100); const spaceTilt = await controls();
  assert.ok(spaceTilt.move < 0); assert.ok(spaceTilt.turn < 0);
  const [tx, ty] = await center('#mobileActionPrimary');
  await dispatch('touchStart', [[1, tx, ty]]); assert.equal(await page.evaluate(() => vehicleQa.spaceFlight.keys[' ']), true);
  await page.waitForFunction(() => vehicleQa.spaceFlight._isThrusting === true);
  await dispatch('touchCancel', []); assert.equal(await page.evaluate(() => vehicleQa.spaceFlight.keys[' ']), false);
  await page.waitForFunction(() => vehicleQa.spaceFlight._isThrusting === false);
  await page.screenshot({ path: `${out}/space-tilt.png` });
  report.checks.push({ id: 'space-tilt-and-thrust-release', spaceTilt });
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
  if (page) await page.screenshot({ path: `${out}/failed.png` }).catch(() => {});
} finally {
  await closeOwnedBrowser(owned); await server?.close();
  report.ownedBrowserClosed = true;
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.map(c => c.id), failure: report.failure, pageErrors: report.pageErrors, consoleErrors: report.consoleErrors }));
}
