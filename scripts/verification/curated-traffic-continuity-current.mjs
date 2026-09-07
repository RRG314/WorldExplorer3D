import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/curated-traffic-continuity');
await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
});

async function launchEarth() {
  await page.goto(`${baseUrl}/app/?curated-traffic-continuity=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
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
    return state.livingWorld?.active === true && state.urbanSandbox?.active === true;
  }, null, { timeout: 120_000 });
}

try {
  await launchEarth();
  const tracked = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    // Time-of-day demand intentionally virtualizes part of the fixed pool.
    // Track an actor that is currently published, not an arbitrary inactive
    // pool member whose activity affinity may be outside the current band.
    const vehicle = ctx.livingWorldRuntime.population.vehicleSnapshots().find((entry) => entry.visible);
    if (!vehicle) throw new Error('No visible traffic vehicle available to track');
    const walker = ctx.Walk.state.walker;
    Object.assign(walker, { x: vehicle.x - 5, y: vehicle.y, z: vehicle.z - 5, vx: 0, vz: 0, vy: 0, onGround: true });
    return { id: vehicle.id, variantId: vehicle.variant.id };
  });
  await page.waitForTimeout(1_000);
  const samples = [];
  for (let index = 0; index < 120; index += 1) {
    await page.waitForTimeout(100);
    samples.push(await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const vehicle = ctx.livingWorldRuntime.population.vehicleSnapshots().find((entry) => entry.id === id);
      return vehicle ? {
        id: vehicle.id,
        x: vehicle.x,
        z: vehicle.z,
        speed: vehicle.speed,
        visible: vehicle.visible,
        detailPromoted: vehicle.detailPromoted
      } : null;
    }, tracked.id));
  }
  assert.ok(samples.every(Boolean));
  assert.ok(samples.every((sample) => sample.id === tracked.id));
  assert.ok(samples.every((sample) => sample.visible === true));
  const steps = samples.slice(1).map((sample, index) => Math.hypot(
    sample.x - samples[index].x,
    sample.z - samples[index].z
  ));
  const pathDistance = steps.reduce((sum, distance) => sum + distance, 0);
  const maximumStep = Math.max(...steps);
  assert.ok(pathDistance > 12, JSON.stringify({ tracked, pathDistance, maximumStep }));
  assert.ok(maximumStep < 5, JSON.stringify({ tracked, pathDistance, maximumStep }));
  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics());
  assert.equal(diagnostics.livingWorld.population.simulationHz, 30);
  assert.equal(diagnostics.livingWorld.population.proceduralVehicleMeshes, 0);
  assert.deepEqual(failures, []);
  await page.screenshot({ path: path.join(evidenceDir, 'continuous-curated-traffic.png'), fullPage: false });
  const report = {
    ok: true,
    tracked,
    sampleCount: samples.length,
    pathDistance: Number(pathDistance.toFixed(2)),
    maximumStep: Number(maximumStep.toFixed(3)),
    visibleSamples: samples.filter((sample) => sample.visible).length,
    detailPromotedSamples: samples.filter((sample) => sample.detailPromoted).length,
    failures
  };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
