import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const sliceOnly = process.argv.includes('--slice-only') || process.env.WE3D_VERIFY_SLICE_ONLY === '1';
const outputDir = path.resolve('output/verification/destination-mission-trappist');
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

async function arriveAtTrappist(page) {
  await page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan, withExpeditionChanges }, { startExpedition }, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=11'),
      import('/app/js/expedition/simulation.js?v=8'),
      import('/app/js/expedition/store.js?v=11')
    ]);
    const planned = createExpeditionPlan({ destinationId: 'trappist-1', crew: DEFAULT_CREW, id: 'trappist-mission-verification', createdAtMs: 94_000 });
    createExpeditionStore().save(withExpeditionChanges(startExpedition(planned, 94_100), {
      state: 'arrived', progress: 1, voyagePhase: 'arrival', arrivalTransferState: 'pending'
    }));
  });
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionArrive').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'trappist-1'
      && state.universeNavigation?.transitionDestinationId == null
      && state.interstellarExpedition?.arrivalTransferState === 'complete';
  }, null, { timeout: 30_000 });
  if (await page.locator('[data-mission-close]').isVisible()) await page.locator('[data-mission-close]').click();
}

async function selectMission(page, destinationId) {
  const navigator = page.locator('#universeNavigator');
  if (!(await navigator.isVisible())) await page.locator('#universeToggle').click();
  await navigator.waitFor({ state: 'visible' });
  await page.locator('#universeDestinationSelect').selectOption(destinationId);
  await page.locator('#universeMissionBtn').click();
  await page.locator('#destinationMissionPanel').waitFor({ state: 'visible' });
}

async function enterAnalysisLab(page) {
  if (await page.locator('#destinationMissionPanel').isVisible()) await page.locator('[data-mission-close]').click();
  const alreadyAboard = (await snapshot(page)).expeditionShipInterior?.active === true;
  if (!alreadyAboard) {
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  }
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: -5.1, z: -14.5, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.waitForTimeout(220);
  await page.keyboard.press('KeyE');
  await page.locator('[data-complete-destination-analysis="cautious-baseline"]').waitFor({ state: 'visible' });
}

async function completeAnalysisAndExit(page) {
  await enterAnalysisLab(page);
  const outcomes = page.locator('[data-complete-destination-analysis]');
  assert.equal(await outcomes.count(), 2);
  assert.equal(await page.locator('[data-complete-destination-analysis="cautious-baseline"]').isEnabled(), true);
  const priority = page.locator('[data-complete-destination-analysis="priority-follow-up"]');
  assert.equal(await priority.isEnabled(), true);
  assert.match(await page.locator('#shipStationPanel').textContent(), /Noor Haddad can lead the review/i);
  await page.screenshot({ path: path.join(outputDir, 'desktop-trappist-analysis-outcomes.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await priority.scrollIntoViewIfNeeded();
  const mobileAction = await priority.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  assert.ok(mobileAction.left >= 0 && mobileAction.right <= mobileAction.width, JSON.stringify(mobileAction));
  assert.ok(mobileAction.top >= 0 && mobileAction.bottom <= mobileAction.height, JSON.stringify(mobileAction));
  await page.screenshot({ path: path.join(outputDir, 'mobile-trappist-analysis-outcomes.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await priority.click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'complete');
  const completed = await snapshot(page);
  assert.equal(completed.destinationMission.outcomeId, 'priority-follow-up');
  assert.equal(completed.destinationMission.crewLeadId, 'crew-science');
  assert.match(completed.destinationMission.returnConsequence, /higher-value return survey/i);
  await page.waitForFunction(async (destinationId) => {
    const { createIndexedDbDiscoveryProfileStore } = await import('/app/js/discovery/profile-store.js?v=4');
    const events = await createIndexedDbDiscoveryProfileStore().listEvents(500);
    return events.some((entry) => entry.eventId === `event:destination-mission:${destinationId}`);
  }, completed.destinationMission.destinationId, { timeout: 5_000 });
  const journal = await page.evaluate(async (destinationId) => {
    const { createIndexedDbDiscoveryProfileStore } = await import('/app/js/discovery/profile-store.js?v=4');
    const events = await createIndexedDbDiscoveryProfileStore().listEvents(500);
    const event = events.find((entry) => entry.eventId === `event:destination-mission:${destinationId}`);
    return event ? { detail: event.detail, points: event.progress?.points, projections: event.projections } : null;
  }, completed.destinationMission.destinationId);
  assert.ok(journal, 'Destination result was not recorded in the Explorer Journal event store.');
  assert.match(journal.detail, /higher-value return survey/i);
  assert.match(journal.detail, /Noor Haddad/i);
  assert.equal(journal.points, 40);
  assert.equal(journal.projections.journal, true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.exitExpeditionShipInterior();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active !== true);
  await page.waitForFunction(() => document.getElementById('universeToggle')?.offsetParent !== null);
  await page.waitForTimeout(350);
  if (await page.locator('#expeditionOverlay').isVisible()) await page.locator('#expeditionClose').click();
  await page.evaluate(async (destinationId) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openDestinationMission(destinationId);
  }, completed.destinationMission.destinationId);
  assert.match(await page.locator('#destinationMissionPanel').textContent(), /return consequence/i);
  assert.match(await page.locator('#destinationMissionPanel').textContent(), /higher-value return survey/i);
  assert.match(await page.locator('#destinationMissionPanel').textContent(), /Analysis led by Noor Haddad/i);
  await page.locator('[data-mission-close]').click();
}

async function runTransitNetwork(page) {
  const targetIds = ['trappist-1-b', 'trappist-1-c', 'trappist-1-d', 'trappist-1-e', 'trappist-1-f', 'trappist-1-g', 'trappist-1-h'];
  await selectMission(page, 'trappist-1');
  assert.equal(await page.locator('#destinationMissionTitle').textContent(), 'Seven Shadows');
  await page.locator('[data-mission-begin]').click();
  const courseAction = page.locator('[data-mission-course]');
  if (await courseAction.isVisible()) await courseAction.click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'trappist-1' && state.destinationMission?.phase === 'fieldwork';
  }, null, { timeout: 30_000 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openDestinationMission('trappist-1');
  });
  for (const targetId of targetIds) {
    await page.locator('[data-mission-local-course]').click();
    await page.waitForFunction((expected) => JSON.parse(globalThis.render_game_to_text?.() || '{}').universeNavigation?.courseDestinationId === expected, targetId);
    const targetReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      if (!target?.position || !ctx.spaceFlight?.rocket) return false;
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius * 3);
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.speed = 0;
      ctx.openDestinationMission('trappist-1');
      return target.destinationId;
    });
    assert.equal(targetReady, targetId);
    await page.locator('[data-mission-field]').waitFor({ state: 'visible' });
    await page.locator('[data-mission-field]').click();
    const scanVisible = await page.evaluate((expected) => {
      let found = false;
      globalThis.THREE;
      return import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
        ctx.spaceFlight.scene.traverse((child) => { if (child.name === `destination-mission-scan:${expected}` && child.visible !== false) found = true; });
        return found;
      });
    }, targetId);
    assert.equal(scanVisible, true, targetId);
    await page.waitForFunction((expected) => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.evidence?.includes(expected), targetId, { timeout: 6_000 });
  }
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'analysis');
  await page.screenshot({ path: path.join(outputDir, 'desktop-seven-world-transit-complete.png'), fullPage: true });
  const result = await snapshot(page);
  assert.deepEqual(result.destinationMission.evidence, targetIds);
  await completeAnalysisAndExit(page);
  return { evidence: targetIds, phase: 'complete' };
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
  await page.waitForTimeout(160);
  for (let step = 0; step < 3; step += 1) {
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), true);
    await page.waitForTimeout(120);
  }
}

async function runSurfaceMission(page, destinationId, expectedEvidence, screenshotName) {
  await selectMission(page, destinationId);
  await page.locator('[data-mission-begin]').click();
  await page.locator('[data-mission-course]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getUniverseHudTarget();
    const approachOffset = target.radius + Math.max(9, target.radius * 1.5);
    ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + approachOffset);
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'fieldwork');
  await enterPodBay(page);
  await page.locator('[data-pod-mission]').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.podJourney?.phase === 'local_flight');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getUniverseHudTarget();
    const approachOffset = target.radius + Math.max(9, target.radius * 1.5);
    ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + approachOffset);
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
  });
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10_000 });
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.podJourney?.phase === 'surface', null, { timeout: 35_000 });
  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  for (const activityId of ['photograph', 'geology-inspect', 'habitat-survey']) await recordSurfaceActivity(page, activityId);
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'analysis');
  assert.deepEqual((await snapshot(page)).destinationMission.evidence, expectedEvidence);
  const pod = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    let result = null;
    ctx.scene.traverse((child) => { if (child.name === `expedition-return-pod:${ctx.activePlanetaryBodyId}`) result = child; });
    return result ? { x: result.position.x, y: result.position.y, z: result.position.z, rotationY: result.rotation.y } : null;
  });
  assert.ok(pod);
  await page.evaluate(async (pose) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: pose.x - Math.sin(pose.rotationY) * 2.7, z: pose.z - Math.cos(pose.rotationY) * 2.7, y: pose.y + 1.7, angle: pose.rotationY, yaw: pose.rotationY, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    await ctx.handlePrimaryContextInteraction();
  }, pod);
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'PLANETARY'
      && state.interstellarExpedition?.podJourney?.phase === 'surface_launch'
      && state.surfacePodLaunch?.active === true;
  });
  await page.keyboard.press('Space');
  await page.waitForFunction((frameId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true
      && state.interstellarExpedition?.podJourney?.phase === 'rendezvous'
      && state.universeNavigation?.currentFrameId === frameId
      && state.universeNavigation?.transitionDestinationId == null;
  }, destinationId.split('-').slice(0, 2).join('-'), { timeout: 35_000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getExpeditionPodDockingTarget?.()?.position != null;
  });
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getExpeditionPodDockingTarget?.();
    if (!target?.position) return false;
    ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + Math.max(2, target.radius * 0.25));
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
    return true;
  }), true);
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false);
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.interstellarExpedition?.podJourney?.phase === 'recovered'
      && state.expeditionShipInterior?.active === true;
  });
  await completeAnalysisAndExit(page);
  return { destinationId, evidence: expectedEvidence, phase: 'complete' };
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    await arriveAtTrappist(page);
    if (sliceOnly) {
      const e = await runSurfaceMission(page, 'trappist-1-e', ['terminator-panorama', 'surface-chemistry', 'climate-boundary'], 'desktop-trappist-1-e-surface.png');
      return { sliceOnly: true, e };
    }
    const transit = await runTransitNetwork(page);
    const e = await runSurfaceMission(page, 'trappist-1-e', ['terminator-panorama', 'surface-chemistry', 'climate-boundary'], 'desktop-trappist-1-e-surface.png');
    const f = await runSurfaceMission(page, 'trappist-1-f', ['volatile-panorama', 'volatile-sample', 'thermal-gradient'], 'desktop-trappist-1-f-surface.png');
    return { transit, e, f };
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
