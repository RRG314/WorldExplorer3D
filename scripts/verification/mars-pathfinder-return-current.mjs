import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(`${baseUrl}/app/?launch=mars&pathfinder=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('marsLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'MARS' && !state.worldLoading;
  }, null, { timeout: 180_000 });
  assert.match(await page.locator('#marsReturnEarthBtn').textContent(), /Launch Pathfinder to Solis Reach/i);
  await page.locator('#marsReturnEarthBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').surfacePodLaunch?.phase === 'ready');
  const grounded = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const pod = ctx.scene.getObjectByName('expedition-surface-launch-pod:mars');
    return {
      environment: ctx.getEnv?.(),
      podPresent: Boolean(pod),
      podVisible: pod?.visible !== false,
      parentIsActiveScene: pod?.parent === ctx.scene,
      launch: ctx.surfacePodLaunchSnapshot
    };
  });
  assert.equal(grounded.environment, 'MARS');
  assert.equal(grounded.podPresent, true, JSON.stringify(grounded));
  assert.equal(grounded.podVisible, true, JSON.stringify(grounded));
  assert.equal(grounded.parentIsActiveScene, true, JSON.stringify(grounded));
  assert.equal(grounded.launch.awaitingLaunchInput, true);
  assert.equal(grounded.launch.altitude, 0);

  await page.keyboard.down('Space');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').surfacePodLaunch?.altitude > 2);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'SPACE_FLIGHT'
      && state.spaceFlight?.vehiclePresentation === 'pathfinder-pod';
  }, null, { timeout: 120_000 });
  const rendezvous = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getSolisReachDockTarget?.();
    const activeCraftRoots = ctx.spaceFlight.scene.children.filter((child) => child.userData?.spaceCraftId);
    return {
      activeCraftId: ctx.spaceFlight.rocket?.userData?.spaceCraftId,
      activeCraftRootCount: activeCraftRoots.length,
      targetVisible: target?.mesh?.visible === true,
      targetName: target?.name || null,
      destination: ctx.getSpaceTravelSession?.()?.destination?.id || null
    };
  });
  assert.deepEqual(rendezvous, {
    activeCraftId: 'pathfinder-pod',
    activeCraftRootCount: 1,
    targetVisible: true,
    targetName: 'Solis Reach',
    destination: 'solis-reach'
  });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ok: true, grounded, rendezvous }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
