import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-surface-operation');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function state(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
    await page.locator('#sfHudToggle').click();
  }
}

async function seedJourney(page) {
  return page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, simulation, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=6'),
      import('/app/js/expedition/simulation.js?v=5'),
      import('/app/js/expedition/store.js?v=6')
    ]);
    let expedition = createExpeditionPlan({
      destinationId: 'proxima-centauri',
      crew: DEFAULT_CREW,
      id: 'surface-operation-verification',
      createdAtMs: 42_000
    });
    expedition = simulation.startExpedition(expedition, 42_100);
    while (expedition.state === 'traveling' && !expedition.routeContacts.some((contact) => contact.localOperationState === 'available')) {
      expedition = simulation.advanceToNextMilestone(expedition);
      if (expedition.pendingEvent) {
        const choice = expedition.pendingEvent.options.find((option) => option.enabled);
        expedition = simulation.resolveExpeditionEvent(expedition, choice.id);
      }
    }
    expedition = {
      ...expedition,
      systems: { ...expedition.systems, thermal: { condition: 0.5, status: 'degraded' } },
      resources: { ...expedition.resources, feedstockKg: 22, maintenanceKg: 0, processingResidueKg: 0 },
      materialLedger: { installedRepairKg: 0 }
    };
    createExpeditionStore().save(expedition);
    return expedition;
  });
}

async function run(viewport, name) {
  const context = await browser.newContext({ viewport, hasTouch: name === 'mobile' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.stack || error}`));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${name} ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`${name} failed ${request.url()}`);
  });

  try {
    await openSpace(page);
    const seeded = await seedJourney(page);
    const contact = seeded.routeContacts.find((entry) => entry.localOperationState === 'available');
    assert.ok(contact);
    const cargoBefore = Number(seeded.resources.scienceCargoKg);
    const trackedMaterialBefore = Number(seeded.resources.feedstockKg) + Number(seeded.resources.maintenanceKg)
      + Number(seeded.resources.scienceCargoKg) + Number(seeded.resources.processingResidueKg || 0)
      + Number(seeded.materialLedger.installedRepairKg || 0);

    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator(`[data-enter-contact="${contact.id}"]`).click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.localOperation?.recoveryRequirement?.kind === 'repair-feedstock');
    await page.waitForFunction((contactId) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.universeNavigation?.currentFrameId === contactId && snapshot.universeNavigation?.transitionDestinationId == null;
    }, contact.id, { timeout: 20000 });

    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator('#expeditionSetSurveyCourse').scrollIntoViewIfNeeded();
    await page.locator('#expeditionSetSurveyCourse').click();
    await page.waitForFunction((bodyId) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.universeNavigation?.courseDestinationId === bodyId && snapshot.universeNavigation?.courseStatus === 'active';
    }, `${contact.id}-i`, { timeout: 10000 });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius + Math.max(12, target.radius * 2));
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.speed = 0;
    });
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10000 });
    assert.match(await page.locator('#sfLandBtn').textContent(), /land on/i);
    await page.screenshot({ path: path.join(outputDir, `${name}-survey-approach.png`), fullPage: true });

    await page.locator('#sfLandBtn').click();
    await page.waitForFunction(async (bodyId) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return snapshot.environment === 'PLANETARY' && ctx.activePlanetaryBodyId === bodyId;
    }, `${contact.id}-i`, { timeout: 30000 });
    await page.locator('#solidWorldPanel').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(750);
    const surface = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return {
        bodyId: ctx.activePlanetaryBodyId,
        environment: ctx.activePlanetaryEnvironment,
        activities: ctx.planetaryFieldActivitySnapshot?.()
      };
    });
    assert.equal(surface.bodyId, `${contact.id}-i`);
    assert.equal(surface.environment.truthClass, 'modeled');
    assert.match(surface.environment.uncertainty, /unconfirmed/i);
    assert.equal(surface.activities.activities.length, 3);
    await page.screenshot({ path: path.join(outputDir, `${name}-survey-surface.png`), fullPage: true });

    const walkBefore = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return { x: ctx.Walk.state.walker.x, y: ctx.Walk.state.walker.y, z: ctx.Walk.state.walker.z };
    });
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(650);
    await page.keyboard.up('ArrowUp');
    const walkAfter = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return { x: ctx.Walk.state.walker.x, y: ctx.Walk.state.walker.y, z: ctx.Walk.state.walker.z, onGround: ctx.Walk.state.walker.onGround };
    });
    assert.ok(Math.hypot(walkAfter.x - walkBefore.x, walkAfter.z - walkBefore.z) > 0.1);
    assert.equal(Number.isFinite(walkAfter.y), true);

    const interaction = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const activity = ctx.planetaryFieldActivitySnapshot().activities.find((entry) => entry.activityId === 'geology-inspect');
      Object.assign(ctx.car, { x: activity.x, z: activity.z, y: activity.y + 1.2, speed: 0, vx: 0, vz: 0 });
      ctx.carMesh?.position.set(activity.x, activity.y + 1.2, activity.z);
      if (ctx.Walk?.state?.walker) Object.assign(ctx.Walk.state.walker, { x: activity.x + 4, z: activity.z + 2, y: activity.y + 1.2, vy: 0, onGround: true });
      return {
        paused: ctx.paused,
        nearest: ctx.planetaryFieldActivitySnapshot().nearest,
        candidate: ctx.contextInteractionSnapshot?.().active || null
      };
    });
    assert.equal(interaction.paused, false);
    assert.equal(interaction.nearest.activityId, 'geology-inspect');
    assert.equal(interaction.candidate.id, 'planetary-field-activity');
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), true);
    await page.waitForFunction((bodyId) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition;
      return snapshot?.localOperation?.state === 'surface-sampled' && snapshot.localOperation.sampleCatalogId?.includes(bodyId);
    }, `${contact.id}-i`, { timeout: 10000 });
    const backpackSample = await page.evaluate(async (bodyId) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.playerBackpackInventory.snapshot().items.find((item) => item.catalogId === `expedition-sample-${bodyId}`) || null;
    }, `${contact.id}-i`);
    assert.equal(backpackSample.quantity, 1);
    assert.equal(backpackSample.metadata.massKg, 4);
    assert.equal(backpackSample.metadata.truthClass, 'modeled-game-world-material');
    await page.screenshot({ path: path.join(outputDir, `${name}-sample-collected.png`), fullPage: true });

    await page.locator('#solidWorldReturnBtn').click();
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.modes?.space === true && snapshot.interstellarExpedition?.activeLocalContactId == null && snapshot.universeNavigation?.transitionDestinationId == null;
    }, null, { timeout: 30000 });
    let resumed = await state(page);
    assert.equal(resumed.universeNavigation.currentFrameId, 'sol');
    assert.equal(resumed.interstellarExpedition.scienceSamples.length, 1);
    assert.equal(resumed.interstellarExpedition.scienceSamples[0].processed, false);
    assert.equal(resumed.interstellarExpedition.resources.scienceCargoKg, cargoBefore + 4);
    assert.equal(resumed.interstellarExpedition.scienceSamples[0].recoveryRequirement.systemId, 'thermal');
    assert.match(resumed.interstellarExpedition.log.at(-2).message, /Backpack to Surveyor cargo/i);
    const backpackAfter = await page.evaluate(async (bodyId) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.playerBackpackInventory.has(`expedition-sample-${bodyId}`);
    }, `${contact.id}-i`);
    assert.equal(backpackAfter, false);

    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true, null, { timeout: 10000 });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6 });
    });
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyE');
    await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
    await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -4.3, z: -14.5, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(180);
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#shipStationTitle').textContent(), 'Resource Processing');
    assert.equal(await page.locator('[data-ship-action="process-resource-sample"]').isEnabled(), true);
    await page.locator('[data-ship-action="process-resource-sample"]').click();
    resumed = await state(page);
    assert.equal(resumed.interstellarExpedition.scienceSamples[0].processed, true);
    assert.equal(resumed.interstellarExpedition.resources.scienceCargoKg, cargoBefore);
    assert.equal(resumed.interstellarExpedition.resources.feedstockKg, 25);
    assert.equal(resumed.interstellarExpedition.resources.processingResidueKg, 1);
    assert.match(resumed.interstellarExpedition.log.at(-1).message, /3 kg.+1 kg/i);

    await page.locator('[data-close-station]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -4.3, z: 0.5, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(180);
    await page.keyboard.press('KeyE');
    await page.locator('[data-ship-action="fabricate-parts"]').click();
    resumed = await state(page);
    assert.equal(resumed.interstellarExpedition.resources.feedstockKg, 0);
    assert.equal(resumed.interstellarExpedition.resources.maintenanceKg, 18);
    assert.equal(resumed.interstellarExpedition.resources.processingResidueKg, 8);

    await page.locator('[data-close-station]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -7, z: 30, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(180);
    await page.keyboard.press('KeyE');
    await page.locator('[data-ship-action="repair-priority-system"]').click();
    resumed = await state(page);
    assert.equal(resumed.interstellarExpedition.resources.maintenanceKg, 6);
    assert.equal(resumed.interstellarExpedition.materialLedger.installedRepairKg, 12);
    assert.equal(resumed.interstellarExpedition.systems.thermal.condition, 0.58);
    const trackedMaterialAfter = Number(resumed.interstellarExpedition.resources.feedstockKg)
      + Number(resumed.interstellarExpedition.resources.maintenanceKg)
      + Number(resumed.interstellarExpedition.resources.scienceCargoKg)
      + Number(resumed.interstellarExpedition.resources.processingResidueKg)
      + Number(resumed.interstellarExpedition.materialLedger.installedRepairKg);
    assert.equal(trackedMaterialAfter, trackedMaterialBefore + 4);
    await page.screenshot({ path: path.join(outputDir, `${name}-repair-complete.png`), fullPage: true });

    results.push({
      name,
      viewport,
      bodyId: surface.bodyId,
      sampleMassKg: resumed.interstellarExpedition.scienceSamples[0].massKg,
      processed: resumed.interstellarExpedition.scienceSamples[0].processed,
      repairedSystem: 'thermal',
      thermalCondition: resumed.interstellarExpedition.systems.thermal.condition,
      conservedMaterialKg: trackedMaterialAfter,
      resumedFrame: resumed.universeNavigation.currentFrameId
    });
  } finally {
    await context.close();
  }
}

try {
  await run({ width: 1440, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}

const report = { ok: failures.length === 0, baseUrl, results, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
