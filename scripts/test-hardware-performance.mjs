#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const baseUrl = String(process.env.HARDWARE_PERF_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const sampleMs = Math.max(10000, Number(process.env.HARDWARE_PERF_SAMPLE_MS || 60000));
const outputDir = path.join(rootDir, 'output', 'playwright', 'hardware-performance');
const reportPath = path.join(outputDir, 'baltimore-report.json');
const screenshotPath = path.join(outputDir, 'baltimore.png');
const budgets = Object.freeze({ medianFps: 30, onePercentLowFps: 20, peakFrameMs: 250 });

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

function summarizeFrames(samples) {
  const sorted = samples.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const slowestCount = Math.max(1, Math.ceil(sorted.length * 0.01));
  const slowest = sorted.slice(-slowestCount);
  const slowestAverageMs = slowest.reduce((sum, value) => sum + value, 0) / slowest.length;
  const medianFrameMs = percentile(sorted, 0.5);
  return {
    sampleCount: sorted.length,
    medianFps: medianFrameMs > 0 ? 1000 / medianFrameMs : 0,
    onePercentLowFps: slowestAverageMs > 0 ? 1000 / slowestAverageMs : 0,
    medianFrameMs,
    p95FrameMs: percentile(sorted, 0.95),
    p99FrameMs: percentile(sorted, 0.99),
    peakFrameMs: sorted.at(-1) || 0,
    over33_3: sorted.filter((value) => value > 33.3).length,
    over50: sorted.filter((value) => value > 50).length,
    over100: sorted.filter((value) => value > 100).length
  };
}

function roundMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [
    key,
    Number.isFinite(value) ? Number(value.toFixed(2)) : value
  ]));
}

function isTransientConsoleError(message = '') {
  return /net::ERR_(ABORTED|HTTP2_PROTOCOL_ERROR)|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(message);
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist']
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !isTransientConsoleError(text)) consoleErrors.push(text);
  });

  await page.goto(`${baseUrl}/app/?hardware-performance=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { ENV } = await import('/app/js/env.js?v=57');
    return typeof ctx?.loadRoads === 'function' && typeof ctx?.switchEnv === 'function' && !!ENV?.EARTH;
  }, { timeout: 120000 });

  const setup = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { ENV } = await import('/app/js/env.js?v=57');
    const deadline = performance.now() + 120000;
    while (
      (typeof ctx.loadRoads !== 'function' || typeof ctx.switchEnv !== 'function') &&
      performance.now() < deadline
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (typeof ctx.loadRoads !== 'function' || typeof ctx.switchEnv !== 'function') {
      throw new Error('World runtime did not become ready before the hardware performance timeout.');
    }
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.selLoc = 'baltimore';
    ctx.switchEnv(ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    const startedAt = performance.now();
    await ctx.loadRoads();
    ctx.setTravelMode?.('walk', { source: 'hardware_performance', emitTutorial: false });
    ctx.spawnOnRoad?.();
    return { loadMs: performance.now() - startedAt };
  });

  await page.waitForTimeout(2000);
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR)
    };
  });

  const frameSamples = await page.evaluate((durationMs) => new Promise((resolve) => {
    const samples = [];
    const startedAt = performance.now();
    let previous = startedAt;
    function sample(now) {
      const delta = now - previous;
      previous = now;
      if (delta > 0 && delta < 2000) samples.push(delta);
      if (now - startedAt >= durationMs) resolve(samples);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }), sampleMs);

  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || null);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const frames = roundMetrics(summarizeFrames(frameSamples));
  const hardwareRenderer = !/swiftshader|software/i.test(String(renderer.renderer || ''));
  const performanceViolations = [
    frames.medianFps < budgets.medianFps ? { metric: 'medianFps', value: frames.medianFps, budget: budgets.medianFps } : null,
    frames.onePercentLowFps < budgets.onePercentLowFps ? { metric: 'onePercentLowFps', value: frames.onePercentLowFps, budget: budgets.onePercentLowFps } : null,
    frames.peakFrameMs > budgets.peakFrameMs ? { metric: 'peakFrameMs', value: frames.peakFrameMs, budget: budgets.peakFrameMs } : null
  ].filter(Boolean).map((violation) => ({
    ...violation,
    owner: diagnostics?.budgetStatus?.topRuntimeOwner?.owner || 'runtime-kernel',
    detail: diagnostics?.budgetStatus?.topRuntimeSystem || null
  }));
  const runtimeViolations = diagnostics?.budgetStatus?.violations || [];
  const pass = hardwareRenderer && frames.sampleCount >= 300 && performanceViolations.length === 0 &&
    runtimeViolations.length === 0 && consoleErrors.length === 0;
  const report = {
    pass,
    generatedAt: new Date().toISOString(),
    baseUrl,
    sampleMs,
    budgets,
    renderer,
    setup: roundMetrics(setup),
    frames,
    performanceViolations,
    runtimeViolations,
    diagnostics,
    consoleErrors,
    screenshot: path.relative(rootDir, screenshotPath)
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    pass,
    renderer: renderer.renderer,
    setup: report.setup,
    frames,
    performanceViolations,
    runtimeViolations,
    consoleErrors
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
}
