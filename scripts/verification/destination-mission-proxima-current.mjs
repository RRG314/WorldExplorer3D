import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/destination-mission-proxima');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function state(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
}

async function seedExpedition(page) {
  await page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, { startExpedition }, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=7'),
      import('/app/js/expedition/simulation.js?v=6'),
      import('/app/js/expedition/store.js?v=7')
    ]);
    const planned = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, id: 'destination-mission-verification', createdAtMs: 88_000 });
    createExpeditionStore().save(startExpedition(planned, 88_100));
  });
}

async function selectMission(page, destinationId) {
  await page.locator('#universeToggle').click();
  await page.locator('#universeNavigator').waitFor({ state: 'visible' });
  await page.locator('#universeDestinationSelect').selectOption(destinationId);
  await page.locator('#universeMissionBtn').click();
  await page.locator('#destinationMissionPanel').waitFor({ state: 'visible' });
}

async function desktopJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`desktop pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`desktop request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`desktop ${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    await seedExpedition(page);
    await selectMission(page, 'proxima-centauri');
    assert.equal(await page.locator('#destinationMissionTitle').textContent(), 'The Flare Watch');
    assert.match(await page.locator('.destination-mission-evidence').textContent(), /Stellar-system mission/);
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-briefing.png'), fullPage: true });
    await page.locator('[data-mission-begin]').click();
    assert.equal((await state(page)).destinationMission.phase, 'approach');
    await page.locator('[data-mission-course]').click();
    await page.waitForFunction(() => {
      const current = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return current.universeNavigation?.currentFrameId === 'proxima-centauri'
        && current.universeNavigation?.transitionDestinationId == null
        && current.destinationMission?.phase === 'fieldwork';
    }, null, { timeout: 25_000 });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.openDestinationMission('proxima-centauri');
    });
    await page.locator('[data-mission-field]').click();
    const fieldActionText = await page.locator('[data-mission-field]').textContent();
    assert.match(fieldActionText || '', /Survey in progress/i);
    await page.locator('[data-mission-close]').click();
    await page.waitForTimeout(260);
    const scanEvidence = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      let count = 0;
      const matchingNames = [];
      ctx.spaceFlight.scene.traverse((child) => { if (child.name === 'destination-mission-scan:proxima-centauri' && child.visible !== false) count += 1; });
      ctx.spaceFlight.scene.traverse((child) => { if (String(child.name || '').includes('mission')) matchingNames.push(child.name); });
      return {
        count,
        matchingNames,
        playType: typeof ctx.playDestinationMissionScan,
        phase: JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase || null
      };
    });
    assert.equal(scanEvidence.count, 1, JSON.stringify(scanEvidence));
    const scanVisible = scanEvidence.count;
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-stellar-scan.png'), fullPage: true });
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'analysis', null, { timeout: 8_000 });

    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -5.1, z: -14.5, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#shipStationTitle').textContent(), 'The Flare Watch');
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-analysis-lab.png'), fullPage: true });
    await page.locator('[data-complete-destination-analysis]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'complete');
    const final = await state(page);
    assert.equal(final.destinationMission.destinationId, 'proxima-centauri');
    assert.equal(final.destinationMission.phase, 'complete');
    return { phase: final.destinationMission.phase, scanVisible, frameId: final.universeNavigation.currentFrameId };
  } finally {
    await context.close();
  }
}

async function mobileBriefing() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`mobile pageerror: ${error.stack || error}`));
  try {
    await openSpace(page);
    await selectMission(page, 'proxima-centauri-b');
    const rect = await page.locator('.destination-mission-card').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
    });
    assert.ok(rect.left >= 0 && rect.right <= rect.width, JSON.stringify(rect));
    assert.ok(rect.bottom <= rect.height, JSON.stringify(rect));
    assert.equal(await page.locator('[data-mission-begin]').isVisible(), true);
    assert.match(await page.locator('.destination-mission-evidence').textContent(), /candidate|irradiation|world/i);
    await page.screenshot({ path: path.join(outputDir, 'mobile-proxima-b-briefing.png'), fullPage: true });
    return rect;
  } finally {
    await context.close();
  }
}

let desktop = null;
let mobile = null;
try {
  desktop = await desktopJourney();
  mobile = await mobileBriefing();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}

const report = { ok: failures.length === 0, baseUrl, desktop, mobile, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
