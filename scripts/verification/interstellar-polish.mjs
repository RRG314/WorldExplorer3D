import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-polish');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function snapshot(page) {
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
}

async function enterPlannedShip(page) {
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
    await page.locator('#sfHudToggle').click();
  }
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionPlan').click();
  await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
}

async function runViewport(name, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: name === 'mobile' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`${name} request failed: ${request.url()}`);
  });
  try {
    await openSpace(page);
    if (name === 'mobile') {
      assert.equal(await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed')), true);
      assert.equal(await page.evaluate(() => document.body.classList.contains('space-flight-hud-expanded')), false);
      await page.locator('#sfHudToggle').click();
      assert.equal(await page.evaluate(() => document.body.classList.contains('space-flight-hud-expanded')), true);
      assert.equal(await page.locator('#mobileTouchControls').evaluate((element) => getComputedStyle(element).visibility), 'hidden');
      await page.locator('#sfHudToggle').click();
      assert.equal(await page.locator('#mobileTouchControls').evaluate((element) => getComputedStyle(element).visibility), 'visible');
    }

    await enterPlannedShip(page);
    const signEvidence = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const signs = [];
      ctx.activeInterior?.group?.traverse?.((child) => {
        if (child.name?.startsWith('room-sign:')) signs.push({ name: child.name, side: child.material?.side });
      });
      return signs;
    });
    assert.equal(signEvidence.length, 50);
    assert.ok(signEvidence.every((entry) => entry.side === 0));
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 22.2, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(350);
    const hudBox = await page.locator('#shipInteriorHud').boundingBox();
    const mapBox = await page.locator('#shipMiniMap').boundingBox();
    assert.ok(hudBox && mapBox);
    assert.ok(hudBox.y + hudBox.height <= mapBox.y + 1, `ship HUD overlaps mini map: ${JSON.stringify({ hudBox, mapBox })}`);
    await page.screenshot({ path: path.join(outputDir, `${name}-door-and-layout.png`), fullPage: true });

    await page.locator('#shipExitButton').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior == null);
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator('#expeditionDepart').click();
    await page.locator('#expeditionAdvance').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.pendingEvent != null);
    assert.equal(await page.locator('.expeditionEvent .expeditionChoice').count(), 0);
    assert.match(await page.locator('#expeditionEnterShip').textContent(), /respond aboard/i);
    const eventBefore = (await snapshot(page)).interstellarExpedition.pendingEvent;
    await page.screenshot({ path: path.join(outputDir, `${name}-incident-brief.png`), fullPage: true });
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.incidentPresentation != null);
    let state = await snapshot(page);
    assert.equal(state.expeditionShipInterior.incidentPresentation.roomId, eventBefore.roomId);
    assert.equal(state.expeditionShipInterior.selectedRoomId, eventBefore.roomId);
    assert.equal(await page.locator('#shipObjectiveCue').isVisible(), true);
    const incidentObjects = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const names = [];
      ctx.activeInterior?.group?.traverse?.((child) => {
        if (child.name?.startsWith('ship-incident:') || child.name === 'incident-floor-beacon' || child.name === 'incident-guidance-column') names.push(child.name);
      });
      return names;
    });
    assert.ok(incidentObjects.some((nameValue) => nameValue.startsWith('ship-incident:')));
    assert.ok(incidentObjects.includes('incident-floor-beacon'));
    assert.ok(incidentObjects.includes('incident-guidance-column'));
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 7, z: 27, angle: 0, yaw: 0, lookYawOffset: 0, pitch: -0.08 });
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputDir, `${name}-incident-in-world.png`), fullPage: true });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 7, z: 31, angle: Math.PI, yaw: Math.PI, lookYawOffset: 0, pitch: 0 });
    });
    await page.waitForTimeout(180);
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.ship-voyage-response').isVisible(), true);
    await page.locator('[data-voyage-response]:not(:disabled)').first().click();
    state = await snapshot(page);
    assert.equal(state.interstellarExpedition.pendingEvent, null);
    assert.equal(state.expeditionShipInterior.incidentPresentation, null);
    assert.equal(await page.locator('#shipObjectiveCue').isVisible(), false);
    assert.ok(state.expeditionShipInterior.actionFeedback);
    await page.locator('[data-close-station]').click();
    if (name === 'mobile') {
      const actionBox = await page.locator('#shipActionCue').boundingBox();
      const controlBoxes = await Promise.all(['#mobileMovePad', '#mobileLookPad', '#mobileActionPrimary', '#mobileActionSecondary'].map((selector) => page.locator(selector).boundingBox()));
      const intersects = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      assert.equal(controlBoxes.some((box) => intersects(actionBox, box)), false, 'ship action feedback must not cover mobile controls');
    }
    await page.screenshot({ path: path.join(outputDir, `${name}-incident-resolved.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

try {
  await runViewport('desktop', { width: 1440, height: 900 });
  await runViewport('mobile', { width: 390, height: 844 });
} finally {
  await browser.close();
}

assert.deepEqual(failures, []);
console.log('Interstellar polish verification passed in installed Chrome (desktop + 390x844 mobile).');
