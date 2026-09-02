import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const freeFlightOnly = process.argv.includes('--free-flight-only');
const pathfinderOnly = process.argv.includes('--pathfinder-only');
const outputDir = path.resolve('output/verification/space-travel-coherence');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function startEarth(page) {
  await page.goto(`${baseUrl}/app/?diagnostics=1&coherence=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  if (await page.locator('#globeLocationSearch').isVisible()) {
    await page.locator('#globeLocationSearch').fill('Baltimore, Maryland');
    await page.locator('#globeLocationSearchBtn').click();
    const result = page.locator('#globeLocationSearchResults [role="option"]').first();
    await result.waitFor({ state: 'visible', timeout: 30_000 });
    await result.click();
    await page.locator('#globeSelectorStartBtn').click();
  } else {
    await page.locator('#startBtn').click();
  }
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.gameStarted && !state.worldLoading && state.environment === 'EARTH';
  }, null, { timeout: 120_000 });
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 120_000 });
}

async function saveIncompleteExpedition(page) {
  return page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=11'),
      import('/app/js/expedition/store.js?v=11')
    ]);
    const expedition = createExpeditionPlan({
      destinationId: 'proxima-centauri',
      crew: DEFAULT_CREW,
      id: 'coherence-incomplete-expedition',
      resources: {
        foodKg: 0, waterKg: 0, powerMWh: 0, propellantKg: 0,
        medicalUnits: 0, maintenanceKg: 0, feedstockKg: 0,
        scienceCargoKg: 0, processingResidueKg: 0
      }
    });
    createExpeditionStore().save(expedition);
    return expedition.readiness.status;
  });
}

async function verifyPathfinderAndInterior(page) {
  assert.equal(await saveIncompleteExpedition(page), 'insufficient');
  await page.locator('#exploreBtn').click();
  await page.waitForTimeout(1_500);
  assert.equal(await page.locator('#exploreMenu').evaluate((menu) => menu.classList.contains('open')), true, 'Exploration menu flickered closed without player input.');
  const copy = await page.locator('#exploreMenu .floatItems').textContent();
  assert.match(copy, /Deploy Pathfinder Pod/i);
  assert.match(copy, /Board Solis Reach/i);
  assert.match(copy, /Free Space Flight/i);
  assert.doesNotMatch(copy, /Fly with Wayfinder|Board Asteria/i);

  await page.locator('#fDeployPathfinder').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').stagedEarthPathfinder?.active === true, null, { timeout: 15_000 });
  const staged = await snapshot(page);
  assert.equal(staged.interstellarExpedition?.readiness?.status, 'insufficient');
  assert.equal(staged.stagedEarthPathfinder?.active, true);
  const stagedPresentation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const pod = ctx.earthSceneRoot?.getObjectByName('expedition-surface-launch-pod:earth');
    if (!pod) return null;
    pod.updateMatrixWorld(true);
    ctx.camera.updateMatrixWorld(true);
    ctx.camera.updateProjectionMatrix();
    const world = new THREE.Vector3();
    pod.getWorldPosition(world);
    const projected = world.clone().project(ctx.camera);
    const groundY = Number(pod.userData?.surfaceGroundY);
    const collision = ctx.checkBuildingCollision?.(world.x, world.z, 2.2, {
      actorBaseY: groundY,
      actorHeight: 8.5
    });
    return {
      walkMode: ctx.Walk?.state?.mode,
      projected: projected.toArray(),
      inFront: projected.z > -1 && projected.z < 1,
      inViewport: Math.abs(projected.x) < 0.82 && Math.abs(projected.y) < 0.82,
      buildingCollision: collision?.collision === true,
      menuLabel: document.getElementById('fDeployPathfinder')?.textContent?.trim() || ''
    };
  });
  assert.equal(stagedPresentation?.walkMode, 'walk');
  assert.equal(stagedPresentation?.inFront, true, JSON.stringify(stagedPresentation));
  assert.equal(stagedPresentation?.inViewport, true, JSON.stringify(stagedPresentation));
  assert.equal(stagedPresentation?.buildingCollision, false, JSON.stringify(stagedPresentation));
  assert.match(stagedPresentation?.menuLabel || '', /Pathfinder Ready Nearby/i);
  await page.screenshot({ path: path.join(outputDir, 'pathfinder-staged-from-incomplete-expedition.png'), fullPage: true });

  await page.evaluate(() => document.getElementById('fBoardSolisReach')?.click());
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true, null, { timeout: 120_000 });
  await page.waitForTimeout(4_000);
  const interior = await snapshot(page);
  assert.equal(interior.interstellarExpedition?.ship?.name, 'Solis Reach');
  assert.equal(interior.expeditionShipInterior?.active, true);
  assert.ok(interior.expeditionShipInterior?.crewActors?.length >= 5, JSON.stringify(interior.expeditionShipInterior));
  const presentation = await page.evaluate(async () => {
    const [{ ctx }, { SHIP_DOORS }] = await Promise.all([
      import('/app/js/shared-context.js?v=55'),
      import('/app/js/expedition/ship-layout.js?v=5')
    ]);
    const actors = ctx.getShipInteriorSnapshot?.()?.crewActors || [];
    const stationaryAtDoor = actors.filter((actor) => {
      if (actor.moving) return false;
      return SHIP_DOORS.some((door) => Math.hypot(actor.x - door.x, actor.z - door.z) < 0.48);
    });
    return {
      rocketName: String(ctx.spaceFlight.rocket?.name || ''),
      rocketScale: Number(ctx.spaceFlight.rocket?.scale?.x || 0),
      starshipActive: ctx.spaceFlight.rocket?.userData?.spaceCraftId === 'solis-reach',
      pathfinderNestedInsideStarship: !!ctx.spaceFlight.rocket?.getObjectByName('Pathfinder Flight Pod'),
      stationaryAtDoor,
      crewActors: actors
    };
  });
  assert.match(presentation.rocketName, /Solis Reach/);
  assert.equal(presentation.rocketScale, 1.45);
  assert.equal(presentation.starshipActive, true);
  assert.equal(presentation.pathfinderNestedInsideStarship, false);
  assert.deepEqual(presentation.stationaryAtDoor, []);
  const cameraEvidence = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const candidates = [];
    for (let z = 25.5; z <= 32.5; z += 0.5) {
      for (let x = -1.5; x <= 1.5; x += 0.5) candidates.push({ x, z });
    }
    const clear = candidates.find((point) => ctx.checkBuildingCollision?.(point.x, point.z, 0.32, {
      actorBaseY: 0.05,
      actorHeight: 1.9
    })?.collision !== true);
    if (!clear) return false;
    ctx.Walk.state.view = 'third';
    Object.assign(ctx.Walk.state.walker, {
      x: clear.x,
      y: 1.7,
      z: clear.z,
      angle: 0,
      yaw: 0,
      lookYawOffset: 0,
      pitch: 0,
      vy: 0,
      onGround: true
    });
    return true;
  });
  assert.equal(cameraEvidence, true);
  await page.waitForTimeout(900);
  const collisionEvidence = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const camera = ctx.camera;
    const collision = ctx.checkBuildingCollision?.(camera.position.x, camera.position.z, 0.18, {
      actorBaseY: camera.position.y - 0.24,
      actorHeight: 0.48
    });
    return {
      camera: camera.position.toArray(),
      collision: collision?.collision === true,
      visibleCrew: ctx.getShipInteriorSnapshot?.()?.crewActors?.filter((actor) => actor.deckId === 'command') || []
    };
  });
  assert.equal(collisionEvidence.collision, false, JSON.stringify(collisionEvidence));
  assert.ok(collisionEvidence.visibleCrew.length >= 1, JSON.stringify(collisionEvidence));
  await page.screenshot({ path: path.join(outputDir, 'solis-reach-interior-crew.png'), fullPage: true });
  return { staged: staged.stagedEarthPathfinder, stagedPresentation, presentation, collisionEvidence };
}

async function verifyFreeFlight(page) {
  await page.locator('#exploreBtn').click();
  await page.locator('#fSpaceRocket').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true && state.spaceFlight?.controlMode === 'flying';
  }, null, { timeout: 120_000 });
  const before = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      position: ctx.spaceFlight.rocket.position.toArray(),
      journey: ctx.spaceJourney || null,
      presentationAuthority: ctx.spaceFlight.presentationAuthority
    };
  });
  assert.equal(before.journey, null, 'Free flight started a Wayfinder journey before the player selected a course.');
  await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  await page.keyboard.up('Space');
  const afterThrottle = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      position: ctx.spaceFlight.rocket.position.toArray(),
      quaternion: ctx.spaceFlight.rocket.quaternion.toArray()
    };
  });
  assert.notDeepEqual(afterThrottle.position, before.position, 'Classic free-flight throttle did not move the starship.');

  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(350);
  const afterTurn = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.spaceFlight.rocket.quaternion).normalize();
    const localUp = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.spaceFlight.rocket.quaternion).normalize();
    const velocity = ctx.spaceFlight.velocity.clone().normalize();
    const cameraOffset = ctx.spaceFlight.camera.position.clone().sub(ctx.spaceFlight.rocket.position);
    return {
      position: ctx.spaceFlight.rocket.position.toArray(),
      quaternion: ctx.spaceFlight.rocket.quaternion.toArray(),
      forwardAlignment: velocity.dot(forward),
      cameraTrailingDistance: -cameraOffset.dot(forward),
      cameraUpAlignment: ctx.spaceFlight.camera.up.clone().normalize().dot(localUp),
      cameraModeButtonPresent: Boolean(document.getElementById('sfCameraBtn')),
      activeCraftId: ctx.getActiveSpaceCraftId?.(),
      craftName: ctx.spaceFlight.rocket?.name || ''
    };
  });
  assert.notDeepEqual(afterTurn.quaternion, afterThrottle.quaternion, 'Arrow steering did not turn the starship.');
  assert.ok(afterTurn.forwardAlignment > 0.94, JSON.stringify(afterTurn));
  assert.ok(afterTurn.cameraTrailingDistance > 30, JSON.stringify(afterTurn));
  assert.ok(afterTurn.cameraUpAlignment > 0.94, JSON.stringify(afterTurn));
  assert.equal(afterTurn.cameraModeButtonPresent, false, 'An added Space camera-mode control replaced the 5.1 chase view.');
  assert.equal(afterTurn.activeCraftId, 'solis-reach');
  assert.match(afterTurn.craftName, /Solis Reach/);
  await page.screenshot({ path: path.join(outputDir, 'free-space-flight.png'), fullPage: true });
  return { before, afterThrottle, afterTurn };
}

const failures = [];
const pageErrors = [];
let result = null;
try {
  let pathfinder = null;
  if (!freeFlightOnly) {
    const pathfinderContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pathfinderPage = await pathfinderContext.newPage();
    pathfinderPage.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
    await startEarth(pathfinderPage);
    pathfinder = await verifyPathfinderAndInterior(pathfinderPage);
    await pathfinderContext.close();
  }

  let freeFlight = null;
  if (!pathfinderOnly) {
    const freeFlightContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const freeFlightPage = await freeFlightContext.newPage();
    freeFlightPage.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
    await startEarth(freeFlightPage);
    freeFlight = await verifyFreeFlight(freeFlightPage);
    await freeFlightContext.close();
  }
  result = { pathfinder, freeFlight };
} catch (error) {
  failures.push(String(error?.stack || error));
} finally {
  await browser.close();
}

failures.push(...pageErrors);
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
