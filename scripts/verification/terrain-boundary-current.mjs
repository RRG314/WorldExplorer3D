import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/terrain-boundary');
await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
const optionalExternalFailures = [];
const isOptionalExternalUrl = (url) => /(?:overpass-api\.de|overpass\.private\.coffee|google-analytics\.com)\//i.test(String(url || ''));
page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const location = message.location();
  const source = location?.url ? ` (${location.url}${location.lineNumber ? `:${location.lineNumber}` : ''})` : '';
  const entry = `console.error: ${message.text()}${source}`;
  (isOptionalExternalUrl(location?.url) ? optionalExternalFailures : failures).push(entry);
});
page.on('requestfailed', (request) => {
  const entry = `requestfailed: ${request.failure()?.errorText || 'unknown'} ${request.url()}`;
  (isOptionalExternalUrl(request.url()) ? optionalExternalFailures : failures).push(entry);
});

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.6612', lon: '-76.8847', lname: 'Manchester Maryland',
    launch: 'earth', gm: 'free', mode: 'walk', terrainBoundary: String(Date.now())
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.livingWorld?.active === true;
  }, null, { timeout: 360_000 });

  const samples = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return [2980, 3000, 3020, 3040, 3060, 3100].map((z) => {
      const x = 716;
      const rendered = Number(ctx.terrainMeshHeightAt?.(x, z));
      const farValue = ctx.sampleFarTerrainWorldYAt?.(x, z);
      const far = farValue === null || farValue === undefined ? null : Number(farValue);
      const drive = Number(ctx.SurfaceQuery?.driveAt?.(x, z, { currentY: rendered })?.position?.y);
      return {
        x, z, rendered, far, drive,
        renderedMinusFar: Number.isFinite(far) ? rendered - far : null,
        driveMinusRendered: drive - rendered
      };
    });
  });
  const farOwned = samples.filter((sample) => Number.isFinite(sample.far));
  assert.ok(farOwned.length >= 3, JSON.stringify(samples));
  assert.ok(farOwned.every((sample) => Math.abs(sample.renderedMinusFar) <= 0.01), JSON.stringify(samples));
  assert.ok(samples.every((sample) => Math.abs(sample.driveMinusRendered) <= 0.01), JSON.stringify(samples));

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const x = 716;
    const z = 3040;
    const groundY = Number(ctx.terrainMeshHeightAt?.(x, z));
    ctx.setTravelMode?.('drive', { force: true, emitTutorial: false, source: 'terrain-boundary-verification' });
    Object.assign(ctx.car, {
      x, z, y: groundY + 1.21, angle: 0, speed: 0,
      vx: 0, vz: 0, vy: 0, terrainPitch: 0, terrainRoll: 0,
      isAirborne: false, _terrainAirTimer: 0
    });
    ctx.carMesh?.position?.set?.(x, groundY + 1.21, z);
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2_000);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
  assert.equal(state.surfaceChain?.actor?.mode, 'drive');
  assert.ok(Number(state.surfaceChain?.actor?.vehicleContact?.supportSampleCount || 0) >= 1, JSON.stringify(state.surfaceChain));
  assert.ok(Number(state.surfaceChain?.actor?.vehicleContact?.chassisClearance) >= -0.002, JSON.stringify(state.surfaceChain));
  assert.ok(Math.abs(
    Number(state.surfaceChain?.renderedTerrainY) - Number(state.surfaceChain?.surfaces?.drive?.y)
  ) <= 0.02, JSON.stringify(state.surfaceChain));
  assert.deepEqual(failures, []);
  await page.screenshot({ path: path.join(evidenceDir, 'manchester-car-over-boundary.png'), fullPage: false });
  const report = { ok: true, samples, surfaceChain: state.surfaceChain, failures, optionalExternalFailures };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
