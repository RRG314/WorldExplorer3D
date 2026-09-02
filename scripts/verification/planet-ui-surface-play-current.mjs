import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/planet-ui-surface-play-current');
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

async function openMarsDetails() {
  await page.evaluate(async () => {
    const { showPlanetInfo } = await import('/app/js/solar-system/info-panel.js?v=5');
    const { SOLAR_SYSTEM_PLANETS } = await import('/app/js/solar-system/catalog.js?v=7');
    const panel = document.getElementById('solarSystemInfo');
    const mars = SOLAR_SYSTEM_PLANETS.find((planet) => planet.bodyId === 'mars');
    showPlanetInfo({
      appCtx: (await import('/app/js/shared-context.js?v=55')).ctx,
      solarSystem: { infoPanel: panel, selectedPlanet: null, selectedBodyId: null, planetMeshes: [] },
      getEarthHelioPos: () => ({ x: 0, y: 0, z: 0 }),
      distanceAU: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    }, { planet: mars, realPosition: { x: mars.meanDistanceAU, y: 0, z: 0 } });
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('solarSystemInfo')).display !== 'none');
}

async function accessibilitySnapshot() {
  return page.evaluate(() => {
    const close = document.getElementById('ssInfoClose');
    const menu = document.getElementById('mainMenuBtn');
    const panel = document.getElementById('solarSystemInfo');
    const hud = document.getElementById('spaceFlightHUD');
    const closeRect = close.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const topElement = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      closeTopmost: topElement === close || close.contains(topElement),
      closeVisible: closeRect.width > 0 && closeRect.height > 0,
      panelBelowMenu: panelRect.top >= menuRect.bottom,
      panelInsideViewport: panelRect.left >= 0 && panelRect.right <= innerWidth && panelRect.bottom <= innerHeight,
      hudHiddenWhileDetailsOpen: getComputedStyle(hud).visibility === 'hidden',
      closeRect: { x: closeRect.x, y: closeRect.y, width: closeRect.width, height: closeRect.height },
      menuRect: { x: menuRect.x, y: menuRect.y, width: menuRect.width, height: menuRect.height },
      panelRect: { x: panelRect.x, y: panelRect.y, width: panelRect.width, height: panelRect.height }
    };
  });
}

try {
  await page.addInitScript(() => localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({ version: 4, started: true, completed: true, skipped: false, stage: 'done' })));
  await page.goto(`${baseUrl}/app/?launch=space&planet-ui-audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => { document.getElementById('spaceLaunchToggle')?.click(); document.getElementById('startBtn')?.click(); });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').environment === 'SPACE_FLIGHT', null, { timeout: 180_000 });

  await openMarsDetails();
  const desktopDetails = await accessibilitySnapshot();
  assert.deepEqual(
    [desktopDetails.closeTopmost, desktopDetails.closeVisible, desktopDetails.panelBelowMenu, desktopDetails.panelInsideViewport, desktopDetails.hudHiddenWhileDetailsOpen],
    [true, true, true, true, true],
    JSON.stringify(desktopDetails)
  );
  await page.screenshot({ path: path.join(evidenceDir, '01-mars-details-desktop.png') });
  await page.locator('#ssInfoClose').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openMarsDetails();
  const mobileDetails = await accessibilitySnapshot();
  assert.deepEqual(
    [mobileDetails.closeTopmost, mobileDetails.closeVisible, mobileDetails.panelBelowMenu, mobileDetails.panelInsideViewport, mobileDetails.hudHiddenWhileDetailsOpen],
    [true, true, true, true, true],
    JSON.stringify(mobileDetails)
  );
  await page.screenshot({ path: path.join(evidenceDir, '02-mars-details-mobile.png') });
  await page.locator('#ssInfoClose').click();

  await page.setViewportSize({ width: 1440, height: 900 });
  const mercuryArrival = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.arriveAtSolidWorld?.('mercury');
  });
  assert.equal(mercuryArrival, true);
  await page.waitForFunction(() => {
    const current = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return current.environment === 'PLANETARY' && current.worldLoading === false;
  }, null, { timeout: 120_000 });
  await page.waitForTimeout(800);
  const mercurySurface = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { planetarySurfaceYAtRenderXZ } = await import('/app/js/planetary/runtime/surface-query.js?v=3');
    const surface = ctx.activeSolidWorldSurface;
    surface.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const samples = [];
    for (let dz = -360; dz <= 360; dz += 45) {
      for (let dx = -360; dx <= 360; dx += 45) {
        const x = ctx.car.x + dx;
        const z = ctx.car.z + dz;
        raycaster.set(new THREE.Vector3(x, 2_000, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObject(surface, false)[0];
        const sampledY = planetarySurfaceYAtRenderXZ(ctx, x, z, { bodyId: 'mercury' });
        if (hit && Number.isFinite(sampledY)) samples.push({ x, z, renderedY: hit.point.y, sampledY, delta: sampledY - hit.point.y });
      }
    }
    samples.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { sampleCount: samples.length, largestMismatch: samples[0], car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z } };
  });
  assert.ok(mercurySurface.sampleCount > 200, JSON.stringify(mercurySurface));
  assert.ok(Math.abs(mercurySurface.largestMismatch?.delta || 0) < 0.05, JSON.stringify(mercurySurface));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1_500);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(250);
  const mercuryAfterDrive = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const raycaster = new THREE.Raycaster(new THREE.Vector3(ctx.car.x, 2_000, ctx.car.z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(ctx.activeSolidWorldSurface, false)[0];
    return { car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z }, renderedY: hit?.point?.y ?? null, clearance: hit ? ctx.car.y - 1.2 - hit.point.y : null };
  });
  assert.ok(mercuryAfterDrive.renderedY != null && mercuryAfterDrive.clearance > -0.05, JSON.stringify(mercuryAfterDrive));
  await page.screenshot({ path: path.join(evidenceDir, '03-mercury-after-driving.png') });

  const report = { ok: pageErrors.length === 0, desktopDetails, mobileDetails, mercurySurface, mercuryAfterDrive, pageErrors };
  await writeFile(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
}
