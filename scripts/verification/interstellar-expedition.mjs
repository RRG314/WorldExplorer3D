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
    assert.equal(await page.locator('#expeditionDestination option[value="sagittarius-a-star"]').count(), 1);
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
    assert.equal(state.expeditionShipInterior.deckCount, 3);
    assert.equal(state.expeditionShipInterior.roomCount, 25);
    assert.equal(state.expeditionShipInterior.stationCount, 30);
    assert.equal(state.expeditionShipInterior.doorCount, 25);
    assert.equal(state.expeditionShipInterior.totalCrewCount, 7);
    assert.ok(state.expeditionShipInterior.visibleCrewCount >= 1);
    assert.equal(state.expeditionShipInterior.miniMapVisible, true);
    assert.equal(state.expeditionShipInterior.crewOperationSummary.total, 7);
    assert.equal(state.expeditionShipInterior.crewOperationSummary.active, 5);
    assert.equal(state.expeditionShipInterior.crewOperationSummary.resting, 2);
    assert.equal(state.expeditionShipInterior.crewOperations.length, 7);
    const initialCrewPositions = new Map(state.expeditionShipInterior.crewPresentation.map((crew) => [crew.crewId, crew]));
    assert.equal(state.interior.key, 'expedition-ship:surveyor');
    assert.equal(await page.locator('#shipInteriorHud').isVisible(), true);
    assert.equal(await page.locator('#spaceFlightCanvas').isVisible(), false);
    assert.equal(await page.locator('#tutorialHintCard').isVisible(), false);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 26.5, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, `${name}-surveyor-command-visual.png`), fullPage: true });
    await page.locator('#shipMapButton').click();
    assert.equal(await page.locator('#shipMapOverlay').isVisible(), true);
    assert.equal(await page.locator('#shipMapOverlay [data-map-deck="command"]').count(), 1);
    await page.locator('#shipMapOverlay [data-map-deck="habitat"]').click();
    assert.equal(await page.locator('#shipMapOverlay [data-room="medical"]').count(), 1);
    await page.locator('#shipMapOverlay [data-room="medical"]').click();
    await page.screenshot({ path: path.join(outputDir, `${name}-ship-map.png`), fullPage: true });
    await page.locator('#shipMapOverlay [data-close-map]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6 });
    });
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyE');
    await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
    await page.locator('#shipDeckPicker [data-deck="habitat"]').click();
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior.deckId, 'habitat');
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 10, z: 26.1, angle: -Math.PI / 2, yaw: -Math.PI / 2, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, `${name}-surveyor-habitat-visual.png`), fullPage: true });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6 });
    });
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyE');
    await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
    await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior.deckId, 'engineering');
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 10, z: 27, angle: -Math.PI / 2, yaw: -Math.PI / 2, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, `${name}-surveyor-engineering-visual.png`), fullPage: true });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6 });
    });
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyE');
    await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
    await page.locator('#shipDeckPicker [data-deck="habitat"]').click();
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior.deckId, 'habitat');
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -1.45, z: 0.5 });
    });
    await page.waitForTimeout(120);
    assert.match(String(await page.locator('#interiorPrompt').textContent()), /pressure door/i);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(250);
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior.openDoorCount, 1);
    await page.screenshot({ path: path.join(outputDir, `${name}-surveyor-habitat.png`), fullPage: true });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6 });
    });
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyE');
    await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
    await page.locator('#shipDeckPicker [data-deck="command"]').click();
    state = await diagnostics(page);
    assert.equal(state.expeditionShipInterior.deckId, 'command');
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -5.1, z: 15.5 });
    });
    await page.waitForTimeout(120);
    assert.match(String(await page.locator('#interiorPrompt').textContent()), /route|margin/i);
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#shipStationTitle').textContent(), 'Navigation & Cartography');
    await page.locator('[data-ship-action="verify-course"]').click();
    state = await diagnostics(page);
    assert.ok(Object.keys(state.interstellarExpedition.operationFlags || {}).some((key) => key.startsWith('verify-course:')));
    assert.equal(await page.locator('[data-ship-action="verify-course"]').isDisabled(), true);
    await page.screenshot({ path: path.join(outputDir, `${name}-ship-operation.png`), fullPage: true });
    await page.locator('[data-close-station]').click();
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
    const voyageFamilies = [];
    const voyageCategories = new Set();
    let previousProgress = 0;
    for (let chapter = 0; chapter < 14; chapter += 1) {
      await page.locator('#expeditionAdvance').click();
      state = await diagnostics(page);
      assert.ok(state.interstellarExpedition.pendingEvent?.familyId);
      assert.ok(state.interstellarExpedition.pendingEvent.options.some((option) => option.enabled));
      voyageFamilies.push(state.interstellarExpedition.pendingEvent.familyId);
      voyageCategories.add(state.interstellarExpedition.pendingEvent.kind);
      assert.ok(state.interstellarExpedition.progress > previousProgress);
      previousProgress = state.interstellarExpedition.progress;
      if (chapter === 0) {
        await page.locator('.expeditionEvent').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(outputDir, `${name}-voyage-event.png`), fullPage: true });
        await page.locator('#expeditionEnterShip').click();
        await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
        await page.evaluate(async () => {
          const { ctx } = await import('/app/js/shared-context.js?v=55');
          Object.assign(ctx.Walk.state.walker, { x: 7, z: 31, angle: Math.PI, yaw: Math.PI, lookYawOffset: 0, pitch: 0 });
        });
        await page.waitForTimeout(180);
        await page.keyboard.press('KeyE');
        await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.ship-voyage-response').isVisible(), true);
        await page.screenshot({ path: path.join(outputDir, `${name}-ship-voyage-response.png`), fullPage: true });
        await page.locator('[data-voyage-response]:not(:disabled)').first().click();
        state = await diagnostics(page);
        assert.equal(state.interstellarExpedition.pendingEvent, null);
        assert.equal(state.interstellarExpedition.voyageDirector.history.length, 1);
        await page.locator('[data-close-station]').click();
        await page.locator('#shipExitButton').click();
        await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior == null);
        if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
        await page.locator('#sfExpeditionBtn').click();
        await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
      } else {
        await page.locator('.expeditionChoice:not(:disabled)').first().click();
      }
    }
    state = await diagnostics(page);
    assert.equal(voyageFamilies[0], 'departure-handoff');
    assert.equal(voyageFamilies.at(-1), 'final-approach');
    assert.equal(new Set(voyageFamilies).size, 14);
    assert.ok(['navigation', 'engineering', 'crew', 'science', 'hazard', 'stop'].every((category) => voyageCategories.has(category)));
    assert.equal(state.interstellarExpedition.voyageDirector.history.length, 14);
    assert.ok(state.interstellarExpedition.voyageDirector.history.every((entry) => ['success', 'partial', 'setback'].includes(entry.outcome)));
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
