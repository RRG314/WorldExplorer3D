import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'minimap-sustained-drive');
const durationSeconds = Math.max(10, Number(process.env.WE3D_SUSTAINED_SECONDS) || 70);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4183, 4184, 4185, 4186]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    let ctx = null;
    while (performance.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (
        typeof ctx?.loadRoads === 'function' &&
        typeof ctx?.setTravelMode === 'function' &&
        typeof ctx?.switchEnv === 'function'
      ) break;
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    const { ENV } = await import('/app/js/env.js?v=57');
    if (typeof ctx?.loadRoads !== 'function') throw new Error('Runtime bootstrap timed out');
    ctx.selLoc = 'baltimore';
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    document.getElementById('minimap')?.classList.add('show');
    document.getElementById('minimapZoomControls')?.classList.add('show');
    await ctx.loadRoads();

    const route = (ctx.roads || [])
      .filter((road) => Array.isArray(road?.pts) && road.pts.length >= 4)
      .map((road) => ({
        points: road.pts,
        distance: road.pts.slice(1).reduce((sum, point, index) => (
          sum + Math.hypot(point.x - road.pts[index].x, point.z - road.pts[index].z)
        ), 0)
      }))
      .sort((left, right) => right.distance - left.distance)[0];
    if (!route) throw new Error('No sustained-drive route available');

    const first = route.points[0];
    const second = route.points[1];
    const angle = Math.atan2(second.x - first.x, second.z - first.z);
    const spawn = ctx.resolveSafeWorldSpawn(first.x, first.z, {
      mode: 'drive',
      angle,
      source: 'minimap_sustained_drive'
    });
    ctx.applyResolvedWorldSpawn(spawn, { mode: 'drive', syncCar: true, syncWalker: true });
    ctx.setTravelMode('drive', {
      source: 'minimap_sustained_drive',
      emitTutorial: false,
      force: true
    });

    const frameTimes = [];
    let previousFrame = null;
    const captureFrame = (timestamp) => {
      if (previousFrame !== null) frameTimes.push(timestamp - previousFrame);
      previousFrame = timestamp;
      requestAnimationFrame(captureFrame);
    };
    requestAnimationFrame(captureFrame);

    const originalDrawMinimap = ctx.drawMinimap;
    const minimapDurations = [];
    ctx.drawMinimap = (...args) => {
      const startedAt = performance.now();
      const result = originalDrawMinimap(...args);
      minimapDurations.push(performance.now() - startedAt);
      return result;
    };

    window.__sustainedDrive = {
      ctx,
      route,
      waypoint: 1,
      start: { x: ctx.car.x, z: ctx.car.z },
      frameTimes,
      minimapDurations
    };
    ctx.keys.ArrowUp = true;
    window.__sustainedDriveSteering = window.setInterval(() => {
      const state = window.__sustainedDrive;
      const actor = state.ctx.car;
      let target = state.route.points[Math.min(state.waypoint, state.route.points.length - 1)];
      while (
        state.waypoint < state.route.points.length - 1 &&
        Math.hypot(target.x - actor.x, target.z - actor.z) < 10
      ) {
        state.waypoint += 1;
        target = state.route.points[state.waypoint];
      }
      actor.angle = Math.atan2(target.x - actor.x, target.z - actor.z);
      actor.yawRate = 0;
      actor.steerSm = 0;
    }, 100);
  });

  const samples = [];
  for (let elapsedSeconds = 0; elapsedSeconds <= durationSeconds; elapsedSeconds += 5) {
    if (elapsedSeconds > 0) await page.waitForTimeout(5000);
    samples.push(await page.evaluate((elapsed) => {
      const state = window.__sustainedDrive;
      const { ctx } = state;
      const memory = ctx.renderer?.info?.memory || {};
      const render = ctx.renderer?.info?.render || {};
      return {
        elapsed,
        x: Number(ctx.car.x.toFixed(2)),
        z: Number(ctx.car.z.toFixed(2)),
        speed: Number(ctx.car.speed.toFixed(2)),
        heap: Number(performance.memory?.usedJSHeapSize || 0),
        geometries: Number(memory.geometries || 0),
        textures: Number(memory.textures || 0),
        calls: Number(render.calls || 0),
        triangles: Number(render.triangles || 0),
        terrain: ctx.terrainTileCacheSnapshot?.() || null,
        map: ctx.mapTileCacheSnapshot?.() || null,
        trackPoints: ctx.customTrack?.length || 0,
        recording: Boolean(ctx.isRecording),
        frames: state.frameTimes.length,
        minimapDraws: state.minimapDurations.length
      };
    }, elapsedSeconds));
  }

  const result = await page.evaluate(() => {
    const state = window.__sustainedDrive;
    state.ctx.keys.ArrowUp = false;
    window.clearInterval(window.__sustainedDriveSteering);
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
    };
    const third = Math.floor(state.frameTimes.length / 3);
    const earlyFrames = state.frameTimes.slice(0, third);
    const lateFrames = state.frameTimes.slice(-third);
    const geometriesBeforeRecording = Number(state.ctx.renderer?.info?.memory?.geometries || 0);
    state.ctx.isRecording = true;
    for (let index = 0; index < 5000; index += 1) {
      state.ctx.appendTrackPoint?.(index * 9, index * 2);
    }
    state.ctx.drawMinimap?.();
    const recordedPoints = state.ctx.customTrack?.length || 0;
    const geometriesAfterRecording = Number(state.ctx.renderer?.info?.memory?.geometries || 0);
    state.ctx.isRecording = false;
    const originalCarX = state.ctx.car.x;
    const originalCarZ = state.ctx.car.z;
    state.ctx.resetMinimapView?.();
    state.ctx.drawMinimap?.();
    state.ctx.car.x += 300;
    state.ctx.drawMinimap?.();
    const deadZoneView = state.ctx.getMinimapViewSnapshot?.() || null;
    state.ctx.car.x = originalCarX;
    state.ctx.car.z = originalCarZ;
    state.ctx.resetMinimapView?.();
    state.ctx.drawMinimap?.();
    return {
      displacement: Math.hypot(
        state.ctx.car.x - state.start.x,
        state.ctx.car.z - state.start.z
      ),
      frameCount: state.frameTimes.length,
      earlyP95: percentile(earlyFrames, 0.95),
      lateP95: percentile(lateFrames, 0.95),
      earlyP99: percentile(earlyFrames, 0.99),
      lateP99: percentile(lateFrames, 0.99),
      minimapDrawP95: percentile(state.minimapDurations, 0.95),
      minimapDrawMax: Math.max(0, ...state.minimapDurations),
      minimapView: state.ctx.getMinimapViewSnapshot?.() || null,
      recordedPoints,
      geometriesBeforeRecording,
      geometriesAfterRecording,
      deadZoneView
    };
  });

  await page.screenshot({
    path: path.join(outputDir, 'sustained-drive.png'),
    fullPage: true
  });
  await page.locator('#minimap').screenshot({
    path: path.join(outputDir, 'minimap.png')
  });
  const report = { samples, result, consoleErrors };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join('; ')}`);
  const minimumDisplacement = durationSeconds >= 70 ? 90 : 1;
  assert(result.displacement > minimumDisplacement, `Drive did not cover enough distance (${result.displacement.toFixed(1)}m)`);
  assert(samples.every((sample) => sample.map?.entries <= sample.map?.limit), 'Minimap tile cache exceeded its limit');
  assert(samples.every((sample) => sample.trackPoints === 0 && sample.recording === false), 'Normal driving recorded a route');
  assert(result.recordedPoints <= 4096, `Recorded route exceeded its bound (${result.recordedPoints} points)`);
  assert(result.geometriesAfterRecording === result.geometriesBeforeRecording, 'Track recording allocated 3D geometry');
  const deadZoneOffset = Math.hypot(
    Number(result.deadZoneView?.actorX) - Number(result.deadZoneView?.centerX),
    Number(result.deadZoneView?.actorY) - Number(result.deadZoneView?.centerY)
  );
  assert(deadZoneOffset >= 35 && deadZoneOffset <= 44, `Minimap dead zone was not retained (${deadZoneOffset.toFixed(1)}px)`);
  assert(result.lateP95 <= Math.max(50, result.earlyP95 * 1.8), `Late frame pacing regressed (${result.earlyP95.toFixed(1)}ms -> ${result.lateP95.toFixed(1)}ms)`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
