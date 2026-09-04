import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const destinationBodyId = String(process.env.WE3D_SPACE_DESTINATION || 'jupiter').trim().toLowerCase();
const destinationLabel = destinationBodyId[0].toUpperCase() + destinationBodyId.slice(1);
const mobile = process.env.WE3D_VERIFY_VIEWPORT === 'mobile';
const viewportLabel = mobile ? 'mobile' : 'desktop';
const evidenceDir = path.resolve('output/verification/space-landing-continuity');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  isMobile: mobile,
  hasTouch: mobile
});
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) failedLocalResources.push({ status: response.status(), url: response.url() });
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

  await page.selectOption('#spaceDestinationSelect', destinationBodyId);
  await page.waitForFunction((bodyId) => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.destinationBodyId === bodyId, destinationBodyId);
  if (!await page.locator('#sfAssistBtn').isVisible() && await page.locator('#sfHudToggle').isVisible()) {
    await page.locator('#sfHudToggle').click();
  }
  await page.locator('#sfAssistBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.assist?.active === true);

  const advanced = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    let minimumForwardDot = 1;
    for (let frame = 0; frame < 2_000 && ctx.spaceJourney?.phase !== 'approach'; frame += 1) {
      const before = ctx.spaceFlight.rocket.position.clone();
      ctx.updateRenderedSpaceJourney?.({ realDtS: 0.1 });
      const motion = ctx.spaceFlight.rocket.position.clone().sub(before);
      if (motion.lengthSq() > 1e-8 && ctx.spaceJourneyAssistState?.active) {
        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.spaceFlight.rocket.quaternion).normalize();
        minimumForwardDot = Math.min(minimumForwardDot, forward.dot(motion.normalize()));
      }
    }
    return {
      phase: ctx.spaceJourney?.phase || null,
      assist: ctx.spaceJourneyAssistState || null,
      lastCelestialContact: ctx.spaceFlight?.lastCelestialContact || null,
      lastCelestialAvoidance: ctx.spaceFlight?.lastCelestialAvoidance || null,
      minimumForwardDot
    };
  });
  assert.equal(advanced.phase, 'approach', `Assisted ${destinationLabel} course stopped: ${JSON.stringify(advanced)}.`);
  assert.ok(advanced.minimumForwardDot > 0.98, `Assisted flight moved backward relative to the craft: ${JSON.stringify(advanced)}.`);
  const before = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      journeyId: ctx.spaceJourney?.journeyId,
      phase: ctx.spaceJourney?.phase,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId,
      activeCraftId: ctx.getSpaceTravelSession?.()?.activeCraftId,
      pathfinderActive: ctx.spaceFlight?.rocket?.userData?.spaceCraftId === 'pathfinder-pod',
      landingButtonText: document.getElementById('sfLandBtn')?.textContent?.trim() || '',
      landingButtonDisabled: document.getElementById('sfLandBtn')?.disabled === true,
      altitudeM: ctx.spacecraftState && ctx.spaceJourneyEphemeris?.destination
        ? Math.hypot(
            ctx.spacecraftState.positionM.x - ctx.spaceJourneyEphemeris.destination.positionM.x,
            ctx.spacecraftState.positionM.y - ctx.spaceJourneyEphemeris.destination.positionM.y,
            ctx.spacecraftState.positionM.z - ctx.spaceJourneyEphemeris.destination.positionM.z
          ) - ctx.spaceJourneyEphemeris.destination.radiusM
        : null
    };
  });
  assert.match(before.landingButtonText, new RegExp(`ENTER ${destinationLabel} ATMOSPHERE`, 'i'), JSON.stringify(before));
  assert.equal(before.landingButtonDisabled, false, JSON.stringify(before));
  await page.screenshot({ path: path.join(evidenceDir, `01-${destinationBodyId}-${viewportLabel}-entry-ready.png`) });
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.phase === 'atmospheric_exploration');
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1100);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  const after = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      journeyId: ctx.spaceJourney?.journeyId,
      phase: ctx.spaceJourney?.phase,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId,
      activeCraftId: ctx.getSpaceTravelSession?.()?.activeCraftId,
      pathfinderActive: ctx.spaceFlight?.rocket?.userData?.spaceCraftId === 'pathfinder-pod',
      shipInteriorActive: ctx.getShipInteriorSnapshot?.()?.active === true,
      horizontalSpeedMps: ctx.spaceAtmosphereExploration?.horizontalSpeedMps || 0,
      groundTrackM: ctx.spaceAtmosphereExploration?.groundTrackM || 0,
      atmosphereVisible: ctx.spaceFlight?.atmosphericPresentation?.group?.visible !== false,
      celestialCatalogHidden: ctx.spaceFlight?.celestialCatalog?.group?.visible === false,
      visibleGanymedeNodes: (() => {
        const found = [];
        ctx.spaceFlight?.scene?.traverse?.((object) => {
          if (!String(object?.name || '').toLowerCase().includes('ganymede')) return;
          const chain = [];
          let cursor = object;
          let effectivelyVisible = true;
          while (cursor) {
            chain.push(`${cursor.name || cursor.type}:${cursor.visible}`);
            if (cursor.visible === false) effectivelyVisible = false;
            cursor = cursor.parent;
          }
          found.push({ name: object.name, effectivelyVisible, chain });
        });
        return found;
      })(),
      craftInView: (() => {
        const projected = ctx.spaceFlight?.rocket?.position?.clone?.().project?.(ctx.spaceFlight?.camera);
        return projected ? Math.abs(projected.x) <= 0.8 && Math.abs(projected.y) <= 0.8 && projected.z >= -1 && projected.z <= 1 : false;
      })()
    };
  });
  await page.screenshot({ path: path.join(evidenceDir, `02-${destinationBodyId}-${viewportLabel}-atmospheric-flight.png`) });

  assert.equal(before.destinationBodyId, destinationBodyId);
  assert.equal(before.phase, 'approach');
  assert.equal(before.activeCraftId, 'solis-reach');
  assert.equal(before.pathfinderActive, false);
  assert.equal(after.journeyId, before.journeyId, 'Planet entry replaced the active journey.');
  assert.equal(after.destinationBodyId, destinationBodyId);
  assert.equal(after.phase, 'atmospheric_exploration');
  assert.equal(after.shipInteriorActive, false, 'Planet entry opened the starship interior.');
  assert.equal(after.activeCraftId, 'pathfinder-pod');
  assert.equal(after.pathfinderActive, true, 'Atmospheric descent did not hand flight from Solis Reach to Pathfinder.');
  assert.ok(after.horizontalSpeedMps > 0, JSON.stringify(after));
  assert.ok(after.groundTrackM > 0, JSON.stringify(after));
  assert.equal(after.atmosphereVisible, true, JSON.stringify(after));
  assert.equal(after.celestialCatalogHidden, true, JSON.stringify(after));
  assert.equal(after.craftInView, true, JSON.stringify(after));
  if (!await page.locator('#sfLandBtn').isVisible() && await page.locator('#sfHudToggle').isVisible()) {
    await page.locator('#sfHudToggle').click();
  }
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.phase === 'ascent');
  await page.waitForTimeout(250);
  const departure = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      phase: ctx.spaceJourney?.phase || null,
      atmosphereReleased: !ctx.spaceFlight?.atmosphericPresentation,
      celestialCatalogRestored: ctx.spaceFlight?.celestialCatalog?.group?.visible !== false,
      activeCraftId: ctx.getSpaceTravelSession?.()?.activeCraftId || null
    };
  });
  assert.equal(departure.atmosphereReleased, true, JSON.stringify(departure));
  assert.equal(departure.celestialCatalogRestored, true, JSON.stringify(departure));
  assert.equal(departure.activeCraftId, 'pathfinder-pod', JSON.stringify(departure));
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedLocalResources, []);
  console.log(JSON.stringify({
    ok: true,
    checks: {
      courseReachedDestinationApproach: true,
      assistedCraftFacesTravelDirection: advanced.minimumForwardDot > 0.98,
      planetEntryPreservedJourney: after.journeyId === before.journeyId,
      gasGiantOpenedAtmosphericFlight: after.phase === 'atmospheric_exploration',
      planetEntryDidNotOpenShipInterior: after.shipInteriorActive === false,
      starshipTravelHandsDescentToPathfinder: after.activeCraftId === 'pathfinder-pod' && after.pathfinderActive === true,
      playerControlsMoveAcrossAtmosphere: after.horizontalSpeedMps > 0 && after.groundTrackM > 0,
      atmosphericVolumeReplacesOrbitalBackdrop: after.atmosphereVisible && after.celestialCatalogHidden,
      pathfinderRemainsInView: after.craftInView,
      atmosphereDepartureRestoresSpace: departure.atmosphereReleased && departure.celestialCatalogRestored,
      noBrowserErrors: true,
      noFailedLocalResources: true
    },
    before,
    after,
    departure
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
