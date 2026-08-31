import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-interior-visual');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openShip(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionPlan').click();
  await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
}

async function placeCamera(page, { x, z, yaw = 0, pitch = 0 }) {
  await page.evaluate(async (pose) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, {
      x: pose.x,
      z: pose.z,
      angle: pose.yaw,
      yaw: pose.yaw,
      lookYawOffset: 0,
      pitch: pose.pitch,
      vy: 0,
      onGround: true
    });
  }, { x, z, yaw, pitch });
  await page.waitForTimeout(350);
}

async function useLift(page, deckId) {
  await placeCamera(page, { x: 0, z: 0.6 });
  await page.keyboard.press('KeyE');
  await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
  await page.locator(`#shipDeckPicker [data-deck="${deckId}"]`).click();
  await page.waitForFunction((expectedDeck) => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.deckId === expectedDeck, deckId);
}

async function capture(page, name, pose) {
  await placeCamera(page, pose);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
}

async function openDoor(page, pose) {
  const before = (await snapshot(page)).expeditionShipInterior.openDoorCount;
  await placeCamera(page, pose);
  await page.keyboard.press('KeyE');
  await page.waitForFunction((expected) => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.openDoorCount === expected, before + 1);
}

async function runViewport(name, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`${name} request failed: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${name} ${response.status()} ${response.url()}`);
  });

  try {
    await openShip(page);
    let state = await snapshot(page);
    const contract = state.expeditionShipInterior?.visualContract;
    assert.ok(contract, 'The rendered ship must publish its visual contract through render_game_to_text.');
    assert.ok(contract.texturedSurfaceCount >= 20, `Expected textured environment and display surfaces, received ${contract.texturedSurfaceCount}.`);
    assert.equal(contract.floorAccessPanelCount, 25);
    assert.equal(contract.ceilingCrossbeamCount, 27);
    assert.equal(contract.doorThresholdCount, 25);
    assert.ok(contract.consoleDisplayCount >= 10);
    assert.ok(contract.equipmentGroupCount >= 25);

    const sceneEvidence = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const evidence = { roots: 0, textured: [], displayLabels: [], surfaceNames: [] };
      ctx.scene?.traverse?.((child) => {
        if (child.name === 'expedition-ship:surveyor') evidence.roots += 1;
        if (child.material?.map && evidence.textured.length < 40) evidence.textured.push(child.name || child.type);
        if (child.name?.endsWith(':display') && child.parent?.name?.startsWith('ship-console:')) evidence.displayLabels.push(child.name);
        if (/^(floor-access-panel|ceiling-crossbeam|door-threshold):/.test(child.name || '') && evidence.surfaceNames.length < 90) evidence.surfaceNames.push(child.name);
      });
      return evidence;
    });
    assert.equal(sceneEvidence.roots, 1, 'Only one Surveyor interior renderer may own the scene.');
    assert.ok(sceneEvidence.textured.some((entry) => entry.includes(':deck')));
    assert.ok(sceneEvidence.textured.some((entry) => entry.includes(':hull-')));
    assert.ok(sceneEvidence.displayLabels.length >= 10);

    const beforeWalk = state.expeditionShipInterior.player;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowUp');
    state = await snapshot(page);
    const afterWalk = state.expeditionShipInterior.player;
    const moved = Math.hypot(Number(afterWalk.x || 0) - Number(beforeWalk.x || 0), Number(afterWalk.z || 0) - Number(beforeWalk.z || 0));
    assert.ok(moved > 0.05, `The existing walking authority did not move inside the ship (${moved}).`);

    await openDoor(page, { x: 0, z: 22.4, yaw: 0 });
    await capture(page, `${name}-command-bridge`, { x: 0, z: 26, yaw: 0, pitch: -0.03 });
    await openDoor(page, { x: -3.4, z: 0.5, yaw: -Math.PI / 2 });
    await capture(page, `${name}-command-science`, { x: -11.3, z: -6.8, yaw: 0.65, pitch: -0.04 });

    await placeCamera(page, { x: -5.1, z: 15.5, yaw: Math.PI / 2 });
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#shipStationTitle').textContent(), 'Navigation & Cartography');
    await page.locator('[data-close-station]').click();

    await useLift(page, 'habitat');
    await openDoor(page, { x: 0, z: 22.4, yaw: 0 });
    await capture(page, `${name}-habitat-wardroom`, { x: 10, z: 26.1, yaw: -Math.PI / 2, pitch: -0.02 });
    if (name === 'desktop') {
      await openDoor(page, { x: -3.4, z: 15.5, yaw: -Math.PI / 2 });
      await capture(page, `${name}-habitat-medical`, { x: -11.3, z: 8.3, yaw: 0.45, pitch: -0.04 });
      await openDoor(page, { x: -3.4, z: -29, yaw: -Math.PI / 2 });
      await capture(page, `${name}-habitat-hydroponics`, { x: -11.3, z: -21.8, yaw: 2.7, pitch: -0.04 });
    }

    const beforeExtraDoor = (await snapshot(page)).expeditionShipInterior.openDoorCount;
    await placeCamera(page, { x: -3.4, z: 0.5, yaw: -Math.PI / 2 });
    await page.keyboard.press('KeyE');
    state = await snapshot(page);
    assert.equal(state.expeditionShipInterior.openDoorCount, beforeExtraDoor + 1, 'The existing pressure-door interaction must still operate after the visual pass.');

    await useLift(page, 'engineering');
    await openDoor(page, { x: 0, z: 22.4, yaw: 0 });
    await capture(page, `${name}-engineering-core`, { x: 10, z: 27, yaw: -Math.PI / 2, pitch: -0.02 });
    if (name === 'desktop') {
      await openDoor(page, { x: -3.4, z: 0.5, yaw: -Math.PI / 2 });
      await capture(page, `${name}-engineering-fabrication`, { x: -11.3, z: -7, yaw: 0.68, pitch: -0.04 });
      await openDoor(page, { x: 0, z: -21.4, yaw: Math.PI });
      await capture(page, `${name}-engineering-craft-bay`, { x: 10, z: -26.5, yaw: -Math.PI / 2, pitch: -0.02 });
    }

    await page.locator('#shipExitButton').click();
    await page.waitForFunction(() => {
      const current = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return current.expeditionShipInterior == null && current.modes?.space === true;
    });
    results.push({ name, viewport, visualContract: contract, movedMeters: Number(moved.toFixed(3)) });
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

const report = { ok: failures.length === 0, baseUrl, results, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
