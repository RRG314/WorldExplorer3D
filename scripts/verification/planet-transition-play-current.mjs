import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/planet-transition-play-current');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

async function state() {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function capture(name) {
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

try {
  await page.addInitScript(() => {
    localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({ version: 4, started: true, completed: true, skipped: false, stage: 'done' }));
  });
  await page.goto(`${baseUrl}/app/?launch=space&planet-transition-audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const current = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return current.environment === 'SPACE_FLIGHT' && current.worldLoading === false;
  }, null, { timeout: 180_000 });

  await page.selectOption('#spaceDestinationSelect', 'mars');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.destinationBodyId === 'mars');
  await page.locator('#sfAssistBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.assist?.active === true);
  const approach = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    for (let frame = 0; frame < 3_000 && ctx.spaceJourney?.phase !== 'approach'; frame += 1) {
      ctx.updateRenderedSpaceJourney?.({ realDtS: 0.1 });
    }
    return {
      phase: ctx.spaceJourney?.phase || null,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId || null,
      landingText: document.getElementById('sfLandBtn')?.textContent?.trim() || '',
      landingDisabled: document.getElementById('sfLandBtn')?.disabled === true
    };
  });
  assert.equal(approach.phase, 'approach', JSON.stringify(approach));
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false);
  await capture('01-mars-approach.png');
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => {
    const current = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return current.environment === 'MARS' && current.worldLoading === false;
  }, null, { timeout: 180_000 });
  await page.waitForTimeout(1_000);
  await capture('02-mars-surface-arrival.png');

  const surfaceAudit = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { planetarySurfaceYAtRenderXZ } = await import('/app/js/planetary/runtime/surface-query.js?v=3');
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const samples = [];
    const center = { x: Number(ctx.car.x), z: Number(ctx.car.z) };
    ctx.marsSurface.updateMatrixWorld(true);
    for (let dz = -450; dz <= 450; dz += 45) {
      for (let dx = -450; dx <= 450; dx += 45) {
        const x = center.x + dx;
        const z = center.z + dz;
        raycaster.set(new THREE.Vector3(x, 2_000, z), down);
        const hit = raycaster.intersectObject(ctx.marsSurface, false)[0] || null;
        const sampledY = planetarySurfaceYAtRenderXZ(ctx, x, z, { bodyId: 'mars' });
        if (hit && Number.isFinite(sampledY)) samples.push({ x, z, renderedY: hit.point.y, sampledY, delta: sampledY - hit.point.y });
      }
    }
    samples.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return {
      activeSurface: ctx.planetarySurfaceAuthority?.snapshot?.()?.active || null,
      car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z },
      largestMismatch: samples[0] || null,
      largestFive: samples.slice(0, 5),
      sampleCount: samples.length
    };
  });
  console.log('SURFACE_AUDIT', JSON.stringify(surfaceAudit));
  assert.ok(surfaceAudit.sampleCount > 300, JSON.stringify(surfaceAudit));
  assert.ok(Math.abs(surfaceAudit.largestMismatch?.delta || 0) < 0.05, JSON.stringify(surfaceAudit));

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2_000);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(300);
  const driven = await state();
  await capture('03-mars-after-driving.png');

  await page.locator('#marsReturnEarthBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').surfacePodLaunch?.phase === 'ready');
  await capture('04-mars-pathfinder-ready.png');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => Number(JSON.parse(globalThis.render_game_to_text?.() || '{}').surfacePodLaunch?.altitude) > 8);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const current = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return current.environment === 'SPACE_FLIGHT' && current.spaceFlight?.vehiclePresentation === 'pathfinder-pod';
  }, null, { timeout: 120_000 });
  await page.waitForTimeout(1_200);
  await capture('05-pathfinder-rendezvous.png');

  const dockingSetup = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.positionSpacecraftAtSolisReachDock?.(0);
    ctx.spaceFlight.velocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
    const expeditionDock = ctx.getExpeditionPodDockingTarget?.() || null;
    const basicDock = ctx.getSolisReachDockTarget?.() || null;
    return {
      session: ctx.getSpaceTravelSession?.() || null,
      destination: ctx.spaceFlight.destination || null,
      expeditionDock: expeditionDock ? {
        distance: expeditionDock.distance,
        relativeSpeed: expeditionDock.relativeSpeed,
        canDock: expeditionDock.canDock
      } : null,
      basicDock: basicDock ? {
        radius: basicDock.radius,
        distance: ctx.spaceFlight.rocket.position.distanceTo(basicDock.position)
      } : null,
      positioned: Boolean(ctx.positionSpacecraftAtSolisReachDock?.(0))
    };
  });
  console.log('DOCKING_SETUP', JSON.stringify(dockingSetup));
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10_000 });
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true, null, { timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const interiorBeforeMove = await state();
  await capture('06-returned-ship-interior.png');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(200);
  const interiorAfterMove = await state();
  const interiorVisual = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const snapshot = ctx.getShipInteriorSnapshot?.() || null;
    const root = ctx.scene.getObjectByName('expedition-ship:solis-reach');
    let visibleMeshes = 0;
    root?.traverse?.((child) => { if (child.isMesh && child.visible !== false) visibleMeshes += 1; });
    return {
      snapshot,
      rootPresent: Boolean(root),
      rootVisible: root?.visible !== false,
      visibleMeshes,
      worldCanvasDisplay: getComputedStyle(document.querySelector('canvas')).display,
      bodyClasses: document.body.className,
      walker: ctx.Walk?.state?.walker ? {
        x: ctx.Walk.state.walker.x,
        y: ctx.Walk.state.walker.y,
        z: ctx.Walk.state.walker.z
      } : null
    };
  });
  assert.equal(interiorVisual.snapshot?.active, true, JSON.stringify(interiorVisual));
  assert.equal(interiorVisual.rootPresent, true, JSON.stringify(interiorVisual));
  assert.ok(interiorVisual.visibleMeshes > 50, JSON.stringify(interiorVisual));
  const beforePlayer = interiorBeforeMove.expeditionShipInterior?.player;
  const afterPlayer = interiorAfterMove.expeditionShipInterior?.player;
  assert.ok(beforePlayer && afterPlayer, 'Ship interior player snapshots are required.');
  assert.ok(Math.hypot(afterPlayer.x - beforePlayer.x, afterPlayer.z - beforePlayer.z) > 0.05, JSON.stringify({ beforePlayer, afterPlayer }));

  const report = {
    ok: pageErrors.length === 0 && failedLocalResources.length === 0,
    approach,
    surfaceAudit,
    driven,
    dockingSetup,
    interiorBeforeMove,
    interiorAfterMove,
    interiorVisual,
    pageErrors,
    failedLocalResources
  };
  await writeFile(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
}
