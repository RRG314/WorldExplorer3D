import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const bodyId = String(process.env.WE3D_SPACE_DESTINATION || 'mercury').trim().toLowerCase();
const bodyName = bodyId[0].toUpperCase() + bodyId.slice(1);
const supportedSolidBodies = Object.freeze([
  'moon', 'mercury', 'venus', 'mars', 'io', 'europa', 'titan', 'enceladus',
  'triton', 'ceres', 'vesta', 'pluto'
]);
assert.ok(supportedSolidBodies.includes(bodyId), `Unsupported solid-planet browser journey: ${bodyId}`);
const returnControlSelector = bodyId === 'mars'
  ? '#marsReturnEarthBtn'
  : bodyId === 'moon'
    ? '#returnToEarthBtn'
    : '#solidWorldReturnBtn';
const mobile = process.env.WE3D_VERIFY_VIEWPORT === 'mobile';
const viewportLabel = mobile ? 'mobile' : 'desktop';
const evidenceDir = path.resolve('output/verification/solid-planet-landings');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  isMobile: mobile,
  hasTouch: mobile
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) errors.push(`request failed: ${request.url()}`);
});

try {
  await page.addInitScript(() => {
    localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({ version: 4, started: true, completed: true, skipped: false, stage: 'done' }));
  });
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 180_000 });
  await page.selectOption('#spaceDestinationSelect', bodyId);
  await page.waitForFunction((target) => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.destinationBodyId === target, bodyId);
  if (!await page.locator('#sfAssistBtn').isVisible() && await page.locator('#sfHudToggle').isVisible()) {
    await page.locator('#sfHudToggle').click();
  }
  await page.locator('#sfAssistBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.assist?.active === true);

  const approach = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    let minimumForwardDot = 1;
    for (let frame = 0; frame < 2_000 && ctx.spaceJourney?.phase !== 'approach'; frame += 1) {
      const prior = ctx.spaceFlight.rocket.position.clone();
      ctx.updateRenderedSpaceJourney?.({ realDtS: 0.1 });
      const motion = ctx.spaceFlight.rocket.position.clone().sub(prior);
      if (motion.lengthSq() > 1e-8 && ctx.spaceJourneyAssistState?.active) {
        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.spaceFlight.rocket.quaternion).normalize();
        minimumForwardDot = Math.min(minimumForwardDot, forward.dot(motion.normalize()));
      }
    }
    return { phase: ctx.spaceJourney?.phase, minimumForwardDot };
  });
  assert.equal(approach.phase, 'approach', `${bodyName} did not reach approach.`);
  assert.ok(approach.minimumForwardDot > 0.98, `${bodyName} assisted travel moved backward relative to the ship.`);
  await page.waitForFunction((name) => document.getElementById('sfLandBtn')?.textContent?.includes(`LAND ON ${name.toUpperCase()}`) && document.getElementById('sfLandBtn')?.disabled === false, bodyName);
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction((target) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    if (target === 'mars') return state.environment === 'MARS';
    if (target === 'moon') return state.environment === 'MOON';
    return state.environment === 'PLANETARY';
  }, bodyId, { timeout: 120_000 });
  await page.waitForFunction((selector) => {
    const control = document.querySelector(selector);
    return !!control && getComputedStyle(control).display !== 'none' && control.getBoundingClientRect().width > 0;
  }, returnControlSelector, { timeout: 120_000 });
  const surface = await page.evaluate(async ({ target, returnSelector }) => {
    const [{ ctx }, { planetarySurfaceYAtRenderXZ }] = await Promise.all([
      import('/app/js/shared-context.js?v=55'),
      import('/app/js/planetary/runtime/surface-query.js?v=3')
    ]);
    const position = ctx.Walk?.state?.mode === 'walk'
      ? ctx.Walk.state.walker
      : ctx.car;
    const groundY = planetarySurfaceYAtRenderXZ(ctx, position?.x || 0, position?.z || 0, { bodyId: target });
    const returnControl = document.querySelector(returnSelector);
    const returnStyle = returnControl ? getComputedStyle(returnControl) : null;
    return {
      environment: ctx.currentEnvironment,
      activePlanetaryBodyId: ctx.activePlanetaryBodyId || (ctx.onMars ? 'mars' : ctx.onMoon ? 'moon' : null),
      positionY: Number(position?.y || 0),
      groundY: Number.isFinite(groundY) ? groundY : null,
      surfaceVisible: target === 'mars'
        ? Array.isArray(ctx.marsObjects) && ctx.marsObjects.some((object) => object?.visible !== false)
        : target === 'moon'
          ? ctx.moonSurface?.visible === true
          : ctx.activeSolidWorldSurface?.visible === true,
      returnControlVisible: !!returnControl && returnStyle.display !== 'none' && returnStyle.visibility !== 'hidden' && returnControl.getBoundingClientRect().width > 0,
      returnControlDisplay: returnStyle?.display || null
    };
  }, { target: bodyId, returnSelector: returnControlSelector });
  assert.equal(surface.activePlanetaryBodyId, bodyId, JSON.stringify(surface));
  assert.equal(surface.surfaceVisible, true, JSON.stringify(surface));
  assert.equal(surface.returnControlVisible, true, JSON.stringify(surface));
  if (surface.groundY != null) assert.ok(surface.positionY >= surface.groundY - 0.25, JSON.stringify(surface));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidenceDir, `${bodyId}-${viewportLabel}-playable-surface.png`), fullPage: true });
  await page.locator(returnControlSelector).click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').surfacePodLaunch?.awaitingLaunchInput === true, null, { timeout: 15_000 });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => (JSON.parse(globalThis.render_game_to_text?.() || '{}').surfacePodLaunch?.altitude || 0) > 2, null, { timeout: 10_000 });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true && state.spaceFlight?.travelSession?.phase === 'rendezvous';
  }, null, { timeout: 120_000 });
  const rendezvous = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getSolisReachDockTarget?.();
    const craft = ctx.spaceFlight?.rocket;
    const camera = ctx.spaceFlight?.camera;
    const projected = craft?.position?.clone?.().project?.(camera);
    const projectedTarget = target?.position?.clone?.().project?.(camera);
    const courseCue = document.getElementById('universeCourseCue');
    const courseCueVisible = courseCue?.hidden === false;
    const courseCueText = courseCue?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      destination: ctx.getSpaceTravelSession?.()?.destination?.name || null,
      activeCraftId: ctx.getSpaceTravelSession?.()?.activeCraftId || null,
      targetVisible: target?.mesh?.visible === true,
      targetDistance: Number(target?.distance),
      craftInView: projected ? Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1 : false,
      targetInView: projectedTarget ? Math.abs(projectedTarget.x) <= 1 && Math.abs(projectedTarget.y) <= 1 && projectedTarget.z >= -1 && projectedTarget.z <= 1 : false,
      courseCueVisible,
      courseCueText,
      stalePlanetCourseVisible: courseCueVisible && !/Solis Reach/i.test(courseCueText),
      universeCourseDestinationId: ctx.getUniverseCourseSnapshot?.()?.courseDestinationId || null
    };
  });
  assert.equal(rendezvous.destination, 'Solis Reach', JSON.stringify(rendezvous));
  assert.equal(rendezvous.activeCraftId, 'pathfinder-pod', JSON.stringify(rendezvous));
  assert.equal(rendezvous.targetVisible, true, JSON.stringify(rendezvous));
  assert.equal(rendezvous.craftInView, true, JSON.stringify(rendezvous));
  assert.equal(rendezvous.stalePlanetCourseVisible, false, JSON.stringify(rendezvous));
  assert.equal(rendezvous.universeCourseDestinationId, null, JSON.stringify(rendezvous));
  assert.equal(rendezvous.targetInView || (rendezvous.courseCueVisible && /Solis Reach/i.test(rendezvous.courseCueText)), true, JSON.stringify(rendezvous));
  await page.screenshot({ path: path.join(evidenceDir, `${bodyId}-${viewportLabel}-return-rendezvous.png`), fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    bodyId,
    checks: {
      assistedCraftFacesTravelDirection: approach.minimumForwardDot > 0.98,
      landingCompletedThroughGameButton: true,
      playableSurfaceVisible: surface.surfaceVisible,
      returnJourneyAvailable: surface.returnControlVisible,
      returnLaunchReachedSolis: rendezvous.destination === 'Solis Reach' && rendezvous.targetVisible,
      playerNotBelowSurface: surface.groundY == null || surface.positionY >= surface.groundY - 0.25,
      noBrowserErrors: errors.length === 0
    },
    approach,
    surface,
    rendezvous
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
