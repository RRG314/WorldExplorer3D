import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-long-duration');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function gameState(page) { return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}')); }

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('spaceLaunchToggle')?.click(); document.getElementById('startBtn')?.click(); });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
}

async function openPlanner(page) {
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
}

async function selectPlan(page, shipId, propulsionId) {
  await page.locator('#expeditionShip').selectOption(shipId);
  await page.locator('#expeditionPropulsion').selectOption(propulsionId);
  await page.locator('#expeditionPlan').click();
  await page.waitForFunction((id) => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.ship?.profileId === id, shipId);
  return gameState(page);
}

async function moveToStation(page, stationId) {
  const station = await page.evaluate(async (id) => {
    const [{ ctx }, layout] = await Promise.all([import('/app/js/shared-context.js?v=55'), import('/app/js/expedition/ship-layout.js?v=4')]);
    const target = layout.SHIP_STATIONS.find((entry) => entry.id === id);
    if (!target) return null;
    if (ctx.getShipInteriorSnapshot()?.deckId !== target.deckId) ctx.switchSurveyorDeck(target.deckId);
    Object.assign(ctx.Walk.state.walker, { x: target.x, z: target.z, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    return target;
  }, stationId);
  assert.ok(station);
  await page.waitForTimeout(180);
  await page.keyboard.press('KeyE');
  await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
}

async function run(viewport, name) {
  const context = await browser.newContext({ viewport, hasTouch: name === 'mobile' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.stack || error}`));
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${name} ${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`${name} failed ${request.url()}`); });
  try {
    await openSpace(page);
    await openPlanner(page);
    let state = await selectPlan(page, 'cryogenic-expedition-vessel', 'radiant-plasma-field-drive');
    assert.equal(state.interstellarExpedition.longDuration.kind, 'cryogenic');
    assert.equal(state.interstellarExpedition.readiness.status, 'ready');
    assert.ok(state.interstellarExpedition.calculation.externalYears > state.interstellarExpedition.calculation.properYears);
    assert.ok(state.interstellarExpedition.calculation.peakLorentzFactor > 1);
    await page.locator('.expeditionLongDuration').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, `${name}-cryogenic-plan.png`), fullPage: true });

    await page.evaluate(async () => {
      const { createExpeditionStore } = await import('/app/js/expedition/store.js?v=6');
      const store = createExpeditionStore();
      const expedition = store.load();
      store.save({ ...expedition, crew: expedition.crew.map((member) => member.id === 'crew-eng' ? { ...member, status: 'dead' } : member) });
    });
    await page.locator('#expeditionClose').click();
    await openPlanner(page);
    await page.locator('#expeditionDepart').click();
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await moveToStation(page, 'cryogenic-status');
    assert.equal(await page.locator('#shipStationTitle').textContent(), 'Cryogenic Reserve');
    await page.locator('[data-ship-action="wake-reserve-specialist"]').click();
    state = await gameState(page);
    assert.ok(state.interstellarExpedition.crew.some((member) => member.id === 'reserve-engineer' && member.status === 'active'));
    assert.equal(state.interstellarExpedition.longDuration.wakeHistory.length, 1);
    assert.ok(state.expeditionShipInterior.crewPresentation.some((member) => member.crewId === 'reserve-engineer'));
    await page.locator('[data-close-station]').click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outputDir, `${name}-cryogenic-wake.png`), fullPage: true });

    await page.evaluate(async () => { const { ctx } = await import('/app/js/shared-context.js?v=55'); ctx.exitExpeditionShipInterior(); });
    await openPlanner(page);
    state = await selectPlan(page, 'generation-ship', 'fusion-pulse-interstellar');
    assert.notEqual(state.interstellarExpedition.readiness.status, 'insufficient');
    await page.locator('#expeditionDepart').click();
    await page.evaluate(async () => {
      const [simulation, { createExpeditionStore }] = await Promise.all([
        import('/app/js/expedition/simulation.js?v=5'), import('/app/js/expedition/store.js?v=6')
      ]);
      const store = createExpeditionStore();
      let expedition = store.load();
      while (expedition.state === 'traveling' && Number(expedition.longDuration?.generationIndex || 0) < 3) {
        expedition = simulation.advanceToNextMilestone(expedition);
        if (expedition.pendingEvent) {
          const choice = expedition.pendingEvent.options.find((option) => option.enabled);
          expedition = simulation.resolveExpeditionEvent(expedition, choice.id);
        }
      }
      store.save(expedition);
    });
    await page.locator('#expeditionClose').click();
    await openPlanner(page);
    state = await gameState(page);
    assert.ok(state.interstellarExpedition.longDuration.generationIndex >= 3);
    assert.equal(state.interstellarExpedition.longDuration.originalCrewStatus, 'retired');
    assert.ok(state.interstellarExpedition.crew.every((member) => member.id.startsWith('successor-g')));
    await page.locator('.expeditionLongDuration').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, `${name}-generation-continuity.png`), fullPage: true });

    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    state = await gameState(page);
    assert.ok(state.expeditionShipInterior.crewPresentation.every((member) => member.crewId.startsWith('successor-g')));
    await moveToStation(page, 'generation-continuity');
    assert.equal(await page.locator('#shipStationTitle').textContent(), 'Generation Continuity');
    const powerBefore = state.interstellarExpedition.resources.powerMWh;
    await page.locator('[data-ship-action="train-successors"]').click();
    state = await gameState(page);
    assert.equal(state.interstellarExpedition.resources.powerMWh, powerBefore - 0.4);
    assert.match(state.interstellarExpedition.log.at(-1).message, /cross-role training/i);
    await page.locator('[data-close-station]').click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outputDir, `${name}-generation-training.png`), fullPage: true });

    results.push({
      name, viewport,
      cryogenicWakeCrewId: 'reserve-engineer',
      generationIndex: state.interstellarExpedition.longDuration.generationIndex,
      generationPopulation: state.interstellarExpedition.longDuration.population,
      roleContinuity: state.interstellarExpedition.longDuration.roleContinuity,
      externalYears: state.interstellarExpedition.calculation.externalYears,
      properYears: state.interstellarExpedition.calculation.properYears
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
