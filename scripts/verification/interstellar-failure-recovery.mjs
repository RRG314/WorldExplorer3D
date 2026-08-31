import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-failure-recovery');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('spaceLaunchToggle')?.click(); document.getElementById('startBtn')?.click(); });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
}

async function seedEmergency(page) {
  return page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, simulation, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=6'),
      import('/app/js/expedition/simulation.js?v=5'),
      import('/app/js/expedition/store.js?v=6')
    ]);
    let expedition = simulation.startExpedition(createExpeditionPlan({
      destinationId: 'proxima-centauri', crew: DEFAULT_CREW, id: 'failure-recovery-verification', createdAtMs: 51_000
    }), 51_100);
    expedition = simulation.advanceToNextMilestone(expedition);
    expedition = {
      ...expedition,
      systems: { ...expedition.systems, thermal: { condition: 0.22, status: 'critical' } },
      resources: { ...expedition.resources, maintenanceKg: 20 },
      failureChain: [
        { id: 'thermal:degraded:1', systemId: 'thermal', stage: 'degraded', status: 'active', message: 'thermal became degraded.' },
        { id: 'thermal:critical:2', systemId: 'thermal', stage: 'critical', status: 'active', message: 'thermal became critical.' }
      ]
    };
    createExpeditionStore().save(expedition);
    return expedition;
  });
}

async function moveToStation(page, stationId) {
  return page.evaluate(async (id) => {
    const [{ ctx }, layout] = await Promise.all([
      import('/app/js/shared-context.js?v=55'),
      import('/app/js/expedition/ship-layout.js?v=4')
    ]);
    const station = layout.SHIP_STATIONS.find((entry) => entry.id === id);
    if (!station) return null;
    if (ctx.getShipInteriorSnapshot()?.deckId !== station.deckId) ctx.switchSurveyorDeck(station.deckId);
    Object.assign(ctx.Walk.state.walker, { x: station.x, z: station.z, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    return station;
  }, stationId);
}

async function run(viewport, name) {
  const context = await browser.newContext({ viewport, hasTouch: name === 'mobile' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.stack || error}`));
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${name} ${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`${name} failed ${request.url()}`); });
  try {
    await openSpace(page);
    const seeded = await seedEmergency(page);
    assert.ok(seeded.pendingEvent?.roomId);
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    let state = await snapshot(page);
    assert.equal(state.expeditionShipInterior.alert.level, 'critical');
    assert.match(state.expeditionShipInterior.alert.message, new RegExp(seeded.pendingEvent.title, 'i'));
    assert.ok(state.expeditionShipInterior.crewOperations.some((entry) => entry.assignmentId === 'event-response'));
    await page.screenshot({ path: path.join(outputDir, `${name}-critical-response.png`), fullPage: true });

    const responseStation = await page.evaluate(async (roomId) => {
      const layout = await import('/app/js/expedition/ship-layout.js?v=4');
      return layout.SHIP_STATIONS.find((entry) => entry.roomId === roomId && !entry.id.startsWith('deck-lift:'))?.id || null;
    }, seeded.pendingEvent.roomId);
    assert.ok(responseStation);
    await moveToStation(page, responseStation);
    await page.waitForTimeout(180);
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
    const responseButton = page.locator('[data-voyage-response]:not([disabled])').first();
    await responseButton.click();
    state = await snapshot(page);
    assert.equal(state.interstellarExpedition.pendingEvent, null);
    assert.ok(state.expeditionShipInterior.actionFeedback);
    assert.notEqual(state.expeditionShipInterior.audioState, 'not-started');

    await page.locator('[data-close-station]').click();
    await moveToStation(page, 'engineering-repair');
    await page.waitForTimeout(180);
    await page.keyboard.press('KeyE');
    await page.locator('[data-ship-action="repair-priority-system"]').click();
    state = await snapshot(page);
    assert.equal(state.interstellarExpedition.systems.thermal.condition, 0.3);
    assert.equal(state.expeditionShipInterior.alert.level, 'attention');
    assert.ok(state.interstellarExpedition.failureChain.some((entry) => entry.systemId === 'thermal' && entry.stage === 'recovered'));
    assert.ok(state.interstellarExpedition.failureChain.find((entry) => entry.stage === 'critical').status === 'resolved');
    assert.ok(state.interstellarExpedition.failureChain.find((entry) => entry.stage === 'degraded').status === 'active');
    await page.locator('[data-close-station]').click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outputDir, `${name}-repair-feedback.png`), fullPage: true });

    await page.evaluate(async () => {
      const [{ ctx }, simulation, { createExpeditionStore }] = await Promise.all([
        import('/app/js/shared-context.js?v=55'),
        import('/app/js/expedition/simulation.js?v=5'),
        import('/app/js/expedition/store.js?v=6')
      ]);
      ctx.exitExpeditionShipInterior();
      const store = createExpeditionStore();
      const current = store.load();
      const failing = {
        ...current,
        systems: { ...current.systems, 'life-support': { condition: 0.002, status: 'critical' } },
        resources: { ...current.resources, maintenanceKg: 0, feedstockKg: 0 },
        failureChain: [
          ...(current.failureChain || []),
          { id: 'life-support:degraded:visual', systemId: 'life-support', stage: 'degraded', status: 'active', message: 'life support became degraded.' },
          { id: 'life-support:critical:visual', systemId: 'life-support', stage: 'critical', status: 'active', message: 'life support became critical.' }
        ]
      };
      store.save(simulation.advanceExpedition(failing, failing.calculation.properElapsedS * 0.1));
    });
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('.expeditionFailure').waitFor({ state: 'visible' });
    assert.ok(await page.locator('.expeditionFailure li').count() >= 5);
    assert.match(await page.locator('.expeditionFailure h3').textContent(), /life support became unrecoverable/i);
    await page.locator('.expeditionFailure').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, `${name}-causal-failure-report.png`), fullPage: true });

    results.push({ name, viewport, eventId: seeded.pendingEvent.id, repairedCondition: state.interstellarExpedition.systems.thermal.condition, alertLevel: state.expeditionShipInterior.alert.level, audioState: state.expeditionShipInterior.audioState, causalReportVisible: true });
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
