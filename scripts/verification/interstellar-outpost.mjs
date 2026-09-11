import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-outpost');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function gameState(page) { return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}')); }

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => { document.getElementById('spaceLaunchToggle')?.click(); document.getElementById('startBtn')?.click(); });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
}

async function seedReturnedSurvey(page) {
  return page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, simulation, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'), import('/app/js/expedition/model.js?v=6'),
      import('/app/js/expedition/simulation.js?v=5'), import('/app/js/expedition/store.js?v=6')
    ]);
    let expedition = createExpeditionPlan({
      destinationId: 'proxima-centauri', crew: DEFAULT_CREW,
      id: 'outpost-verification', createdAtMs: 58_000
    });
    expedition = simulation.startExpedition(expedition, 58_100);
    while (expedition.state === 'traveling' && !expedition.routeContacts.some((contact) => contact.localOperationState === 'available')) {
      expedition = simulation.advanceToNextMilestone(expedition);
      if (expedition.pendingEvent) {
        const choice = expedition.pendingEvent.options.find((option) => option.enabled);
        expedition = simulation.resolveExpeditionEvent(expedition, choice.id);
      }
    }
    const contact = expedition.routeContacts.find((entry) => entry.localOperationState === 'available');
    expedition = {
      ...expedition,
      routeContacts: expedition.routeContacts.map((entry) => entry.id === contact.id
        ? { ...entry, localOperationState: 'returned', status: 'surveyed' } : entry),
      resources: {
        ...expedition.resources,
        maintenanceKg: Math.max(160, Number(expedition.resources.maintenanceKg || 0)),
        feedstockKg: Math.max(180, Number(expedition.resources.feedstockKg || 0)),
        powerMWh: Math.max(20, Number(expedition.resources.powerMWh || 0)),
        foodKg: Math.max(200, Number(expedition.resources.foodKg || 0)),
        waterKg: Math.max(200, Number(expedition.resources.waterKg || 0))
      }
    };
    createExpeditionStore().save(expedition);
    return { expedition, contact };
  });
}

async function run(viewport, name) {
  const context = await browser.newContext({ viewport, hasTouch: name === 'mobile' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name}: ${error.stack || error}`));
  try {
    await openSpace(page);
    const seeded = await seedReturnedSurvey(page);
    const contact = seeded.contact;
    const before = seeded.expedition.resources;
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator(`[data-plan-outpost="${contact.id}"]`).click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.outposts?.[0]?.state === 'planned');
    const outpostId = (await gameState(page)).interstellarExpedition.outposts[0].id;
    await page.locator(`[data-build-outpost="${outpostId}"]`).click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.outposts?.[0]?.state === 'operational');
    let state = await gameState(page);
    const outpost = state.interstellarExpedition.outposts[0];
    assert.equal(state.interstellarExpedition.resources.maintenanceKg, before.maintenanceKg - 90);
    assert.equal(state.interstellarExpedition.resources.feedstockKg, before.feedstockKg - 120);
    assert.equal(outpost.assignedCrewIds.length, 2);
    await page.locator('.expeditionOutposts').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, `${name}-outpost-ledger.png`), fullPage: true });

    await page.locator(`.expeditionOutposts [data-enter-contact="${contact.id}"]`).click();
    await page.waitForFunction((contactId) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.universeNavigation?.currentFrameId === contactId && snapshot.universeNavigation?.transitionDestinationId == null;
    }, contact.id, { timeout: 20_000 });
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionSetSurveyCourse').click();
    await page.waitForFunction((bodyId) => JSON.parse(globalThis.render_game_to_text?.() || '{}').universeNavigation?.courseDestinationId === bodyId, `${contact.id}-i`);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius + Math.max(12, target.radius * 2));
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.speed = 0;
    });
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false);
    await page.locator('#sfLandBtn').click();
    await page.waitForFunction((bodyId) => JSON.parse(globalThis.render_game_to_text?.() || '{}').environment === 'PLANETARY' && document.body.classList.contains('solid-world-active'), `${contact.id}-i`, { timeout: 30_000 });
    await page.locator('#solidWorldPanel').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('solidWorldPanel')?.textContent?.includes('Field Station'));

    const visual = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const expedition = ctx.getInterstellarExpeditionSnapshot();
      const outpost = expedition.outposts[0];
      const meshes = [];
      ctx.scene.traverse((object) => { if (object.userData?.buildAuthority === 'expedition-outpost') meshes.push(object); });
      const packSpawn = { x: 420, z: -360 };
      const originX = Math.round(packSpawn.x + 58);
      const originZ = Math.round(packSpawn.z + 24);
      const first = meshes[0];
      const collision = first ? ctx.getBuildCollisionAtWorldXZ(first.position.x, first.position.z) : null;
      const ownPlaced = ctx.placeBuildBlock(originX + 15, first?.userData?.gy || 0, originZ, 3, { persist: false, shape: 'cube' });
      const protectedRemoval = first ? ctx.removeBuildBlock?.(first.userData.gx, first.userData.gy, first.userData.gz) : null;
      if (ctx.Walk?.state?.walker) Object.assign(ctx.Walk.state.walker, {
        x: originX, z: originZ - 18, y: Number(first?.position?.y || 0) + 1.2,
        angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true
      });
      return {
        meshCount: meshes.length,
        addressKey: outpost.worldAddressKey,
        activeAddressKey: ctx.planetarySurfaceAuthority.snapshot().active.addressKey,
        collision: !!collision,
        ownPlaced,
        protectedRemoval
      };
    });
    assert.equal(visual.meshCount, outpost.blueprint.length);
    assert.equal(visual.addressKey, visual.activeAddressKey);
    assert.equal(visual.collision, true);
    assert.equal(visual.ownPlaced, true);
    assert.equal(visual.protectedRemoval, false);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outputDir, `${name}-outpost-surface.png`), fullPage: true });

    results.push({ name, viewport, outpostId, addressKey: visual.addressKey, structuralBlocks: visual.meshCount, assignedCrew: outpost.assignedCrewIds.length });
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
