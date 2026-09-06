import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/living-world-rnd');
await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
});

async function launchEarth() {
  await page.goto(`${baseUrl}/app/?diagnostics=1&living-world-rnd=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  const deny = page.locator('#analyticsConsentDenyBtn');
  if (await deny.isVisible().catch(() => false)) await deny.click();
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  await page.evaluate(() => {
    const skip = document.querySelector('.tutorial-text-btn');
    if (skip instanceof HTMLElement && skip.offsetParent) skip.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.livingWorld?.active === true && state.worldCounts?.roads > 0;
  }, null, { timeout: 120_000 });
}

try {
  await launchEarth();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.setTimeOfDay?.('day');
  });
  await page.waitForTimeout(1_500);

  const baseline = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const living = ctx.livingWorldRuntimeSnapshot();
    const controls = (ctx.trafficControlPlacements || []).map((control) => ({
      id: control.id,
      kind: control.kind,
      placement: control.placement,
      centerToFixture: Number.isFinite(control.fixtureX)
        ? Math.hypot(control.fixtureX - control.x, control.fixtureZ - control.z)
        : null
    }));
    return { living, controls };
  });

  const expectedMinimums = {
    low: { pedestrians: 10, vehicles: 6 },
    performance: { pedestrians: 22, vehicles: 13 },
    balanced: { pedestrians: 38, vehicles: 24 },
    quality: { pedestrians: 56, vehicles: 36 }
  }[baseline.living.tier];
  assert.ok(expectedMinimums);
  assert.ok(baseline.living.population.pedestrians >= expectedMinimums.pedestrians);
  assert.ok(baseline.living.population.vehicles >= expectedMinimums.vehicles);
  assert.ok(baseline.living.activePopulation.pedestrians > 0);
  assert.ok(baseline.living.activePopulation.vehicles > 0);
  assert.ok(baseline.controls.every((control) => ['outside-road-envelope', 'semantic-only'].includes(control.placement)));
  assert.ok(baseline.controls.filter((control) => control.placement === 'outside-road-envelope')
    .every((control) => Number(control.centerToFixture) > 1));

  const tracked = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.livingWorldRuntime.population.vehicleSnapshots()
      .filter((vehicle) => vehicle.visible)
      .slice(0, 6)
      .map((vehicle) => ({ id: vehicle.id, x: vehicle.x, z: vehicle.z }));
  });
  assert.ok(tracked.length >= 1);
  const previousById = new Map(tracked.map((vehicle) => [vehicle.id, vehicle]));
  let maximumStep = 0;
  let maximumStepSample = null;
  let continuouslyVisible = true;
  for (let index = 0; index < 40; index += 1) {
    await page.waitForTimeout(100);
    const samples = await page.evaluate(async (ids) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const wanted = new Set(ids);
      return ctx.livingWorldRuntime.population.vehicleSnapshots()
        .filter((vehicle) => wanted.has(vehicle.id))
        .map((vehicle) => ({ id: vehicle.id, x: vehicle.x, z: vehicle.z, visible: vehicle.visible }));
    }, tracked.map((vehicle) => vehicle.id));
    for (const sample of samples) {
      const previous = previousById.get(sample.id);
      const step = Math.hypot(sample.x - previous.x, sample.z - previous.z);
      if (step > maximumStep) {
        maximumStep = step;
        maximumStepSample = { id: sample.id, step, previous, sample };
      }
      continuouslyVisible &&= sample.visible;
      previousById.set(sample.id, sample);
    }
  }
  assert.ok(continuouslyVisible);
  assert.ok(maximumStep < 5, `maximum traffic step ${maximumStep.toFixed(3)}m ${JSON.stringify(maximumStepSample)}`);

  const selection = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { performWorldClickTarget } = await import('/app/js/interaction/world-click-router.js?v=2');
    const pedestrian = ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => entry.visible);
    if (!pedestrian) throw new Error('No visible pedestrian available for selection');
    performWorldClickTarget(ctx, { kind: 'living-pedestrian', id: pedestrian.id, label: 'Local explorer' });
    const card = document.getElementById('worldSelectionNotice');
    const walker = ctx.Walk.state.walker;
    Object.assign(walker, {
      x: pedestrian.x - 12,
      z: pedestrian.z - 12,
      y: pedestrian.y + Number(ctx.Walk.CFG?.eyeHeight || 1.7),
      yaw: Math.atan2(12, 12),
      angle: Math.atan2(12, 12),
      lookYawOffset: 0,
      pitch: -.14,
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: true
    });
    ctx.Walk.state.view = 'third';
    return {
      pedestrianId: pedestrian.id,
      title: card?.querySelector('strong')?.textContent || '',
      detail: card?.querySelector('span')?.textContent || '',
      hidden: card?.hidden !== false
    };
  });
  assert.equal(selection.hidden, false);
  assert.equal(selection.title, 'Local explorer');
  assert.match(selection.detail, /m away/);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(evidenceDir, 'living-world-selection.png'), fullPage: false });

  const textState = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(textState.livingWorld.active, true);
  assert.deepEqual(failures, []);
  const report = {
    ok: true,
    tier: baseline.living.tier,
    population: baseline.living.population,
    activePopulation: baseline.living.activePopulation,
    activityAnchors: baseline.living.publication?.diagnostics?.activityAnchors || null,
    trafficControlCount: baseline.controls.length,
    trafficControlPlacements: baseline.controls.reduce((counts, control) => ({
      ...counts,
      [control.placement]: Number(counts[control.placement] || 0) + 1
    }), {}),
    trackedVehicleCount: tracked.length,
    maximumTrafficStepMeters: Number(maximumStep.toFixed(3)),
    selection,
    failures
  };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(evidenceDir, 'state.json'), `${JSON.stringify(textState, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
