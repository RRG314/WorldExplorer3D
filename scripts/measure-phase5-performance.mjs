#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = {
  url: 'http://127.0.0.1:4192/app/',
  frames: 1800,
  out: 'output/playwright/phase5-performance.json'
};
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index + 1];
  if (process.argv[index] === '--url' && value) args.url = value, index += 1;
  else if (process.argv[index] === '--frames' && value) args.frames = Math.max(120, Number(value) || 1800), index += 1;
  else if (process.argv[index] === '--out' && value) args.out = value, index += 1;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

try {
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (ctx?.loadRoads && ctx?.ENV?.EARTH && ctx?.renderer) return;
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    throw new Error('Runtime bootstrap timed out');
  });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const loadRoads = ctx.loadRoads;
    const switchEnv = ctx.switchEnv;
    const earthEnvironment = ctx.ENV?.EARTH;
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.selLoc = 'baltimore';
    if (earthEnvironment && typeof switchEnv === 'function') switchEnv(earthEnvironment);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    if (typeof loadRoads !== 'function') throw new Error('World loader unavailable during performance bootstrap');
    await loadRoads();
    ctx.spawnOnRoad?.();
    ctx.setTravelMode?.('drive', { source: 'phase5_performance', emitTutorial: false, force: true });
  });
  await page.waitForTimeout(5000);

  const metrics = await page.evaluate(async (frameTarget) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const frameTimes = [];
    const rendererMaximum = {
      calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0
    };
    const longTasks = [];
    let observer = null;
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => longTasks.push(entry.duration));
      });
      observer.observe({ entryTypes: ['longtask'] });
    }

    const gpu = (() => {
      const gl = ctx.renderer?.getContext?.();
      const extension = gl?.getExtension?.('WEBGL_debug_renderer_info');
      return {
        vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl?.getParameter?.(gl.VENDOR) || '',
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || ''
      };
    })();
    const heapStart = Number(performance.memory?.usedJSHeapSize || 0);
    const resourcesStart = {
      geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
      textures: Number(ctx.renderer?.info?.memory?.textures || 0),
      programs: Number(ctx.renderer?.info?.programs?.length || 0)
    };

    await new Promise((resolve) => {
      let lastTimestamp = null;
      const frame = (timestamp) => {
        if (lastTimestamp !== null) frameTimes.push(timestamp - lastTimestamp);
        lastTimestamp = timestamp;
        const render = ctx.renderer?.info?.render || {};
        const memory = ctx.renderer?.info?.memory || {};
        rendererMaximum.calls = Math.max(rendererMaximum.calls, Number(render.calls || 0));
        rendererMaximum.triangles = Math.max(rendererMaximum.triangles, Number(render.triangles || 0));
        rendererMaximum.geometries = Math.max(rendererMaximum.geometries, Number(memory.geometries || 0));
        rendererMaximum.textures = Math.max(rendererMaximum.textures, Number(memory.textures || 0));
        rendererMaximum.programs = Math.max(rendererMaximum.programs, Number(ctx.renderer?.info?.programs?.length || 0));
        if (frameTimes.length >= frameTarget) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    observer?.disconnect();

    const sorted = [...frameTimes].sort((left, right) => left - right);
    const percentile = (ratio) => {
      const position = ratio * (sorted.length - 1);
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      const weight = position - lower;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };
    let longestOver33Run = 0;
    let currentOver33Run = 0;
    frameTimes.forEach((duration) => {
      currentOver33Run = duration > 33.3 ? currentOver33Run + 1 : 0;
      longestOver33Run = Math.max(longestOver33Run, currentOver33Run);
    });
    const medianMs = percentile(0.5);
    const p99Ms = percentile(0.99);
    const rendererText = `${gpu.vendor} ${gpu.renderer}`.toLowerCase();
    const softwareRenderer = /swiftshader|llvmpipe|software/.test(rendererText);

    return {
      frameCount: frameTimes.length,
      elapsedMs: frameTimes.reduce((sum, value) => sum + value, 0),
      medianFrameMs: Number(medianMs.toFixed(3)),
      p95FrameMs: Number(percentile(0.95).toFixed(3)),
      p99FrameMs: Number(p99Ms.toFixed(3)),
      medianFps: Number((1000 / medianMs).toFixed(2)),
      onePercentLowFps: Number((1000 / p99Ms).toFixed(2)),
      longestOver33Run,
      longTasks: {
        count: longTasks.length,
        maximumMs: Number(Math.max(0, ...longTasks).toFixed(2)),
        over200Ms: longTasks.filter((duration) => duration > 200).length
      },
      rendererMaximum,
      resourcesStart,
      resourcesEnd: {
        geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
        textures: Number(ctx.renderer?.info?.memory?.textures || 0),
        programs: Number(ctx.renderer?.info?.programs?.length || 0)
      },
      heap: {
        start: heapStart,
        end: Number(performance.memory?.usedJSHeapSize || 0)
      },
      gpu: { ...gpu, softwareRenderer },
      budgetEligible: !softwareRenderer,
      runtime: ctx.getRuntimeKernelSnapshot?.() || null,
      interpolation: ctx.getRenderInterpolationSnapshot?.() || null,
      snapshot: ctx.capturePerfSnapshot?.({ source: 'phase5-performance' }) || null
    };
  }, args.frames);

  const payload = {
    ok: consoleErrors.length === 0,
    capturedAt: new Date().toISOString(),
    url: args.url,
    consoleErrors,
    ...metrics
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
} finally {
  await browser.close();
}
