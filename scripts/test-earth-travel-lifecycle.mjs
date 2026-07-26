import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'earth-travel-lifecycle');
const host = '127.0.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distance3d(a, b) {
  return Math.hypot(
    Number(b?.x || 0) - Number(a?.x || 0),
    Number(b?.y || 0) - Number(a?.y || 0),
    Number(b?.z || 0) - Number(a?.z || 0)
  );
}

async function launchBaltimore(page, baseUrl) {
  await page.goto(`${baseUrl}/app/?earth-travel=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && document.getElementById('globeSelectorScreen')?.classList.contains('show');
  }, null, { timeout: 90000 });
  await page.locator('#globeCustomLat').fill('39.2904');
  await page.locator('#globeCustomLon').fill('-76.6122');
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.gameStarted && !ctx.worldLoading && typeof ctx.setTravelMode === 'function';
  }, null, { timeout: 60000 });
  await page.evaluate(() => document.activeElement?.blur?.());
}

async function setMode(page, mode, cycle) {
  const resolved = await page.evaluate(async ({ requestedMode, requestedCycle }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const source = `earth_travel_cycle_${requestedCycle}`;
    if (requestedMode === 'plane') {
      const x = Number(ctx.drone?.x ?? ctx.car?.x ?? 0);
      const z = Number(ctx.drone?.z ?? ctx.car?.z ?? 0);
      const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y ?? ctx.elevationWorldYAtWorldXZ?.(x, z) ?? 0);
      return ctx.setTravelMode('plane', {
        source,
        force: true,
        emitTutorial: false,
        x,
        z,
        y: Math.max(Number(ctx.drone?.y || 0), terrainY + 40),
        speed: 24,
        throttle: 0.65,
        airborne: true
      });
    }
    return ctx.setTravelMode(requestedMode, { source, force: true, emitTutorial: false });
  }, { requestedMode: mode, requestedCycle: cycle });
  assert(resolved === mode, `Requested ${mode}, resolved ${resolved || 'unset'}`);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(150);
}

async function readState(page, mode) {
  return page.evaluate(async (requestedMode) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const actor = requestedMode === 'walk' ? ctx.Walk?.state?.walker :
      requestedMode === 'drive' ? ctx.car :
      requestedMode === 'drone' ? ctx.drone :
      ctx.planeMode;
    const memory = ctx.renderer?.info?.memory || {};
    return {
      mode: ctx.getCurrentTravelMode?.(),
      worldLoading: !!ctx.worldLoading,
      actions: ctx.readControlActions?.(requestedMode) || null,
      transportControllers: ctx.getEarthTransportControllerSnapshot?.() || null,
      actor: {
        x: Number(actor?.x),
        y: Number(actor?.y),
        z: Number(actor?.z),
        speed: Number(actor?.speed || actor?.forwardSpeed || 0)
      },
      camera: ctx.camera ? {
        x: Number(ctx.camera.position.x),
        y: Number(ctx.camera.position.y),
        z: Number(ctx.camera.position.z)
      } : null,
      resources: {
        geometries: Number(memory.geometries || 0),
        textures: Number(memory.textures || 0),
        heapBytes: Number(performance.memory?.usedJSHeapSize || 0),
        planeMeshes: ctx.scene?.children?.filter((child) => child?.name === 'Explorer STOL Aircraft').length || 0
      }
    };
  }, mode);
}

async function moveMode(page, mode) {
  const start = await readState(page, mode);
  let during = null;
  if (mode === 'plane') {
    await page.keyboard.down('KeyX');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(250);
    during = await readState(page, mode);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      for (let frame = 0; frame < 120; frame += 1) ctx.update(1 / 60);
      ctx.updateCamera?.(1 / 60);
    });
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('KeyX');
  } else {
    await page.keyboard.down('ArrowUp');
    if (mode === 'drone') await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    during = await readState(page, mode);
    await page.evaluate(async (requestedMode) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const frames = requestedMode === 'drive' ? 180 : 90;
      for (let frame = 0; frame < frames; frame += 1) ctx.update(1 / 60);
      ctx.updateCamera?.(1 / 60);
    }, mode);
    if (mode === 'drone') await page.keyboard.up('Space');
    await page.keyboard.up('ArrowUp');
  }
  await page.waitForTimeout(200);
  let end = await readState(page, mode);
  let distance = distance3d(start.actor, end.actor);
  let collisionRecovery = false;
  if ((mode === 'walk' || mode === 'drive') && distance <= 0.25) {
    collisionRecovery = true;
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(200);
    await page.evaluate(async (requestedMode) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const frames = requestedMode === 'drive' ? 120 : 90;
      for (let frame = 0; frame < frames; frame += 1) ctx.update(1 / 60);
      ctx.updateCamera?.(1 / 60);
    }, mode);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(100);
    end = await readState(page, mode);
    distance = distance3d(start.actor, end.actor);
  }
  return { start, during, end, distance, collisionRecovery };
}

await mkdirp(outputDir);
const suppliedBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
const server = suppliedBaseUrl ? null : await startServer({ rootDir, host, candidatePorts: [4223, 4224, 4225] });
const baseUrl = suppliedBaseUrl || `http://${host}:${server.port}`;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/net::ERR_|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(text)) {
      consoleErrors.push(text);
    }
  });
  await launchBaltimore(page, baseUrl);

  const cycles = [];
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const modes = {};
    for (const mode of ['walk', 'drive', 'drone', 'plane']) {
      await setMode(page, mode, cycle);
      modes[mode] = await moveMode(page, mode);
      if (modes[mode].distance <= 0.25) {
        await fs.writeFile(path.join(outputDir, 'failure-report.json'), `${JSON.stringify({ cycle, mode, result: modes[mode] }, null, 2)}\n`);
        await page.screenshot({ path: path.join(outputDir, `failure-${cycle}-${mode}.png`), fullPage: false });
      }
      assert(modes[mode].end.mode === mode, `${mode} lost input ownership during cycle ${cycle}`);
      assert(modes[mode].distance > 0.25, `${mode} did not move under real input during cycle ${cycle}: ${modes[mode].distance}`);
      assert(Object.values(modes[mode].end.camera || {}).every(Number.isFinite), `${mode} camera became invalid during cycle ${cycle}`);
      if (cycle === 3) {
        await page.screenshot({ path: path.join(outputDir, `${mode}.png`), fullPage: false });
      }
    }
    await setMode(page, 'walk', cycle);
    const restored = await readState(page, 'walk');
    assert(restored.mode === 'walk', `Cycle ${cycle} did not restore walking mode`);
    assert(Object.values(restored.camera || {}).every(Number.isFinite), `Cycle ${cycle} did not restore a finite camera`);
    cycles.push({ cycle, modes, restored });
  }

  const second = cycles[1].restored.resources;
  const third = cycles[2].restored.resources;
  assert(third.planeMeshes === 1, `Repeated cycles retained ${third.planeMeshes} plane meshes`);
  assert(third.geometries <= second.geometries + 8, `Renderer geometries grew after warm-up (${second.geometries} to ${third.geometries})`);
  assert(third.textures <= second.textures + 2, `Renderer textures grew after warm-up (${second.textures} to ${third.textures})`);
  if (second.heapBytes > 0 && third.heapBytes > 0) {
    assert(third.heapBytes <= second.heapBytes * 1.2, `Heap retained growth after warm-up (${second.heapBytes} to ${third.heapBytes})`);
  }
  assert(consoleErrors.length === 0, `Earth travel logged errors: ${consoleErrors.join(' | ')}`);

  const report = { ok: true, cycles, consoleErrors };
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    movement: Object.fromEntries(Object.keys(cycles[2].modes).map((mode) => [mode, cycles[2].modes[mode].distance])),
    warmResources: { second, third },
    consoleErrors
  }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
