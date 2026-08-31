import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/destination-mission-proxima-surface');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function snapshot(page) {
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

async function beginProximaBMission(page) {
  await page.locator('#universeToggle').click();
  await page.locator('#universeDestinationSelect').selectOption('proxima-centauri-b');
  await page.locator('#universeMissionBtn').click();
  await page.locator('[data-mission-begin]').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'approach');
  await page.locator('[data-mission-course]').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'proxima-centauri'
      && state.universeNavigation?.courseDestinationId === 'proxima-centauri-b'
      && state.destinationMission?.phase === 'fieldwork';
  }, null, { timeout: 30_000 });
}

async function enterPodBay(page) {
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
  });
  await page.keyboard.press('KeyE');
  await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 5.4, z: -29, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.waitForTimeout(220);
  await page.keyboard.press('KeyE');
  await page.locator('[data-pod-mission]').waitFor({ state: 'visible' });
}

async function recordSurfaceActivity(page, activityId) {
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const activity = ctx.planetaryFieldActivitySnapshot().activities.find((entry) => entry.activityId === id);
    Object.assign(ctx.Walk.state.walker, { x: activity.x + 2.2, z: activity.z + 0.8, y: activity.y + 1.2, vy: 0, onGround: true });
  }, activityId);
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.handlePrimaryContextInteraction();
  }), true);
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    await beginProximaBMission(page);
    assert.ok(await page.evaluate(() => localStorage.getItem('world-explorer:interstellar-expedition:v1')));
    await enterPodBay(page);
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-pod-route.png'), fullPage: true });
    await page.locator('[data-pod-mission]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.podJourney?.phase === 'local_flight');
    const landingTargetReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      if (!target?.landable) return false;
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius + Math.max(12, target.radius * 2));
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.speed = 0;
      return true;
    });
    assert.equal(landingTargetReady, true);
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10_000 });
    await page.locator('#sfLandBtn').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.environment === 'PLANETARY' && state.interstellarExpedition?.podJourney?.phase === 'surface';
    }, null, { timeout: 35_000 });
    assert.equal((await snapshot(page)).destinationMission.phase, 'fieldwork');
    for (const id of ['photograph', 'geology-inspect', 'habitat-survey']) await recordSurfaceActivity(page, id);
    await page.waitForFunction(() => {
      const mission = JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission;
      return mission?.phase === 'analysis' && mission.evidence?.length === 3;
    });
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-surface-complete.png'), fullPage: true });
    const pod = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      let result = null;
      ctx.scene.traverse((child) => { if (child.name === 'expedition-return-pod:proxima-centauri-b') result = child; });
      return result ? { x: result.position.x, y: result.position.y, z: result.position.z, rotationY: result.rotation.y } : null;
    });
    assert.ok(pod);
    await page.evaluate(async (pose) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, {
        x: pose.x - Math.sin(pose.rotationY) * 2.7,
        z: pose.z - Math.cos(pose.rotationY) * 2.7,
        y: pose.y + 1.7,
        angle: pose.rotationY,
        yaw: pose.rotationY,
        lookYawOffset: 0,
        pitch: 0,
        vy: 0,
        onGround: true
      });
    }, pod);
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), true);
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.modes?.space === true && state.interstellarExpedition?.podJourney?.phase === 'recovered';
    }, null, { timeout: 35_000 });

    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -5.1, z: -14.5, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyE');
    await page.locator('[data-complete-destination-analysis]').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-analysis.png'), fullPage: true });
    await page.locator('[data-complete-destination-analysis]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'complete');
    const final = await snapshot(page);
    return {
      missionPhase: final.destinationMission.phase,
      evidence: final.destinationMission.evidence,
      podPhase: final.interstellarExpedition.podJourney.phase,
      frameId: final.universeNavigation.currentFrameId
    };
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
