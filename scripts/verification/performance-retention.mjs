import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const PRODUCTION_REFERENCE = Object.freeze({
  source: '2026-08-23 fixed-window Firebase production parity capture',
  minimumAverageFps: 43.65,
  maximumP95FrameMs: 34.36,
  maximumP99FrameMs: 50,
  maximumDrawCalls: 1729,
  maximumTrianglesWithCoverageTolerance: 4_950_000
});

const verifyRoot = process.env.WE3D_VERIFY_ROOT || process.cwd();
const server = await startStaticServer({ rootDir: verifyRoot, ports: [4421, 4422, 4423] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ url: response.url(), status: response.status() });
  }
});

const percentile = (values, portion) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * portion) - 1))] || 0;
};

async function selectMode(expected, selector) {
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 10_000 });
  await page.locator(selector).click();
  await page.waitForFunction((mode) => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === mode, expected, { timeout: 20_000 });
  await page.waitForTimeout(1_200);
}

async function measureMode(id, sampleMs = 5_000) {
  const raw = await page.evaluate((durationMs) => new Promise((resolve) => {
    const deltas = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const frame = (now) => {
      if (now > previous) deltas.push(now - previous);
      previous = now;
      if (now - startedAt < durationMs) requestAnimationFrame(frame);
      else resolve({ deltas, diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || {} });
    };
    requestAnimationFrame(frame);
  }), sampleMs);
  const deltas = raw.deltas.filter((value) => Number.isFinite(value) && value > 0);
  const averageFrameMs = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
  return {
    id,
    sampleMs,
    frames: deltas.length,
    averageFps: 1000 / averageFrameMs,
    averageFrameMs,
    p95FrameMs: percentile(deltas, 0.95),
    p99FrameMs: percentile(deltas, 0.99),
    worstFrameMs: Math.max(...deltas),
    calls: Number(raw.diagnostics.renderer?.calls || 0),
    triangles: Number(raw.diagnostics.renderer?.triangles || 0),
    programs: Number(raw.diagnostics.renderer?.programs || 0),
    worldCounts: raw.diagnostics.worldCounts || null
  };
}

try {
  const navigationStartedAt = Date.now();
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForSelector('#loading.show', { timeout: 30_000 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 240_000 });
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false;
  }, null, { timeout: 240_000 });
  const firstPlayableMs = Date.now() - navigationStartedAt;
  await page.waitForTimeout(2_500);

  await selectMode('walk', '#fWalk');
  const walk = await measureMode('walk');
  await selectMode('drive', '#fDriving');
  const drive = await measureMode('drive');
  await selectMode('plane', '#fPlane');
  const plane = await measureMode('plane');
  const modes = [walk, drive, plane];
  const checks = {
    completeWorld: modes.every((mode) => Number(mode.worldCounts?.buildings) > 0 && Number(mode.worldCounts?.roads) > 0 && Number(mode.worldCounts?.terrainTiles) > 0),
    fpsAtLeastProductionReference: modes.every((mode) => mode.averageFps >= PRODUCTION_REFERENCE.minimumAverageFps),
    p95NotWorseThanProductionReference: modes.every((mode) => mode.p95FrameMs <= PRODUCTION_REFERENCE.maximumP95FrameMs),
    p99NotWorseThanProductionReference: modes.every((mode) => mode.p99FrameMs <= PRODUCTION_REFERENCE.maximumP99FrameMs),
    drawCallsWithinProductionReference: modes.every((mode) => mode.calls <= PRODUCTION_REFERENCE.maximumDrawCalls),
    trianglesWithinCoverageTolerance: modes.every((mode) => mode.triangles <= PRODUCTION_REFERENCE.maximumTrianglesWithCoverageTolerance),
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'retention-release-fixed-window-production-performance-parity',
    baseUrl,
    firstPlayableMs,
    productionReference: PRODUCTION_REFERENCE,
    checks,
    modes,
    browserErrors,
    localFailures
  };
  await mkdir('output/verification/performance-retention', { recursive: true });
  await writeFile('output/verification/performance-retention/report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Current source is materially worse than the preceding Firebase deployment reference.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
