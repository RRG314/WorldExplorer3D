import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { host, mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'performance-stability');

const budgets = {
  domReadyMs: { target: 1500, warn: 2500, fail: 5000, label: 'DOM ready' },
  firstControllableMs: { target: 12000, warn: 20000, fail: 60000, label: 'First controllable world' },
  worldLoadMs: { target: 9000, warn: 15000, fail: 45000, label: 'World load' },
  frameMs: { target: 22, warn: 33, fail: 55, label: 'Average frame time' },
  drawCalls: { target: 1400, warn: 1900, fail: 3200, label: 'Draw calls' },
  triangles: { target: 3500000, warn: 4500000, fail: 6500000, label: 'Triangles' },
  geometries: { target: 1200, warn: 1600, fail: 2500, label: 'Geometries' },
  textures: { target: 550, warn: 700, fail: 1200, label: 'Textures' },
  jsHeapUsedMB: { target: 500, warn: 750, fail: 1300, label: 'JS heap used (MB)' },
  surfaceSyncLastMs: { target: 35, warn: 60, fail: 120, label: 'Last terrain/road sync' }
};

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(429|500|502|503|504)/i.test(msg) ||
    /Road loading failed after all attempts:\s+Error:\s+All Overpass endpoints failed:/i.test(msg)
  );
}

function isOverpassInfraFailure(text = '') {
  return /All Overpass endpoints failed|status of 429|status of 500|status of 502|status of 503|status of 504|HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|timeout after \d+ms/i.test(String(text));
}

function classifyBudget(value, budget) {
  if (!Number.isFinite(value)) return 'unavailable';
  if (value > budget.fail) return 'fail';
  if (value > budget.warn) return 'warn';
  return value <= budget.target ? 'pass' : 'warn';
}

function summarizeBudgets(values = {}) {
  const summary = {};
  let hasFail = false;
  for (const [key, budget] of Object.entries(budgets)) {
    const value = values[key];
    const status = classifyBudget(value, budget);
    summary[key] = {
      label: budget.label,
      value: Number.isFinite(value) ? Number(value.toFixed ? value.toFixed(2) : value) : null,
      status,
      budget
    };
    if (status === 'fail') hasFail = true;
  }
  return { summary, hasFail };
}

async function captureRuntimeMetrics(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const perf = typeof ctx.capturePerfSnapshot === 'function' ? ctx.capturePerfSnapshot() : null;
    const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
    return {
      perf,
      terrain: validation?.terrain || null,
      continuousWorld: validation?.continuousWorld || null,
      interactiveStream: validation?.interactiveStream || null,
      featureRegions: validation?.featureRegions || null,
      road: validation?.road || null,
      world: {
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.length : 0,
        landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
        structureVisualMeshes: Array.isArray(ctx.structureVisualMeshes) ? ctx.structureVisualMeshes.length : 0,
        vegetationMeshes: Array.isArray(ctx.vegetationMeshes) ? ctx.vegetationMeshes.length : 0,
        waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
        waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0
      }
    };
  });
}

function deriveBudgetValues(sample = {}) {
  return {
    domReadyMs: Number(sample.domReadyMs || 0),
    firstControllableMs: Number(sample.firstControllableMs || 0),
    worldLoadMs: Number(sample.snapshot?.perf?.lastLoad?.loadMs || 0),
    frameMs: Number(sample.snapshot?.perf?.frameMs || 0),
    drawCalls: Number(sample.snapshot?.perf?.renderer?.calls || 0),
    triangles: Number(sample.snapshot?.perf?.renderer?.triangles || 0),
    geometries: Number(sample.snapshot?.perf?.renderer?.geometries || 0),
    textures: Number(sample.snapshot?.perf?.renderer?.textures || 0),
    jsHeapUsedMB: Number(sample.snapshot?.perf?.memory?.jsHeapUsedMB || NaN),
    surfaceSyncLastMs: Number(sample.snapshot?.terrain?.lastSurfaceSyncDurationMs || 0)
  };
}

async function runCase(page, key, loader) {
  const start = Date.now();
  const result = await loader();
  const firstControllableMs = Date.now() - start;
  await page.waitForTimeout(3000);
  const snapshot = await captureRuntimeMetrics(page);
  const milestoneFirstControllable = Array.isArray(snapshot?.perf?.milestones) ?
    snapshot.perf.milestones.find((entry) => entry?.name === 'runtime:first_controllable_world') :
    null;
  return {
    key,
    loader: result,
    firstControllableMs: Number.isFinite(Number(milestoneFirstControllable?.atMs)) ?
      Number(milestoneFirstControllable.atMs) :
      firstControllableMs,
    snapshot
  };
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const baseUrl = `http://${host}:${server.port}/app/`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const infraErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isTransientNetworkConsoleError(text)) {
      infraErrors.push(text);
      return;
    }
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = error?.message || String(error);
    if (isTransientNetworkConsoleError(text)) {
      infraErrors.push(text);
      return;
    }
    consoleErrors.push(text);
  });

  try {
    const navStartedAt = Date.now();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const domReadyMs = Date.now() - navStartedAt;

    const initial = await runCase(page, 'baltimore_boot', () => bootstrapEarthRuntime(page, 'baltimore'));
    initial.domReadyMs = domReadyMs;

    const reloadStartedAt = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const reloadDomReadyMs = Date.now() - reloadStartedAt;
    const warmReload = await runCase(page, 'baltimore_warm_reload', () => bootstrapEarthRuntime(page, 'baltimore'));
    warmReload.domReadyMs = reloadDomReadyMs;

    const cases = [initial, warmReload].map((sample) => {
      const budgetValues = deriveBudgetValues(sample);
      const budgetSummary = summarizeBudgets(budgetValues);
      const loadError = String(sample?.snapshot?.perf?.lastLoad?.error || '');
      const partialRecovery = !!sample?.snapshot?.perf?.lastLoad?.partialRecovery;
      const underbuiltWorld =
        Number(sample?.snapshot?.world?.roads || 0) < 1500 ||
        Number(sample?.snapshot?.world?.buildings || 0) < 500;
      const overpassInfraFailure =
        infraErrors.some((text) => isOverpassInfraFailure(text)) ||
        isOverpassInfraFailure(loadError);
      const blockedReason =
        overpassInfraFailure && (partialRecovery || underbuiltWorld) ?
          'overpass_infra_partial_recovery' :
          null;
      return {
        ...sample,
        budgetValues,
        budgets: budgetSummary.summary,
        blockedReason,
        hardFail: budgetSummary.hasFail || !!blockedReason
      };
    });

    await page.screenshot({ path: path.join(outputDir, 'runtime.png'), fullPage: true });

    const report = {
      ok: !cases.some((sample) => sample.hardFail),
      baseUrl,
      budgets,
      cases,
      consoleErrors,
      infraErrors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(async (error) => {
  const report = {
    ok: false,
    error: error?.message || String(error),
    stack: error?.stack || null
  };
  await mkdirp(outputDir);
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exitCode = 1;
});
