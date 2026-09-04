import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/destination-mission-proxima-thermal');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

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

async function setThermalAngle(page, zone) {
  return page.evaluate(async (requestedZone) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getUniverseHudTarget();
    const star = ctx.universeRuntime.frameGroup.userData.destinationMeshes.get('proxima-centauri');
    const starPosition = new THREE.Vector3();
    star.getWorldPosition(starPosition);
    const towardStar = starPosition.sub(target.position).normalize();
    let direction = towardStar;
    if (requestedZone === 'nightside') direction = towardStar.clone().multiplyScalar(-1);
    if (requestedZone === 'terminator') {
      direction = towardStar.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
      if (direction.lengthSq() < 0.5) direction.set(1, 0, 0);
    }
    ctx.spaceFlight.rocket.position.copy(target.position).addScaledVector(direction, target.radius + 72);
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.speed = 0;
    ctx.spaceFlight.camera.position.copy(ctx.spaceFlight.rocket.position).add(new THREE.Vector3(0, 24, 72));
    ctx.spaceFlight.camera.lookAt(target.position);
    return target.destinationId;
  }, zone);
}

async function runThermalPass(page, zone, capture = false) {
  assert.equal(await setThermalAngle(page, zone), 'proxima-centauri-d');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openDestinationMission('proxima-centauri-d');
  });
  const action = page.locator('[data-mission-field]');
  await action.waitFor({ state: 'visible' });
  assert.equal(await action.isEnabled(), true);
  assert.match(await action.textContent(), new RegExp(zone, 'i'));
  await action.click();
  await page.locator('[data-mission-close]').click();
  await page.waitForTimeout(240);
  if (capture) await page.screenshot({ path: path.join(outputDir, `desktop-proxima-d-${zone}-scan.png`), fullPage: true });
  await page.waitForFunction((evidenceId) => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.evidence?.includes(evidenceId), zone, { timeout: 5_000 });
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    await page.locator('#universeToggle').click();
    await page.locator('#universeDestinationSelect').selectOption('proxima-centauri-d');
    await page.locator('#universeMissionBtn').click();
    assert.equal(await page.locator('#destinationMissionTitle').textContent(), 'The Inner Furnace');
    await page.locator('[data-mission-begin]').click();
    await page.locator('[data-mission-course]').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.universeNavigation?.courseDestinationId === 'proxima-centauri-d' && state.destinationMission?.phase === 'fieldwork';
    }, null, { timeout: 30_000 });
    await runThermalPass(page, 'dayside');
    await runThermalPass(page, 'terminator', true);
    await runThermalPass(page, 'nightside');
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'analysis');
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -5.1, z: -14.5, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyE');
    await page.locator('[data-complete-destination-analysis="cautious-baseline"]').waitFor({ state: 'visible' });
    await page.locator('[data-complete-destination-analysis="cautious-baseline"]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'complete');
    const final = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission);
    return { phase: final.phase, evidence: final.evidence, destinationId: final.destinationId };
  } finally {
    await context.close();
  }
}

let result = null;
try {
  result = await run();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
