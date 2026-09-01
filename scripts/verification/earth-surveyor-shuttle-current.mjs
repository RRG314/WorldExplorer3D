import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/earth-surveyor-shuttle');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function startEarth(page) {
  await page.goto(`${baseUrl}/app/?diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
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

async function seedExpedition(page) {
  return page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=8'),
      import('/app/js/expedition/store.js?v=8')
    ]);
    const expedition = createExpeditionPlan({
      destinationId: 'proxima-centauri',
      crew: DEFAULT_CREW,
      id: 'earth-surveyor-shuttle-verification',
      createdAtMs: 91_000
    });
    createExpeditionStore().save(expedition);
    return { id: expedition.id, state: expedition.state, readiness: expedition.readiness.status };
  });
}

async function openEarthExpedition(page) {
  await page.evaluate(() => document.getElementById('fSpaceSurveyor')?.click());
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionEarthPod').waitFor({ state: 'visible' });
}

async function placeAtDockingRange(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getExpeditionSurveyorDockTarget();
    const approachDirection = target.approachDirection.clone().normalize();
    ctx.spaceFlight.rocket.position.copy(target.position).addScaledVector(approachDirection, target.radius + 8);
    ctx.spaceFlight.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), approachDirection.clone().negate());
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
    return { name: target.name, radius: target.radius, childCount: target.mesh.children.length };
  });
}

async function dockWithSurveyor(page) {
  const target = await placeAtDockingRange(page);
  assert.equal(target.name, 'Surveyor');
  assert.ok(target.childCount >= 20, JSON.stringify(target));
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.textContent?.includes('DOCK WITH SURVEYOR') && document.getElementById('sfLandBtn')?.disabled === false);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDir, 'desktop-surveyor-docking-approach.png'), fullPage: true });
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true, null, { timeout: 15_000 });
}

async function enterPodBay(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.keyboard.press('KeyE');
  await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 4.8, z: -28.4, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.waitForTimeout(220);
  await page.keyboard.press('KeyE');
  await page.locator('[data-pod-earth]').waitFor({ state: 'visible' });
}

async function approachEarthAndLand(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const earth = ctx.spaceFlight.earth;
    const outward = new THREE.Vector3(0.62, 0.48, 0.62).normalize();
    ctx.spaceFlight.rocket.position.copy(earth.position).addScaledVector(outward, 130);
    ctx.spaceFlight.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward.clone().negate());
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
  });
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.textContent?.includes('LAND ON EARTH') && document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDir, 'desktop-earth-pod-approach.png'), fullPage: true });
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'EARTH' && !state.worldLoading && state.interstellarExpedition?.podJourney?.phase === 'surface';
  }, null, { timeout: 120_000 });
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await startEarth(page);
    const earthBefore = await snapshot(page);
    const earthLocationBefore = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return { selLoc: String(ctx.selLoc || ''), name: String(ctx.customLoc?.name || ctx.LOCS?.[ctx.selLoc]?.name || '') };
    });
    const expedition = await seedExpedition(page);
    assert.equal(expedition.readiness, 'ready');

    await openEarthExpedition(page);
    assert.match(await page.locator('#expeditionEarthPod').textContent(), /Launch Pathfinder to Surveyor/i);
    await page.locator('#expeditionEarthPod').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.modes?.space === true && state.interstellarExpedition?.podJourney?.phase === 'rendezvous';
    }, null, { timeout: 120_000 });
    const outbound = await snapshot(page);
    const firstJourneyId = outbound.interstellarExpedition.podJourney.id;
    assert.equal(outbound.interstellarExpedition.podJourney.routeKind, 'earth-shuttle');
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.spaceFlight.rocket.getObjectByName('Surveyor Pathfinder Pod')?.visible === true
        && ctx.getExpeditionSurveyorDockTarget()?.mesh?.visible === true;
    }), true);
    const beforeThrust = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.spaceFlight.rocket.position.toArray();
    });
    await page.keyboard.down('Space');
    await page.waitForTimeout(450);
    await page.keyboard.up('Space');
    const afterThrust = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.spaceFlight.rocket.position.toArray();
    });
    assert.notDeepEqual(afterThrust, beforeThrust, 'Manual pod throttle did not move Pathfinder.');
    await dockWithSurveyor(page);
    assert.equal((await snapshot(page)).interstellarExpedition.podJourney.phase, 'recovered');

    await enterPodBay(page);
    await page.locator('[data-pod-earth]').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.modes?.space === true && state.interstellarExpedition?.podJourney?.phase === 'local_flight';
    }, null, { timeout: 15_000 });
    const earthbound = await snapshot(page);
    const returnJourneyId = earthbound.interstellarExpedition.podJourney.id;
    assert.notEqual(returnJourneyId, firstJourneyId);
    await approachEarthAndLand(page);
    const landed = await snapshot(page);
    assert.equal(landed.interstellarExpedition.podJourney.id, returnJourneyId);
    assert.equal(landed.interstellarExpedition.podJourney.phase, 'surface');
    assert.equal(landed.environment, 'EARTH');
    const earthLocationAfter = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return { selLoc: String(ctx.selLoc || ''), name: String(ctx.customLoc?.name || ctx.LOCS?.[ctx.selLoc]?.name || '') };
    });
    assert.deepEqual(earthLocationAfter, earthLocationBefore);

    await openEarthExpedition(page);
    assert.match(await page.locator('#expeditionEarthPod').textContent(), /Return to Surveyor/i);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#expeditionEarthPod').scrollIntoViewIfNeeded();
    const mobileButton = await page.locator('#expeditionEarthPod').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(mobileButton.left >= 0 && mobileButton.right <= mobileButton.width && mobileButton.top >= 0 && mobileButton.bottom <= mobileButton.height, JSON.stringify(mobileButton));
    await page.screenshot({ path: path.join(outputDir, 'mobile-earth-return-to-surveyor.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#expeditionEarthPod').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.podJourney?.phase === 'rendezvous', null, { timeout: 120_000 });
    assert.equal((await snapshot(page)).interstellarExpedition.podJourney.id, returnJourneyId);
    await dockWithSurveyor(page);
    const final = await snapshot(page);
    assert.equal(final.interstellarExpedition.podJourney.phase, 'recovered');
    assert.equal(final.expeditionShipInterior.active, true);
    return { firstJourneyId, returnJourneyId, finalPhase: final.interstellarExpedition.podJourney.phase, earthSelection: earthLocationBefore, initialEnvironment: earthBefore.environment };
  } finally {
    await context.close();
  }
}

let result = null;
try {
  result = await run();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
