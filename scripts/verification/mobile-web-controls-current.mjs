import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { closeOwnedBrowser } from './owned-browser.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
import { createStagingGatewayHandler } from './staging-proxy-delivery.mjs';

// Frozen released web artifact, staging services, one selected world per engine.
// Real browser engines; synthetic sensor samples are not physical phone tests.
const name = process.env.WE3D_MOBILE_WEB_ENGINE || 'webkit';
assert.ok(['chromium', 'webkit'].includes(name));
const out = process.env.WE3D_MOBILE_WEB_OUTPUT || `output/research/mobile-vehicle-controls-2026-10-25/mobile-web-${name}`;
await fs.mkdir(out, { recursive: true });
assert.ok(process.env.WE3D_VERIFY_ROOT, 'Use an explicitly frozen artifact.');
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE, 'Use a temporary registered staging credential.');
const server = await startStaticServer({ rootDir: path.resolve(process.env.WE3D_VERIFY_ROOT), ports: [4536], handleRequest: createStagingGatewayHandler() });
const base = `http://127.0.0.1:${server.port}`;
const engine = name === 'webkit' ? webkit : chromium;
const owned = await engine.launchServer({ headless: true, ...(name === 'chromium' ? { channel: 'chrome', args: ['--js-flags=--max-old-space-size=1536'] } : {}) });
const report = { passed: false, engine: name, scope: 'Regular mobile website without Play distribution; desktop browser engines with touch viewport and synthetic sensors, staging attestation. Not physical Android/iOS qualification.', checks: [], pageErrors: [], consoleErrors: [], resourceFailures: [] };
let page;
try {
  const browser = await engine.connect(owned.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 500)); });
  page.on('response', r => { if (r.status() >= 400) { const u = new URL(r.url()); report.resourceFailures.push({ status: r.status(), url: u.origin + u.pathname }); } });
  // API rewrites are served above, including requests controlled by the real
  // offline worker. Only the local Firebase configuration needs a page route.
  report.attestation = await configureStagingAppCheck(page, base, { proxyGeospatial: false });
  if (name === 'webkit') await page.addInitScript(() => {
    globalThis.__motionPermissionQa = { answer: 'denied', calls: [], clickTrusted: false };
    document.addEventListener('click', event => {
      if (event.target.closest?.('#mobileTiltEnable')) __motionPermissionQa.clickTrusted = event.isTrusted;
    }, true);
    const type = globalThis.DeviceOrientationEvent || class extends Event {};
    Object.defineProperty(type, 'requestPermission', { configurable: true, value() {
      __motionPermissionQa.calls.push({ trustedClick: __motionPermissionQa.clickTrusted, active: navigator.userActivation?.isActive });
      return Promise.resolve(__motionPermissionQa.answer);
    } });
    globalThis.DeviceOrientationEvent = type;
  });
  await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=driving`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => WorldExplorerDistribution.isGooglePlay), false);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.distribution), 'web');
  await page.evaluate(async () => { globalThis.mobileWebQa = (await import('/app/js/shared-context.js?v=55')).ctx; mobileWebQa.renderer.domElement.setAttribute('data-mobile-web-main', 'true'); });
  for (const selector of ['#analyticsConsentDenyBtn', '#testerInvitationClose']) if (await page.locator(selector).isVisible()) await page.locator(selector).tap();
  if (await page.locator('#globeSelectorStartBtn').isVisible()) await page.locator('#globeSelectorStartBtn').tap();
  await page.waitForFunction(() => mobileWebQa.gameStarted && !mobileWebQa.worldLoading && !mobileWebQa.titleLaunchPending && mobileWebQa.worldLoadRuntimeState?.gameplayRuntimesReady, null, { timeout: 180000, polling: 500 });
  for (const selector of ['#tutorialSkipBtn']) if (await page.locator(selector).isVisible()) await page.locator(selector).tap();
  const later = page.getByRole('button', { name: 'Show this tutorial step later' }); if (await later.isVisible()) await later.tap();
  await page.locator('#mobileTouchControls.show').waitFor({ state: 'visible' });
  report.checks.push({ id: 'regular-web-game-launch', googlePlay: false });
  console.log(`mobile-web ${name}: selected world ready`);
  const controls = () => page.evaluate(() => mobileWebQa.readControlActions(mobileWebQa.getCurrentTravelMode()));
  report.orientation = await page.evaluate(() => ({ screenAngle: screen.orientation?.angle, legacyAngle: window.orientation }));
  const orient = (beta, gamma) => page.evaluate(({ beta, gamma }) => {
    // Synthetic angles start in portrait screen coordinates. WebKit on this Mac
    // reports 90 degrees even with a portrait mobile viewport; rotate the sample
    // into the engine's declared natural-device axes, as a real sensor would.
    const b = beta * Math.PI / 180, g = gamma * Math.PI / 180, s = Number(screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
    const right = -Math.cos(b) * Math.sin(g), up = Math.sin(b), z = Math.cos(b) * Math.cos(g);
    beta = Math.asin(Math.max(-1, Math.min(1, right * Math.sin(s) + up * Math.cos(s)))) * 180 / Math.PI;
    gamma = Math.atan2(-(right * Math.cos(s) - up * Math.sin(s)), z) * 180 / Math.PI;
    const event = new Event('deviceorientation'); Object.assign(event, { beta, gamma, alpha: 0 }); window.dispatchEvent(event);
  }, { beta, gamma });
  const openControls = async () => { await page.locator('#controlsBarBtn').tap(); await page.locator('#mobileTiltEnable').scrollIntoViewIfNeeded(); };
  const closeControls = () => page.locator('#ctrlHeader').tap();
  if (name === 'webkit') {
    await openControls(); await page.locator('#mobileTiltEnable').tap();
    await page.waitForFunction(() => document.querySelector('#mobileTiltStatus').textContent.includes('declined'));
    assert.equal(await page.locator('#mobileTiltEnable').getAttribute('aria-pressed'), 'false');
    const calls = await page.evaluate(() => __motionPermissionQa.calls);
    assert.equal(calls.length, 1); assert.equal(calls[0].trustedClick, true); assert.equal(calls[0].active, true);
    await page.screenshot({ path: `${out}/permission-denied.png` }); await closeControls();
    report.checks.push({ id: 'permission-denial-from-trusted-tap', calls });
  }
  const pose = () => page.evaluate(() => ({ x: mobileWebQa.car.x, z: mobileWebQa.car.z, angle: mobileWebQa.car.angle }));
  const center = async selector => { const b = await page.locator(selector).boundingBox(); assert.ok(b); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const before = await pose(), [sx, sy] = await center('#mobileMovePad'), [gx, gy] = await center('#mobileDriveAccelerate');
  if (name === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
    await send('touchStart', [[1, sx, sy]]); await send('touchMove', [[1, sx + 25, sy]]);
    assert.equal((await controls()).throttle, 0);
    await send('touchStart', [[1, sx + 25, sy], [2, gx, gy]]);
    const held = await controls(); assert.ok(held.steer < -.1); assert.equal(held.throttle, 1);
    await page.waitForTimeout(1000); await send('touchCancel', []);
    report.checks.push({ id: 'browser-multitouch-car', held });
  } else {
    // WebKit has no CDP multitouch injection. Trusted mouse drag exercises its
    // pointer/capture path; second pedal is explicitly synthetic DOM input.
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 25, sy);
    assert.equal((await controls()).throttle, 0);
    await page.locator('#mobileDriveAccelerate').dispatchEvent('pointerdown', { pointerId: 22, pointerType: 'touch', clientX: gx, clientY: gy, bubbles: true });
    const held = await controls(); assert.ok(held.steer < -.1); assert.equal(held.throttle, 1);
    await page.waitForTimeout(1000);
    await page.locator('#mobileDriveAccelerate').dispatchEvent('pointercancel', { pointerId: 22, pointerType: 'touch', bubbles: true }); await page.mouse.up();
    report.checks.push({ id: 'browser-pointer-car-after-denial', held, secondPointerSynthetic: true });
  }
  const after = await pose(); assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > .1); assert.ok(Math.abs(after.angle - before.angle) > .01);
  assert.equal((await controls()).throttle, 0); assert.equal((await controls()).steer, 0);
  await page.screenshot({ path: `${out}/car-regular-web.png` });
  await openControls();
  if (name === 'webkit') await page.evaluate(() => { __motionPermissionQa.answer = 'granted'; });
  await page.locator('#mobileTiltEnable').tap();
  await page.waitForFunction(() => document.querySelector('#mobileTiltEnable').getAttribute('aria-pressed') === 'true');
  await closeControls(); await controls(); await orient(40, 0); await controls(); await orient(40, 28); await page.waitForTimeout(100);
  const tilt = await controls(); report.tiltDiagnostic = { tilt, snapshot: await page.evaluate(() => mobileWebQa.getMobileTouchInputSnapshot()) }; assert.ok(tilt.steer < -.1);
  await page.locator('#mobileTiltQuickRecenter').tap(); await orient(40, 28); assert.equal((await controls()).steer, 0);
  await orient(40, -28); await page.waitForTimeout(100); assert.ok((await controls()).steer > .1);
  await page.waitForTimeout(650); assert.equal((await controls()).steer, 0);
  report.checks.push({ id: 'permission-grant-tilt-recenter-stale', tilt });
  await openControls(); await orient(40, -28); assert.equal((await controls()).mobileTilt, undefined);
  await page.locator('#mobileTiltEnable').tap(); await closeControls();
  for (const viewport of [{ width: 844, height: 390 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(viewport); await page.waitForFunction(w => innerWidth === w && document.documentElement.scrollWidth === w, viewport.width);
    const targets = await page.evaluate(() => ['mobileMovePad', 'mobileDriveAccelerate', 'mobileDriveBrakeReverse', 'mobileLookPad'].map(id => {
      const e = document.getElementById(id), b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { id, width: b.width, height: b.height, visible: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, hit: hit === e || e.contains(hit) };
    }));
    for (const t of targets) { assert.ok(t.visible && t.hit, JSON.stringify(t)); assert.ok(t.width >= 44 && t.height >= 44); }
    report.checks.push({ id: 'normal-web-rotation-layout', viewport, targets }); await page.screenshot({ path: `${out}/car-${viewport.width}x${viewport.height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openControls();
  await page.evaluate(() => { globalThis.__savedOrientationQa = globalThis.DeviceOrientationEvent; Object.defineProperty(globalThis, 'DeviceOrientationEvent', { configurable: true, writable: true, value: undefined }); });
  await page.locator('#mobileTiltEnable').tap(); await page.waitForFunction(() => document.querySelector('#mobileTiltStatus').textContent.includes('unavailable in this browser'));
  assert.equal(await page.locator('#mobileTiltEnable').getAttribute('aria-pressed'), 'false'); await page.screenshot({ path: `${out}/unsupported-touch-fallback.png` });
  await page.evaluate(() => { globalThis.DeviceOrientationEvent = __savedOrientationQa; delete globalThis.__savedOrientationQa; }); await closeControls();
  report.checks.push({ id: 'no-motion-api-touch-fallback' });
  await runPrescribedGameActions(page, out, [{ buttons: ['up'], frames: 8 }, { buttons: [], frames: 4 }], 'canvas[data-mobile-web-main]');
  assert.equal((await controls()).throttle, 0);
  if (name === 'webkit') {
    // The new engine also exercises both flight consumers, in the same session.
    await page.locator('#travelBtn').tap(); await page.locator('#fWalk').tap();
    await page.locator('#travelBtn').tap(); await page.locator('#fPlane').tap();
    await page.waitForFunction(() => mobileWebQa.planeMode?.active === true);
    await openControls(); await page.locator('#mobileTiltEnable').tap(); await closeControls();
    await controls(); await orient(40, 0); await controls(); await orient(60, 25); await page.waitForTimeout(100);
    const planeTilt = await controls(); assert.ok(planeTilt.pitch > 0 && planeTilt.roll < 0);
    const [px, py] = await center('#mobileMovePad'); await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px - 25, py - 25);
    const manualPlane = await controls(); assert.ok(manualPlane.pitch < 0 && manualPlane.roll > 0); await page.mouse.up();
    await page.screenshot({ path: `${out}/plane-mobile-web.png` }); report.checks.push({ id: 'webkit-plane-tilt-manual-override', planeTilt, manualPlane });
    await page.locator('#travelBtn').tap(); await page.locator('#fSpaceRocket').tap();
    await page.waitForFunction(() => mobileWebQa.spaceFlight?.active && !mobileWebQa.paused && mobileWebQa.spaceFlight?.renderer?.info.render.frame > 0, null, { timeout: 90000 });
    await page.locator('#mobileTouchControls.show.mode-rocket').waitFor({ state: 'visible' });
    await controls(); await orient(40, 0); await controls(); await orient(60, 25); await page.waitForTimeout(100);
    const spaceTilt = await controls(); assert.ok(spaceTilt.move < 0 && spaceTilt.turn < 0);
    const [tx, ty] = await center('#mobileActionPrimary'); await page.mouse.move(tx, ty); await page.mouse.down();
    assert.equal(await page.evaluate(() => mobileWebQa.spaceFlight.keys[' ']), true);
    await page.waitForFunction(() => mobileWebQa.spaceFlight._isThrusting === true); await page.mouse.up();
    await page.waitForFunction(() => mobileWebQa.spaceFlight._isThrusting === false);
    await page.screenshot({ path: `${out}/space-mobile-web.png` }); report.checks.push({ id: 'webkit-space-tilt-thrust-release', spaceTilt });
  }
  report.cdnCodecs = await page.evaluate(async () => {
    const [{default: Pbf}, {VectorTile}, {PMTiles}] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/pbf@3.2.1/+esm'),
      import('https://cdn.jsdelivr.net/npm/@mapbox/vector-tile@1.3.1/+esm'),
      import('https://cdn.jsdelivr.net/npm/pmtiles@4.4.1/+esm')
    ]);
    const writer = new Pbf(); writer.writeVarint(42);
    return { pbfRoundTrip: new Pbf(writer.finish()).readVarint(), emptyTileLayers: Object.keys(new VectorTile(new Pbf(new Uint8Array())).layers), pmtilesConstructor: typeof PMTiles };
  });
  assert.deepEqual(report.cdnCodecs, { pbfRoundTrip: 42, emptyTileLayers: [], pmtilesConstructor: 'function' });
  // Desktop WebKit emits extra origin-relative CDN dependency requests even
  // when actual imports and decoding succeed. Retain the raw failures and permit
  // only these diagnosed engine requests, with the real codecs checked above.
  const knownWebKitPaths = new Set(['/npm/@mapbox/point-geometry@0.1.0/+esm', '/npm/ieee754@1.1.13/+esm', '/npm/fflate@0.8.2/+esm']);
  report.browserEngineWarnings = report.resourceFailures.filter(r => name === 'webkit' && r.status === 404 && new URL(r.url).origin === base && knownWebKitPaths.has(new URL(r.url).pathname));
  assert.deepEqual(report.resourceFailures.filter(r => !report.browserEngineWarnings.includes(r)), []);
  const console404 = report.consoleErrors.filter(m => m === 'Failed to load resource: the server responded with a status of 404 (Not Found)');
  assert.equal(console404.length, report.browserEngineWarnings.length);
  assert.deepEqual(report.consoleErrors.filter(m => !console404.includes(m)), []);
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack; process.exitCode = 1; await page?.screenshot({ path: `${out}/failed.png` }).catch(() => {});
} finally {
  await closeOwnedBrowser(owned); await server.close(); report.ownedBrowserClosed = true;
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
