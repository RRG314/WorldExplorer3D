import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-expedition');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function diagnostics(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space && document.getElementById('sfExpeditionBtn');
  }, null, { timeout: 120000 });
}

async function runJourney(viewport, name) {
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
    const freeRoam = await diagnostics(page);
    assert.equal(freeRoam.modes.space, true);
    assert.equal(freeRoam.interstellarExpedition, null);
    assert.equal(await page.locator('#sfExpeditionBtn').isVisible(), name === 'desktop');
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
      await page.locator('#sfHudToggle').click();
    }
    await page.keyboard.down('Space');
    await page.waitForTimeout(1700);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => Number(document.getElementById('sfSpeed')?.textContent || 0) > 0, null, { timeout: 5000 });
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.locator('#expeditionDestination').inputValue(), 'proxima-centauri');
    assert.equal(await page.locator('#expeditionPropulsion').inputValue(), 'radiant-plasma-field-drive');
    await page.screenshot({ path: path.join(outputDir, `${name}-planner.png`), fullPage: true });

    await page.locator('#expeditionPlan').click();
    await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
    let state = await diagnostics(page);
    assert.equal(state.interstellarExpedition.destinationId, 'proxima-centauri');
    assert.equal(state.interstellarExpedition.readiness.status, 'ready');
    assert.ok(state.interstellarExpedition.calculation.externalYears > state.interstellarExpedition.calculation.properYears);
    await page.screenshot({ path: path.join(outputDir, `${name}-ready.png`), fullPage: true });

    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.expeditionShipInterior?.active === true;
    }, null, { timeout: 10000 });
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior.parentEnvironment, 'SPACE_FLIGHT');
    assert.equal(state.expeditionShipInterior.movementAuthority, 'Walk');
    assert.equal(state.expeditionShipInterior.collisionAuthority, 'activeInterior');
    assert.equal(state.expeditionShipInterior.roomCount, 8);
    assert.equal(state.expeditionShipInterior.stationCount, 8);
    assert.equal(state.expeditionShipInterior.visibleCrewCount, 7);
    assert.equal(state.expeditionShipInterior.crewOperationSummary.total, 7);
    assert.equal(state.expeditionShipInterior.crewOperationSummary.active, 5);
    assert.equal(state.expeditionShipInterior.crewOperationSummary.resting, 2);
    assert.equal(state.expeditionShipInterior.crewOperations.length, 7);
    const initialCrewPositions = new Map(state.expeditionShipInterior.crewPresentation.map((crew) => [crew.crewId, crew]));
    assert.equal(state.interior.key, 'expedition-ship:surveyor');
    assert.equal(await page.locator('#shipInteriorHud').isVisible(), true);
    assert.equal(await page.locator('#spaceFlightCanvas').isVisible(), false);
    assert.equal(await page.locator('#tutorialHintCard').isVisible(), false);
    if (name === 'mobile') {
      await page.waitForFunction(() => document.getElementById('mobileTouchControls')?.dataset.mode === 'walking');
      assert.equal(await page.locator('#mobileActionSecondary').textContent(), 'Interact');
    }
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1800);
    await page.keyboard.up('ArrowUp');
    state = await diagnostics(page);
    assert.equal(await page.locator('#tutorialHintCard').isVisible(), false);
    assert.ok(state.expeditionShipInterior.crewPresentation.some((crew) => {
      const initial = initialCrewPositions.get(crew.crewId);
      return initial && Math.hypot(crew.x - initial.x, crew.z - initial.z) > 0.05;
    }));
    await page.screenshot({ path: path.join(outputDir, `${name}-surveyor-interior.png`), fullPage: true });
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior?.active, true);
    assert.equal(state.interior?.key, 'expedition-ship:surveyor');
    await page.locator('#shipExitButton').click();
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.expeditionShipInterior == null && snapshot.modes?.space === true;
    }, null, { timeout: 10000 });
    assert.equal(await page.locator('#spaceFlightCanvas').isVisible(), true);
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
      await page.locator('#sfHudToggle').click();
    }
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });

    await page.locator('#expeditionDepart').click();
    await page.locator('#expeditionAdvance').click();
    state = await diagnostics(page);
    assert.equal(state.interstellarExpedition.pendingEvent.kind, 'maintenance');
    assert.equal(state.interstellarExpedition.systems.thermal.status, 'degraded');
    const maintenanceBefore = state.interstellarExpedition.resources.maintenanceKg;
    await page.locator('[data-choice="replace"]').click();
    state = await diagnostics(page);
    assert.equal(state.interstellarExpedition.systems.thermal.status, 'optimal');
    assert.ok(state.interstellarExpedition.resources.maintenanceKg < maintenanceBefore);

    await page.locator('#expeditionAdvance').click();
    state = await diagnostics(page);
    assert.equal(state.interstellarExpedition.pendingEvent.kind, 'discovery');
    assert.equal(state.interstellarExpedition.discoveries[0].truthClass, 'procedural-game-object');
    await page.locator('[data-choice="observe"]').click();
    await page.locator('#expeditionAdvance').click();
    state = await diagnostics(page);
    assert.equal(state.interstellarExpedition.state, 'arrived');
    assert.equal(state.interstellarExpedition.progress, 1);
    assert.ok(state.interstellarExpedition.crew[0].ageYears > 50);
    await page.screenshot({ path: path.join(outputDir, `${name}-arrived.png`), fullPage: true });

    await page.locator('#expeditionArrive').click();
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.universeNavigation?.courseDestinationId === 'proxima-centauri';
    }, null, { timeout: 15000 });
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.universeNavigation?.currentFrameId === 'proxima-centauri' && snapshot.universeNavigation?.courseStatus === 'active';
    }, null, { timeout: 15000 });
    const arrival = await diagnostics(page);
    assert.equal(arrival.modes.space, true);
    assert.equal(arrival.universeNavigation.currentFrameId, 'proxima-centauri');
    assert.equal(arrival.interstellarExpedition.state, 'arrived');
    await page.screenshot({ path: path.join(outputDir, `${name}-local-space.png`), fullPage: true });

    results.push({ name, viewport, destination: arrival.universeNavigation.currentFrameId, expeditionState: arrival.interstellarExpedition.state });
  } finally {
    await context.close();
  }
}

try {
  await runJourney({ width: 1440, height: 900 }, 'desktop');
  await runJourney({ width: 390, height: 844 }, 'mobile');
} finally {
  await browser.close();
}

const report = { ok: failures.length === 0, baseUrl, results, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
