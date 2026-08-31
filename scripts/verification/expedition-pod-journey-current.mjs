import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/expedition-pod-journey');
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
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
}

async function seedSurfaceTarget(page) {
  return page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, simulation, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=8'),
      import('/app/js/expedition/simulation.js?v=7'),
      import('/app/js/expedition/store.js?v=8')
    ]);
    let expedition = createExpeditionPlan({
      destinationId: 'proxima-centauri',
      crew: DEFAULT_CREW,
      id: 'pod-journey-verification',
      createdAtMs: 77_000
    });
    expedition = simulation.startExpedition(expedition, 77_100);
    while (expedition.state === 'traveling' && !expedition.routeContacts.some((entry) => entry.localOperationState === 'available')) {
      expedition = simulation.advanceToNextMilestone(expedition);
      if (expedition.pendingEvent) {
        const choice = expedition.pendingEvent.options.find((option) => option.enabled);
        expedition = simulation.resolveExpeditionEvent(expedition, choice.id);
      }
    }
    createExpeditionStore().save(expedition);
    return expedition.routeContacts.find((entry) => entry.localOperationState === 'available');
  });
}

async function enterPodBay(page, contactId) {
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
  });
  await page.keyboard.press('KeyE');
  await page.locator('#shipDeckPicker').waitFor({ state: 'visible' });
  await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 5.4, z: -29, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#shipStationTitle').textContent(), 'Pod Launch Bay');
  assert.equal(await page.locator(`[data-pod-contact="${contactId}"]`).isEnabled(), true);
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  try {
    await openSpace(page);
    const contact = await seedSurfaceTarget(page);
    assert.ok(contact?.id);
    const bodyId = `${contact.id}-i`;
    await enterPodBay(page, contact.id);
    await page.locator('[data-close-station]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 10, z: -26.5, angle: -Math.PI / 2, yaw: -Math.PI / 2, lookYawOffset: 0, pitch: -0.03 });
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, 'desktop-pod-launch-bay.png'), fullPage: true });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 5.4, z: -29, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0 });
    });
    await page.keyboard.press('KeyE');
    await page.locator(`[data-pod-contact="${contact.id}"]`).click();
    await page.waitForFunction((id) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.expeditionShipInterior == null && state.interstellarExpedition?.podJourney?.contactId === id;
    }, contact.id);
    await page.waitForFunction((id) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.universeNavigation?.currentFrameId === id && state.universeNavigation?.transitionDestinationId == null;
    }, contact.id, { timeout: 25_000 });
    await page.waitForFunction((id) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.universeNavigation?.courseDestinationId === id && state.interstellarExpedition?.podJourney?.phase === 'local_flight';
    }, bodyId, { timeout: 10_000 });

    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius + Math.max(12, target.radius * 2));
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.speed = 0;
    });
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10_000 });
    await page.screenshot({ path: path.join(outputDir, 'desktop-pod-manual-approach.png'), fullPage: true });
    await page.locator('#sfLandBtn').click();
    await page.waitForFunction((id) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.environment === 'PLANETARY' && state.interstellarExpedition?.podJourney?.bodyId === id && state.interstellarExpedition?.podJourney?.phase === 'surface';
    }, bodyId, { timeout: 35_000 });
    assert.equal(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('world-explorer:interstellar-expedition:v1') || 'null');
      return saved?.podJourney?.phase;
    }), 'surface');
    const surfacePod = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      let pod = null;
      ctx.scene.traverse((child) => { if (child.name === `expedition-return-pod:${ctx.activePlanetaryBodyId}`) pod = child; });
      return pod ? { x: pod.position.x, y: pod.position.y, z: pod.position.z, rotationY: pod.rotation.y, visible: pod.visible !== false } : null;
    });
    assert.ok(surfacePod?.visible);

    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const activity = ctx.planetaryFieldActivitySnapshot().activities.find((entry) => entry.activityId === 'geology-inspect');
      Object.assign(ctx.Walk.state.walker, { x: activity.x + 3, z: activity.z + 1, y: activity.y + 1.2, vy: 0, onGround: true });
    });
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), true);
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.localOperation?.state === 'surface-sampled');

    const podCandidate = await page.evaluate(async (pose) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const rampDistance = 2.7;
      Object.assign(ctx.Walk.state.walker, {
        x: pose.x - Math.sin(pose.rotationY) * rampDistance,
        z: pose.z - Math.cos(pose.rotationY) * rampDistance,
        y: pose.y + 1.7,
        angle: pose.rotationY,
        yaw: pose.rotationY,
        lookYawOffset: 0,
        pitch: 0,
        vy: 0,
        onGround: true
      });
      return ctx.contextInteractionSnapshot?.().active || null;
    }, surfacePod);
    assert.equal(podCandidate.id, 'expedition-return-pod');
    await page.screenshot({ path: path.join(outputDir, 'desktop-surface-return-pod.png'), fullPage: true });
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), true);
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.modes?.space === true && state.interstellarExpedition?.podJourney?.phase === 'recovered' && state.universeNavigation?.transitionDestinationId == null;
    }, null, { timeout: 35_000 });
    const final = await snapshot(page);
    assert.equal(final.universeNavigation.currentFrameId, 'sol');
    assert.equal(final.interstellarExpedition.activeLocalContactId, null);
    assert.equal(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('world-explorer:interstellar-expedition:v1') || 'null');
      return saved?.podJourney?.phase;
    }), 'recovered');
    return {
      contactId: contact.id,
      bodyId,
      finalPhase: final.interstellarExpedition.podJourney.phase,
      returnFrameId: final.universeNavigation.currentFrameId,
      surfacePodVisible: surfacePod.visible
    };
  } finally {
    await context.close();
  }
}

async function verifyMobileLaunchBay() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`mobile pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`mobile request failed: ${request.url()}`);
  });
  try {
    await openSpace(page);
    const contact = await seedSurfaceTarget(page);
    assert.ok(contact?.id);
    await enterPodBay(page, contact.id);
    const layout = await page.locator('.pod-launch-card').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight
      };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.viewportWidth, `mobile pod panel overflows horizontally: ${JSON.stringify(layout)}`);
    assert.ok(layout.top >= 0 && layout.top < layout.viewportHeight, `mobile pod panel starts offscreen: ${JSON.stringify(layout)}`);
    assert.equal(await page.locator(`[data-pod-contact="${contact.id}"]`).isVisible(), true);
    assert.equal(await page.locator(`[data-pod-contact="${contact.id}"]`).isEnabled(), true);
    await page.screenshot({ path: path.join(outputDir, 'mobile-pod-launch-panel.png'), fullPage: true });
    return layout;
  } finally {
    await context.close();
  }
}

let result = null;
let mobileLayout = null;
try {
  result = await run();
  mobileLayout = await verifyMobileLaunchBay();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}

const report = { ok: failures.length === 0, baseUrl, result, mobileLayout, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
