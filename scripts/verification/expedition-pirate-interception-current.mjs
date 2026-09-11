import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4467, 4468, 4469] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = path.resolve('output/verification/expedition-pirate-interception');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const failedLocalResources = [];

async function diagnostics(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space&diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true && document.getElementById('sfExpeditionBtn');
  }, null, { timeout: 120_000 });
}

async function prepareEncounter(page) {
  await page.evaluate(async () => {
    const [{ DEFAULT_CREW }, model, hostile, storeModule, runtimeModule, contextModule] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=12'),
      import('/app/js/expedition/hostile-interception.js?v=1'),
      import('/app/js/expedition/store.js?v=12'),
      import('/app/js/expedition/runtime.js?v=51'),
      import('/app/js/shared-context.js?v=55')
    ]);
    const plan = model.createExpeditionPlan({
      destinationId: 'proxima-centauri',
      crew: DEFAULT_CREW,
      survival: 'forgiving',
      createdAtMs: 1_700_000_000_000,
      id: 'browser-pirate-interception'
    });
    const traveling = model.withExpeditionChanges(plan, {
      state: 'traveling',
      progress: 0.57,
      strategicElapsedS: plan.calculation.properElapsedS * 0.57,
      voyagePhase: 'long-watch',
      voyageDirector: Object.freeze({ ...plan.voyageDirector, nextSlotIndex: 7, step: 7 })
    });
    const encounter = hostile.createPirateInterception(traveling, { id: 'long-watch' });
    storeModule.createExpeditionStore().save(encounter);
    runtimeModule.openExpeditionPlanner(contextModule.ctx);
  });
  await page.locator('#expeditionBeginInterception').waitFor({ state: 'visible' });
}

async function destroyEnemyWithRealFire(page, enemyId) {
  for (let shot = 0; shot < 6; shot += 1) {
    const alive = await page.evaluate((id) => {
      const runtime = globalThis.render_game_to_text ? JSON.parse(globalThis.render_game_to_text()).pirateInterception : null;
      return runtime?.enemies?.some((enemy) => enemy.id === id) === true;
    }, enemyId);
    if (!alive) return;
    const aligned = await page.evaluate((id) => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.()?.pirateInterception;
      void runtime;
      return globalThis.__pirateVerificationResult = null, import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
        const didAlign = ctx.pirateInterceptionRuntime?.verification?.alignEnemy(id, 78) === true;
        const didFire = ctx.pirateInterceptionRuntime?.fire?.() === true;
        return didAlign && didFire;
      });
    }, enemyId);
    assert.equal(aligned, true, `could not line up and fire at ${enemyId}`);
    await page.waitForTimeout(360);
  }
  throw new Error(`actual weapon hits did not destroy ${enemyId}`);
}

async function desktopJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(`desktop: ${error.stack || error}`));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failedLocalResources.push(`${response.status()} ${response.url()}`);
  });
  await openSpace(page);
  await prepareEncounter(page);
  const priority = await diagnostics(page);
  assert.equal(priority.interstellarExpedition.activeEncounter.phase, 'CONTACT_DETECTED');
  await page.locator('#expeditionBeginInterception').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, '01-priority-contact.png') });

  await page.locator('#expeditionBeginInterception').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').pirateInterception?.phase === 'COMBAT_ACTIVE', null, { timeout: 30_000 });
  let combat = await diagnostics(page);
  assert.ok([4, 5].includes(combat.pirateInterception.enemies.length));
  assert.equal(combat.pirateInterception.enemies.some((enemy) => enemy.role === 'boarding-craft'), true);
  assert.equal(combat.pirateInterception.maxProjectiles, 52);
  assert.match(combat.pirateInterception.controls.fire, /V|Use Item/i);
  await page.screenshot({ path: path.join(evidenceDir, '02-combat-active.png') });

  await page.waitForFunction(() => ['COMBAT_ACTIVE', 'BOARDING_THREAT'].includes(JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.activeEncounter?.phase));
  await openSpace(page);
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionBeginInterception').waitFor({ state: 'visible' });
  assert.match(await page.locator('#expeditionBeginInterception').textContent(), /Resume defensive control/i);
  await page.locator('#expeditionBeginInterception').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, '02a-saved-combat-resume.png') });
  await page.locator('#expeditionBeginInterception').click();
  await page.waitForFunction(() => ['COMBAT_ACTIVE', 'BOARDING_THREAT'].includes(JSON.parse(globalThis.render_game_to_text?.() || '{}').pirateInterception?.phase), null, { timeout: 30_000 });
  combat = await diagnostics(page);
  assert.ok(['COMBAT_ACTIVE', 'BOARDING_THREAT'].includes(combat.interstellarExpedition.activeEncounter.phase));

  const boarding = combat.pirateInterception.enemies.find((enemy) => enemy.role === 'boarding-craft');
  const defenders = combat.pirateInterception.enemies.filter((enemy) => enemy.role !== 'boarding-craft').slice(0, 2);
  assert.equal(await page.evaluate((id) => import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
    const aligned = ctx.pirateInterceptionRuntime?.verification?.alignEnemy(id, 160) === true;
    const fired = ctx.pirateInterceptionRuntime?.fire?.() === true;
    return aligned && fired;
  }), boarding.id), true);
  await page.waitForTimeout(85);
  assert.ok((await diagnostics(page)).pirateInterception.activeProjectiles >= 2);
  await page.screenshot({ path: path.join(evidenceDir, '02b-player-energy-volley.png') });
  await page.waitForTimeout(360);
  for (const enemy of [boarding, ...defenders]) await destroyEnemyWithRealFire(page, enemy.id);
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').pirateInterception?.phase === 'AFTERMATH', null, { timeout: 30_000 });
  combat = await diagnostics(page);
  assert.ok(combat.pirateInterception.enemiesDestroyed >= 3);
  assert.equal(combat.interstellarExpedition.activeEncounter.phase, 'AFTERMATH');
  assert.ok(combat.interstellarExpedition.systems.hull.condition < 1);
  assert.ok(combat.interstellarExpedition.resources.maintenanceKg < priority.interstellarExpedition.resources.maintenanceKg);
  assert.equal(await page.locator('#pirateAftermathButton').isVisible(), true);
  await page.screenshot({ path: path.join(evidenceDir, '03-aftermath.png') });

  await page.locator('#pirateAftermathButton').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.pirateInterception?.active === false
      && state.interstellarExpedition?.activeEncounter?.phase === 'COMPLETE'
      && document.getElementById('expeditionOverlay')?.hidden === false;
  }, null, { timeout: 30_000 });
  const resumed = await diagnostics(page);
  assert.equal(resumed.interstellarExpedition.state, 'traveling');
  assert.equal(resumed.interstellarExpedition.voyagePhase, 'long-watch-recovery');
  assert.equal(resumed.interstellarExpedition.encounterHistory.length, 1);
  assert.match(resumed.interstellarExpedition.log.at(-1).message, /resumed its original course/i);
  assert.deepEqual(await page.evaluate(() => import('/app/js/shared-context.js?v=55').then(({ ctx }) => ({
    combatGroupPresent: ctx.spaceFlight.scene?.getObjectByName?.('Pirate Boarding Interception') != null,
    solarSystemRestored: ctx.spaceFlight.scene?.getObjectByName?.('solarSystemGroup')?.visible === true,
    combatHudHidden: document.getElementById('pirateCombatHUD')?.hidden === true
  }))), { combatGroupPresent: false, solarSystemRestored: true, combatHudHidden: true });
  await page.locator('.expeditionInterceptionAftermath, .expeditionTimeline').last().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: path.join(evidenceDir, '04-course-resumed.png') });
  await context.close();
  return {
    enemiesStarted: priority.interstellarExpedition.activeEncounter.difficulty.enemyCount,
    enemiesDestroyed: combat.pirateInterception.enemiesDestroyed,
    playerCondition: combat.pirateInterception.player.condition,
    resultingHullCondition: resumed.interstellarExpedition.systems.hull.condition,
    encounterHistory: resumed.interstellarExpedition.encounterHistory.length
  };
}

async function mobilePresentation() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(`mobile: ${error.stack || error}`));
  await openSpace(page);
  await prepareEncounter(page);
  await page.locator('#expeditionBeginInterception').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').pirateInterception?.phase === 'COMBAT_ACTIVE', null, { timeout: 30_000 });
  assert.equal(await page.locator('#mobileTouchControls').getAttribute('data-mode'), 'rocket');
  assert.equal(await page.locator('#mobileActionSecondary').textContent(), 'Fire');
  assert.equal(await page.locator('#mobileActionSecondary').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(evidenceDir, '05-mobile-combat.png') });
  await context.close();
  return { mobileFireAction: true, overflow: false };
}

try {
  const desktop = await desktopJourney();
  const mobile = await mobilePresentation();
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedLocalResources, []);
  console.log(JSON.stringify({ ok: true, desktop, mobile, evidenceDir }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
