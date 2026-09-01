import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/space-travel-coherence');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
const page = await context.newPage();
const failures = [];

page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`);
});
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
});
await page.addInitScript(() => {
  localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({
    version: 4,
    enabled: true,
    completed: true,
    skipped: false,
    stage: 'complete',
    distanceMoved: 8,
    startedAtMs: Date.now() - 1000,
    completedAtMs: Date.now(),
    analyticsBegan: true,
    contextSeen: {}
  }));
});

const snapshot = () => page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));

try {
  await page.goto(`${baseUrl}/app/?launch=space&diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true && state.spaceFlight?.active === true && state.spaceFlight?.up;
  }, null, { timeout: 120_000 });
  await page.locator('#spaceDestinationSelect').waitFor({ state: 'visible', timeout: 30_000 });

  const initial = await snapshot();
  assert.ok(initial.spaceFlight.up.y > 0.75, `Spacecraft began sideways: ${JSON.stringify(initial.spaceFlight.up)}`);

  await page.locator('#spaceDestinationSelect').selectOption('venus');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.spaceFlight?.destinationBodyId === 'venus' && state.planetary?.flightDestination === 'venus';
  }, null, { timeout: 15_000 });
  assert.equal(await page.locator('#spaceDestinationSelect').inputValue(), 'venus');
  assert.match(await page.locator('#sfDestination').textContent(), /Venus/i);

  if (!(await page.locator('#sfAssistBtn').isVisible())) {
    await page.locator('#sfHudToggle').click();
  }
  await page.locator('#sfAssistBtn').waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await page.locator('#sfAssistBtn').isEnabled(), true, 'Venus flight assist must be available after setting the course.');
  const clickState = await page.evaluate(() => {
    document.getElementById('sfAssistBtn')?.click();
    return JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight;
  });
  assert.equal(clickState.assist.active, true, `Venus assist did not engage: ${JSON.stringify(clickState)}`);
  const beforeAssist = await snapshot();
  await page.waitForTimeout(1300);
  const afterAssist = await snapshot();
  const assistRuntimeDetail = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      contact: ctx.spaceFlight.lastCelestialContact || null,
      avoidance: ctx.spaceFlight.lastCelestialAvoidance || null,
      journeyPhase: ctx.spaceJourney?.phase || null,
      spacecraftEvent: ctx.spacecraftState?.lastEvent || null
    };
  });
  const moved = Math.hypot(
    afterAssist.spaceFlight.position.x - beforeAssist.spaceFlight.position.x,
    afterAssist.spaceFlight.position.y - beforeAssist.spaceFlight.position.y,
    afterAssist.spaceFlight.position.z - beforeAssist.spaceFlight.position.z
  );
  assert.ok(moved > 0.000001, `Venus assist did not move the spacecraft: ${moved}`);
  assert.ok(
    afterAssist.spaceFlight.assist.progress > beforeAssist.spaceFlight.assist.progress,
    `Venus assist did not advance: ${JSON.stringify({ before: beforeAssist.spaceFlight.assist, after: afterAssist.spaceFlight.assist, runtime: assistRuntimeDetail })}`
  );
  assert.equal(afterAssist.spaceFlight.destinationBodyId, 'venus');
  await page.screenshot({ path: path.join(outputDir, 'desktop-venus-assist.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.updateControlsModeUI?.();
  });
  if ((await page.locator('#sfHudToggle').getAttribute('aria-expanded')) === 'true') {
    await page.locator('#sfHudToggle').click();
  }
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#mobileMoveLabel').textContent(), 'Flight');
  assert.equal(await page.locator('#mobileMovePad').isVisible(), true, 'Space steering must use the plane-style directional pad.');
  assert.equal(await page.locator('#mobileLookPad').isVisible(), false, 'Space must not present a second competing steering pad.');
  const beforeTurn = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.spaceFlight.rocket.quaternion.toArray();
  });
  await page.locator('#mobileMoveRight').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(320);
  await page.locator('#mobileMoveRight').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  const afterTurn = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.spaceFlight.rocket.quaternion.toArray();
  });
  assert.notDeepEqual(afterTurn, beforeTurn, 'Plane-style right input did not steer Space Flight.');
  assert.equal((await snapshot()).spaceFlight.assist.active, false, 'Manual steering must return control from assist.');
  await page.screenshot({ path: path.join(outputDir, 'mobile-space-flight-controls.png'), fullPage: true });
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await context.close();
  await browser.close();
}

const report = { ok: failures.length === 0, baseUrl, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
