import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4195';
const output = 'output/playwright/bridge-tunnel-current';
await mkdir(output, { recursive: true });
const browserServer = await chromium.launchServer({ channel: 'chrome', headless: false });
const browser = await chromium.connect(browserServer.wsEndpoint());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const report = { baseline: base, providerPath: 'explicit-worldwide-fallback', errors: [], frames: [], checks: {} };
// This transport-only source fixture must not contact production capture
// services. Capture publication is exercised separately on staged hosting.
report.captureListing = 'isolated-empty-fixture-not-capture-acceptance';
await page.route('**/listApprovedExteriorRepresentations', route => route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({representations:[]})
}));
// A graceful Chrome close can hang after a WebGL run. Own only this test's
// browser and keep a hard bound through cleanup, not merely through assertions.
async function closeOwnedBrowser() {
  let timer;
  const closed=await Promise.race([
    browser.close().then(()=>true,()=>false),
    new Promise(resolve=>{timer=setTimeout(()=>resolve(false),8000);})
  ]);
  clearTimeout(timer);
  if(!closed)await browserServer.kill();
  return closed;
}
const deadline = setTimeout(() => {
  report.failure='Transport verification exceeded its 150 second wall-clock limit.';
  process.exitCode=1;
  void browserServer.kill();
}, 150_000);
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push({ message: message.text(), location: message.location() }); });
report.failedRequests = [];
page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure() }));
// Deliberately exercise the fallback that permitted passage through its walls.
// This does not count as verification of the exact OSM provider path.
await page.route(/https:\/\/[^/]*overpass[^/]*\/.*interpreter/i, route => route.abort());

async function snapshot(label) {
  await page.screenshot({ path: `${output}/${label}.png` });
  const state = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { resolveTunnelSpace } = await import('/app/js/world/compiler/tunnel-space-query.js');
    const { projectPointToFeature } = await import('/app/js/structure-semantics.js?v=63');
    const { createVehicleCameraBody, vehicleCameraProbeRadius } = await import('/app/js/hud/vehicle-camera-body.js');
    const walker = ctx.Walk.state.walker;
    const walk = ctx.Walk.state.mode === 'walk';
    const actor = walk ? walker : ctx.car;
    const space = resolveTunnelSpace(window.testTunnel, ctx.camera.position.x, ctx.camera.position.z, ctx.camera.position.y);
    return { mode: ctx.Walk.state.mode, x: actor.x, y: actor.y, z: actor.z,
      lateral: projectPointToFeature(window.testTunnel, actor.x, actor.z)?.dist,
      road: ctx.car.road?.sourceFeatureId, cameraInside: space.inside,
      cameraReason: space.reason, camera: { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z },
      visibleVehicleCameraClipping: !walk && ctx.carMesh.visible && createVehicleCameraBody(THREE, ctx.carMesh, vehicleCameraProbeRadius(ctx.camera))?.contains(ctx.camera.position) === true,
      cameraClearanceMode: ctx.camera.userData.vehicleClearanceMode,
      vehicleContact: ctx.car.groundContact, walls: ctx.transportStructureColliders?.length,
      masks: ctx.structureTerrainPortalMaskStats, runtimeErrors: window.getWorldExplorerRuntimeDiagnostics().runtimeErrors,
      renderState: JSON.parse(window.render_game_to_text()) };
  });
  report.frames.push({ label, ...state });
  console.log(label, JSON.stringify({ mode: state.mode, y: state.y, lateral: state.lateral, cameraInside: state.cameraInside, walls: state.walls }));
  return state;
}

try {
  await page.goto(`${base}/app/?loc=custom&lat=39.2718&lon=-76.5614&lname=Harbor%20Tunnel&launch=earth&gm=free&mode=driving`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__, null, { timeout: 30_000 });
  const deny = page.locator('#analyticsConsentDenyBtn');
  if (await deny.isVisible()) await deny.click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const d = window.getWorldExplorerRuntimeDiagnostics?.();
    return d?.gameStarted && !d.worldLoading && d.worldCounts.roads > 0;
  }, null, { timeout: 100_000 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { sampleFeatureSurfaceY } = await import('/app/js/structure-semantics.js?v=63');
    window.testTunnel = ctx.roads.find(r => r.name === 'Fort McHenry Tunnel (Bore 2)' && r.tunnelSystemModel?.shellRanges.length);
    if (!window.testTunnel) throw new Error('Mapped test tunnel did not load');
    window.placeOnTestTunnel = (distance, normal = false) => {
      const r = window.testTunnel;
      let left = distance, point;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (left <= length) {
          point = { x: a.x + (b.x - a.x) * left / length, z: a.z + (b.z - a.z) * left / length,
            angle: Math.atan2(b.x - a.x, b.z - a.z) + (normal ? Math.PI / 2 : 0) };
          break;
        }
        left -= length;
      }
      const y = sampleFeatureSurfaceY(r, point.x, point.z);
      Object.assign(ctx.car, { ...point, y: y + 1.2, vy: 0, road: r, onRoad: true, isAirborne: false,
        _lastSurfaceY: y, _lastRawSurfaceY: y, _roadContinuityTimer: .7, speed: 0, vFwd: 0, vLat: 0 });
      ctx.invalidateRoadCache();
      ctx.carMesh.position.set(point.x, y + 1.2, point.z);
      ctx.camMode = 0;
      return { ...point, y };
    };
    ctx.setTimeOfDay?.('day');
    ctx.setTravelMode('drive');
    window.placeOnTestTunnel(2);
  });
  await page.waitForTimeout(600);
  await snapshot('entrance');
  await page.keyboard.down('w');
  await page.waitForTimeout(3600);
  await page.keyboard.up('w');
  const entered = await snapshot('entered-driving');
  report.checks.drivingRemainsBelowSeaLevel = entered.y < 0 && entered.vehicleContact?.roadCentered;
  await page.evaluate(() => window.placeOnTestTunnel(80, true));
  await page.keyboard.down('w');
  await page.waitForTimeout(2200);
  await page.keyboard.up('w');
  const wall = await snapshot('vehicle-wall-impact');
  report.checks.vehicleWallStopsEscape = wall.y < 0 && wall.lateral < 4.6 && wall.walls > 0;
  await page.evaluate(() => window.placeOnTestTunnel(100));
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  await snapshot('hood-view');
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  const overhead = await snapshot('underground-overhead-choice');
  report.checks.overheadKeepsCameraInside = overhead.cameraInside;
  await page.locator('#travelBtn').click();
  await page.locator('#fWalk').click();
  await page.waitForTimeout(600);
  const walk = await snapshot('walking');
  report.checks.walkModePreservesTunnel = walk.mode === 'walk' && walk.y < 0;
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.Walk.state.walker.angle += Math.PI / 2;
    ctx.Walk.state.walker.yaw = ctx.Walk.state.walker.angle;
  });
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(1600);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const walkerWall = await snapshot('walker-wall-jump');
  report.checks.walkerWallStopsEscape = walkerWall.y < 1 && walkerWall.lateral < 5.4;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobile = await snapshot('mobile-tunnel-camera');
  report.checks.mobileCameraInside = mobile.cameraInside;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.setTravelMode('drive');
  });
  await page.waitForTimeout(300);
  const returnDrive = await snapshot('return-to-driving');
  report.checks.returnToDrivingPreservesTunnel = returnDrive.mode === 'drive' && returnDrive.y < 0 && returnDrive.lateral < 5.4;
  // Retain the deliberately induced network failures as evidence. Only those
  // exact provider requests are expected; unrelated console/page errors fail.
  report.expectedProviderErrors = report.errors.filter(error =>
    error?.message === 'Failed to load resource: net::ERR_FAILED' &&
    /^https:\/\/[^/]*overpass[^/]*\/.*interpreter$/i.test(error?.location?.url || ''));
  report.unexpectedErrors = report.errors.filter(error => !report.expectedProviderErrors.includes(error));
  report.checks.noRuntimeErrors = report.unexpectedErrors.length === 0 && report.frames.every(f => f.runtimeErrors.length === 0);
  report.checks.noVisibleVehicleCameraClipping = report.frames.every(f => !f.visibleVehicleCameraClipping);
  assert.deepEqual(Object.entries(report.checks).filter(([, passed]) => !passed), []);
  report.ok = true;
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  report.gracefulBrowserClose = await closeOwnedBrowser();
  clearTimeout(deadline);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok || false, checks: report.checks, failure: report.failure }, null, 2));
}
