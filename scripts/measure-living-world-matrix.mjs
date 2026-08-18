import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'living-world-performance');
await fs.mkdir(outputDir, { recursive: true });
const locations = [
  { id: 'manhattan', name: 'Manhattan', lat: 40.7580, lon: -73.9855 },
  { id: 'baltimore', name: 'Baltimore', lat: 39.2904, lon: -76.6122 },
  { id: 'monaco', name: 'Monaco', lat: 43.7384, lon: 7.4246 },
  { id: 'suburban', name: 'Towson Suburban', lat: 39.4015, lon: -76.6019 },
  { id: 'rural', name: 'Rural Maryland', lat: 39.5150, lon: -77.3200 }
];
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4330, 4331, 4332] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
const fatalErrors = [];
page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (!/Failed to load resource|net::ERR_|Firestore|Overpass|WorldCover|Shortbread|Terrarium|tile|429|500|502|503|504/i.test(text)) fatalErrors.push(text);
});

async function waitForRuntime() {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady && typeof ctx.loadRoads === 'function' && !!ctx.renderer;
  }, null, { timeout: 120000 });
}

async function sampleMode(mode, frameCount = 75) {
  return page.evaluate(async ({ mode, frameCount }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const population = ctx.earthSceneRoot?.getObjectByName?.('Living World Population');
    const pedestrianParts = population?.children?.filter?.((child) => child.name.startsWith('Living World Pedestrian')) || [];
    const trafficParts = population?.children?.filter?.((child) => child.name.startsWith('Living World Traffic')) || [];
    pedestrianParts.forEach((part) => { part.visible = mode.pedestrians; });
    trafficParts.forEach((part) => { part.visible = mode.traffic; });
    const frames = [];
    const maxima = { calls: 0, triangles: 0 };
    await new Promise((resolve) => {
      let last = 0;
      const frame = (now) => {
        if (last) frames.push(now - last);
        last = now;
        maxima.calls = Math.max(maxima.calls, Number(ctx.renderer.info.render.calls || 0));
        maxima.triangles = Math.max(maxima.triangles, Number(ctx.renderer.info.render.triangles || 0));
        if (frames.length >= frameCount) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const sorted = frames.slice().sort((a, b) => a - b);
    const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
    return {
      medianFrameMs: Number(percentile(0.5).toFixed(3)),
      p95FrameMs: Number(percentile(0.95).toFixed(3)),
      medianFps: Number((1000 / percentile(0.5)).toFixed(1)),
      rendererMaximum: maxima
    };
  }, { mode, frameCount });
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?living-world-performance=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1800);
  await waitForRuntime();
  const runs = [];
  for (const location of locations) {
    const load = await page.evaluate(async (location) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.customLoc = { lat: location.lat, lon: location.lon, name: location.name, arrivalMode: 'auto' };
      ctx.selLoc = 'custom';
      ctx.gameMode = 'free';
      ctx.gameStarted = true;
      ctx.paused = false;
      ctx.switchEnv?.(ctx.ENV.EARTH);
      document.getElementById('titleScreen')?.classList.add('hidden');
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
      const startedAt = performance.now();
      await ctx.loadRoads();
      const loadMs = performance.now() - startedAt;
      const deadline = performance.now() + 30000;
      while (!ctx.livingWorldRuntime && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        loadMs: Number(loadMs.toFixed(2)),
        heapBytes: Number(performance.memory?.usedJSHeapSize || 0),
        livingWorld: JSON.parse(globalThis.render_game_to_text()).livingWorld,
        worldCounts: ctx.worldPublication?.counts || null,
        providersInFlight: Object.values(ctx.worldLoadRuntimeState?.session?.providers || {}).map((provider) => Number(provider.inFlight || 0)),
        resources: {
          geometries: Number(ctx.renderer.info.memory.geometries || 0),
          textures: Number(ctx.renderer.info.memory.textures || 0),
          programs: Number(ctx.renderer.info.programs?.length || 0)
        }
      };
    }, location);
    const modes = {};
    const modeDefinitions = {
      base: { facades: false, pedestrians: false, traffic: false },
      trafficOnly: { facades: false, pedestrians: false, traffic: true },
      pedestriansOnly: { facades: false, pedestrians: true, traffic: false },
      populations: { facades: false, pedestrians: true, traffic: true },
      fullLivingWorld: { facades: true, pedestrians: true, traffic: true }
    };
    for (const [name, mode] of Object.entries(modeDefinitions)) modes[name] = await sampleMode(mode);
    runs.push({ location, ...load, modes });
    await page.screenshot({ path: path.join(outputDir, `${location.id}.png`) });
  }
  const report = {
    ok: fatalErrors.length === 0 && runs.every((run) => run.livingWorld?.active && run.providersInFlight.every((count) => count === 0)),
    browser: 'Google Chrome',
    generatedAt: new Date().toISOString(),
    runs,
    fatalErrors
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
